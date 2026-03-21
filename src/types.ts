export type AccountCluster = "openai" | "observer" | "api";
export type AccountStatus =
  | "active"
  | "ready"
  | "limited"
  | "observe"
  | "paused"
  | "expired";
export type TrackingMode = "estimate" | "exact" | "window";
export type ActivityKind =
  | "switch"
  | "limit"
  | "note"
  | "import"
  | "reset"
  | "sync";
export type ThemeMode = "system" | "light" | "dark";
export type AccountProduct =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "kimi"
  | "custom"
  | "qwen"
  | "glm-ocr";
export type TeamMode = "none" | "team";
export type ThemePreset =
  | "nordic-blue"
  | "sea-salt"
  | "vital-orange"
  | "retro-amber"
  | "rose-red"
  | "lemon-lime"
  | "flamingo"
  | "violet"
  | "lavender"
  | "peach-pink"
  | "sakura-pink";
export type LocaleMode = "zh-CN" | "en";
export type VisualEffectMode = "frosted" | "solid";
export type TimelineScope = "week" | "month";
export type AnalyticsRange = "hour" | "day" | "week" | "month";
export type AnalyticsChartMode = "line" | "bar";
export type HeatmapScope = "month" | "year";

export interface RollingUsageWindow {
  usedPercent?: number;
  remainingPercent?: number;
  resetsAt?: string;
  resetsAtMs?: number;
}

export interface LiveUsageSnapshot {
  provider: string;
  accountEmail?: string;
  plan?: string;
  subscriptionActiveUntil?: string;
  subscriptionActiveUntilMs?: number;
  fiveHour: RollingUsageWindow;
  sevenDay: RollingUsageWindow;
  totalTokens?: number;
  lastTokens?: number;
  sourceLabel: string;
  sourceSyncedAt?: string;
  sourceSyncedAtMs?: number;
  syncedAt: string;
  syncedAtMs?: number;
  recordedAt?: string;
  recordedAtMs?: number;
}

export interface UsageHistoryEntry {
  id: string;
  snapshot: LiveUsageSnapshot;
  recordedAt: string;
  recordedAtMs?: number;
  note?: string;
}

export interface AccountRecord {
  id: string;
  provider: string;
  accountLabel: string;
  email: string;
  plan: string;
  cluster: AccountCluster;
  productKey?: AccountProduct;
  tierKey?: string;
  teamMode?: TeamMode;
  status: AccountStatus;
  priority: number;
  isActive: boolean;
  workspace?: string;
  statusDetail: string;
  usageLabel: string;
  usagePercent: number;
  trackingMode: TrackingMode;
  resetAt?: string;
  expiryAt?: string;
  costLabel?: string;
  tokensUsed?: number;
  tokensRemaining?: number;
  liveUsage?: LiveUsageSnapshot;
  usageHistory?: UsageHistoryEntry[];
  sourceLabel: string;
  notes: string[];
}

export interface DashboardProfile {
  title: string;
  currentMode: string;
  summary: string;
  strategyNotes: string[];
  lastReviewedAt: string;
}

export interface ActivityRecord {
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  detail: string;
}

export interface TimelineLogEntry {
  id: string;
  at: string;
  atMs?: number;
  kind: "depleted5h" | "depleted7d" | "reset5h" | "reset7d" | "expired" | "login";
  accountId?: string;
  sourceAccountId?: string;
  targetAccountId?: string;
  note?: string;
}

export interface DashboardSettings {
  syncIntervalMinutes: number;
  snapshotRetentionDays: number;
  autoSyncOnLaunch: boolean;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  locale: LocaleMode;
  visualEffectMode: VisualEffectMode;
  performanceMode: boolean;
  timelineScope: TimelineScope;
  analyticsRange: AnalyticsRange;
  analyticsChartMode: AnalyticsChartMode;
  heatmapScope: HeatmapScope;
}

export interface DashboardState {
  version: number;
  profile: DashboardProfile;
  settings: DashboardSettings;
  accounts: AccountRecord[];
  activityLog: ActivityRecord[];
  timelineLog?: TimelineLogEntry[];
}

export interface SnapshotRecord {
  id: string;
  accountId: string;
  accountLabel: string;
  email: string;
  workspace?: string;
  plan: string;
  provider: string;
  captureReason?: "sync" | "forced-switch" | "forced-depleted5h";
  sourceSyncedAt?: string;
  sourceSyncedAtMs?: number;
  syncedAt: string;
  syncedAtMs?: number;
  recordedAt: string;
  recordedAtMs?: number;
  subscriptionActiveUntil?: string;
  subscriptionActiveUntilMs?: number;
  fiveHour: RollingUsageWindow;
  sevenDay: RollingUsageWindow;
  totalTokens?: number;
  lastTokens?: number;
}

export interface SnapshotIndexBucketEntry {
  key: string;
  dateMs: number;
  tokens: number;
}

export interface SnapshotIndexCache {
  signature: string;
  generatedAt: string;
  generatedAtMs: number;
  cleanSnapshots: SnapshotRecord[];
  tokenTotalsByAccount: Record<string, { tokens: number; lastTokens: number }>;
  minuteBuckets: SnapshotIndexBucketEntry[];
  hourBuckets: SnapshotIndexBucketEntry[];
  dayBuckets: SnapshotIndexBucketEntry[];
}

export interface SelfCheckIssue {
  severity: "error" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
}

export interface SelfCheckReport {
  ok: boolean;
  checkedAt: string;
  checkedAtMs: number;
  summary: {
    accounts: number;
    openAiAccounts: number;
    snapshots: number;
    timelineEvents: number;
    errors: number;
    warnings: number;
  };
  issues: SelfCheckIssue[];
}

export interface DataPaths {
  dataDir: string;
  stateFile: string;
  snapshotsDir: string;
  cacheDir?: string;
  snapshotIndexCacheFile?: string;
  importsDir: string;
  memoryFile: string;
  timelineLogFile: string;
  timelineLogsDir?: string;
  migrationReportFile?: string;
}

export interface DesktopApi {
  loadState(): Promise<DashboardState | null>;
  saveState(state: DashboardState): Promise<void>;
  getStoragePath(): Promise<string>;
  getDataPaths(): Promise<DataPaths>;
  openDataFile(): Promise<void>;
  openDataDir(): Promise<void>;
  openSnapshotsDir(): Promise<void>;
  openTimelineLogsDir?(): Promise<void>;
  openMemoryFile(): Promise<void>;
  saveOpenAiSnapshot(snapshot: SnapshotRecord): Promise<void>;
  listSnapshots(): Promise<SnapshotRecord[]>;
  loadSnapshotIndexCache?(): Promise<SnapshotIndexCache | null>;
  saveSnapshotIndexCache?(cache: SnapshotIndexCache): Promise<void>;
  pruneSnapshots(retentionDays: number): Promise<void>;
  clearOpenAiCache(): Promise<void>;
  runSelfCheck?(): Promise<SelfCheckReport>;
  syncAccountsMemory(accounts: AccountRecord[]): Promise<{ updated: number }>;
  probeCodexUsage(): Promise<LiveUsageSnapshot | null>;
  openSettingsWindow?(): Promise<boolean>;
  minimizeWindow?(): Promise<void>;
  toggleMaximizeWindow?(): Promise<void>;
  closeWindow?(): Promise<void>;
  getWindowState?(): Promise<DesktopWindowState>;
  getWindowBounds?(): Promise<DesktopWindowBounds>;
  setWindowBounds?(bounds: DesktopWindowBounds): Promise<DesktopWindowBounds>;
  onStateUpdated?(callback: (state: DashboardState) => void): () => void;
  onWindowStateChange?(callback: (state: DesktopWindowState) => void): () => void;
}

export interface DesktopWindowState {
  isMaximized: boolean;
  isVisible: boolean;
}

export interface DesktopWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    desktopMeta?: {
      platform: string;
      isPackaged: boolean;
    };
    desktopApi?: DesktopApi;
  }
}
