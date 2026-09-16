import { type SessionMessage, formatMessagesAsContext, processMessagesForFork } from "../fork";
import { extractFinalAssistantText, parseModelRef } from "../helpers";
import { FORK_MESSAGES, INTERACTIVE_INSTRUCTIONS, buildForkPreamble } from "../prompts";
import type { BackgroundTask, LaunchInput, OpencodeClient } from "../types";

/**
 * Fork implementation method:
 * - "inject": session.create + context injection (recommended, UI works)
 * - "native": session.fork API (UI visibility issues with subagent view)
 */
const FORK_METHOD: "inject" | "native" = "inject";

/**
 * Resolves the model to use for a launched background task session.
 * - If the caller passes `model` ("provider/model-id"), parse it into { providerID, modelID }.
 * - Otherwise inherit the current model of the parent conversation (the session that launched
 *   the task), so background tasks use the same model as the orchestrator by default.
 * Returns undefined when there is no explicit override and the parent model cannot be read,
 * letting OpenCode fall back to its default resolution.
 */
export async function resolveLaunchModel(
  client: OpencodeClient,
  input: { model?: string; parentSessionID: string }
): Promise<{ providerID: string; modelID: string } | undefined> {
  if (input.model) {
    return parseModelRef(input.model);
  }
  try {
    const parent = await client.session.get({ path: { id: input.parentSessionID } });
    const model = (parent as { data?: { model?: { providerID?: string; id?: string } } })?.data
      ?.model;
    if (model?.providerID && model?.id) {
      return { providerID: model.providerID, modelID: model.id };
    }
  } catch {
    // Ignore — fall back to OpenCode's default model resolution.
  }
  return undefined;
}

/**
 * Resolves the session title prefix for a background task session.
 * The launching agent decides via `prefix` (LaunchInput.titlePrefix): when it is
 * undefined the descriptive defaults apply ("Background: " / "Background (forked): ");
 * when provided — including an empty string to omit the prefix — it is used verbatim.
 */
export function resolveTitlePrefix(prefix: string | undefined, fork: boolean): string {
  if (prefix === undefined) return fork ? "Background (forked): " : "Background: ";
  return prefix;
}

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

  // Session title prefix. The caller (the launching agent) decides whether and
  // which prefix to use via LaunchInput.titlePrefix. When omitted, fall back to
  // the descriptive defaults below; when provided (including "" for no prefix),
  // it wins.
  const titlePrefix = resolveTitlePrefix(input.titlePrefix, input.fork ?? false);

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
          title: `${titlePrefix}${input.description}`,
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
        title: `${titlePrefix}${input.description}`,
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

  // Resolve the model up-front so it is stored on the task and visible to the
  // orchestrator. Invalid overrides throw here (before a session is created).
  const launchModel = await resolveLaunchModel(client, input);

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
    kind: input.interactive ? "interactive" : "autonomous",
    model: launchModel,
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
  // Default: orchestration tools (task/cancel/clear/steer/progress/rename) are
  // blocked for spawned agents to prevent recursion. bgagent_report is the
  // child->parent channel, so it is enabled by default; an agent opts out by
  // setting it to false explicitly.
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
    bgagent_report: agentToolConfig["bgagent_report"] !== false,
    bgagent_rename: agentToolConfig["bgagent_rename"] === true,
    bgagent_finish: agentToolConfig["bgagent_finish"] === true,
  };

  const parts: Array<{ type: "text"; text: string; synthetic?: boolean }> = [
    { type: "text", text: input.prompt },
  ];
  if (input.interactive) {
    // Interactive sessions must know the user can see/message them and that idle
    // is not completion — they complete by calling bgagent_finish. Also make sure
    // the child can actually call finish/rename regardless of its agent config.
    bgagentToolOverrides.bgagent_finish = true;
    bgagentToolOverrides.bgagent_rename = true;
    parts.push({ type: "text", text: INTERACTIVE_INSTRUCTIONS, synthetic: true });
  }

  client.session
    .promptAsync({
      path: { id: sessionID },
      body: {
        agent: input.agent,
        ...(launchModel ? { model: launchModel } : {}),
        tools: bgagentToolOverrides,
        parts,
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
 * Captures a task's final result text and stores it on the task, so `bgagent_output`
 * does not have to reconstruct it from messages later (which breaks when the session's
 * last assistant message is tool-only, or when the session is later deleted).
 * Best-effort: on failure the task keeps no result and output falls back to lazy extraction.
 */
export async function captureTaskResult(
  task: BackgroundTask,
  getMessages: (
    sessionID: string
  ) => Promise<Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>>
): Promise<void> {
  try {
    const messages = await getMessages(task.sessionID);
    const text = extractFinalAssistantText(messages);
    if (text) task.result = text;
  } catch {
    // Leave task.result unset; formatTaskResult will fall back to lazy extraction.
  }
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
  persistTask?: (task: BackgroundTask) => Promise<void>
): Promise<BackgroundTask> {
  if (task.status !== "running") {
    return task;
  }

  // Interactive sessions complete only via bgagent_finish, never on idle.
  if (task.kind === "interactive") {
    return task;
  }

  const completeTask = async (): Promise<BackgroundTask> => {
    if (getTaskMessages) {
      await captureTaskResult(task, getTaskMessages);
    }
    task.status = "completed";
    task.completedAt = new Date().toISOString();
    emitTaskEvent?.("task.completed", task);

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
