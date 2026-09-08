# Better OpenCode Async Agents

[![npm version](https://img.shields.io/npm/v/better-opencode-async-agents)](https://www.npmjs.com/package/better-opencode-async-agents)
[![license](https://img.shields.io/npm/l/better-opencode-async-agents)](https://github.com/mainsoft-2024/better-opencode-async-agents/blob/main/LICENSE)

An unopinionated, 
**Async**, 
Forkable, 
Resumable, 
Parallelizable
multi-agent plugin for OpenCode.

## Configuration

Add the plugin to your `opencode.json(c)`:

```json
{
  "plugin": ["better-opencode-async-agents"]
}
```

## Overview

This is the subagent/subtask plugin we all know and love, with some key features that support advanced agent control:

- **Async & Batch Task Execution**: Run multiple agent tasks in parallel without blocking the main conversation. Launch tasks individually or in batches and continue working while they execute.

- **Real-time Progress Tracking**: Live updates with spinner animations and tool call counts. See exactly what each agent is doing as it works.

- **Resumable & Cancellable**: Resume completed tasks with follow-up messages for multi-turn conversations. Cancel running tasks at any time.

- **Context Forking Support**: Fork the current conversation context to spawn new agent sessions that inherit the parent's context.

- **Automatic Context Truncation**: When forking, context is intelligently truncated to fit within token limits while preserving the most relevant information.

- **Dynamic Agent Response Collection**: Collect responses from agents in blocking or non-blocking modes. Wait for all tasks to complete or check progress incrementally.

- **Live Steering**: Send a message to a running task; its agent reads it at its next step and changes course — no need to cancel and restart.

- **Child→Parent Reporting**: Background agents can send compact status reports/questions back to the orchestrator (`bgagent_report`) without dumping their full history into its context.

- **Inspectable Sessions**: Each background task runs as a normal conversation in the UI, so you can open and watch it live.

- **Variable Timeouts**: Configure custom timeouts per task. Some tasks need seconds, others need minutes - you decide.

## Tools Provided

| Tool | Description |
|------|-------------|
| `bgagent_task` | Launch async background agent tasks (or resume/follow-up) with description, prompt, and agent type |
| `bgagent_output` | Get task results (blocking or non-blocking) with configurable timeout and message filtering |
| `bgagent_cancel` | Cancel a running task |
| `bgagent_list` | List all tasks with optional status filter |
| `bgagent_clear` | Abort and clear all tasks |
| `bgagent_steer` | Send a steering message to a running task; the agent reads it at its next step and changes course |
| `bgagent_progress` | Lightweight progress of a running task (status, phase, tool calls) without dumping its full history |
| `bgagent_report` | Child→parent channel: send a compact status report/question to the parent session |

## Philosophy

This is an unopinionated tool. It provides the primitives for async multi-agent orchestration without imposing a specific workflow. You decide:

- When to block vs. fire-and-forget
- How to structure your agent hierarchy
- What context to fork and when
- How long to wait for results

Build your own patterns on top of these building blocks.

## Development

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT

---

For issues, questions, or contributions, visit the [GitHub repository](https://github.com/mainsoft-2024/better-opencode-async-agents).
