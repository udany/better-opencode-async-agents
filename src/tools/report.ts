import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { ERROR_MESSAGES, TOOL_DESCRIPTIONS } from "../prompts";

// =============================================================================
// Background Report Tool Factory (child -> parent communication)
// =============================================================================

export function createBackgroundReport(manager: {
  reportToParent(childSessionID: string, message: string): Promise<string>;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundReport,
    args: {
      message: tool.schema.string().describe("The report/question text (keep it concise)"),
    },
    async execute(args: { message: string }, context: { sessionID: string }) {
      try {
        return await manager.reportToParent(context.sessionID, args.message);
      } catch (error) {
        return ERROR_MESSAGES.reportFailed(error instanceof Error ? error.message : String(error));
      }
    },
  });
}
