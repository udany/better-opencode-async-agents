import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { BGAGENT_TOOL_NAMES } from "../constants";
import { formatDuration, formatModel, truncateText } from "../helpers";
import { ERROR_MESSAGES, TOOL_DESCRIPTIONS } from "../prompts";
import type { BackgroundTask, SessionPermission } from "../types";

// =============================================================================
// Background Progress Tool Factory (compact metadata, no full history dump)
// =============================================================================

type TaskMessage = {
  info?: { role?: string };
  parts?: Array<{ type?: string; text?: string }>;
};

const DEFAULT_TAIL = 300;
const MAX_TAIL = 2000;

/**
 * Formats the child's tool permissions. OpenCode only records DENY entries, so a
 * bgagent tool is available unless it appears in the deny list.
 */
function formatToolPermissions(permissions: SessionPermission[] | null): string[] {
  if (permissions === null) return ["Tools: (unavailable)"];
  const denied = new Set(
    permissions.filter((p) => p.action === "deny").map((p) => p.permission)
  );
  const enabled = BGAGENT_TOOL_NAMES.filter((name) => !denied.has(name));
  const lines = [`Bgagent tools: ${enabled.length > 0 ? enabled.join(", ") : "(none)"}`];
  const blocked = [...denied].sort();
  if (blocked.length > 0) lines.push(`Blocked tools: ${blocked.join(", ")}`);
  return lines;
}

function extractLatestText(messages: TaskMessage[], tail: number): string {
  const assistantMessages = (messages ?? []).filter((m) => m.info?.role === "assistant");
  if (assistantMessages.length === 0) return "";
  const last = assistantMessages[assistantMessages.length - 1];
  const textParts = last?.parts?.filter((p) => p.type === "text") ?? [];
  const text = textParts
    .map((p) => p.text ?? "")
    .filter((t) => t.length > 0)
    .join("\n")
    .trim();
  return text ? truncateText(text, tail) : "";
}

async function formatProgress(
  task: BackgroundTask,
  tail: number,
  getTaskMessages: (sessionID: string) => Promise<TaskMessage[]>,
  getTaskPermissions: (sessionID: string) => Promise<SessionPermission[] | null>
): Promise<string> {
  const progress = task.progress;
  const toolCallsByName = progress?.toolCallsByName ?? {};
  const lastTools = progress?.lastTools ?? [];
  const elapsed = formatDuration(task.startedAt, task.completedAt);

  const lines: string[] = [];
  lines.push(`Task ID: \`${task.sessionID.slice(0, 8)}\``);
  lines.push(`Description: ${task.description}`);
  lines.push(`Agent: ${task.agent}`);
  lines.push(`Model: ${formatModel(task.model)}`);
  lines.push(`Status: ${task.status}`);
  lines.push(`Phase: ${progress?.phase ?? "waiting"}`);
  lines.push(`Elapsed: ${elapsed}`);
  lines.push(`Tool calls: ${progress?.toolCalls ?? 0}`);
  if (Object.keys(toolCallsByName).length > 0) {
    const breakdown = Object.entries(toolCallsByName)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name}:${count}`)
      .join(" ");
    lines.push(`Tools breakdown: ${breakdown}`);
  }
  if (lastTools.length > 0) {
    lines.push(`Last tools: ${lastTools.join(" > ")}`);
  }
  lines.push(`Text generated: ${progress?.textCharCount ?? 0} chars`);

  try {
    lines.push(...formatToolPermissions(await getTaskPermissions(task.sessionID)));
  } catch {
    // Ignore permission fetch errors
  }

  if (tail > 0) {
    try {
      const messages = await getTaskMessages(task.sessionID);
      const tailText = extractLatestText(messages, tail);
      if (tailText) lines.push(`\nLatest text:\n${tailText}`);
    } catch {
      // Ignore message fetch errors
    }
  }

  return lines.join("\n");
}

export function createBackgroundProgress(manager: {
  resolveTaskIdWithFallback(id: string): Promise<string | null>;
  getTaskWithFallback(id: string): Promise<BackgroundTask | undefined>;
  getTaskMessages(sessionID: string): Promise<TaskMessage[]>;
  getTaskPermissions(sessionID: string): Promise<SessionPermission[] | null>;
}): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundProgress,
    args: {
      task_id: tool.schema.string(),
      tail: tool.schema
        .number()
        .optional()
        .describe(
          "Chars of latest assistant text to include (default 300, max 2000). 0 = metadata only"
        ),
    },
    async execute(args: { task_id: string; tail?: number }) {
      try {
        const resolved = await manager.resolveTaskIdWithFallback(args.task_id);
        if (!resolved) return ERROR_MESSAGES.taskNotFoundWithHint(args.task_id);
        const task = await manager.getTaskWithFallback(resolved);
        if (!task) return ERROR_MESSAGES.taskNotFoundWithHint(args.task_id);
        const tail = Math.min(Math.max(args.tail ?? DEFAULT_TAIL, 0), MAX_TAIL);
        return await formatProgress(
          task,
          tail,
          (id) => manager.getTaskMessages(id),
          (id) => manager.getTaskPermissions(id)
        );
      } catch (error) {
        return ERROR_MESSAGES.progressFailed(
          error instanceof Error ? error.message : String(error)
        );
      }
    },
  });
}
