import { FORMAT_TEMPLATES, PLACEHOLDER_TEXT, STATUS_NOTES } from "./prompts";
import type { BackgroundTask, BackgroundTaskStatus } from "./types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Centralized task status setter. Always use this to change task status.
 * - Sets task.status
 * - Sets task.completedAt for terminal statuses
 * - Optionally sets task.error
 * - Auto-persists if persistFn is provided
 * - Emits events if emitFn is provided
 */
export function setTaskStatus(
  task: BackgroundTask,
  status: BackgroundTaskStatus,
  options?: {
    error?: string;
    persistFn?: (task: BackgroundTask) => void;
    emitFn?: (
      eventType: "task.completed" | "task.error" | "task.cancelled",
      task: BackgroundTask
    ) => void;
  }
): void {
  const previousStatus = task.status;
  task.status = status;

  // Set completedAt for terminal statuses
  if (status === "completed" || status === "error" || status === "cancelled") {
    task.completedAt = new Date().toISOString();
  }

  // Set error message if provided
  if (options?.error) {
    task.error = options.error;
  }

  // Auto-persist if function provided
  options?.persistFn?.(task);

  // Emit event if function provided and status changed to a terminal state
  if (options?.emitFn && previousStatus !== status) {
    if (status === "completed") {
      options.emitFn("task.completed", task);
    } else if (status === "error") {
      options.emitFn("task.error", task);
    } else if (status === "cancelled") {
      options.emitFn("task.cancelled", task);
    }
  }
}

/**
 * Converts a full session ID to a short display ID.
 * Simple version — no collision awareness. Use for cases where
 * you don't have access to the sibling task list.
 *
 * Example: ses_41e080918ffeyhQtX6E4vERe4O → ses_41e08091
 */
export function shortId(sessionId: string, minLen = 8): string {
  if (!sessionId.startsWith("ses_")) {
    // Fallback for non-standard IDs: just take first minLen chars
    return sessionId.slice(0, minLen);
  }
  const suffix = sessionId.slice(4); // Remove "ses_"
  return suffix.slice(0, minLen);
}

/**
 * Converts a full session ID to a collision-free short display ID.
 * Git-style: starts at minLen chars, extends until unique among siblings.
 *
 * @param sessionId - Full session ID (e.g., "ses_41e080918ffeyhQtX6E4vERe4O")
 * @param siblingIds - Array of OTHER full session IDs to avoid collision with
 * @param minLen - Minimum suffix length (default 8)
 * @returns Short ID guaranteed unique among siblings
 */
export function uniqueShortId(sessionId: string, siblingIds: string[], minLen = 8): string {
  if (!sessionId.startsWith("ses_")) {
    return sessionId.slice(0, minLen);
  }

  const suffix = sessionId.slice(4);

  for (let len = minLen; len <= suffix.length; len++) {
    const candidate = suffix.slice(0, len);
    // Check if any sibling's suffix also starts with this candidate
    const hasClash = siblingIds.some((otherId) => {
      if (otherId === sessionId) return false;
      const otherSuffix = otherId.startsWith("ses_") ? otherId.slice(4) : otherId;
      return otherSuffix.startsWith(candidate);
    });
    if (!hasClash) return candidate;
  }

  // Fallback: return full suffix (always unique)
  return suffix;
}

export function formatDuration(startStr: string, endStr?: string): string {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  const duration = end.getTime() - start.getTime();
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

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function getStatusIcon(status: BackgroundTaskStatus): string {
  switch (status) {
    case "running":
      return "⏳";
    case "completed":
      return "✓";
    case "error":
      return "✗";
    case "cancelled":
      return "⊘";
    case "resumed":
      return "↻";
  }
}

export function formatTaskStatus(task: BackgroundTask): string {
  const duration = formatDuration(task.startedAt, task.completedAt);
  const promptPreview = truncateText(task.prompt, 500);
  const icon = getStatusIcon(task.status);

  let progressSection = "";
  if (task.progress?.lastTools && task.progress.lastTools.length > 0) {
    progressSection = FORMAT_TEMPLATES.progressSection(task.progress.lastTools);
  }

  let statusNote = "";
  if (task.status === "running") {
    statusNote = STATUS_NOTES.running;
  } else if (task.status === "error") {
    statusNote = STATUS_NOTES.failed(task.error || "Unknown error");
  } else if (task.status === "cancelled") {
    statusNote = STATUS_NOTES.cancelled;
  }

  return FORMAT_TEMPLATES.taskStatus(
    icon,
    shortId(task.sessionID),
    task.description,
    task.agent,
    task.status,
    duration,
    progressSection,
    statusNote,
    promptPreview
  );
}

// Interface for getTaskMessages return type
interface TaskMessage {
  info?: { role?: string };
  parts?: Array<{ type?: string; text?: string }>;
}

/**
 * Extracts the most recent assistant text from a session's messages.
 *
 * The agent's final step is frequently tool-only (no text part) — e.g. it ends on
 * a tool call and the turn goes idle. Blindly taking the LAST assistant message
 * therefore yields no text even though the agent produced a real result earlier.
 * Scan backwards for the newest assistant message that actually contains text.
 */
export function extractFinalAssistantText(messages: TaskMessage[]): string {
  const assistantMessages = messages.filter((m) => m.info?.role === "assistant");
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const text = (assistantMessages[i]?.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .filter((part) => part.length > 0)
      .join("\n");
    if (text) return text;
  }
  return "";
}

export async function formatTaskResult(
  task: BackgroundTask,
  getMessages: (sessionID: string) => Promise<TaskMessage[]>
): Promise<string> {
  const duration = formatDuration(task.startedAt, task.completedAt);

  // Prefer the result captured explicitly when the task completed. This survives
  // session deletion and does not depend on the last message having a text part.
  if (task.result) {
    return FORMAT_TEMPLATES.taskResult(shortId(task.sessionID), task.description, duration, task.result);
  }

  try {
    const messages = await getMessages(task.sessionID);

    if (!Array.isArray(messages) || messages.length === 0) {
      return FORMAT_TEMPLATES.taskResult(
        shortId(task.sessionID),
        task.description,
        duration,
        PLACEHOLDER_TEXT.noMessagesFound
      );
    }

    const assistantMessages = messages.filter((m) => m.info?.role === "assistant");

    if (assistantMessages.length === 0) {
      return FORMAT_TEMPLATES.taskResult(
        shortId(task.sessionID),
        task.description,
        duration,
        PLACEHOLDER_TEXT.noAssistantResponse
      );
    }

    const textContent = extractFinalAssistantText(messages);

    return FORMAT_TEMPLATES.taskResult(
      shortId(task.sessionID),
      task.description,
      duration,
      textContent || PLACEHOLDER_TEXT.noTextOutput
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return FORMAT_TEMPLATES.taskResultError(
      shortId(task.sessionID),
      task.description,
      duration,
      errMsg
    );
  }
}
