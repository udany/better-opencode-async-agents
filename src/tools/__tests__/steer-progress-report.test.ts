import { describe, expect, mock, test } from "bun:test";
import { shortId } from "../../helpers";
import type { BackgroundTask } from "../../types";
import { createBackgroundProgress } from "../progress";
import { createBackgroundReport } from "../report";
import { createBackgroundSteer } from "../steer";

const createMockTask = (overrides: Partial<BackgroundTask> = {}): BackgroundTask => ({
  sessionID: "ses_test123",
  parentSessionID: "ses_parent",
  parentMessageID: "msg_parent",
  parentAgent: "test-agent",
  description: "Test task",
  prompt: "Test prompt",
  agent: "explore",
  status: "running",
  startedAt: new Date().toISOString(),
  batchId: "batch_123",
  resumeCount: 0,
  isForked: false,
  ...overrides,
});

describe("bgagent_steer", () => {
  const makeManager = (task?: BackgroundTask) => ({
    resolveTaskIdWithFallback: mock(() => Promise.resolve(task?.sessionID ?? null)),
    getTaskWithFallback: mock(() => Promise.resolve(task)),
    steerTask: mock(() => Promise.resolve()),
  });

  test("creates a tool with correct description", () => {
    const tool = createBackgroundSteer(makeManager());
    expect(tool.description).toContain("steering");
  });

  test("returns error when task not found", async () => {
    const tool = createBackgroundSteer(makeManager());
    const result = await tool.execute({ task_id: "nope", message: "hi" }, {} as any);
    expect(result).toContain("Task not found");
  });

  test("returns error when task is not running", async () => {
    const task = createMockTask({ status: "completed" });
    const tool = createBackgroundSteer(makeManager(task));
    const result = await tool.execute({ task_id: task.sessionID, message: "hi" }, {} as any);
    expect(result).toContain("cannot be steered");
  });

  test("steers a running task", async () => {
    const task = createMockTask({ status: "running" });
    const manager = makeManager(task);
    const tool = createBackgroundSteer(manager);
    const result = await tool.execute(
      { task_id: task.sessionID, message: "give status report" },
      {} as any
    );
    expect(result).toContain("Steering message sent");
    expect(manager.steerTask).toHaveBeenCalledWith(task, "give status report");
  });

  test("attaches child sessionId to tool part metadata for UI navigation", async () => {
    const task = createMockTask({ status: "running" });
    const manager = makeManager(task);
    const tool = createBackgroundSteer(manager);
    const metadataMock = mock(() => {});
    const result = await tool.execute({ task_id: task.sessionID, message: "give status report" }, {
      metadata: metadataMock,
    } as any);
    expect(result).toContain("Steering message sent");
    expect(metadataMock).toHaveBeenCalledWith({
      title: `steer: ${task.description}`,
      metadata: { sessionId: task.sessionID, parentSessionId: task.parentSessionID },
    });
  });
});

describe("bgagent_progress", () => {
  const taskWithProgress = createMockTask({
    status: "running",
    progress: {
      toolCalls: 3,
      toolCallsByName: { bash: 2, read: 1 },
      lastTools: ["grep", "read"],
      lastUpdate: new Date().toISOString(),
      phase: "tool",
      textCharCount: 42,
      streamFrame: 0,
      brailleFrame: 0,
      progressBarFrame: 0,
      waitingFrame: 0,
      toolFrame: 0,
    },
  });

  const makeManager = (task?: BackgroundTask) => ({
    resolveTaskIdWithFallback: mock(() => Promise.resolve(task?.sessionID ?? null)),
    getTaskWithFallback: mock(() => Promise.resolve(task)),
    getTaskMessages: mock(() =>
      Promise.resolve([
        { info: { role: "assistant" }, parts: [{ type: "text", text: "latest output here" }] },
      ])
    ),
  });

  test("creates a tool with correct description", () => {
    const tool = createBackgroundProgress(makeManager());
    expect(tool.description).toContain("progress");
  });

  test("returns error when task not found", async () => {
    const tool = createBackgroundProgress(makeManager());
    const result = await tool.execute({ task_id: "nope" }, {} as any);
    expect(result).toContain("Task not found");
  });

  test("returns compact metadata and tail", async () => {
    const tool = createBackgroundProgress(makeManager(taskWithProgress));
    const result = await tool.execute({ task_id: taskWithProgress.sessionID }, {} as any);
    expect(result).toContain("Status: running");
    expect(result).toContain("Phase: tool");
    expect(result).toContain("Tool calls: 3");
    expect(result).toContain("Last tools: grep > read");
    expect(result).toContain("Latest text:");
    expect(result).toContain("latest output here");
  });

  test("tail=0 omits latest text", async () => {
    const tool = createBackgroundProgress(makeManager(taskWithProgress));
    const result = await tool.execute({ task_id: taskWithProgress.sessionID, tail: 0 }, {} as any);
    expect(result).toContain("Tool calls: 3");
    expect(result).not.toContain("Latest text:");
  });
});

describe("bgagent_report", () => {
  test("creates a tool with correct description", () => {
    const tool = createBackgroundReport({
      reportToParent: mock(() => Promise.resolve("ok")),
    });
    expect(tool.description).toContain("parent");
  });

  test("sends report and returns parent id", async () => {
    const report = mock(() => Promise.resolve("Report sent to parent\nParent: `ses_parent`"));
    const tool = createBackgroundReport({ reportToParent: report });
    const result = await tool.execute({ message: "done X, still need Y" }, {
      sessionID: "ses_child",
    } as any);
    expect(report).toHaveBeenCalledWith("ses_child", "done X, still need Y");
    expect(result).toContain("Report sent to parent");
  });

  test("surfaces reportNoParent from manager", async () => {
    const report = mock(() =>
      Promise.resolve(
        "This session is not a background task with a parent. bgagent_report is only available to child/background agents."
      )
    );
    const tool = createBackgroundReport({ reportToParent: report });
    const result = await tool.execute({ message: "hi" }, { sessionID: "ses_child" } as any);
    expect(result).toContain("not a background task with a parent");
  });
});
