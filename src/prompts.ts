// =============================================================================
// Centralized Prompts & Text Strings
// =============================================================================
// All user-facing text, tool descriptions, and notification messages.
// Edit prompts here to update them across the entire codebase.
// =============================================================================

// =============================================================================
// Tool Descriptions (for AI/LLM consumption)
// =============================================================================

export const TOOL_DESCRIPTIONS = {
  backgroundTask: `Launch a background agent task that runs asynchronously with clear context.

The task runs in a separate session while you continue with other work.

Use this for:
- Long-running research tasks
- Complex analysis that doesn't need immediate results
- Parallel workloads to maximize throughput

Arguments:
- resume: (Optional) Task ID to resume - if provided, enters resume mode. You can send follow-up prompts for continuous feedback.
- fork: (Optional) If true, fork parent context to child session (child inherits conversation history of caller agent). MUST provide the expected response to it.
- model: (Optional) Model override for the task session in "provider/model-id" form. Defaults to the current model of the parent conversation.
- description: Short task description (shown in status)
- prompt: Full detailed prompt for the agent (or follow-up message in resume mode)
- agent: Agent type to use (any registered agent)

IMPORTANT: You'll be informed when each task is complete. DO NOT assume all tasks were done, check again if all agents you need are complete.

  Returns immediately with task ID. The task will run in background and notify you when complete.
Optionally use \`bgagent_output\` later if you need to check results manually with or without blocking.`,

  backgroundList: `List all background tasks.

Shows all running, completed, error, and cancelled background tasks with their status.

Arguments:
- status: Optional filter by status ("running", "completed", "error", "cancelled").`,

  backgroundCancel: `Cancel a running background task.

Only works for tasks with status "running". Aborts the background session and marks the task as cancelled.

Arguments:
- task_id: Required task ID to cancel.`,

  backgroundOutput: `Get output from a background task.

Arguments:
- task_id: Required task ID to get output from
- block: Optional boolean to wait for task completion (default: false)
- timeout: Optional timeout in seconds when blocking (default: 120, max: 600)
- full_session: Optional boolean to return full session messages instead of just the final result (default: false)
- include_thinking: Optional boolean to include thinking/reasoning content (default: false, requires full_session=true)
- include_tool_results: Optional boolean to include tool result content (default: false, requires full_session=true)
- since_message_id: Optional message ID to return only messages after this ID (requires full_session=true)
- message_limit: Optional max number of messages to return, max 100 (requires full_session=true)
- thinking_max_chars: Optional max characters for thinking content truncation (requires full_session=true)

Returns:
- Current status and result (if completed)
- When full_session=true, returns filtered session messages
- When full_session=true on a running task, returns partial results (messages available so far)
- Combine full_session with since_message_id for incremental polling of new messages from running tasks
- When block=true, waits until task completes or timeout is reached
- When block=false (default), returns immediately with current status

Note: full_session works for both running and completed tasks. For running tasks, it returns all messages available so far, allowing real-time progress monitoring.`,
  backgroundClear: `Clear and abort all background tasks immediately.

Use this to stop all running background agents and clear the task list.
This is useful when you want to start fresh or cancel all pending work.`,

  backgroundSteer: `Send a steering message to a RUNNING background task.

The task's agent reads it at its next step and changes course. Use this to:
- Redirect an agent that is going the wrong way
- Request a compact status report ("give status report: what's done, what's left?")

Does NOT pollute your context with the task's full history — if instructed,
the child replies via bgagent_report with a short summary.

Arguments:
- task_id: Required task ID to steer
- message: The steering instruction / status-report request

Note: if the agent is mid long-running tool, the message is read when that tool yields.
Use bgagent_cancel to abort a runaway tool instead.`,
  backgroundProgress: `Get lightweight progress from a background task WITHOUT dumping its full history.

Returns compact metadata only: status, phase, tool call counts, last tools used,
elapsed time, and an optional short tail of the latest assistant text.

Arguments:
- task_id: Required task ID
- tail: Optional number of chars of latest assistant text to include (default 300, max 2000). 0 = metadata only.

Prefer this over bgagent_output(...full_session=true) to avoid polluting your context
with the task's full token history.`,
  backgroundReport: `Call this from WITHIN a child/background agent to send a short status report or question to its parent session.

Use for progress updates ("done X, still need Y") or to ask the parent something.
This is the channel for child->parent communication. It sends a compact message to the
parent instead of outputting a huge context dump.

Arguments:
- message: The report/question text (keep it concise)

Requires the child agent's config to enable bgagent_report.`,
};

// =============================================================================
// Success Messages
// =============================================================================

export const SUCCESS_MESSAGES = {
  taskLaunched: (shortTaskId: string) => `⏳ **Background task launched**
Task ID: \`${shortTaskId}\`

You can continue working or say 'waiting' and halt.`,

  taskCancelled: (shortTaskId: string, description: string) => `⊘ **Task cancelled**

Task ID: \`${shortTaskId}\`
Description: ${description}
Status: ⊘ cancelled`,

  resumeInitiated: (shortTaskId: string, resumeCount: number) => {
    const resumeCountInfo = resumeCount > 1 ? `\nResume count: ${resumeCount}` : "";
    return `⏳ **Resume initiated**
Task ID: \`${shortTaskId}\`${resumeCountInfo}

Follow-up prompt sent. You can continue working or say 'waiting' and halt.`;
  },

  resumeQueued: (shortTaskId: string) => `⏳ **Resume queued**
Task ID: \`${shortTaskId}\`
Will execute automatically when the current run completes.`,

  clearedAllTasks: (runningCount: number, totalCount: number) => `✓ **Cleared all background tasks**

Running tasks aborted: ${runningCount}
Total tasks cleared: ${totalCount}`,

  resumeResponse: (resumeCount: number, textContent: string) =>
    `✓ **Resume Response** (count: ${resumeCount})\n\n${textContent || "(No text response)"}`,

  resumeResponseNoContent: (resumeCount: number) =>
    `✓ **Resume Response** (count: ${resumeCount})\n\n(No response found)`,

  steerInitiated: (shortTaskId: string) => `⏳ **Steering message sent**
Task ID: \`${shortTaskId}\`
The agent will read it at its next step. Use bgagent_progress for live updates.`,

  reportSent: (parentShortId: string) => `✓ **Report sent to parent**
Parent: \`${parentShortId}\``,
};

// =============================================================================
// Error Messages
// =============================================================================

export const ERROR_MESSAGES = {
  // Task validation errors
  taskNotFound: (taskId: string) => `Task not found: ${taskId}`,
  taskNotFoundWithHint: (taskId: string) =>
    `Task not found: ${taskId}. Use bgagent_list to see available tasks.`,

  // Resume validation errors
  taskCurrentlyResuming: "Task is currently being resumed. Wait for completion.",
  onlyCompletedCanResume: (currentStatus: string) =>
    `Only completed tasks can be resumed. Current status: ${currentStatus}`,
  queueFull: "Task already has a pending resume queued. Wait for current execution to complete.",
  sessionExpired: "Session expired or was deleted. Start a new bgagent_task to continue.",

  // Launch validation errors
  agentRequired: "Agent parameter is required. Specify which agent to use.",
  promptRequired: "Prompt is required when resuming a task",

  // Generic errors
  launchFailed: (message: string) => `Failed to launch background task: ${message}`,
  cancelFailed: (message: string) => `Error cancelling task: ${message}`,
  listFailed: (message: string) => `Error listing tasks: ${message}`,
  outputFailed: (message: string) => `Error getting output: ${message}`,
  clearFailed: (message: string) => `Error clearing tasks: ${message}`,
  resumeFailed: (errorMsg: string) => `Error resuming task: ${errorMsg}`,
  fetchMessagesFailed: (errMsg: string) => `Error fetching messages: ${errMsg}`,

  // Steer / progress / report errors
  onlyRunningCanSteer: (status: string) =>
    `Task cannot be steered (status: ${status}). Only running or resumed tasks can be steered.`,
  steerFailed: (message: string) => `Error steering task: ${message}`,
  progressFailed: (message: string) => `Error getting progress: ${message}`,
  reportFailed: (message: string) => `Error sending report: ${message}`,
  reportNoParent:
    "This session is not a background task with a parent. bgagent_report is only available to child/background agents.",

  // List empty states
  noTasksFound: "No background tasks found.",
  noTasksWithStatus: (status: string) => `No background tasks found with status "${status}".`,
  noTasksToClear: "No background tasks to clear.",
};

// =============================================================================
// Warnings
// =============================================================================

export const WARNING_MESSAGES = {
  resumeModeIgnoresParams: "Note: agent and description are ignored in resume mode.",
};

// =============================================================================
// Fork Messages
// =============================================================================

export const FORK_MESSAGES = {
  forkResumeConflict:
    "Cannot use fork and resume together. Use fork for new tasks with context, resume for continuing existing tasks.",
};

/**
 * Builds a dynamic preamble for forked context with truncation metadata.
 * Informs the child agent about what processing was applied to the inherited context.
 */
export function buildForkPreamble(stats: {
  compactionDetected: boolean;
  tierDistribution: { tier1: number; tier2: number; tier3: number };
  removedMessages: number;
}): string {
  const compactionStatus = stats.compactionDetected
    ? "Compaction summary included (messages before compaction removed)"
    : "No compaction detected";

  const tierSummary = `Tool results: ${stats.tierDistribution.tier1} full, ${stats.tierDistribution.tier2} truncated to 3000 chars, ${stats.tierDistribution.tier3} truncated to 500 chars`;

  const removalStatus =
    stats.removedMessages > 0
      ? `${stats.removedMessages} oldest messages removed to fit 200k char budget`
      : "All messages preserved";

  return `You are working with forked context from a parent agent session.
Context processing applied:
- ${compactionStatus}
- ${tierSummary}
- ${removalStatus}
If you need complete file contents or detailed results, re-read the files directly.`;
}

// =============================================================================
// Notification Messages (sent to parent session)
// =============================================================================

export const NOTIFICATION_MESSAGES = {
  // Visible notification messages
  visibleTaskCompleted: (description: string, duration: string) =>
    `✓ **Agent "${description}" finished in ${duration}.**`,

  visibleTaskFailed: (description: string, duration: string) =>
    `✗ **Agent "${description}" failed in ${duration}.**`,

  visibleTaskCancelled: (description: string, duration: string) =>
    `⊘ **Agent "${description}" cancelled after ${duration}.**`,

  visibleResumeCompleted: (resumeCount: number, duration: string) =>
    `✓ **Resume #${resumeCount} completed in ${duration}.**`,

  visibleResumeFailed: (resumeCount: number, duration: string) =>
    `✗ **Resume #${resumeCount} failed in ${duration}.**`,

  taskProgressLine: (completed: number, total: number) => `Task Progress: ${completed}/${total}`,

  devHintIndicator: "[hint attached]",
};

// =============================================================================
// System Hint Messages (hidden from user, sent via session.prompt() with synthetic: true)
// =============================================================================

export const SYSTEM_HINT_MESSAGES = {
  runningTasksHint: (taskId: string) =>
    `If you need results immediately, use bgagent_output(task_id="${taskId}").
You can continue working or just say 'waiting' and halt.
WATCH OUT for leftovers, you will likely WANT to wait for all agents to complete.`,

  allTasksDoneHint: (totalCount: number) =>
    `All ${totalCount} tasks finished.
Use bgagent_output tools to see agent responses.`,

  errorHint: (taskId: string, errorMessage: string) =>
    `Task failed: ${errorMessage}
Use bgagent_output(task_id="${taskId}") for details.`,

  resumeHint: (taskId: string) => `Use bgagent_output(task_id="${taskId}") for full response.`,
};

// =============================================================================
// Toast Titles
// =============================================================================

export const TOAST_TITLES = {
  taskCompleted: "✓ Task completed",
  taskFailed: "✗ Task failed",
  taskCancelled: "⊘ Task cancelled",
  backgroundTasksRunning: (spinner: string) => {
    const prefix = process.env.OPENCODE_BGAGENT_PREFIX;
    const client = process.env.ASYNCAGENTS_CLIENT;
    const baseText = client === "SLASH" ? "SlashAgents" : "AsyncAgents";
    return prefix ? `⛭ ${prefix} ${baseText}` : `⛭ ${baseText}`;
  },
  tasksComplete: "✓ Tasks complete",
};

// =============================================================================
// Status Notes (for formatTaskStatus)
// =============================================================================

export const STATUS_NOTES = {
  running: "\n\n> ⏳ **Running**: Task is still in progress. Check back later for results.",
  failed: (error: string) => `\n\n> ✗ **Failed**: ${error || "Unknown error"}`,
  cancelled: "\n\n> ⊘ **Cancelled**: Task was cancelled before completion.",
};

// =============================================================================
// Format Templates
// =============================================================================

export const FORMAT_TEMPLATES = {
  taskStatus: (
    icon: string,
    shortTaskId: string,
    description: string,
    agent: string,
    status: string,
    duration: string,
    progressSection: string,
    statusNote: string,
    promptPreview: string
  ) => `# ${icon} Task Status

| Field | Value |
|-------|-------|
| Task ID | \`${shortTaskId}\` |
| Description | ${description} |
| Agent | ${agent} |
| Status | ${icon} **${status}** |
| Duration | ${duration} |${progressSection}
${statusNote}
## Original Prompt

\`\`\`
${promptPreview}
\`\`\``,

  taskResult: (shortTaskId: string, description: string, duration: string, content: string) =>
    `✓ **Task Completed**

| Field | Value |
|-------|-------|
| Task ID | \`${shortTaskId}\` |
| Description | ${description} |
| Duration | ${duration} |

---

${content}`,

  taskResultError: (shortTaskId: string, description: string, duration: string, errMsg: string) =>
    `Task Result

Task ID: ${shortTaskId}
Description: ${description}
Duration: ${duration}

---

Error fetching messages: ${errMsg}`,

  listHeader: `# Background Tasks

| Task ID | Description | Agent | Status | Duration | Tools |
|---------|-------------|-------|--------|----------|-------|`,

  listSummary: (
    total: number,
    running: number,
    completed: number,
    errored: number,
    cancelled: number,
    totalToolCalls: number
  ) =>
    `**Total: ${total}** | ⏳ ${running} running | ✓ ${completed} completed | ✗ ${errored} error | ⊘ ${cancelled} cancelled | 🔧${totalToolCalls}`,

  progressSection: (tools: string[]) => `\n| Last tools | ${tools.join(" → ")} |`,
};

// =============================================================================
// Placeholder Text
// =============================================================================

export const PLACEHOLDER_TEXT = {
  noMessagesFound: "(No messages found)",
  noAssistantResponse: "(No assistant response found)",
  noTextOutput: "(No text output)",
  noTextResponse: "(No text response)",
  noResponseFound: "(No response found)",
  andMoreFinished: (count: number) => `   ... and ${count} more finished`,
};
