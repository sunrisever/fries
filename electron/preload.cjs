const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopMeta", {
  platform: process.platform,
  isPackaged: process.env.NODE_ENV === "production",
});

contextBridge.exposeInMainWorld("desktopApi", {
  loadState: () => ipcRenderer.invoke("dashboard:load"),
  saveState: (state) => ipcRenderer.invoke("dashboard:save", state),
  getStoragePath: () => ipcRenderer.invoke("dashboard:get-storage-path"),
  getDataPaths: () => ipcRenderer.invoke("dashboard:get-data-paths"),
  openDataFile: () => ipcRenderer.invoke("dashboard:open-data-file"),
  openDataDir: () => ipcRenderer.invoke("dashboard:open-data-dir"),
  openSnapshotsDir: () => ipcRenderer.invoke("dashboard:open-snapshots-dir"),
  openTimelineLogsDir: () => ipcRenderer.invoke("dashboard:open-timeline-logs-dir"),
  openMemoryFile: () => ipcRenderer.invoke("dashboard:open-memory-file"),
  saveOpenAiSnapshot: (snapshot) => ipcRenderer.invoke("dashboard:save-openai-snapshot", snapshot),
  listSnapshots: () => ipcRenderer.invoke("dashboard:list-snapshots"),
  loadSnapshotIndexCache: () => ipcRenderer.invoke("dashboard:load-snapshot-index-cache"),
  saveSnapshotIndexCache: (cache) => ipcRenderer.invoke("dashboard:save-snapshot-index-cache", cache),
  pruneSnapshots: (retentionDays) => ipcRenderer.invoke("dashboard:prune-snapshots", retentionDays),
  clearOpenAiCache: () => ipcRenderer.invoke("dashboard:clear-openai-cache"),
  runSelfCheck: () => ipcRenderer.invoke("dashboard:run-self-check"),
  syncAccountsMemory: (accounts) => ipcRenderer.invoke("dashboard:sync-accounts-memory", accounts),
  probeCodexUsage: () => ipcRenderer.invoke("dashboard:probe-codex-usage"),
  openSettingsWindow: () => ipcRenderer.invoke("window:open-settings"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  getWindowState: () => ipcRenderer.invoke("window:get-state"),
  onStateUpdated: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("dashboard:state-updated", listener);
    return () => {
      ipcRenderer.removeListener("dashboard:state-updated", listener);
    };
  },
  onWindowStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("window:state-changed", listener);
    return () => {
      ipcRenderer.removeListener("window:state-changed", listener);
    };
  },
});
