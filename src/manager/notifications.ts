import {
  COMPLETION_DISPLAY_DURATION,
  STREAMING_FRAMES,
  TOOL_FRAMES,
  WAITING_FRAMES,
} from "../constants";
import { shortId } from "../helpers";
import {
  NOTIFICATION_MESSAGES,
  PLACEHOLDER_TEXT,
  SYSTEM_HINT_MESSAGES,
  TOAST_TITLES,
} from "../prompts";
import type { BackgroundTask, OpencodeClient } from "../types";

// =============================================================================
// Notification Deduplication State
// =============================================================================

type NotifyKind = "completed" | "error" | "cancelled";
const NOTIFY_PRIORITY: Record<NotifyKind, number> = {
  completed: 1,
  cancelled: 2,
  error: 3,
};

interface NotifyState {
  scheduledKind?: NotifyKind;
  sentKind?: NotifyKind;
  timer?: ReturnType<typeof setTimeout>;
}

const notifyStateMap = new Map<string, NotifyState>();

// =============================================================================
// Notification Functions
// =============================================================================

/**
 * Shows a toast notification with progress information about running and completed background tasks.
 */
/**
 * Returns the animation icon for a running task based on its current phase.
 */
function getPhaseIcon(task: BackgroundTask): string {
  const phase = task.progress?.phase ?? "waiting";
  if (phase === "waiting") {
    return WAITING_FRAMES[task.progress?.waitingFrame ?? 0] ?? "◌";
  }
  const braille = STREAMING_FRAMES[task.progress?.brailleFrame ?? 0] ?? "⠋";
  const bar = TOOL_FRAMES[task.progress?.progressBarFrame ?? 0] ?? "▰▱▱";
  return `${braille} ${bar}`;
}

export function showProgressToast(
  allTasks: BackgroundTask[],
  client: OpencodeClient,
  getTasksArray: () => BackgroundTask[]
): void {
  if (allTasks.length === 0) return;

  const now = Date.now();
  const runningTasks = allTasks.filter((t) => t.status === "running" || t.status === "resumed");
  const completedTasks = allTasks.filter(
    (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
  );

  const recentlyCompletedTasks =
    runningTasks.length > 0
      ? completedTasks
      : completedTasks.filter((t) => {
          if (!t.completedAt) return false;
          const completedTime = new Date(t.completedAt).getTime();
          return now - completedTime <= COMPLETION_DISPLAY_DURATION;
        });

  const activeTasks = [...runningTasks, ...recentlyCompletedTasks];
  if (activeTasks.length === 0) return;

  const firstActive = activeTasks[0];
  if (!firstActive) return;
  const activeBatchId = firstActive.batchId;
  const batchTasks = allTasks.filter((t) => t.batchId === (activeBatchId ?? ""));
  const totalTasks = batchTasks.length;
  const finishedCount = batchTasks.filter(
    (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
  ).length;

  const totalToolCalls = batchTasks.reduce((sum, t) => sum + (t.progress?.toolCalls ?? 0), 0);

  // Aggregate tool calls by name across batch tasks
  const aggregatedToolCalls: Record<string, number> = {};
  for (const t of batchTasks) {
    if (t.progress?.toolCallsByName) {
      for (const [toolName, count] of Object.entries(t.progress.toolCallsByName)) {
        aggregatedToolCalls[toolName] = (aggregatedToolCalls[toolName] ?? 0) + count;
      }
    }
  }

  const taskLines: string[] = [];

  const batchRunning = runningTasks.filter((t) => t.batchId === activeBatchId);
  for (const task of batchRunning) {
    const duration = formatDuration(new Date(task.startedAt));
    const tools = task.progress?.lastTools?.slice(-3) ?? [];
    let toolsStr = "";
    if (tools.length > 0) {
      const lastTool = tools[tools.length - 1];
      const prevTools = tools.slice(0, -1);
      toolsStr =
        prevTools.length > 0 ? ` - ${prevTools.join(" > ")} > ｢${lastTool}｣` : ` - ｢${lastTool}｣`;
    }
    const callCount = task.progress?.toolCalls ?? 0;
    const callsStr = callCount > 0 ? ` 🔧${callCount}` : "";
    const icon = getPhaseIcon(task);
    taskLines.push(
      `${icon} [${task.agent}#${shortId(task.sessionID)}] ${task.description} (${duration})${toolsStr}${callsStr}`
    );
  }

  const batchCompleted = batchTasks
    .filter((t) => t.status === "completed" || t.status === "error" || t.status === "cancelled")
    .sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

  const maxCompleted = batchRunning.length > 0 ? 10 : 10 - batchRunning.length;
  const visibleCompleted = batchCompleted.slice(0, maxCompleted);

  for (const task of visibleCompleted) {
    const duration = formatDuration(
      new Date(task.startedAt),
      task.completedAt ? new Date(task.completedAt) : undefined
    );
    const statusIcon =
      task.status === "completed" ? "✓ ▰▰▰" : task.status === "error" ? "✗ ▱▱▱" : "⊘";
    const callCount = task.progress?.toolCalls ?? 0;
    const callsStr = callCount > 0 ? ` 🔧${callCount}` : "";
    taskLines.push(
      `${statusIcon} [${task.agent}#${shortId(task.sessionID)}] ${task.description} (${duration})${callsStr}`
    );
  }

  const hiddenCount = batchCompleted.length - visibleCompleted.length;
  if (hiddenCount > 0) {
    taskLines.push(PLACEHOLDER_TEXT.andMoreFinished(hiddenCount));
  }

  const progressPercent = totalTasks > 0 ? Math.round((finishedCount / totalTasks) * 100) : 0;
  const barLength = 10;
  const filledLength = Math.round((finishedCount / Math.max(totalTasks, 1)) * barLength);
  const progressBar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

  // Build per-tool breakdown string
  const sortedTools = Object.entries(aggregatedToolCalls).sort(([, a], [, b]) => b - a);
  let toolBreakdown = "";
  if (sortedTools.length > 0) {
    const top3 = sortedTools
      .slice(0, 3)
      .map(([name, count]) => `${name}:${count}`)
      .join(" ");
    const remaining = sortedTools.length - 3;
    toolBreakdown = remaining > 0 ? ` (${top3} +${remaining} more)` : ` (${top3})`;
  }
  const summary = `[${progressBar}] ${finishedCount}/${totalTasks} agents (${progressPercent}%) | 🔧${totalToolCalls}${toolBreakdown}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuiClient = client as any;

  if (!tuiClient.tui?.showToast) return;

  const hasRunning = runningTasks.filter((t) => t.batchId === activeBatchId).length > 0;
  const firstRunningTask = runningTasks.filter((t) => t.batchId === activeBatchId)[0];
  const titleIcon = firstRunningTask
    ? (STREAMING_FRAMES[firstRunningTask.progress?.brailleFrame ?? 0] ?? "⠋")
    : "⏳";
  const title = hasRunning
    ? TOAST_TITLES.backgroundTasksRunning(titleIcon)
    : TOAST_TITLES.tasksComplete;
  const variant = hasRunning ? "info" : "success";

  tuiClient.tui
    .showToast({
      body: {
        title,
        message: `${taskLines.join("\n")}\n\n${summary}`,
        variant,
        duration: 150,
      },
    })
    .catch(() => {});
}

/**
 * Notifies the parent session when a background task completes, fails, or is cancelled.
 */
export function notifyParentSession(
  task: BackgroundTask,
  client: OpencodeClient,
  directory: string,
  getTasksArray: () => BackgroundTask[]
): void {
  // --- DEDUPLICATION GUARD START ---
  const kind: NotifyKind =
    task.status === "error" ? "error" : task.status === "cancelled" ? "cancelled" : "completed";

  const state = notifyStateMap.get(task.sessionID) ?? {};

  // Already sent this kind → skip entirely
  if (state.sentKind === kind) return;

  // Already sent a higher-priority kind → skip
  if (state.sentKind && NOTIFY_PRIORITY[state.sentKind] >= NOTIFY_PRIORITY[kind]) return;

  // Already scheduled this kind → skip (timer will fire)
  if (state.scheduledKind === kind) return;

  // Higher priority incoming: cancel existing scheduled timer
  if (
    state.timer &&
    state.scheduledKind &&
    NOTIFY_PRIORITY[kind] > NOTIFY_PRIORITY[state.scheduledKind]
  ) {
    clearTimeout(state.timer);
    state.timer = undefined;
    state.scheduledKind = undefined;
  }

  // If something of equal or lower priority is already scheduled, skip
  if (state.scheduledKind && NOTIFY_PRIORITY[state.scheduledKind] >= NOTIFY_PRIORITY[kind]) return;

  state.scheduledKind = kind;
  notifyStateMap.set(task.sessionID, state);
  // --- DEDUPLICATION GUARD END ---

  const duration = formatDuration(
    new Date(task.startedAt),
    task.completedAt ? new Date(task.completedAt) : undefined
  );
  const statusText =
    task.status === "completed" ? "COMPLETED" : task.status === "error" ? "FAILED" : "CANCELLED";

  // Calculate batch progress
  const batchTasks = getTasksArray().filter((t) => t.batchId === task.batchId);
  const totalTasks = batchTasks.length;
  const completedTasks = batchTasks.filter(
    (t) => t.status === "completed" || t.status === "error" || t.status === "cancelled"
  ).length;
  const runningTasks = batchTasks.filter((t) => t.status === "running").length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuiClient = client as any;
  if (tuiClient.tui?.showToast) {
    const toastTitle =
      task.status === "completed"
        ? TOAST_TITLES.taskCompleted
        : task.status === "error"
          ? TOAST_TITLES.taskFailed
          : TOAST_TITLES.taskCancelled;
    tuiClient.tui
      .showToast({
        body: {
          title: toastTitle,
          message: `Task "${task.description}" finished in ${duration}. Batch: ${completedTasks}/${totalTasks} complete, ${runningTasks} still running.`,
          variant: task.status === "completed" ? "success" : "error",
          duration: 5000,
        },
      })
      .catch(() => {});
  }

  // Build visible message
  const visibleStatus =
    task.status === "completed"
      ? NOTIFICATION_MESSAGES.visibleTaskCompleted(task.description, duration)
      : task.status === "error"
        ? NOTIFICATION_MESSAGES.visibleTaskFailed(task.description, duration)
        : NOTIFICATION_MESSAGES.visibleTaskCancelled(task.description, duration);
  const progressLine = NOTIFICATION_MESSAGES.taskProgressLine(completedTasks, totalTasks);
  const devIndicator =
    process.env.SUPERAGENTS_DEBUG === "1" ? ` ${NOTIFICATION_MESSAGES.devHintIndicator}` : "";
  const visibleMessage = `${visibleStatus}\n${progressLine}${devIndicator}`;

  // Build hidden hint based on batch status
  const taskShortId = shortId(task.sessionID);
  let hiddenHint: string;
  if (task.status === "error") {
    hiddenHint = SYSTEM_HINT_MESSAGES.errorHint(taskShortId, task.error || "Unknown error");
  } else if (runningTasks > 0) {
    hiddenHint = SYSTEM_HINT_MESSAGES.runningTasksHint(taskShortId);
  } else {
    hiddenHint = SYSTEM_HINT_MESSAGES.allTasksDoneHint(totalTasks);
  }

  const timer = setTimeout(async () => {
    // Mark as sent BEFORE the async call to prevent races
    state.sentKind = kind;
    state.timer = undefined;
    state.scheduledKind = undefined;

    try {
      const sessionInfo = await client.session.get({
        path: { id: task.parentSessionID },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agent = (sessionInfo.data as any)?.agent || task.agent;

      await client.session.prompt({
        path: { id: task.parentSessionID },
        body: {
          agent: task.parentAgent,
          parts: [
            { type: "text", text: visibleMessage },
            { type: "text", text: hiddenHint, synthetic: true },
          ],
        },
        query: { directory },
      });
    } catch {
      // Ignore notification errors
    }

    // Clean up state after a delay (allow for resume resets)
    setTimeout(() => {
      notifyStateMap.delete(task.sessionID);
    }, 5000);
  }, 200);

  state.timer = timer;
}

/**
 * Resets the notification deduplication state for a task.
 * Call this when a task re-enters "running" state (e.g., resume).
 */
export function resetNotificationState(taskSessionID: string): void {
  const state = notifyStateMap.get(taskSessionID);
  if (state?.timer) {
    clearTimeout(state.timer);
  }
  notifyStateMap.delete(taskSessionID);
}

/**
 * Formats a duration between two dates as a human-readable string.
 */
function formatDuration(start: Date, end?: Date): string {
  const duration = (end ?? new Date()).getTime() - start.getTime();
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
