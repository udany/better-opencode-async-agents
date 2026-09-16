import { describe, expect, mock, test } from "bun:test";
import type { BackgroundTask, FilteredMessage, MessageFilter } from "../../types";
import { createBackgroundOutput } from "../output";

const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_test123",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "test-agent",
  description: "Test task",
  prompt: "Test prompt",
  agent: "explore",
  status: "running",
  startedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  batchId: "batch_123",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});

type MockOutputManager = {
  getTask: ReturnType<typeof mock>;
  resolveTaskIdWithFallback: ReturnType<typeof mock>;
  getTaskWithFallback: ReturnType<typeof mock>;
  checkAndUpdateTaskStatus: ReturnType<typeof mock>;
  waitForTask: ReturnType<typeof mock>;
  getTaskMessages: ReturnType<typeof mock>;
  getFilteredMessages: ReturnType<typeof mock>;
};

const createMockOutputManager = (
  task: BackgroundTask = createMockTask(),
  overrides: Partial<MockOutputManager> = {}
): MockOutputManager => ({
  getTask: mock(() => task as BackgroundTask | undefined),
  resolveTaskIdWithFallback: mock(() => Promise.resolve(task.sessionID)),
  getTaskWithFallback: mock(() => Promise.resolve(task as BackgroundTask | undefined)),
  checkAndUpdateTaskStatus: mock((current: BackgroundTask) => Promise.resolve(current)),
  waitForTask: mock(() => Promise.resolve(null as BackgroundTask | null)),
  getTaskMessages: mock(() => Promise.resolve([] as any[])),
  getFilteredMessages: mock(() => Promise.resolve([] as FilteredMessage[])),
  ...overrides,
});

describe("createBackgroundOutput", () => {
  test("backward compat: returns formatted result when no session params given", async () => {
    const completedTask = createMockTask({
      status: "completed",
      completedAt: new Date("2026-01-01T00:00:10.000Z").toISOString(),
    });
    const manager = createMockOutputManager(completedTask, {
      getTaskMessages: mock(() =>
        Promise.resolve([
          {
            info: { role: "assistant" },
            parts: [{ type: "text", text: "final assistant output" }],
          },
        ])
      ),
    });

    const tool = createBackgroundOutput(manager);
    const result = await tool.execute({ task_id: completedTask.sessionID }, {} as any);

    expect(result).toContain("final assistant output");
    expect(manager.getTaskMessages).toHaveBeenCalledWith(completedTask.sessionID);
    expect(manager.getFilteredMessages).not.toHaveBeenCalled();
  });

  test("backward compat: existing block/timeout params still work", async () => {
    const runningTask = createMockTask({ status: "running" });
    const completedTask = createMockTask({
      status: "completed",
      completedAt: new Date("2026-01-01T00:00:30.000Z").toISOString(),
    });
    const manager = createMockOutputManager(runningTask, {
      waitForTask: mock(() => Promise.resolve(completedTask)),
      checkAndUpdateTaskStatus: mock(() => Promise.resolve(completedTask)),
      getTaskMessages: mock(() => Promise.resolve([] as any[])),
    });

    const tool = createBackgroundOutput(manager);
    await tool.execute({ task_id: runningTask.sessionID, block: true, timeout: 60 }, {} as any);

    expect(manager.waitForTask).toHaveBeenCalledWith(runningTask.sessionID, 60000);
  });

  test("full_session=true returns filtered messages", async () => {
    const completedTask = createMockTask({ status: "completed" });
    const filtered: FilteredMessage[] = [
      { id: "msg_1", role: "assistant", type: "text", content: "hello from full session" },
      { id: "msg_2", role: "assistant", type: "text", content: "second message" },
    ];
    const manager = createMockOutputManager(completedTask, {
      getFilteredMessages: mock(() => Promise.resolve(filtered)),
    });

    const tool = createBackgroundOutput(manager);
    const result = await tool.execute(
      {
        task_id: completedTask.sessionID,
        full_session: true,
      } as any,
      {} as any
    );

    expect(manager.getFilteredMessages).toHaveBeenCalled();
    expect(result).toContain("msg_1");
    expect(result).toContain("hello from full session");
  });

  test("full_session=true passes filter params to getFilteredMessages", async () => {
    const completedTask = createMockTask({ status: "completed" });
    const manager = createMockOutputManager(completedTask, {
      getFilteredMessages: mock(() => Promise.resolve([] as FilteredMessage[])),
    });

    const tool = createBackgroundOutput(manager);
    await tool.execute(
      {
        task_id: completedTask.sessionID,
        full_session: true,
        include_thinking: true,
        include_tool_results: true,
        since_message_id: "msg_42",
        message_limit: 55,
        thinking_max_chars: 250,
      } as any,
      {} as any
    );

    const expectedFilter: MessageFilter = {
      fullSession: true,
      includeThinking: true,
      includeToolResults: true,
      sinceMessageId: "msg_42",
      messageLimit: 55,
      thinkingMaxChars: 250,
    };
    expect(manager.getFilteredMessages).toHaveBeenCalledWith(completedTask.sessionID, expectedFilter);
  });

  test("full_session=true with include_thinking passes includeThinking filter", async () => {
    const task = createMockTask({ status: "completed" });
    const manager = createMockOutputManager(task, {
      getFilteredMessages: mock(() => Promise.resolve([] as FilteredMessage[])),
    });

    const tool = createBackgroundOutput(manager);
    await tool.execute(
      { task_id: task.sessionID, full_session: true, include_thinking: true } as any,
      {} as any
    );

    expect(manager.getFilteredMessages).toHaveBeenCalledWith(
      task.sessionID,
      expect.objectContaining({ includeThinking: true })
    );
  });

  test("full_session=true with include_tool_results passes includeToolResults filter", async () => {
    const task = createMockTask({ status: "completed" });
    const manager = createMockOutputManager(task, {
      getFilteredMessages: mock(() => Promise.resolve([] as FilteredMessage[])),
    });

    const tool = createBackgroundOutput(manager);
    await tool.execute(
      { task_id: task.sessionID, full_session: true, include_tool_results: true } as any,
      {} as any
    );

    expect(manager.getFilteredMessages).toHaveBeenCalledWith(
      task.sessionID,
      expect.objectContaining({ includeToolResults: true })
    );
  });

  test("full_session=true with since_message_id passes sinceMessageId filter", async () => {
    const task = createMockTask({ status: "completed" });
    const manager = createMockOutputManager(task, {
      getFilteredMessages: mock(() => Promise.resolve([] as FilteredMessage[])),
    });

    const tool = createBackgroundOutput(manager);
    await tool.execute(
      { task_id: task.sessionID, full_session: true, since_message_id: "msg_100" } as any,
      {} as any
    );

    expect(manager.getFilteredMessages).toHaveBeenCalledWith(
      task.sessionID,
      expect.objectContaining({ sinceMessageId: "msg_100" })
    );
  });

  test("full_session=true with message_limit clamps to max 100", async () => {
    const task = createMockTask({ status: "completed" });
    const manager = createMockOutputManager(task, {
      getFilteredMessages: mock(() => Promise.resolve([] as FilteredMessage[])),
    });

    const tool = createBackgroundOutput(manager);
    await tool.execute({ task_id: task.sessionID, full_session: true, message_limit: 200 } as any, {} as any);

    expect(manager.getFilteredMessages).toHaveBeenCalledWith(
      task.sessionID,
      expect.objectContaining({ messageLimit: 100 })
    );
  });

  test("full_session=false falls back to formatTaskResult", async () => {
    const completedTask = createMockTask({ status: "completed" });
    const manager = createMockOutputManager(completedTask, {
      getTaskMessages: mock(() =>
        Promise.resolve([
          {
            info: { role: "assistant" },
            parts: [{ type: "text", text: "fallback output path" }],
          },
        ])
      ),
      getFilteredMessages: mock(() => Promise.resolve([] as FilteredMessage[])),
    });

    const tool = createBackgroundOutput(manager);
    const result = await tool.execute(
      {
        task_id: completedTask.sessionID,
        full_session: false,
      } as any,
      {} as any
    );

    expect(result).toContain("fallback output path");
    expect(manager.getTaskMessages).toHaveBeenCalledWith(completedTask.sessionID);
    expect(manager.getFilteredMessages).not.toHaveBeenCalled();
  });

  test("returns error when task not found", async () => {
    const manager = createMockOutputManager(createMockTask(), {
      resolveTaskIdWithFallback: mock(() => Promise.resolve(null as string | null)),
    });

    const tool = createBackgroundOutput(manager);
    const result = await tool.execute({ task_id: "missing_task" }, {} as any);

    expect(result).toContain("Task not found");
  });

  test("full_session=true works on running tasks", async () => {
    const runningTask = createMockTask({ status: "running" });
    const manager = createMockOutputManager(runningTask, {
      checkAndUpdateTaskStatus: mock(() => Promise.resolve(runningTask)),
      getFilteredMessages: mock(() =>
        Promise.resolve([
          {
            id: "msg_running_1",
            role: "assistant",
            type: "text",
            content: "streamed partial output",
          },
        ] as FilteredMessage[])
      ),
    });

    const tool = createBackgroundOutput(manager);
    const result = await tool.execute(
      { task_id: runningTask.sessionID, full_session: true } as any,
      {} as any
    );

    expect(manager.getFilteredMessages).toHaveBeenCalledWith(
      runningTask.sessionID,
      expect.objectContaining({ fullSession: true })
    );
    expect(result).toContain("msg_running_1");
    expect(result).toContain("streamed partial output");
  });

  test("skips tool-only trailing assistant messages and returns the last text", async () => {
    const completedTask = createMockTask({
      status: "completed",
      completedAt: new Date("2026-01-01T00:00:10.000Z").toISOString(),
    });
    const manager = createMockOutputManager(completedTask, {
      getTaskMessages: mock(() =>
        Promise.resolve([
          { info: { role: "assistant" }, parts: [{ type: "text", text: "the real result" }] },
          { info: { role: "assistant" }, parts: [{ type: "tool" }, { type: "step-finish" }] },
          { info: { role: "assistant" }, parts: [{ type: "tool" }] },
        ])
      ),
    });

    const tool = createBackgroundOutput(manager);
    const result = await tool.execute({ task_id: completedTask.sessionID }, {} as any);

    expect(result).toContain("the real result");
    expect(result).not.toContain("No text output");
  });

  test("prefers an explicitly captured task.result over fetching messages", async () => {
    const completedTask = createMockTask({
      status: "completed",
      completedAt: new Date("2026-01-01T00:00:10.000Z").toISOString(),
      result: "captured at completion",
    });
    const manager = createMockOutputManager(completedTask, {
      getTaskMessages: mock(() => Promise.resolve([] as any[])),
    });

    const tool = createBackgroundOutput(manager);
    const result = await tool.execute({ task_id: completedTask.sessionID }, {} as any);

    expect(result).toContain("captured at completion");
    expect(manager.getTaskMessages).not.toHaveBeenCalled();
  });
});