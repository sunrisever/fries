const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  shell,
} = require("electron");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const { probeCodexUsage } = require("./codex-sync.cjs");
const { runSelfCheck } = require("./self-check.cjs");

const DEV_SERVER_URL =
  process.env.AI_ACCOUNT_CONSOLE_DEV_URL || "http://127.0.0.1:5173";
const APP_DATA_DIR_NAME = "Fries";
const LEGACY_APP_DATA_DIR_NAMES = ["Token Chowhound", "ai-account-console"];
const APP_USER_MODEL_ID = "com.sunrisever.fries";

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let isQuitting = false;
let hasShownTrayHint = false;
let lastStateSerialized = null;
let lastTimelineLogSerialized = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

app.setAppUserModelId(APP_USER_MODEL_ID);

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });
}

function getStateFilePath() {
  return path.join(getUserDataRoot(), "subscriptions.json");
}

function getUserDataRoot() {
  return path.join(app.getPath("appData"), APP_DATA_DIR_NAME);
}

function getLegacyUserDataRoots() {
  return LEGACY_APP_DATA_DIR_NAMES.map((dirName) =>
    path.join(app.getPath("appData"), dirName),
  );
}

function getDataDir() {
  return path.join(getUserDataRoot(), "data");
}

function getSnapshotsDir() {
  return path.join(getDataDir(), "snapshots");
}

function getImportsDir() {
  return path.join(getDataDir(), "imports");
}

function getCacheDir() {
  return path.join(getDataDir(), "cache");
}

function getSnapshotIndexCacheFilePath() {
  return path.join(getCacheDir(), "snapshot-index.json");
}

function getTimelineLogsDir() {
  return path.join(getDataDir(), "timeline-events");
}

function getTimelineLogFilePath() {
  return path.join(getDataDir(), "timeline-events.json");
}

function getMemoryFilePath() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, ".codex", "memories", "config", "accounts.md");
}

async function ensureDataDirs() {
  const previousStateFile = path.join(getUserDataRoot(), "dashboard-state.json");
  const nextStateFile = getStateFilePath();
  const legacyStateFiles = getLegacyUserDataRoots().flatMap((legacyRoot) => [
    path.join(legacyRoot, "subscriptions.json"),
    path.join(legacyRoot, "dashboard-state.json"),
  ]);

  await fs.mkdir(getUserDataRoot(), { recursive: true });
  await fs.mkdir(getDataDir(), { recursive: true });
  await fs.mkdir(getSnapshotsDir(), { recursive: true });
  await fs.mkdir(getImportsDir(), { recursive: true });
  await fs.mkdir(getCacheDir(), { recursive: true });
  await fs.mkdir(getTimelineLogsDir(), { recursive: true });

  if (!fssync.existsSync(nextStateFile)) {
    for (const legacyStateFile of legacyStateFiles) {
      if (!fssync.existsSync(legacyStateFile)) {
        continue;
      }
      try {
        await fs.copyFile(legacyStateFile, nextStateFile);
        break;
      } catch {
        // ignore migration failure
      }
    }
  }

  if (!fssync.existsSync(nextStateFile) && fssync.existsSync(previousStateFile)) {
    try {
      await fs.copyFile(previousStateFile, nextStateFile);
    } catch {
      // ignore migration failure
    }
  }
}

function getDataPaths() {
  return {
    dataDir: getDataDir(),
    stateFile: getStateFilePath(),
    snapshotsDir: getSnapshotsDir(),
    cacheDir: getCacheDir(),
    snapshotIndexCacheFile: getSnapshotIndexCacheFilePath(),
    importsDir: getImportsDir(),
    memoryFile: getMemoryFilePath(),
    timelineLogFile: getTimelineLogFilePath(),
    timelineLogsDir: getTimelineLogsDir(),
  };
}

async function readSnapshotIndexCache() {
  try {
    const raw = await fs.readFile(getSnapshotIndexCacheFilePath(), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeSnapshotIndexCache(payload) {
  await ensureDataDirs();
  await fs.writeFile(getSnapshotIndexCacheFilePath(), JSON.stringify(payload ?? null, null, 2), "utf8");
}

async function writeTimelineLog(entries) {
  await ensureDataDirs();
  const serialized = JSON.stringify(Array.isArray(entries) ? entries : [], null, 2);
  if (serialized === lastTimelineLogSerialized) {
    return false;
  }

  lastTimelineLogSerialized = serialized;
  const logFileName = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await fs.writeFile(
    getTimelineLogFilePath(),
    serialized,
    "utf8",
  );
  await fs.writeFile(
    path.join(getTimelineLogsDir(), logFileName),
    serialized,
    "utf8",
  );
  return true;
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

async function saveSnapshotRecord(snapshot) {
  await ensureDataDirs();
  const stamp = sanitizeFilename(
    snapshot.recordedAt || snapshot.sourceSyncedAt || snapshot.syncedAt || Date.now(),
  );
  const accountId = sanitizeFilename(snapshot.accountId || "account");
  const fileName = `${stamp}-${accountId}-${snapshot.id || Date.now()}.json`;
  await fs.writeFile(
    path.join(getSnapshotsDir(), fileName),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );
}

async function listSnapshotRecords() {
  await ensureDataDirs();
  const entries = await fs.readdir(getSnapshotsDir(), { withFileTypes: true });
  const snapshots = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    try {
      const raw = await fs.readFile(path.join(getSnapshotsDir(), entry.name), "utf8");
      snapshots.push(JSON.parse(raw));
    } catch {
      // Skip broken snapshot files.
    }
  }

  return snapshots.sort((left, right) => {
    const leftTime =
      left.recordedAtMs ||
      Date.parse(left.recordedAt || 0) ||
      left.sourceSyncedAtMs ||
      Date.parse(left.sourceSyncedAt || left.syncedAt || 0);
    const rightTime =
      right.recordedAtMs ||
      Date.parse(right.recordedAt || 0) ||
      right.sourceSyncedAtMs ||
      Date.parse(right.sourceSyncedAt || right.syncedAt || 0);
    return rightTime - leftTime;
  });
}

async function pruneSnapshotRecords(retentionDays) {
  await ensureDataDirs();
  const safeDays = Math.max(1, Number(retentionDays) || 14);
  const expireBefore = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(getSnapshotsDir(), { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        return;
      }
      const fullPath = path.join(getSnapshotsDir(), entry.name);
      try {
        const raw = await fs.readFile(fullPath, "utf8");
        const parsed = JSON.parse(raw);
        const recordedAt =
          parsed.recordedAtMs ||
          Date.parse(parsed.recordedAt || 0) ||
          parsed.sourceSyncedAtMs ||
          Date.parse(parsed.sourceSyncedAt || parsed.syncedAt || 0);
        const stat = await fs.stat(fullPath);
        const fileTime = Number.isNaN(recordedAt) ? stat.mtimeMs : recordedAt;
        if (fileTime < expireBefore) {
          await fs.unlink(fullPath);
        }
      } catch {
        try {
          await fs.unlink(fullPath);
        } catch {
          // ignore
        }
      }
    }),
  );
}

async function clearOpenAiCache() {
  await ensureDataDirs();
  const entries = await fs.readdir(getSnapshotsDir(), { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) {
        return;
      }
      try {
        await fs.unlink(path.join(getSnapshotsDir(), entry.name));
      } catch {
        // ignore
      }
    }),
  );

  const state = await readDashboardState();
  if (!state) {
    return;
  }

  const nextState = {
    ...state,
    version: Math.max(2, Number(state.version) || 1),
    accounts: Array.isArray(state.accounts)
      ? state.accounts.map((account) => {
          if (account.cluster !== "openai") {
            return account;
          }

          const liveUsage = account.liveUsage
            ? {
                ...account.liveUsage,
                totalTokens: undefined,
                lastTokens: undefined,
              }
            : account.liveUsage;

          return {
            ...account,
            tokensUsed: undefined,
            usageHistory: [],
            liveUsage,
          };
        })
      : state.accounts,
  };

  await writeDashboardState(nextState);
}

function formatDateForMemory(value) {
  if (!value) {
    return "待首次同步";
  }
  return String(value).replace(/\//g, ".");
}

function buildOpenAiMemoryBlock(accounts) {
  const rows = accounts
    .filter((account) => account.cluster === "openai")
    .sort((left, right) => (left.priority || 0) - (right.priority || 0))
    .map((account) => {
      const liveExpiry = account.liveUsage?.subscriptionActiveUntil || account.expiryAt || "待首次同步";
      const syncedAt =
        account.liveUsage?.recordedAt ||
        account.liveUsage?.sourceSyncedAt ||
        account.liveUsage?.syncedAt ||
        "未同步";
      const workspace = account.workspace || account.accountLabel || "未记录";
      return `| ${account.accountLabel || "未命名账号"} | ${account.email || "未记录"} | ${workspace} | ${formatDateForMemory(liveExpiry)} | ${syncedAt} |`;
    })
    .join("\n");

  return [
    "### Fries 自动同步（OpenAI）",
    "",
    "> 权威口径：OpenAI 的订阅有效期统一取 `liveUsage.subscriptionActiveUntil`；若该字段尚未同步，则显示为“待首次同步”。",
    "",
    "| 标题 | 邮箱 | 团队 / workspace | 订阅有效期 | 同步时间 |",
    "|------|------|------------------|------------|----------|",
    rows || "| — | — | — | — | — |",
    "",
  ].join("\n");
}

async function syncAccountsMemory(accounts) {
  const memoryFile = getMemoryFilePath();
  await fs.mkdir(path.dirname(memoryFile), { recursive: true });
  const block = buildOpenAiMemoryBlock(Array.isArray(accounts) ? accounts : []);
  let raw = "";

  try {
    raw = await fs.readFile(memoryFile, "utf8");
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  const marker = "### Fries 自动同步（OpenAI）";
  const nextHeadingPattern = /\n### /g;
  let nextContent = raw;

  if (raw.includes(marker)) {
    const start = raw.indexOf(marker);
    nextHeadingPattern.lastIndex = start + marker.length;
    const nextHeading = nextHeadingPattern.exec(raw);
    const end = nextHeading ? nextHeading.index + 1 : raw.length;
    nextContent = `${raw.slice(0, start)}${block}${raw.slice(end)}`.trimEnd();
  } else {
    nextContent = `${raw.trimEnd()}\n\n${block}`.trim();
  }

  await fs.writeFile(memoryFile, `${nextContent}\n`, "utf8");
  return {
    updated: Array.isArray(accounts) ? accounts.filter((account) => account.cluster === "openai").length : 0,
  };
}

function resolveAsset(...segments) {
  return app.isPackaged
    ? path.join(app.getAppPath(), ...segments)
    : path.join(__dirname, "..", ...segments);
}

function getWindowIconPath() {
  return resolveAsset("electron", "assets", "app-icon.png");
}

function getTrayIconPath() {
  return resolveAsset("electron", "assets", "tray.ico");
}

function createTrayIcon() {
  const preferred = nativeImage.createFromPath(getTrayIconPath());
  if (!preferred.isEmpty()) {
    return preferred;
  }

  const fallback = nativeImage.createFromPath(getWindowIconPath());
  if (!fallback.isEmpty()) {
    return fallback.resize({ width: 20, height: 20, quality: "best" });
  }

  return nativeImage.createFromPath(app.getPath("exe"));
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setSkipTaskbar(false);
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
    settingsWindow.moveTop();
  }
  emitWindowState();
}

function showSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    return;
  }

  if (settingsWindow.isMinimized()) {
    settingsWindow.restore();
  }
  settingsWindow.show();
  settingsWindow.moveTop();
  settingsWindow.focus();
  emitWindowState(settingsWindow);
}

function hideToTray() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setSkipTaskbar(true);
  mainWindow.hide();
  emitWindowState();

  if (tray && process.platform === "win32" && !hasShownTrayHint) {
    tray.displayBalloon({
      iconType: "info",
      title: "Fries",
      content: "已最小化到任务栏通知区，点击托盘图标可恢复。",
    });
    hasShownTrayHint = true;
  }
}

function currentWindowState(targetWindow = mainWindow) {
  return {
    isMaximized: Boolean(targetWindow?.isMaximized()),
    isVisible: Boolean(targetWindow?.isVisible()),
  };
}

function emitWindowState(targetWindow = mainWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  targetWindow.webContents.send("window:state-changed", currentWindowState(targetWindow));
}

function loadRenderer(targetWindow, hash = "") {
  if (app.isPackaged) {
    targetWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      hash: hash || undefined,
    });
    return;
  }

  const suffix = hash ? `#${hash}` : "";
  targetWindow.loadURL(`${DEV_SERVER_URL}${suffix}`);
}

function createBaseWindow(overrides = {}) {
  return new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1240,
    minHeight: 760,
    show: false,
    title: "Fries",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    autoHideMenuBar: true,
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...overrides,
  });
}

function attachSharedWindowListeners(targetWindow) {
  targetWindow.on("maximize", () => {
    emitWindowState(targetWindow);
  });

  targetWindow.on("unmaximize", () => {
    emitWindowState(targetWindow);
  });

  targetWindow.on("show", () => {
    emitWindowState(targetWindow);
  });

  targetWindow.on("hide", () => {
    emitWindowState(targetWindow);
  });
}

function createWindow() {
  mainWindow = createBaseWindow({});

  loadRenderer(mainWindow);

  mainWindow.once("ready-to-show", () => {
    showMainWindow();
  });

  attachSharedWindowListeners(mainWindow);

  mainWindow.on("focus", () => {
    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      settingsWindow.moveTop();
    }
  });

  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    hideToTray();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideToTray();
    }
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    showSettingsWindow();
    return settingsWindow;
  }

  const mainBounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
  settingsWindow = createBaseWindow({
    width: 1120,
    height: 860,
    minWidth: 920,
    minHeight: 700,
    show: false,
    title: "Fries Settings",
    x: mainBounds ? mainBounds.x + 70 : undefined,
    y: mainBounds ? mainBounds.y + 50 : undefined,
    transparent: false,
    backgroundColor: "#f3f6fb",
    thickFrame: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
  });

  loadRenderer(settingsWindow, "settings");
  attachSharedWindowListeners(settingsWindow);

  settingsWindow.once("ready-to-show", () => {
    settingsWindow.moveTop();
    showSettingsWindow();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Fries");

  const menu = Menu.buildFromTemplate([
    {
      label: "打开主面板",
      click: () => showMainWindow(),
    },
    {
      label: "隐藏到托盘",
      click: () => hideToTray(),
    },
    {
      type: "separator",
    },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isVisible()) {
      hideToTray();
      return;
    }
    showMainWindow();
  });
}

async function readDashboardState() {
  try {
    const raw = await fs.readFile(getStateFilePath(), "utf8");
    lastStateSerialized = raw;
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeDashboardState(payload) {
  await ensureDataDirs();
  const serialized = JSON.stringify(payload, null, 2);
  if (serialized === lastStateSerialized) {
    return false;
  }
  lastStateSerialized = serialized;
  await fs.writeFile(getStateFilePath(), serialized, "utf8");
  return true;
}

function broadcastStateUpdate(payload, excludeWindow) {
  BrowserWindow.getAllWindows().forEach((targetWindow) => {
    if (targetWindow.isDestroyed() || targetWindow === excludeWindow) {
      return;
    }
    targetWindow.webContents.send("dashboard:state-updated", payload);
  });
}

function getTargetWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

if (hasSingleInstanceLock) {
  app.whenReady().then(() => {
    ipcMain.handle("dashboard:load", async () => readDashboardState());
    ipcMain.handle("dashboard:save", async (event, payload) => {
      const stateChanged = await writeDashboardState(payload);
      await writeTimelineLog(payload.timelineLog);
      if (stateChanged) {
        broadcastStateUpdate(payload, getTargetWindow(event));
      }
    });
    ipcMain.handle("dashboard:get-storage-path", async () => getStateFilePath());
    ipcMain.handle("dashboard:get-data-paths", async () => {
      await ensureDataDirs();
      return getDataPaths();
    });
    ipcMain.handle("dashboard:open-data-file", async () => {
      await ensureDataDirs();
      const target = getStateFilePath();
      if (!fssync.existsSync(target)) {
        await shell.openPath(getDataDir());
        return;
      }
      await shell.openPath(target);
    });
    ipcMain.handle("dashboard:open-data-dir", async () => {
      await ensureDataDirs();
      await shell.openPath(getDataDir());
    });
    ipcMain.handle("dashboard:open-snapshots-dir", async () => {
      await ensureDataDirs();
      await shell.openPath(getSnapshotsDir());
    });
    ipcMain.handle("dashboard:open-timeline-logs-dir", async () => {
      await ensureDataDirs();
      await shell.openPath(getTimelineLogsDir());
    });
    ipcMain.handle("dashboard:open-memory-file", async () => {
      await fs.mkdir(path.dirname(getMemoryFilePath()), { recursive: true });
      if (!fssync.existsSync(getMemoryFilePath())) {
        await fs.writeFile(getMemoryFilePath(), "", "utf8");
      }
      await shell.openPath(getMemoryFilePath());
    });
    ipcMain.handle("dashboard:save-openai-snapshot", async (_event, payload) => {
      await saveSnapshotRecord(payload);
    });
    ipcMain.handle("dashboard:list-snapshots", async () => listSnapshotRecords());
    ipcMain.handle("dashboard:load-snapshot-index-cache", async () => readSnapshotIndexCache());
    ipcMain.handle("dashboard:save-snapshot-index-cache", async (_event, payload) => {
      await writeSnapshotIndexCache(payload);
    });
    ipcMain.handle("dashboard:prune-snapshots", async (_event, retentionDays) => {
      await pruneSnapshotRecords(retentionDays);
    });
    ipcMain.handle("dashboard:clear-openai-cache", async () => {
      await clearOpenAiCache();
    });
    ipcMain.handle("dashboard:run-self-check", async () => {
      await ensureDataDirs();
      return runSelfCheck({
        stateFile: getStateFilePath(),
        snapshotsDir: getSnapshotsDir(),
        timelineLogFile: getTimelineLogFilePath(),
      });
    });
    ipcMain.handle("dashboard:sync-accounts-memory", async (_event, accounts) => {
      return syncAccountsMemory(accounts);
    });
    ipcMain.handle("dashboard:probe-codex-usage", async () => probeCodexUsage());
    ipcMain.handle("window:minimize", async (event) => {
      const targetWindow = getTargetWindow(event);
      if (!targetWindow) {
        return currentWindowState();
      }

      if (targetWindow === mainWindow) {
        hideToTray();
      } else {
        targetWindow.minimize();
        emitWindowState(targetWindow);
      }
    });
    ipcMain.handle("window:toggle-maximize", async (event) => {
      const targetWindow = getTargetWindow(event);
      if (!targetWindow) {
        return currentWindowState();
      }

      if (targetWindow.isMaximized()) {
        targetWindow.unmaximize();
      } else {
        targetWindow.maximize();
      }

      emitWindowState(targetWindow);
      return currentWindowState(targetWindow);
    });
    ipcMain.handle("window:close", async (event) => {
      const targetWindow = getTargetWindow(event);
      if (!targetWindow) {
        return;
      }

      targetWindow.close();
    });
    ipcMain.handle("window:get-state", async (event) => currentWindowState(getTargetWindow(event)));
    ipcMain.handle("window:open-settings", async () => {
      createSettingsWindow();
      return true;
    });

    createWindow();
    createTray();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        return;
      }
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep tray app alive on Windows/Linux.
  }
});
