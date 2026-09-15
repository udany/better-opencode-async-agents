import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { ERROR_MESSAGES, TOOL_DESCRIPTIONS } from "../prompts";

// =============================================================================
// Background Finish Tool Factory (explicit completion for interactive sessions)
// =============================================================================

export function createBackgroundFinish(manager: {
  finishTask(childSessionID: string, message?: string): Promise<string>;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundFinish,
    args: {
      message: tool.schema
        .string()
        .optional()
        .describe("Optional short summary of the outcome to hand to the parent."),
    },
    async execute(args: { message?: string }, context: { sessionID: string }) {
      try {
        return await manager.finishTask(context.sessionID, args.message);
      } catch (error) {
        return ERROR_MESSAGES.finishFailed(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
