import { describe, expect, mock, test } from "bun:test";
import { ERROR_MESSAGES } from "../../prompts";
import type { BackgroundTask } from "../../types";
import { type ResumeManager, executeResume, validateResumeTask } from "../resume";

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

const createMockResumeManager = (task: BackgroundTask | undefined, sessionExists = true) => {
  const persistTask = mock(async () => {});
  const checkSessionExists = mock(async () => sessionExists);
  const sendResumePromptAsync = mock(async () => {});

  const manager: ResumeManager = {
    getTask: mock(() => task),
    resolveTaskId: mock(() => (task ? task.sessionID : null)),
    resolveTaskIdWithFallback: mock(async () => (task ? task.sessionID : null)),
    getTaskWithFallback: mock(async () => task),
    persistTask,
    checkSessionExists,
    sendResumePromptAsync,
  };

  return { manager, persistTask, checkSessionExists, sendResumePromptAsync };
};

describe("resume helpers", () => {
  test("resume from a finished (error) task reactivates and sends the follow-up", async () => {
    const task = createMockTask({ status: "error", error: "previous failure" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(true);

    const result = await executeResume(manager, task, "continue after fix", {});
    expect(result.success).toBe(true);
    expect(task.status).toBe("resumed");
    expect(task.resumeCount).toBe(1);
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(1);
  });

  test("resume from completed reactivates and sends the follow-up", async () => {
    const task = createMockTask({ status: "completed" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const result = await executeResume(manager, task, "continue completed task", {});
    expect(result.success).toBe(true);
    expect(task.status).toBe("resumed");
    expect(task.resumeCount).toBe(1);
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(1);
  });

  test("resume while running sends immediately without queueing", async () => {
    const task = createMockTask({ status: "running" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const result = await executeResume(manager, task, "inject follow-up", {});
    expect(result.success).toBe(true);
    expect(task.status).toBe("running");
    expect(task.resumeCount).toBe(1);
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(1);
  });

  test("an already-resumed task can be resumed again (no lock)", async () => {
    const task = createMockTask({ status: "resumed", resumeCount: 1 });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);

    const validation = await validateResumeTask(manager, task.sessionID);
    expect(validation.valid).toBe(true);

    const result = await executeResume(manager, task, "another follow-up", {});
    expect(result.success).toBe(true);
    expect(task.resumeCount).toBe(2);
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(1);
  });

  test("expired session fails without reactivating", async () => {
    const task = createMockTask({ status: "completed" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task, false);

    const result = await executeResume(manager, task, "resume gone session", {});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe(ERROR_MESSAGES.sessionExpired);
    expect(task.status).toBe("completed");
    expect(sendResumePromptAsync).toHaveBeenCalledTimes(0);
  });

  test("a send failure marks the task as error", async () => {
    const task = createMockTask({ status: "completed" });
    const { manager, sendResumePromptAsync } = createMockResumeManager(task);
    sendResumePromptAsync.mockImplementation(async () => {
      throw new Error("boom");
    });

    const result = await executeResume(manager, task, "resume", {});
    expect(result.success).toBe(false);
    expect(task.status).toBe("error");
  });
});
