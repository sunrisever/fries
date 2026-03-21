const fs = require("fs/promises");
const path = require("path");

const USER_HOME = process.env.USERPROFILE || process.env.HOME || "";
const CODEX_HOME = path.join(USER_HOME, ".codex");
const SESSION_ROOTS = [
  path.join(CODEX_HOME, "sessions"),
  path.join(CODEX_HOME, "archived_sessions"),
];
const AUTH_FILE = path.join(CODEX_HOME, "auth.json");
const MAX_CANDIDATE_FILES = 10;

function padBase64Url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4 || 4)) % 4;
  return `${normalized}${"=".repeat(padding)}`;
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const segments = token.split(".");
  if (segments.length < 2) {
    return null;
  }

  try {
    const decoded = Buffer.from(padBase64Url(segments[1]), "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function normalizeDateTimeValue(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value > 10_000_000_000 ? value : value * 1000;
    return Number.isNaN(normalized) ? undefined : normalized;
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatDateTime(value) {
  const timestamp = normalizeDateTimeValue(value);
  if (typeof timestamp !== "number") {
    return undefined;
  }

  const date = new Date(timestamp);

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

async function listJsonlFiles(root) {
  const queue = [root];
  const results = [];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          const stat = await fs.stat(fullPath);
          results.push({
            filePath: fullPath,
            mtimeMs: stat.mtimeMs,
          });
        } catch {
          // Skip disappearing files.
        }
      }
    }
  }

  return results.sort((left, right) => right.mtimeMs - left.mtimeMs).slice(0, MAX_CANDIDATE_FILES);
}

function parseTokenCountFromLine(rawLine) {
  if (!rawLine || !rawLine.includes("\"type\":\"token_count\"")) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawLine);
    if (parsed?.payload?.type !== "token_count") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function readLatestTokenCount() {
  const candidateGroups = await Promise.all(SESSION_ROOTS.map((root) => listJsonlFiles(root)));
  const files = candidateGroups.flat().sort((left, right) => right.mtimeMs - left.mtimeMs);
  let newestEvent = null;
  let newestEventTime = -Infinity;

  for (const candidate of files) {
    let raw = "";
    try {
      raw = await fs.readFile(candidate.filePath, "utf8");
    } catch {
      continue;
    }

    const lines = raw.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const event = parseTokenCountFromLine(lines[index]);
      if (!event) {
        continue;
      }

      const eventTime = normalizeDateTimeValue(event.timestamp) ?? candidate.mtimeMs;
      if (eventTime >= newestEventTime) {
        newestEvent = event;
        newestEventTime = eventTime;
      }
    }
  }

  return newestEvent;
}

async function readAuthSnapshot() {
  try {
    const raw = await fs.readFile(AUTH_FILE, "utf8");
    const auth = JSON.parse(raw);
    const payload = decodeJwtPayload(auth?.tokens?.id_token);
    const openAiClaims = payload?.["https://api.openai.com/auth"] || {};

    const planType = openAiClaims.chatgpt_plan_type;
    const normalizedPlan =
      planType === "team"
        ? "ChatGPT Team"
        : typeof planType === "string"
          ? `ChatGPT ${planType}`
          : undefined;

    return {
      email: payload?.email,
      plan: normalizedPlan,
      subscriptionActiveUntil: formatDateTime(openAiClaims.chatgpt_subscription_active_until),
      subscriptionActiveUntilMs: normalizeDateTimeValue(openAiClaims.chatgpt_subscription_active_until),
    };
  } catch {
    return null;
  }
}

function toWindow(rateLimit) {
  const usedPercent = typeof rateLimit?.used_percent === "number" ? rateLimit.used_percent : undefined;
  return {
    usedPercent,
    remainingPercent:
      typeof usedPercent === "number" ? Math.max(0, 100 - usedPercent) : undefined,
    resetsAt: formatDateTime(rateLimit?.resets_at),
    resetsAtMs: normalizeDateTimeValue(rateLimit?.resets_at),
  };
}

function normalizeWindows(primaryWindow, secondaryWindow) {
  if (secondaryWindow?.remainingPercent === 0) {
    return {
      fiveHour: {
        ...primaryWindow,
        usedPercent: 0,
        remainingPercent: 100,
      },
      sevenDay: secondaryWindow,
    };
  }

  return {
    fiveHour: primaryWindow,
    sevenDay: secondaryWindow,
  };
}

async function probeCodexUsage() {
  const [event, auth] = await Promise.all([readLatestTokenCount(), readAuthSnapshot()]);
  if (!event?.payload?.rate_limits) {
    return null;
  }

  const info = event.payload.info || {};
  const totalUsage = info.total_token_usage || {};
  const lastUsage = info.last_token_usage || {};
  const windows = normalizeWindows(
    toWindow(event.payload.rate_limits.primary),
    toWindow(event.payload.rate_limits.secondary),
  );

  return {
    provider: "OpenAI",
    accountEmail: auth?.email,
    plan: auth?.plan,
    subscriptionActiveUntil: auth?.subscriptionActiveUntil,
    subscriptionActiveUntilMs: auth?.subscriptionActiveUntilMs,
    fiveHour: windows.fiveHour,
    sevenDay: windows.sevenDay,
    totalTokens: totalUsage.total_tokens,
    lastTokens: lastUsage.total_tokens,
    sourceLabel: "Codex 本地会话日志",
    sourceSyncedAt: formatDateTime(event.timestamp) || formatDateTime(Date.now()),
    sourceSyncedAtMs: normalizeDateTimeValue(event.timestamp) ?? Date.now(),
    syncedAt: formatDateTime(event.timestamp) || formatDateTime(Date.now()),
    syncedAtMs: normalizeDateTimeValue(event.timestamp) ?? Date.now(),
  };
}

module.exports = {
  probeCodexUsage,
};
