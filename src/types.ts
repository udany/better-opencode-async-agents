import type { PluginInput } from "@opencode-ai/plugin";

// =============================================================================
// Types
// =============================================================================

export type BackgroundTaskStatus = "running" | "completed" | "error" | "cancelled" | "resumed";

export type TaskPhase = "waiting" | "streaming" | "tool";

/** Task modes. */
export type TaskKind = "autonomous" | "interactive";

/** Provider/model reference for a task session, e.g. { providerID: "opencode-go", modelID: "deepseek-v4.1-flash" }. */
export interface ModelRef {
  providerID: string;
  modelID: string;
}

/**
 * A session-level tool permission entry as returned by the session API.
 * OpenCode only records DENY entries for tools we explicitly disable via the
 * launch `tools` map, so a tool is allowed unless there is a matching deny.
 */
export interface SessionPermission {
  permission: string;
  pattern?: string;
  action: "allow" | "deny" | "ask";
}

export interface TaskProgress {
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  lastTools: string[];
  lastUpdate: string;
  // Phase-aware animation state
  phase: TaskPhase;
  textCharCount: number;
  streamFrame: number;
  brailleFrame: number;
  progressBarFrame: number;
  _prevPhase?: TaskPhase;
  waitingFrame: number;
  toolFrame: number;
  _waitPollCount?: number;
}

/**
 * Minimal metadata persisted to disk.
 * OpenCode stores chat history, we only store what's not available there.
 */
export interface PersistedTask {
  description: string;
  agent: string;
  parentSessionID: string;
  createdAt: string;
  status: BackgroundTaskStatus;
  resumeCount?: number;
  isForked?: boolean;
  // Extended fields for HTTP Status API
  completedAt?: string;
  error?: string;
  result?: string;
  progress?: TaskProgress;
  startedAt?: string;
  batchId?: string;
  /** Task kind. "interactive" sessions complete only via bgagent_finish, not on idle. */
  kind?: TaskKind;
  /** Provider/model the task runs on. */
  model?: ModelRef;
}

/**
 * Full task object used in memory.
 * sessionID is the task identifier (no separate id field).
 */
export interface BackgroundTask {
  sessionID: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
  description: string;
  prompt: string;
  agent: string;
  status: BackgroundTaskStatus;
  startedAt: string;
  completedAt?: string;
  resultRetrievedAt?: string;
  result?: string;
  error?: string;
  progress?: TaskProgress;
  batchId: string;
  resumeCount: number;
  isForked: boolean;
  /** Task kind. "interactive" sessions complete only when the agent calls bgagent_finish. */
  kind: TaskKind;
  /** Provider/model the task runs on. Set at launch; updated when the model is switched. */
  model?: ModelRef;
}

export interface MessageFilter {
  fullSession?: boolean;
  includeThinking?: boolean;
  includeToolResults?: boolean;
  sinceMessageId?: string;
  messageLimit?: number;
  thinkingMaxChars?: number;
}

export type FilteredMessage = {
  id: string;
  role: string;
  type: string;
  content: string;
  thinking?: string;
  toolCalls?: any[];
  timestamp?: string;
};

export type DiscoveredInstance = {
  name: string;
  host: string;
  port: number;
  metadata: Record<string, string>;
  /** Unique instance ID (from metadata.instanceId) */
  instanceId?: string;
  /** Human-readable instance name derived from working directory (from metadata.instanceName) */
  instanceName?: string;
  /** Working directory of the OpenCode instance (from metadata.directory) */
  directory?: string;
};

export interface LaunchInput {
  /** Task ID to resume (if provided, enters resume mode) */
  resume?: string;
  /** Fork parent context to child session (creates session with inherited history) */
  fork?: boolean;
  /** Optional model override for the task session, in "provider/model-id" form.
   *  When omitted, the task inherits the current model of the parent conversation. */
  model?: string;
  /** Optional session title prefix. When omitted the default ("Background: ",
   *  or "Background (forked): " for forks) is used; when provided — including an
   *  empty string to omit the prefix entirely — it is used verbatim. */
  titlePrefix?: string;
  /** When true, the session is interactive: the user can see and message it,
   *  it is NOT auto-completed on idle, and it completes only when the agent
   *  calls bgagent_finish. */
  interactive?: boolean;
  description: string;
  prompt: string;
  agent: string;
  parentSessionID: string;
  parentMessageID: string;
  parentAgent: string;
}

export type OpencodeClient = PluginInput["client"];
