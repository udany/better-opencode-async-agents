import { setTaskStatus, shortId } from "../helpers";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../prompts";
import type { BackgroundTask } from "../types";

// =============================================================================
// Resume Helper Types
// =============================================================================

export interface ResumeManager {
  getTask(taskId: string): BackgroundTask | undefined;
  resolveTaskId(idOrPrefix: string): string | null;
  resolveTaskIdWithFallback(idOrPrefix: string): Promise<string | null>;
  getTaskWithFallback(id: string): Promise<BackgroundTask | undefined>;
  persistTask(task: BackgroundTask): Promise<void>;
  checkSessionExists(sessionID: string): Promise<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendResumePromptAsync(task: BackgroundTask, message: string, toolContext: any): Promise<void>;
}

export type ResumeValidationResult =
  | { valid: true; task: BackgroundTask }
  | { valid: false; error: string };

// =============================================================================
// Resume Helper Functions
// =============================================================================

/**
 * Validates that a task can be resumed (async version that checks disk)
 * @param manager - BackgroundManager instance
 * @param taskId - Task ID (full or short) to validate
 * @returns Validation result with task if valid, or error message
 */
export async function validateResumeTask(
  manager: ResumeManager,
  taskId: string
): Promise<ResumeValidationResult> {
  // Resolve short ID or prefix to full ID (checks disk if not in memory)
  const resolvedId = await manager.resolveTaskIdWithFallback(taskId);
  if (!resolvedId) {
    return {
      valid: false,
      error: ERROR_MESSAGES.taskNotFoundWithHint(taskId),
    };
  }

  // Get task from memory or disk
  const task = await manager.getTaskWithFallback(resolvedId);

  if (!task) {
    return {
      valid: false,
      error: ERROR_MESSAGES.taskNotFoundWithHint(taskId),
    };
  }

  // Any task can be (re)resumed — including one already running or already
  // resumed: another follow-up is just injected. No "currently resuming" lock.
  return { valid: true, task };
}

/**
 * Executes the resume operation on a validated task.
 *
 * Non-blocking: it injects the follow-up prompt into the task's session and
 * returns immediately. Completion is detected by the normal idle/poll path —
 * resume never waits synchronously and never invents a timeout. For a still
 * running task the follow-up is picked up like a steering message; for a
 * finished task it starts a new turn.
 *
 * @param manager - BackgroundManager instance
 * @param task - The task to resume (must be validated first)
 * @param prompt - The follow-up prompt to send
 * @param toolContext - Tool context (unused for waiting; kept for notifications)
 * @returns Success message or error message
 */
export async function executeResume(
  manager: ResumeManager,
  task: BackgroundTask,
  prompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolContext: any
): Promise<{ success: true; message: string } | { success: false; error: string }> {
  const wasRunning = task.status === "running";

  if (!wasRunning) {
    // Verify the session still exists before re-activating a finished task.
    const sessionExists = await manager.checkSessionExists(task.sessionID);
    if (!sessionExists) {
      return { success: false, error: ERROR_MESSAGES.sessionExpired };
    }
    setTaskStatus(task, "resumed");
    // Drop the previous turn's captured result so output reflects the new turn.
    task.result = undefined;
  }
  task.resumeCount++;

  try {
    await manager.sendResumePromptAsync(task, prompt, toolContext);
    await manager.persistTask(task);
    return {
      success: true,
      message: SUCCESS_MESSAGES.resumeInitiated(shortId(task.sessionID), task.resumeCount),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    setTaskStatus(task, "error", { error: errorMsg });
    await manager.persistTask(task);
    return { success: false, error: ERROR_MESSAGES.resumeFailed(errorMsg) };
  }
}
