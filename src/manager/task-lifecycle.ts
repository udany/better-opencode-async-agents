import { type SessionMessage, formatMessagesAsContext, processMessagesForFork } from "../fork";
import { FORK_MESSAGES, buildForkPreamble } from "../prompts";
import type { BackgroundTask, LaunchInput, OpencodeClient } from "../types";

/**
 * Fork implementation method:
 * - "inject": session.create + context injection (recommended, UI works)
 * - "native": session.fork API (UI visibility issues with subagent view)
 */
const FORK_METHOD: "inject" | "native" = "inject";

export async function launchTask(
  input: LaunchInput,
  tasks: Map<string, BackgroundTask>,
  client: OpencodeClient,
  getOrCreateBatchId: () => string,
  setOriginalParentSessionID: (sessionID: string | null) => void,
  startPolling: () => void,
  notifyParentSession: (task: BackgroundTask) => void,
  emitTaskEvent?: (eventType: "task.error", task: BackgroundTask) => void,
  persistTask?: (task: BackgroundTask) => Promise<void>
): Promise<BackgroundTask> {
  if (!input.agent || input.agent.trim() === "") {
    throw new Error("Agent parameter is required");
  }

  let sessionID: string;

  if (input.fork && FORK_METHOD === "native") {
    // === NATIVE: Use session.fork API ===
    const forkResult = await client.session.fork({
      path: { id: input.parentSessionID },
    });

    if (forkResult.error || !forkResult.data) {
      throw new Error(`Failed to fork session: ${forkResult.error ?? "No data returned"}`);
    }

    sessionID = forkResult.data.id;

    // Try to set parentID for UI (may not work)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.session as any)
      .update({
        path: { id: sessionID },
        body: {
          parentID: input.parentSessionID,
          title: `Background (forked): ${input.description}`,
        },
      })
      .catch(() => {});

    // Inject preamble (native fork doesn't process messages, so use default stats)
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [
          {
            type: "text",
            text: buildForkPreamble({
              compactionDetected: false,
              tierDistribution: { tier1: 0, tier2: 0, tier3: 0 },
              removedMessages: 0,
            }),
          },
        ],
      },
    });
  } else {
    // === INJECT (default): session.create + context injection ===
    // Deliberately do NOT set parentID: background sessions are created as
    // normal (root) conversations so they appear in the conversation list and
    // can be inspected directly in the UI. Parent linkage is tracked by the
    // manager (task.parentSessionID), not by the session's parent_id.
    const createResult = await client.session.create({
      body: {
        title: input.fork
          ? `Background (forked): ${input.description}`
          : `Background: ${input.description}`,
      },
    });

    if (createResult.error) {
      throw new Error(`Failed to create background session: ${createResult.error}`);
    }

    sessionID = createResult.data.id;

    // Fork mode: inject parent context
    if (input.fork) {
      try {
        const messagesResult = await client.session.messages({
          path: { id: input.parentSessionID },
        });

        if (!messagesResult.error && messagesResult.data) {
          const parentMessages = messagesResult.data as SessionMessage[];

          if (parentMessages.length > 0) {
            const { messages: processedMessages, stats } = processMessagesForFork(parentMessages);
            const contextText = formatMessagesAsContext(processedMessages, stats);

            if (contextText) {
              const preamble = buildForkPreamble(stats);
              const contextWithPreamble = `${preamble}\n\n${contextText}`;
              await client.session.prompt({
                path: { id: sessionID },
                body: { noReply: true, parts: [{ type: "text", text: contextWithPreamble }] },
              });
            }
          }
        }
      } catch {
        // Continue without context if fetching fails
      }
    }
  }
  const batchId = getOrCreateBatchId();

  const task: BackgroundTask = {
    sessionID,
    parentSessionID: input.parentSessionID,
    parentMessageID: input.parentMessageID,
    parentAgent: input.parentAgent,
    description: input.description,
    prompt: input.prompt,
    agent: input.agent,
    status: "running",
    startedAt: new Date().toISOString(),
    batchId,
    resumeCount: 0,
    isForked: input.fork ?? false,
    progress: {
      toolCalls: 0,
      toolCallsByName: {},
      lastTools: [],
      lastUpdate: new Date().toISOString(),
      phase: "waiting",
      textCharCount: 0,
      streamFrame: 0,
      brailleFrame: 0,
      waitingFrame: 0,
      toolFrame: 0,
      progressBarFrame: 0,
    },
  };

  // Track original parent session to detect session changes
  setOriginalParentSessionID(input.parentSessionID);

  tasks.set(task.sessionID, task);

  // Persist task to disk immediately to ensure it's available
  // even if the plugin is re-instantiated (Linux-specific issue)
  if (persistTask) {
    await persistTask(task);
  }

  startPolling();

  // Fetch agent config to check for explicit bgagent tool overrides.
  // Default: all bgagent tools are blocked for spawned agents.
  // Override: if the agent's config explicitly sets a bgagent tool to true, honor it.
  const configResult = await client.config.get();
  const agentToolConfig = configResult.data?.agent?.[input.agent]?.tools ?? {};
  const bgagentToolOverrides = {
    bgagent_task: agentToolConfig["bgagent_task"] === true,
    bgagent_output: agentToolConfig["bgagent_output"] === true,
    bgagent_cancel: agentToolConfig["bgagent_cancel"] === true,
    bgagent_list: agentToolConfig["bgagent_list"] === true,
    bgagent_clear: agentToolConfig["bgagent_clear"] === true,
    bgagent_steer: agentToolConfig["bgagent_steer"] === true,
    bgagent_progress: agentToolConfig["bgagent_progress"] === true,
    bgagent_report: agentToolConfig["bgagent_report"] === true,
  };

  client.session
    .promptAsync({
      path: { id: sessionID },
      body: {
        agent: input.agent,
        tools: bgagentToolOverrides,
        parts: [{ type: "text", text: input.prompt }],
      },
    })
    .catch((error) => {
      const existingTask = tasks.get(task.sessionID);
      if (existingTask) {
        existingTask.status = "error";
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("agent.name") || errorMessage.includes("undefined")) {
          existingTask.error = `Agent "${input.agent}" not found. Make sure the agent is registered.`;
        } else {
          existingTask.error = errorMessage;
        }
        existingTask.completedAt = new Date().toISOString();
        emitTaskEvent?.("task.error", existingTask);
        notifyParentSession(existingTask);
      }
    });

  return task;
}

/**
 * Cancel a running task.
 *
 * Aborts the background session and marks the task as cancelled.
 */
export async function cancelTask(
  taskId: string,
  tasks: Map<string, BackgroundTask>,
  client: OpencodeClient
): Promise<void> {
  const task = tasks.get(taskId);

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  if (task.status !== "running") {
    throw new Error(
      `Cannot cancel task: current status is "${task.status}". Only running tasks can be cancelled.`
    );
  }

  client.session.abort({ path: { id: task.sessionID } }).catch(() => {});

  task.status = "cancelled";
  task.completedAt = new Date().toISOString();
}

/**
 * Get messages from a task's session.
 */
export async function getTaskMessages(
  sessionID: string,
  client: OpencodeClient
): Promise<
  Array<{
    info?: { role?: string };
    parts?: Array<{ type?: string; text?: string }>;
  }>
> {
  const messagesResult = await client.session.messages({
    path: { id: sessionID },
  });

  if (messagesResult.error) {
    throw new Error(`Error fetching messages: ${messagesResult.error}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((messagesResult as any).data ?? messagesResult) as Array<{
    info?: { role?: string };
    parts?: Array<{ type?: string; text?: string }>;
  }>;
}

/**
 * Check and update task status.
 *
 * If the task's session is idle, marks the task as completed and notifies the parent session.
 * Uses a fallback mechanism: if session status isn't in the response, checks for assistant
 * messages to detect completion (session might have finished and no longer appear in status).
 *
 * @param skipNotification - If true, skip sending notification to parent session.
 *   Use this when the parent is blocked waiting for a tool result (e.g., background_output with block=true).
 * @param getTaskMessages - Function to get messages from a session (for fallback detection).
 * @param persistTask - Optional callback to persist task changes immediately.
 * @param sendPendingResumeAsync - Optional callback to execute queued resume prompts.
 */
export async function checkAndUpdateTaskStatus(
  task: BackgroundTask,
  client: OpencodeClient,
  notifyParentSession: (task: BackgroundTask) => void,
  skipNotification = false,
  getTaskMessages?: (
    sessionID: string
  ) => Promise<
    Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
  >,
  emitTaskEvent?: (
    eventType: "task.completed" | "task.error" | "task.cancelled",
    task: BackgroundTask
  ) => void,
  persistTask?: (task: BackgroundTask) => Promise<void>,
  sendPendingResumeAsync?: (task: BackgroundTask, prompt: string) => Promise<void>
): Promise<BackgroundTask> {
  if (task.status !== "running") {
    return task;
  }

  const completeTask = async (): Promise<BackgroundTask> => {
    task.status = "completed";
    task.completedAt = new Date().toISOString();
    emitTaskEvent?.("task.completed", task);

    if (task.pendingResume && sendPendingResumeAsync) {
      const { prompt } = task.pendingResume;
      task.pendingResume = undefined;
      task.status = "resumed";
      task.resumeCount++;
      if (persistTask) {
        await persistTask(task);
      }
      sendPendingResumeAsync(task, prompt).catch(() => {});
    }

    if (!skipNotification) {
      notifyParentSession(task);
    }
    return task;
  };

  try {
    const statusResult = await client.session.status();
    const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>;
    const sessionStatus = allStatuses[task.sessionID];

    if (sessionStatus?.type === "idle") {
      return completeTask();
    }

    // Fallback: if session isn't in the status response, it may have completed.
    // Check if there are assistant messages (indicating the agent responded and finished).
    if (!sessionStatus && getTaskMessages) {
      try {
        const messages = await getTaskMessages(task.sessionID);
        const hasAssistantResponse = messages.some(
          (m) =>
            m.info?.role === "assistant" &&
            m.parts?.some((p) => p.type === "text" && p.text && p.text.length > 0)
        );

        if (hasAssistantResponse) {
          await completeTask();
          return task;
        }
      } catch {
        // Ignore fallback check errors
      }
    }
  } catch {
    // Ignore status check errors
  }

  return task;
}

/**
 * Clear all tasks.
 *
 * Stops polling, aborts all running sessions, and clears the tasks Map.
 */
export function clearAllTasks(
  tasks: Map<string, BackgroundTask>,
  client: OpencodeClient,
  stopPolling: () => void
): void {
  stopPolling();

  for (const task of tasks.values()) {
    if (task.status === "running") {
      client.session.abort({ path: { id: task.sessionID } }).catch(() => {});
    }
  }

  tasks.clear();
}

/**
 * Check if a session exists.
 */
export async function checkSessionExists(
  sessionID: string,
  client: OpencodeClient
): Promise<boolean> {
  try {
    const result = await client.session.get({ path: { id: sessionID } });
    return !result.error && !!result.data;
  } catch {
    return false;
  }
}
