const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");

const APP_NAME = "fries";
const MAX_USAGE_HISTORY = 80;

function getAppRoot() {
  return path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Roaming"), APP_NAME);
}

function getStateFile() {
  return path.join(getAppRoot(), "subscriptions.json");
}

function getSnapshotsDir() {
  return path.join(getAppRoot(), "data", "snapshots");
}

function getBackupRoot() {
  return path.join(getAppRoot(), "repair-backups");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function timestampSlug() {
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

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
  return raw.replace(/\s+/g, "-");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function accountSignature(account) {
  if (!account || account.cluster !== "openai") {
    return null;
  }
  const email = normalizeEmail(account.email || account.liveUsage?.accountEmail);
  const subMs =
    account.liveUsage?.subscriptionActiveUntilMs ||
    toMs(account.liveUsage?.subscriptionActiveUntil) ||
    toMs(account.expiryAt);
  if (!email || !subMs) {
    return null;
  }
  return `${email}::${subMs}`;
}

function snapshotSignature(snapshot) {
  if (!snapshot) {
    return null;
  }
  const email = normalizeEmail(snapshot.accountEmail || snapshot.email);
  const subMs = snapshot.subscriptionActiveUntilMs || toMs(snapshot.subscriptionActiveUntil);
  if (!email || !subMs) {
    return null;
  }
  return `${email}::${subMs}`;
}

function snapshotRecordedMs(snapshot) {
  return (
    snapshot.recordedAtMs ||
    toMs(snapshot.recordedAt) ||
    snapshot.sourceSyncedAtMs ||
    toMs(snapshot.sourceSyncedAt) ||
    snapshot.syncedAtMs ||
    toMs(snapshot.syncedAt) ||
    0
  );
}

function buildUsageHistoryEntry(snapshot, index) {
  const recordedAtMs = snapshotRecordedMs(snapshot);
  return {
    id: snapshot.id || `repaired-${index}-${recordedAtMs || Date.now()}`,
    recordedAt: snapshot.recordedAt || (recordedAtMs ? new Date(recordedAtMs).toISOString() : undefined),
    recordedAtMs,
    snapshot: {
      ...snapshot,
      recordedAtMs,
      sourceSyncedAtMs: snapshot.sourceSyncedAtMs || toMs(snapshot.sourceSyncedAt),
      subscriptionActiveUntilMs:
        snapshot.subscriptionActiveUntilMs || toMs(snapshot.subscriptionActiveUntil),
      accountEmail: snapshot.accountEmail || snapshot.email,
    },
  };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function backupFile(sourcePath, backupDir) {
  if (!fssync.existsSync(sourcePath)) {
    return;
  }
  await ensureDir(backupDir);
  await fs.copyFile(sourcePath, path.join(backupDir, path.basename(sourcePath)));
}

async function main() {
  const stateFile = getStateFile();
  const snapshotsDir = getSnapshotsDir();
  const backupDir = path.join(getBackupRoot(), `signature-repair-${timestampSlug()}`);

  const state = await readJson(stateFile);
  const accounts = Array.isArray(state.accounts) ? state.accounts : [];

  const snapshotFiles = await fs.readdir(snapshotsDir);
  const snapshots = [];
  for (const fileName of snapshotFiles) {
    if (!fileName.endsWith(".json")) {
      continue;
    }
    const fullPath = path.join(snapshotsDir, fileName);
    try {
      const parsed = await readJson(fullPath);
      snapshots.push({ fileName, fullPath, parsed });
    } catch {
      // ignore broken snapshot files
    }
  }

  const snapshotsByAccountId = new Map();
  for (const entry of snapshots) {
    const accountId = entry.parsed.accountId;
    if (!accountId) {
      continue;
    }
    const bucket = snapshotsByAccountId.get(accountId) || [];
    bucket.push(entry);
    snapshotsByAccountId.set(accountId, bucket);
  }

  const touchedSnapshotFiles = new Set();
  const repairedAccounts = [];

  for (const account of accounts) {
    if (account.cluster !== "openai") {
      continue;
    }

    const accountSnapshots = (snapshotsByAccountId.get(account.id) || []).sort(
      (left, right) => snapshotRecordedMs(left.parsed) - snapshotRecordedMs(right.parsed),
    );
    if (!accountSnapshots.length) {
      continue;
    }

    const signatureGroups = new Map();
    for (const entry of accountSnapshots) {
      const parsed = entry.parsed;
      if (!parsed.accountEmail && account.email) {
        parsed.accountEmail = account.email;
        touchedSnapshotFiles.add(entry.fullPath);
      }
      if (!parsed.subscriptionActiveUntilMs && parsed.subscriptionActiveUntil) {
        parsed.subscriptionActiveUntilMs = toMs(parsed.subscriptionActiveUntil);
        touchedSnapshotFiles.add(entry.fullPath);
      }
      if (!parsed.recordedAtMs && parsed.recordedAt) {
        parsed.recordedAtMs = toMs(parsed.recordedAt);
        touchedSnapshotFiles.add(entry.fullPath);
      }
      if (!parsed.sourceSyncedAtMs && parsed.sourceSyncedAt) {
        parsed.sourceSyncedAtMs = toMs(parsed.sourceSyncedAt);
        touchedSnapshotFiles.add(entry.fullPath);
      }

      const signature = snapshotSignature(parsed);
      if (!signature) {
        continue;
      }
      const bucket = signatureGroups.get(signature) || [];
      bucket.push(entry);
      signatureGroups.set(signature, bucket);
    }

    if (!signatureGroups.size) {
      continue;
    }

    const dominant = Array.from(signatureGroups.entries()).sort((left, right) => {
      if (right[1].length !== left[1].length) {
        return right[1].length - left[1].length;
      }
      return snapshotRecordedMs(right[1][right[1].length - 1].parsed) - snapshotRecordedMs(left[1][left[1].length - 1].parsed);
    })[0];

    const dominantEntries = dominant[1].sort(
      (left, right) => snapshotRecordedMs(left.parsed) - snapshotRecordedMs(right.parsed),
    );
    const latestEntry = dominantEntries[dominantEntries.length - 1];
    const latestSnapshot = latestEntry.parsed;
    const currentSignature = accountSignature(account);

    if (currentSignature !== dominant[0] || !account.liveUsage || !Array.isArray(account.usageHistory) || account.usageHistory.length === 0) {
      account.liveUsage = {
        ...latestSnapshot,
        accountEmail: latestSnapshot.accountEmail || latestSnapshot.email || account.email,
        sourceSyncedAtMs: latestSnapshot.sourceSyncedAtMs || toMs(latestSnapshot.sourceSyncedAt),
        syncedAtMs: latestSnapshot.syncedAtMs || toMs(latestSnapshot.syncedAt),
        recordedAtMs: latestSnapshot.recordedAtMs || toMs(latestSnapshot.recordedAt),
        subscriptionActiveUntilMs:
          latestSnapshot.subscriptionActiveUntilMs || toMs(latestSnapshot.subscriptionActiveUntil),
      };
      account.expiryAt = latestSnapshot.subscriptionActiveUntil || account.expiryAt;
      account.plan = latestSnapshot.plan || account.plan;
      account.resetAt =
        latestSnapshot.sevenDay?.resetsAt ||
        latestSnapshot.fiveHour?.resetsAt ||
        account.resetAt;
      account.usageHistory = dominantEntries
        .slice(-MAX_USAGE_HISTORY)
        .reverse()
        .map((entry, index) => buildUsageHistoryEntry(entry.parsed, index));
      repairedAccounts.push({
        label: account.accountLabel,
        from: currentSignature,
        to: dominant[0],
        snapshots: dominantEntries.length,
      });
    }
  }

  await backupFile(stateFile, backupDir);
  for (const filePath of touchedSnapshotFiles) {
    await backupFile(filePath, backupDir);
  }

  for (const entry of snapshots) {
    if (!touchedSnapshotFiles.has(entry.fullPath)) {
      continue;
    }
    await fs.writeFile(entry.fullPath, JSON.stringify(entry.parsed, null, 2), "utf8");
  }

  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");

  process.stdout.write(
    JSON.stringify(
      {
        repairedAccounts,
        touchedSnapshotFiles: touchedSnapshotFiles.size,
        backupDir,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
