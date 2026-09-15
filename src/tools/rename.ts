import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { shortId } from "../helpers";
import { ERROR_MESSAGES, SUCCESS_MESSAGES, TOOL_DESCRIPTIONS } from "../prompts";
import type { BackgroundTask } from "../types";

// =============================================================================
// Background Rename Tool Factory
// =============================================================================

export function createBackgroundRename(manager: {
  resolveTaskIdWithFallback(id: string): Promise<string | null>;
  getTaskWithFallback(id: string): Promise<BackgroundTask | undefined>;
  renameSession(sessionID: string, title: string): Promise<void>;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundRename,
    args: {
      title: tool.schema.string(),
      task_id: tool.schema.string().optional(),
    },
    async execute(args: { title: string; task_id?: string }, context: { sessionID: string }) {
      try {
        let sessionID = context.sessionID;
        if (args.task_id) {
          const resolved = await manager.resolveTaskIdWithFallback(args.task_id);
          if (!resolved) return ERROR_MESSAGES.taskNotFoundWithHint(args.task_id);
          const task = await manager.getTaskWithFallback(resolved);
          if (!task) return ERROR_MESSAGES.taskNotFoundWithHint(args.task_id);
          sessionID = task.sessionID;
        }
        await manager.renameSession(sessionID, args.title);
        return SUCCESS_MESSAGES.renamed(shortId(sessionID), args.title);
      } catch (error) {
        return ERROR_MESSAGES.renameFailed(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
