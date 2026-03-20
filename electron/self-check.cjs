const fs = require("fs/promises");
const path = require("path");

function toMs(value) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function normalizePlanKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  if (raw.includes("business") || raw.includes("team")) {
    return "business";
  }
  if (raw.includes("plus")) {
    return "plus";
  }
  if (raw.includes("pro")) {
    return "pro";
  }
  if (raw.includes("max 10") || raw.includes("max-10")) {
    return "max-10x";
  }
  if (raw.includes("max 5") || raw.includes("max-5")) {
    return "max-5x";
  }
  if (raw.includes("allegretto")) {
    return "allegretto-coding-plan";
  }
  if (raw.includes("allegro")) {
    return "allegro-coding-plan";
  }
  if (raw.includes("moderato")) {
    return "moderato-coding-plan";
  }

  return raw.replace(/\s+/g, "-");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function signatureFromAccount(account) {
  if (!account || account.cluster !== "openai") {
    return null;
  }

  const email = normalizeEmail(account.email || account.liveUsage?.accountEmail);
  const plan = normalizePlanKey(account.liveUsage?.plan || account.plan);
  const subscriptionActiveUntilMs =
    account.liveUsage?.subscriptionActiveUntilMs ||
    toMs(account.liveUsage?.subscriptionActiveUntil) ||
    toMs(account.expiryAt);

  if (!email || !plan || !subscriptionActiveUntilMs) {
    return null;
  }

  return `${email}::${plan}::${subscriptionActiveUntilMs}`;
}

function signatureFromSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  const email = normalizeEmail(snapshot.email || snapshot.accountEmail);
  const plan = normalizePlanKey(snapshot.plan);
  const subscriptionActiveUntilMs =
    snapshot.subscriptionActiveUntilMs || toMs(snapshot.subscriptionActiveUntil);

  if (!email || !plan || !subscriptionActiveUntilMs) {
    return null;
  }

  return `${email}::${plan}::${subscriptionActiveUntilMs}`;
}

async function readJsonIfExists(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function listSnapshotRecords(dirPath) {
  if (!dirPath) {
    return [];
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const snapshots = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      try {
        const parsed = await readJsonIfExists(fullPath);
        if (parsed) {
          snapshots.push(parsed);
        }
      } catch {
        snapshots.push({ __invalidFile: fullPath });
      }
    }
    return snapshots;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function createIssue(severity, code, title, detail) {
  return { severity, code, title, detail };
}

function sortIssues(issues) {
  const weight = { error: 0, warning: 1, info: 2 };
  return [...issues].sort((left, right) => {
    const severityDelta = weight[left.severity] - weight[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return left.code.localeCompare(right.code);
  });
}

function collapseIssues(issues) {
  const grouped = new Map();
  for (const issue of issues) {
    const key = `${issue.severity}::${issue.code}::${issue.title}::${issue.detail}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(key, { issue: { ...issue }, count: 1 });
  }

  return sortIssues(
    Array.from(grouped.values()).map(({ issue, count }) =>
      count > 1
        ? {
            ...issue,
            detail: `${issue.detail}（x${count}）`,
          }
        : issue,
    ),
  );
}

async function runSelfCheck({
  stateFile,
  snapshotsDir,
  timelineLogFile,
} = {}) {
  const checkedAtMs = Date.now();
  const checkedAt = new Date(checkedAtMs).toISOString();
  const issues = [];
  const state = await readJsonIfExists(stateFile);

  if (!state) {
    return {
      ok: false,
      checkedAt,
      checkedAtMs,
      summary: {
        accounts: 0,
        openAiAccounts: 0,
        snapshots: 0,
        timelineEvents: 0,
        errors: 1,
        warnings: 0,
      },
      issues: [createIssue("error", "STATE_MISSING", "未找到状态文件", `状态文件不存在：${stateFile || "unknown"}`)],
    };
  }

  const accounts = Array.isArray(state.accounts) ? state.accounts : [];
  const timelineLog = Array.isArray(state.timelineLog) ? state.timelineLog : [];
  const timelineLogFileEntries = await readJsonIfExists(timelineLogFile);
  const snapshots = await listSnapshotRecords(snapshotsDir);
  const accountIdSet = new Set(accounts.map((account) => account.id));

  const openAiAccounts = accounts.filter((account) => account.cluster === "openai");
  const signatures = new Map();
  for (const account of openAiAccounts) {
    const signature = signatureFromAccount(account);
    if (!signature) {
      issues.push(
        createIssue(
          "warning",
          "OPENAI_SIGNATURE_MISSING",
          "OpenAI 账号缺少唯一签名",
          `${account.accountLabel || account.id} 缺少 email / plan / subscriptionActiveUntil 之一，后续自动归属可能不稳定。`,
        ),
      );
      continue;
    }
    const existing = signatures.get(signature) || [];
    existing.push(account);
    signatures.set(signature, existing);
  }

  for (const [signature, duplicated] of signatures.entries()) {
    if (duplicated.length < 2) {
      continue;
    }
    issues.push(
      createIssue(
        "error",
        "OPENAI_SIGNATURE_DUPLICATED",
        "存在重复的 OpenAI 订阅签名",
        `${signature} 同时命中 ${duplicated.map((item) => item.accountLabel || item.id).join("、")}，需要手动合并或修复。`,
      ),
    );
  }

  const timelineKeys = new Map();
  for (const entry of timelineLog) {
    const key = [
      entry.kind,
      entry.accountId || "",
      entry.sourceAccountId || "",
      entry.targetAccountId || "",
      entry.atMs || entry.at || "",
    ].join("::");
    timelineKeys.set(key, (timelineKeys.get(key) || 0) + 1);

    for (const relatedId of [entry.accountId, entry.sourceAccountId, entry.targetAccountId]) {
      if (relatedId && !accountIdSet.has(relatedId)) {
        issues.push(
          createIssue(
            "error",
            "TIMELINE_ORPHAN_ACCOUNT",
            "时间线事件引用了不存在的账号",
            `${entry.kind} 事件指向不存在的账号 ID：${relatedId}`,
          ),
        );
      }
    }
  }

  for (const [key, count] of timelineKeys.entries()) {
    if (count > 1) {
      issues.push(
        createIssue(
          "warning",
          "TIMELINE_DUPLICATED",
          "时间线里存在重复事件",
          `${key} 重复了 ${count} 次。`,
        ),
      );
    }
  }

  if (Array.isArray(timelineLogFileEntries) && timelineLogFileEntries.length !== timelineLog.length) {
    issues.push(
      createIssue(
        "warning",
        "TIMELINE_FILE_MISMATCH",
        "时间线主文件与内存状态数量不一致",
        `state.timelineLog=${timelineLog.length}，timeline-events.json=${timelineLogFileEntries.length}。`,
      ),
    );
  }

  for (const snapshot of snapshots) {
    if (snapshot.__invalidFile) {
      issues.push(
        createIssue(
          "warning",
          "SNAPSHOT_INVALID_JSON",
          "发现损坏的快照文件",
          `无法解析：${snapshot.__invalidFile}`,
        ),
      );
      continue;
    }

    if (!snapshot.accountId || !accountIdSet.has(snapshot.accountId)) {
      issues.push(
        createIssue(
          "warning",
          "SNAPSHOT_ORPHAN_ACCOUNT",
          "发现孤儿快照",
          `${snapshot.id || "unknown"} 指向不存在的账号 ID：${snapshot.accountId || "missing"}`,
        ),
      );
      continue;
    }

    const account = accounts.find((item) => item.id === snapshot.accountId);
    if (!account || account.cluster !== "openai") {
      continue;
    }

    const accountSignature = signatureFromAccount(account);
    const snapshotSignature = signatureFromSnapshot(snapshot);

    if (accountSignature && snapshotSignature && accountSignature !== snapshotSignature) {
      issues.push(
        createIssue(
          "warning",
          "SNAPSHOT_SIGNATURE_MISMATCH",
          "快照签名与账号当前签名不一致",
          `${snapshot.accountLabel || snapshot.accountId} 的快照签名与当前账号不一致，可能是历史切号遗留。`,
        ),
      );
    }
  }

  const collapsedIssues = collapseIssues(issues);
  const errors = collapsedIssues.filter((issue) => issue.severity === "error").length;
  const warnings = collapsedIssues.filter((issue) => issue.severity === "warning").length;

  if (collapsedIssues.length === 0) {
    collapsedIssues.push(
      createIssue(
        "info",
        "SELF_CHECK_CLEAN",
        "自检通过",
        "没有发现重复签名、孤儿时间线事件或孤儿快照。",
      ),
    );
  }

  return {
    ok: errors === 0,
    checkedAt,
    checkedAtMs,
    summary: {
      accounts: accounts.length,
      openAiAccounts: openAiAccounts.length,
      snapshots: snapshots.length,
      timelineEvents: timelineLog.length,
      errors,
      warnings,
    },
    issues: collapsedIssues,
  };
}

module.exports = {
  runSelfCheck,
  normalizePlanKey,
  signatureFromAccount,
  signatureFromSnapshot,
  toMs,
};
