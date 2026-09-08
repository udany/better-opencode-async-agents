import { describe, expect, mock, test } from "bun:test";
import { shortId } from "../../helpers";
import type { BackgroundTask } from "../../types";
import { createBackgroundCancel } from "../cancel";
import { createBackgroundClear } from "../clear";
import { createBackgroundList } from "../list";
import { createBackgroundTask } from "../task";

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

const createMockTaskManager = (launchMock = mock(() => Promise.resolve(createMockTask()))) => ({
  launch: launchMock,
  getTask: mock(() => undefined as BackgroundTask | undefined),
  getTaskSessionIds: mock(() => [] as string[]),
  resolveTaskId: mock(() => null as string | null),
  resolveTaskIdWithFallback: mock(() => Promise.resolve(null as string | null)),
  getTaskWithFallback: mock(() => Promise.resolve(undefined as BackgroundTask | undefined)),
  persistTask: mock(() => Promise.resolve()),
  checkSessionExists: mock(() => Promise.resolve(true)),
  sendResumePromptAsync: mock(() => Promise.resolve()),
});

describe("tool factories", () => {
  describe("createBackgroundTask", () => {
    test("creates a tool with correct description", () => {
      const mockManager = createMockTaskManager();
      const tool = createBackgroundTask(mockManager);

      expect(tool.description).toContain("background agent task");
    });

    test("returns error when agent is empty", async () => {
      const mockManager = createMockTaskManager();
      const tool = createBackgroundTask(mockManager);

      const result = await tool.execute({ description: "test", prompt: "test", agent: "" }, {
        sessionID: "ses",
        messageID: "msg",
        agent: "test",
      } as any);

      expect(result).toContain("Agent parameter is required");
    });

    test("launches task with valid parameters", async () => {
      const mockTask = createMockTask();
      const launchMock = mock(() => Promise.resolve(mockTask));
      const mockManager = createMockTaskManager(launchMock);
      const tool = createBackgroundTask(mockManager);

      const result = await tool.execute(
        { description: "test", prompt: "test prompt", agent: "explore" },
        { sessionID: "ses", messageID: "msg", agent: "test" } as any
      );

      expect(result).toContain("Background task launched");
      expect(result).toContain(shortId(mockTask.sessionID)); // shortId removes ses_ prefix
      expect(launchMock).toHaveBeenCalled();
    });

    test("passes an explicit model override into the launch", async () => {
      const mockTask = createMockTask();
      const launchMock = mock(() => Promise.resolve(mockTask));
      const mockManager = createMockTaskManager(launchMock);
      const tool = createBackgroundTask(mockManager);

      await tool.execute(
        { description: "test", prompt: "test prompt", agent: "explore", model: "openrouter/deepseek/deepseek-v4-flash" },
        { sessionID: "ses", messageID: "msg", agent: "test" } as any
      );

      expect(launchMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: "openrouter/deepseek/deepseek-v4-flash" })
      );
    });

    test("attaches child sessionId to tool part metadata for UI navigation", async () => {
      const mockTask = createMockTask();
      const launchMock = mock(() => Promise.resolve(mockTask));
      const mockManager = createMockTaskManager(launchMock);
      const tool = createBackgroundTask(mockManager);
      const metadataMock = mock(() => {});

      const result = await tool.execute(
        { description: "test", prompt: "test prompt", agent: "explore" },
        { sessionID: "ses_parent", messageID: "msg", agent: "test", metadata: metadataMock } as any
      );

      expect(result).toContain("Background task launched");
      expect(metadataMock).toHaveBeenCalledWith({
        title: "test",
        metadata: {
          sessionId: mockTask.sessionID,
          parentSessionId: mockTask.parentSessionID,
        },
      });
    });
  });

  describe("createBackgroundCancel", () => {
    test("creates a tool with correct description", () => {
      const mockManager = {
        getTaskWithFallback: mock(() => Promise.resolve(undefined)),
        resolveTaskIdWithFallback: mock(() => Promise.resolve(null)),
        cancelTask: mock(() => Promise.resolve()),
      };
      const tool = createBackgroundCancel(mockManager);

      expect(tool.description).toContain("Cancel a running background task");
    });

    test("returns error when task not found", async () => {
      const mockManager = {
        getTaskWithFallback: mock(() => Promise.resolve(undefined)),
        resolveTaskIdWithFallback: mock(() => Promise.resolve(null)),
        cancelTask: mock(() => Promise.resolve()),
      };
      const tool = createBackgroundCancel(mockManager);

      const result = await tool.execute({ task_id: "nonexistent" }, {} as any);

      expect(result).toContain("Task not found");
    });
  });

  describe("createBackgroundList", () => {
    test("creates a tool with correct description", () => {
      const mockManager = { getAllTasks: mock(() => []) };
      const tool = createBackgroundList(mockManager);

      expect(tool.description).toContain("List all background tasks");
    });

    test("returns empty message when no tasks", async () => {
      const mockManager = { getAllTasks: mock(() => []) };
      const tool = createBackgroundList(mockManager);

      const result = await tool.execute({}, {} as any);

      expect(result).toContain("No background tasks found");
    });

    test("lists tasks with status filter", async () => {
      const tasks = [
        createMockTask({ sessionID: "ses_1", status: "running" }),
        createMockTask({ sessionID: "ses_2", status: "completed" }),
      ];
      const mockManager = { getAllTasks: mock(() => tasks) };
      const tool = createBackgroundList(mockManager);

      const result = await tool.execute({ status: "running" }, {} as any);

      expect(result).toContain("1"); // shortId of ses_1
      expect(result).not.toContain("2"); // shortId of ses_2 is 2
    });
  });

  describe("createBackgroundClear", () => {
    test("creates a tool with correct description", () => {
      const mockManager = {
        getAllTasks: mock(() => []),
        clearAllTasks: mock(() => {}),
      };
      const tool = createBackgroundClear(mockManager);

      expect(tool.description).toContain("Clear and abort all background tasks");
    });

    test("returns empty message when no tasks to clear", async () => {
      const clearMock = mock(() => {});
      const mockManager = {
        getAllTasks: mock(() => []),
        clearAllTasks: clearMock,
      };
      const tool = createBackgroundClear(mockManager);

      const result = await tool.execute({}, {} as any);

      expect(result).toContain("No background tasks to clear");
      expect(clearMock).toHaveBeenCalled();
    });

    test("clears tasks and reports count", async () => {
      const tasks = [
        createMockTask({ status: "running" }),
        createMockTask({ status: "completed" }),
      ];
      const clearMock = mock(() => {});
      const mockManager = {
        getAllTasks: mock(() => tasks),
        clearAllTasks: clearMock,
      };
      const tool = createBackgroundClear(mockManager);

      const result = await tool.execute({}, {} as any);

      expect(result).toContain("Cleared all background tasks");
      expect(result).toContain("Running tasks aborted: 1");
      expect(result).toContain("Total tasks cleared: 2");
      expect(clearMock).toHaveBeenCalled();
    });
  });
});
