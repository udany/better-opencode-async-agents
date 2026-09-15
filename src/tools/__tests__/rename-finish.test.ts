import { describe, expect, mock, test } from "bun:test";
import type { BackgroundTask } from "../../types";
import { createBackgroundFinish } from "../finish";
import { createBackgroundRename } from "../rename";

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
  kind: "autonomous",
  ...overrides,
});

describe("bgagent_rename", () => {
  const makeManager = (task?: BackgroundTask) => ({
    resolveTaskIdWithFallback: mock(() => Promise.resolve(task?.sessionID ?? null)),
    getTaskWithFallback: mock(() => Promise.resolve(task)),
    renameSession: mock(() => Promise.resolve()),
  });

  test("renames the caller's own session when no task_id is given", async () => {
    const manager = makeManager();
    const tool = createBackgroundRename(manager);
    const result = await tool.execute({ title: "new name" }, { sessionID: "ses_self" } as any);
    expect(result).toContain("Session renamed");
    expect(manager.renameSession).toHaveBeenCalledWith("ses_self", "new name");
  });

  test("renames a target task session when task_id is given", async () => {
    const task = createMockTask({ sessionID: "ses_target" });
    const manager = makeManager(task);
    const tool = createBackgroundRename(manager);
    await tool.execute({ title: "renamed", task_id: "ses_target" }, {
      sessionID: "ses_self",
    } as any);
    expect(manager.renameSession).toHaveBeenCalledWith("ses_target", "renamed");
  });

  test("returns error when task_id is unknown", async () => {
    const tool = createBackgroundRename(makeManager());
    const result = await tool.execute({ title: "x", task_id: "nope" }, {
      sessionID: "ses_self",
    } as any);
    expect(result).toContain("Task not found");
  });
});

describe("bgagent_finish", () => {
  test("delegates to finishTask with the caller session and message", async () => {
    const finishTask = mock(() => Promise.resolve("✓ **Task finished** — parent notified"));
    const tool = createBackgroundFinish({ finishTask });
    const result = await tool.execute({ message: "done X" }, { sessionID: "ses_child" } as any);
    expect(finishTask).toHaveBeenCalledWith("ses_child", "done X");
    expect(result).toContain("finished");
  });

  test("works without a message", async () => {
    const finishTask = mock(() => Promise.resolve("✓ **Task finished** — parent notified"));
    const tool = createBackgroundFinish({ finishTask });
    await tool.execute({}, { sessionID: "ses_child" } as any);
    expect(finishTask).toHaveBeenCalledWith("ses_child", undefined);
  });
});
