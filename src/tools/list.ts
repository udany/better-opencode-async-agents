import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { formatDuration, formatModel, getStatusIcon, uniqueShortId } from "../helpers";
import {
  ERROR_MESSAGES,
  FORMAT_TEMPLATES,
  TOOL_DESCRIPTIONS,
} from "../prompts";
import type { BackgroundTask } from "../types";

// =============================================================================
// Background List Tool Factory
// =============================================================================

export function createBackgroundList(manager: {
  getAllTasks(): BackgroundTask[];
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundList,
    args: {
      status: tool.schema.string().optional().describe("Filter by status"),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async execute(args: { status?: string }, toolContext: any) {
      try {
        let tasks = manager.getAllTasks();

        // Filter to only show tasks that are children of the current session
        const currentSessionID = toolContext?.sessionID;
        if (currentSessionID) {
          tasks = tasks.filter((t) => t.parentSessionID === currentSessionID);
        }

        if (args.status) {
          tasks = tasks.filter((t) => t.status === args.status?.toLowerCase());
        }

        if (tasks.length === 0) {
          return args.status
            ? ERROR_MESSAGES.noTasksWithStatus(args.status)
            : ERROR_MESSAGES.noTasksFound;
        }

        tasks.sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        );

        const header = FORMAT_TEMPLATES.listHeader;

        // Get all session IDs for collision-free short ID generation
        const allSessionIds = tasks.map((t) => t.sessionID);

        const rows = tasks
          .map((task) => {
            const duration = formatDuration(task.startedAt, task.completedAt);
            const desc =
              task.description.length > 30
                ? `${task.description.slice(0, 27)}...`
                : task.description;
            const icon = getStatusIcon(task.status);
            const indicators = [
              task.isForked ? "(forked)" : "",
              task.resumeCount > 0 ? "(resumed)" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const shortId = uniqueShortId(task.sessionID, allSessionIds);
            const idWithIndicators = indicators
              ? `${shortId} ${indicators}`
              : shortId;
            const toolsInfo =
              task.progress?.toolCallsByName &&
              Object.keys(task.progress.toolCallsByName).length > 0
                ? Object.entries(task.progress.toolCallsByName)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, count]) => `${name}:${count}`)
                    .join(" ")
                : task.progress?.toolCalls
                  ? `🔧${task.progress.toolCalls}`
                  : "-";
            return `| \`${idWithIndicators}\` | ${desc} | ${task.agent} | ${formatModel(task.model)} | ${icon} ${task.status} | ${duration} | ${toolsInfo} |`;
          })
          .join("\n");

        const running = tasks.filter((t) => t.status === "running").length;
        const completed = tasks.filter((t) => t.status === "completed").length;
        const errored = tasks.filter((t) => t.status === "error").length;
        const cancelled = tasks.filter((t) => t.status === "cancelled").length;
        const totalToolCalls = tasks.reduce(
          (sum, t) => sum + (t.progress?.toolCalls ?? 0),
          0,
        );

        return `${header}
${rows}

---
${FORMAT_TEMPLATES.listSummary(tasks.length, running, completed, errored, cancelled, totalToolCalls)}`;
      } catch (error) {
        return ERROR_MESSAGES.listFailed(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
