// =============================================================================
// Constants
// =============================================================================

export const COMPLETION_DISPLAY_DURATION = 10000;
// Phase-specific animation frames
export const WAITING_FRAMES = ["○", "◉"];
export const WAITING_FRAME_INTERVAL = 5; // 5 polls × 100ms = 500ms per frame
export const BRAILLE_FRAME_INTERVAL = 1; // 1 poll × 100ms = ~100ms per frame
export const STREAMING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const TOOL_FRAMES = ["▰▱▱", "▰▰▱", "▰▰▰", "▱▰▰", "▱▱▰", "▱▱▱"];
/** @deprecated Use STREAMING_FRAMES instead */
export const SPINNER_FRAMES = STREAMING_FRAMES;

/** Characters of assistant text output per streaming animation frame advance (~5 tokens) */
export const STREAM_CHARS_PER_FRAME = 20;

// =============================================================================
// Storage Constants
// =============================================================================

/**
 * Gets the user's home directory with multiple fallbacks.
 * Works across different runtimes (Node.js, Bun, browser-like).
 */
function getHomeDir(): string {
  // Try environment variables first (most reliable across runtimes)
  const envHome = process.env.HOME || process.env.USERPROFILE;
  if (envHome && envHome !== "/") {
    return envHome;
  }

  // Try Node.js os.homedir() as fallback
  try {
    // Dynamic import to avoid bundling issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("node:os");
    const home = os.homedir?.();
    if (home && home !== "/") {
      return home;
    }
  } catch {
    // os module not available
  }

  // Last resort: use /tmp for persistence
  console.warn("[constants] Could not determine home directory, using /tmp");
  return "/tmp";
}

const HOME_DIR = getHomeDir();
export const STORAGE_DIR = `${HOME_DIR}/.opencode/plugins/better-opencode-async-agents`;
export const TASKS_FILE = `${STORAGE_DIR}/tasks.json`;

// =============================================================================
// Fork Constants - Character-Based Budget
// =============================================================================

/** Maximum characters in formatted fork context (200k chars ≈ 50k tokens) */
export const FORK_CHAR_BUDGET = 200_000;

/** Below this character count, skip message removal entirely */
export const FORK_CHAR_NO_REMOVAL = 120_000;

// ─── Graduated Tier Configuration ───

/** Number of most recent tool results that receive unlimited content (Tier 1) */
export const FORK_TIER1_COUNT = 5;

/** Number of next tool results that receive medium truncation (Tier 2) */
export const FORK_TIER2_COUNT = 10;

/** Character limit for Tier 2 tool results */
export const FORK_TIER2_LIMIT = 3_000;

/** Character limit for Tier 3 (oldest) tool results */
export const FORK_TIER3_LIMIT = 500;

// ─── Tool Parameters Per Tier ───

/** Tool params character budget for Tier 1 (recent) */
export const FORK_PARAMS_TIER1 = 500;

/** Tool params character budget for Tier 2 (medium) */
export const FORK_PARAMS_TIER2 = 200;

/** Tool params character budget for Tier 3 (old) */
export const FORK_PARAMS_TIER3 = 100;

// ─── Head+Tail Truncation Configuration ───

/** Ratio of budget allocated to head content in head+tail truncation */
export const FORK_HEAD_RATIO = 0.8;

/** Ratio of budget allocated to tail content in head+tail truncation */
export const FORK_TAIL_RATIO = 0.2;

// ─── Detection Patterns ───

/** Error patterns that trigger head+tail truncation mode (case-sensitive per pattern) */
export const FORK_ERROR_PATTERNS = [
  "error",
  "Error",
  "ERROR",
  "failed",
  "FAILED",
  "exception",
  "traceback",
];

/** Tool name keywords that trigger head+tail truncation mode */
export const FORK_HEAD_TAIL_KEYWORDS = ["bash", "pty", "exec"];

/** Tool names whose results should NEVER be truncated (raw data preserved) */
export const FORK_NO_TRUNCATION_TOOLS = ["ask_user_questions"];

// =============================================================================
// HTTP Status API Server
// =============================================================================

export const DEFAULT_API_PORT = 5165;
export const DEFAULT_API_HOST = "127.0.0.1";
export const SERVER_INFO_FILENAME = "server.json";
export const MAX_PORT_RETRY = 10;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MAX_SSE_SUBSCRIBERS = 50;
export const DEFAULT_TASK_LIMIT = 50;
export const MAX_TASK_LIMIT = 200;

export const DISCOVERY_SERVICE_TYPE = "bgagent-api";
export const DISCOVERY_TIMEOUT_MS = 3000;

// =============================================================================
// Tools
// =============================================================================

/**
 * The bgagent_* tools this plugin exposes. Used to compute, from a child session's
 * permission list (which only records DENY entries), which bgagent tools the child
 * is actually allowed to call.
 */
export const BGAGENT_TOOL_NAMES = [
  "bgagent_task",
  "bgagent_output",
  "bgagent_cancel",
  "bgagent_list",
  "bgagent_clear",
  "bgagent_steer",
  "bgagent_progress",
  "bgagent_report",
  "bgagent_rename",
  "bgagent_finish",
] as const;