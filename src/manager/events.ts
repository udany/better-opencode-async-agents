import { setTaskStatus } from "../helpers";
import type { BackgroundTask } from "../types";
import { captureTaskResult } from "./task-lifecycle";

// =============================================================================
// Event Handling Functions
// =============================================================================

/**
 * Starts the event subscription to listen for session events.
 * Automatically reconnects on errors or stream closure.
 */
export async function startEventSubscription(
  client: {
    event: {
      subscribe: () => Promise<{
        stream: AsyncIterable<{ type: string; properties?: Record<string, unknown> }>;
      }>;
    };
  },
  handleEvent: (event: {
    type: string;
    properties?: Record<string, unknown>;
  }) => void | Promise<void>
): Promise<void> {
  try {
    const subscription = await client.event.subscribe();
    // Process events in background
    (async () => {
      for await (const event of subscription.stream) {
        await handleEvent(event);
      }
    })().catch(() => {
      // Stream ended, try to reconnect
      setTimeout(() => startEventSubscription(client, handleEvent), 1000);
    });
  } catch {
    // Failed to subscribe, retry
    setTimeout(() => startEventSubscription(client, handleEvent), 1000);
  }
}

/**
 * Handles incoming events and triggers appropriate actions.
 * Primary completion detection mechanism via session.idle events.
 */
export async function handleEvent(
  event: {
    type: string;
    properties?: Record<string, unknown>;
  },
  callbacks: {
    clearAllTasks: () => void;
    getTasksArray: () => BackgroundTask[];
    notifyParentSession: (task: BackgroundTask) => void;
    persistTask: (task: BackgroundTask) => void;
    emitTaskEvent?: (
      eventType: "task.completed" | "task.error" | "task.cancelled",
      task: BackgroundTask
    ) => void;
    getTaskMessages?: (
      sessionID: string
    ) => Promise<Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>>;
  }
): Promise<void> {
  const { clearAllTasks, getTasksArray, notifyParentSession, persistTask, emitTaskEvent, getTaskMessages } =
    callbacks;
  const props = event.properties;

  // Clear on session.new, session.switch, prompt.clear, or session.interrupt (ESC key)
  if (event.type === "tui.command.execute") {
    const command = props?.command as string | undefined;
    if (
      command === "session.new" ||
      command === "session.switch" ||
      command === "session.select" ||
      command === "prompt.clear" ||
      command === "session.interrupt"
    ) {
      clearAllTasks();
      return;
    }
  }

  // NOTE: we deliberately do NOT clear tasks on `session.created`. That event fires
  // for EVERY session creation — including the sessions this plugin creates for each
  // bgagent_task launch — so clearing here would wipe (and abort) our own just-launched
  // tasks from memory, orphaning them: they keep running to completion but their
  // `session.idle` handler finds no task and never notifies the parent. Orphan cleanup
  // is already handled by the poll loop (which clears tasks whose parent session is gone).

  // Clear if parent session is deleted
  if (event.type === "session.deleted") {
    const info = props?.info as { id?: string } | undefined;
    if (!info?.id) return;

    // Check if this is a parent session being deleted
    const affectedTasks = getTasksArray().filter((t) => t.parentSessionID === info.id);
    if (affectedTasks.length > 0) {
      clearAllTasks();
      return;
    }

    // Also handle if it's a background task's session
    const task = getTasksArray().find((t) => t.sessionID === info.id);
    if (!task) return;

    if (task.status === "running") {
      setTaskStatus(task, "cancelled", {
        error: "Session deleted",
        persistFn: persistTask,
        emitFn: emitTaskEvent,
      });
    }
    return;
  }

  if (event.type === "session.idle") {
    const sessionID = props?.sessionID as string | undefined;
    if (!sessionID) return;

    const task = getTasksArray().find((t) => t.sessionID === sessionID);
    if (!task) return;

    // Interactive sessions complete only when the agent calls bgagent_finish —
    // going idle just means "waiting for the user", so never auto-complete them.
    if (task.kind === "interactive") return;

    // Complete running and resumed tasks on idle. Resumed tasks are deliberately
    // NOT completed by the poll loop (its "missing status + existing assistant
    // message" fallback would false-complete them), so the idle event is their
    // completion signal.
    if (task.status !== "running" && task.status !== "resumed") return;

    // Capture the result BEFORE persisting, so the stored result is complete.
    if (getTaskMessages) {
      await captureTaskResult(task, getTaskMessages);
    }
    setTaskStatus(task, "completed", { persistFn: persistTask, emitFn: emitTaskEvent });
    // Trigger notification immediately on event-based completion
    notifyParentSession(task);
  }
}
