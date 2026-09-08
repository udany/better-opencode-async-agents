import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { BackgroundManager } from "./manager";
import { StatusApiServer } from "./server";
import {
  createBackgroundCancel,
  createBackgroundClear,
  createBackgroundList,
  createBackgroundOutput,
  createBackgroundProgress,
  createBackgroundReport,
  createBackgroundSteer,
  createBackgroundTask,
} from "./tools";

// Re-export types for consumers
export type { BackgroundTask, BackgroundTaskStatus, TaskProgress, LaunchInput } from "./types";
// Note: BackgroundManager is not exported to avoid OpenCode plugin loader issues
// (it tries to call all exports as functions, which fails for classes)

/**
 * OpenCode Background Agent Plugin
 *
 * Provides tools for launching and managing asynchronous background tasks
 * that run in separate sessions while the main conversation continues.
 */
export default async function plugin(ctx: PluginInput): Promise<Hooks> {
  const instanceId = randomUUID();
  const instanceName = path.basename(ctx.directory);
  const manager = new BackgroundManager(ctx);

  // Start HTTP Status API server
  const server = await StatusApiServer.start(manager, { instanceId, instanceName, directory: ctx.directory });
  if (server) {
    const cleanup = () => {
      server.stop();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);
  }

  return {
    tool: {
      bgagent_task: createBackgroundTask(manager),
      bgagent_output: createBackgroundOutput(manager),
      bgagent_cancel: createBackgroundCancel(manager),
      bgagent_list: createBackgroundList(manager),
      bgagent_clear: createBackgroundClear(manager),
      bgagent_steer: createBackgroundSteer(manager),
      bgagent_progress: createBackgroundProgress(manager),
      bgagent_report: createBackgroundReport(manager),
    },
    event: async () => {
      // Event handling is started in the manager constructor
    },
  };
}
