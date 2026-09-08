import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { shortId } from "../helpers";
import { ERROR_MESSAGES, SUCCESS_MESSAGES, TOOL_DESCRIPTIONS } from "../prompts";
import type { BackgroundTask } from "../types";

// =============================================================================
// Background Steer Tool Factory
// =============================================================================

export function createBackgroundSteer(manager: {
  resolveTaskIdWithFallback(id: string): Promise<string | null>;
  getTaskWithFallback(id: string): Promise<BackgroundTask | undefined>;
  steerTask(task: BackgroundTask, message: string): Promise<void>;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundSteer,
    args: {
      task_id: tool.schema.string(),
      message: tool.schema.string(),
    },
    async execute(
      args: { task_id: string; message: string },
      context: {
        metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void;
      }
    ) {
      try {
        const resolved = await manager.resolveTaskIdWithFallback(args.task_id);
        if (!resolved) return ERROR_MESSAGES.taskNotFoundWithHint(args.task_id);

        const task = await manager.getTaskWithFallback(resolved);
        if (!task) return ERROR_MESSAGES.taskNotFoundWithHint(args.task_id);

        if (task.status !== "running" && task.status !== "resumed") {
          return ERROR_MESSAGES.onlyRunningCanSteer(task.status);
        }

        await manager.steerTask(task, args.message);

        // Link the child session to this tool part so the parent UI shows a
        // clickable card for the steered subagent.
        context?.metadata?.({
          title: `steer: ${task.description}`,
          metadata: { sessionId: task.sessionID, parentSessionId: task.parentSessionID },
        });

        return SUCCESS_MESSAGES.steerInitiated(shortId(task.sessionID));
      } catch (error) {
        return ERROR_MESSAGES.steerFailed(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
