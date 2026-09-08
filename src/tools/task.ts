import { type ToolDefinition, tool } from "@opencode-ai/plugin";
import { uniqueShortId } from "../helpers";
import {
  ERROR_MESSAGES,
  FORK_MESSAGES,
  SUCCESS_MESSAGES,
  TOOL_DESCRIPTIONS,
  WARNING_MESSAGES,
} from "../prompts";
import type { BackgroundTask, LaunchInput } from "../types";
import { type ResumeManager, executeResume, validateResumeTask } from "./resume";

// =============================================================================
// Combined Manager Interface (supports both launch and resume)
// =============================================================================

interface TaskManager extends ResumeManager {
  launch(input: LaunchInput): Promise<BackgroundTask>;
  getTaskSessionIds(): string[];
}

// =============================================================================
// Background Task Tool Factory
// =============================================================================

/**
 * Creates the background_task tool for launching async background agent tasks
 * and resuming completed tasks with follow-up prompts
 * @param manager - BackgroundManager instance with launch() and resume methods
 * @returns Tool definition for background_task
 */
export function createBackgroundTask(manager: TaskManager): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTIONS.backgroundTask,
    args: {
      resume: tool.schema.string().optional(),
      fork: tool.schema.boolean().optional(),
      model: tool.schema
        .string()
        .optional()
        .describe(
          'Model override for the task session in "provider/model-id" form. Defaults to the current model of the parent conversation.'
        ),
      description: tool.schema.string().nonoptional(),
      prompt: tool.schema.string().nonoptional(),
      agent: tool.schema.string().nonoptional(),
    },
    async execute(
      args: {
        resume?: string;
        fork?: boolean;
        model?: string;
        description: string;
        prompt: string;
        agent: string;
      },
      toolContext
    ) {
      // =======================================================================
      // Validation: fork and resume are mutually exclusive
      // =======================================================================
      if (args.fork && args.resume) {
        return FORK_MESSAGES.forkResumeConflict;
      }

      // =======================================================================
      // Mode Detection: if resume is truthy, use resume mode
      // =======================================================================
      if (args.resume) {
        return handleResumeMode(manager, args, toolContext);
      }

      // =======================================================================
      // Launch Mode: create a new background task (with optional fork)
      // =======================================================================
      return handleLaunchMode(manager, args, toolContext);
    },
  });
}

// =============================================================================
// Resume Mode Handler
// =============================================================================

async function handleResumeMode(
  manager: TaskManager,
  args: { resume?: string; description: string; prompt: string; agent: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolContext: any
): Promise<string> {
  // args.resume is guaranteed to be truthy here (checked in caller)
  const taskId = args.resume as string;

  // Validate prompt is provided and non-empty
  const trimmedPrompt = args.prompt?.trim();
  if (!trimmedPrompt) {
    return ERROR_MESSAGES.promptRequired;
  }

  // Warn if extra params are provided (but proceed with resume)
  const warnings: string[] = [];
  if (args.agent?.trim() || args.description?.trim()) {
    warnings.push(WARNING_MESSAGES.resumeModeIgnoresParams);
  }

  // Validate the task can be resumed (async - checks disk if not in memory)
  const validation = await validateResumeTask(manager, taskId);
  if (!validation.valid) {
    return validation.error;
  }

  // Execute the resume
  const result = await executeResume(manager, validation.task, trimmedPrompt, toolContext);

  if (!result.success) {
    return result.error;
  }

  // Return success message with any warnings
  if (warnings.length > 0) {
    return `${warnings.join("\n")}\n\n${result.message}`;
  }

  return result.message;
}

// =============================================================================
// Launch Mode Handler
// =============================================================================

async function handleLaunchMode(
  manager: TaskManager,
  args: {
    resume?: string;
    fork?: boolean;
    model?: string;
    description: string;
    prompt: string;
    agent: string;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolContext: any
): Promise<string> {
  if (!args.agent || args.agent.trim() === "") {
    return ERROR_MESSAGES.agentRequired;
  }

  try {
    const task = await manager.launch({
      description: args.description,
      prompt: args.prompt,
      agent: args.agent.trim(),
      fork: args.fork,
      model: args.model,
      parentSessionID: toolContext.sessionID,
      parentMessageID: toolContext.messageID,
      parentAgent: toolContext.agent,
    });

    // Link the child session to this tool part so the UI renders a
    // clickable subagent card in the parent timeline (same mechanism as the
    // native `task` tool: state.metadata.sessionId drives child navigation).
    toolContext?.metadata?.({
      title: args.description,
      metadata: { sessionId: task.sessionID, parentSessionId: task.parentSessionID },
    });

    // Get sibling IDs to generate collision-free short ID
    const siblingIds = manager.getTaskSessionIds?.() ?? [];
    const displayId = uniqueShortId(task.sessionID, siblingIds);
    return SUCCESS_MESSAGES.taskLaunched(displayId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return ERROR_MESSAGES.launchFailed(message);
  }
}
