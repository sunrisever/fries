import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import "./app.css";
import { cloneSeed } from "./seed";
import {
  buildSnapshotIndex,
  buildSnapshotIndexSignature,
  hydrateSnapshotIndex,
  serializeSnapshotIndex,
} from "./lib/snapshot-index";
import type {
  AccountRecord,
  AccountProduct,
  AccountStatus,
  ActivityKind,
  ActivityRecord,
  AnalyticsChartMode,
  AnalyticsRange,
  DashboardSettings,
  DashboardState,
  DataPaths,
  DesktopWindowBounds,
  DesktopWindowState,
  HeatmapScope,
  LocaleMode,
  LiveUsageSnapshot,
  RollingUsageWindow,
  SelfCheckReport,
  SnapshotIndexCache,
  SnapshotRecord,
  ThemeMode,
  ThemePreset,
  TeamMode,
  TimelineScope,
  TimelineLogEntry,
  UsageHistoryEntry,
  VisualEffectMode,
} from "./types";

const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const ProvidersPage = lazy(() => import("./pages/ProvidersPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const TimelinePage = lazy(() => import("./pages/TimelinePage"));

const STORAGE_KEY = "ai-account-console.dashboard.v1";
const SIGNATURE_PROMPT_COOLDOWN_KEY = "ai-account-console.signature-prompt-cooldowns.v1";
const APP_VERSION = "0.4.4-beta";
const APP_CHINESE_NAME = "薯条";
const DATA_YEAR_MIN = 2026;
const DATA_YEAR_MAX = 2036;
const MAIN_WINDOW_MIN_WIDTH = 1240;
const MAIN_WINDOW_MIN_HEIGHT = 760;

type ViewId = "overview" | "analytics" | "providers" | "timeline" | "settings";

type PendingSyncChoice = {
  snapshot: LiveUsageSnapshot;
  matchedIds: string[];
  sourceAccountId?: string;
  sourceBackup?: AccountRecord;
  reason: string;
};

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type ResizeDragState = {
  direction: ResizeDirection;
  startScreenX: number;
  startScreenY: number;
  startBounds: DesktopWindowBounds;
};

type AccountEditorDraft = {
  id?: string;
  productKey: AccountProduct;
  tierKey: string;
  teamMode: TeamMode;
  customProductName: string;
  customPlanName: string;
  observe: boolean;
  accountLabel: string;
  email: string;
  workspace?: string;
  expiryAt?: string;
  costLabel?: string;
  notesText: string;
};

type ProductConfig = {
  provider: string;
  cluster: AccountRecord["cluster"];
  teamEligible: boolean;
  label: { zh: string; en: string };
  plans: Array<{ value: string; label: { zh: string; en: string } }>;
};

const PRODUCT_CONFIG: Record<AccountProduct, ProductConfig> = {
  chatgpt: {
    provider: "OpenAI",
    cluster: "openai",
    teamEligible: true,
    label: { zh: "ChatGPT", en: "ChatGPT" },
    plans: [
      { value: "plus", label: { zh: "Plus", en: "Plus" } },
      { value: "pro", label: { zh: "Pro", en: "Pro" } },
      { value: "business", label: { zh: "Business", en: "Business" } },
    ],
  },
  claude: {
    provider: "Anthropic",
    cluster: "observer",
    teamEligible: false,
    label: { zh: "Claude", en: "Claude" },
    plans: [
      { value: "pro", label: { zh: "Pro", en: "Pro" } },
      { value: "max-5x", label: { zh: "Max 5x", en: "Max 5x" } },
      { value: "max-10x", label: { zh: "Max 10x", en: "Max 10x" } },
    ],
  },
  gemini: {
    provider: "Google",
    cluster: "observer",
    teamEligible: false,
    label: { zh: "Gemini", en: "Gemini" },
    plans: [
      { value: "ai-plus", label: { zh: "AI Plus", en: "AI Plus" } },
      { value: "ai-pro", label: { zh: "AI Pro", en: "AI Pro" } },
      { value: "ai-ultra", label: { zh: "AI Ultra", en: "AI Ultra" } },
    ],
  },
  kimi: {
    provider: "Moonshot",
    cluster: "observer",
    teamEligible: false,
    label: { zh: "Kimi", en: "Kimi" },
    plans: [
      { value: "moderato", label: { zh: "Moderato Coding Plan", en: "Moderato Coding Plan" } },
      { value: "allegretto", label: { zh: "Allegretto Coding Plan", en: "Allegretto Coding Plan" } },
      { value: "allegro", label: { zh: "Allegro Coding Plan", en: "Allegro Coding Plan" } },
    ],
  },
  custom: {
    provider: "",
    cluster: "api",
    teamEligible: false,
    label: { zh: "自定义", en: "Custom" },
    plans: [],
  },
  qwen: {
    provider: "Qwen",
    cluster: "api",
    teamEligible: false,
    label: { zh: "Qwen", en: "Qwen" },
    plans: [{ value: "api", label: { zh: "API / 流量包", en: "API / quota pack" } }],
  },
  "glm-ocr": {
    provider: "ZhipuAI",
    cluster: "api",
    teamEligible: false,
    label: { zh: "GLM OCR", en: "GLM OCR" },
    plans: [{ value: "quota-pack", label: { zh: "流量包", en: "Quota pack" } }],
  },
};

const PRODUCT_PICKER_OPTIONS: AccountProduct[] = ["chatgpt", "claude", "gemini", "kimi", "custom"];
const CUSTOM_PRODUCT_SUGGESTIONS = ["GLM", "MiniMax", "Qwen", "Zhipu GLM", "DeepSeek"];

function sanitizeThemePreset(value?: string): ThemePreset {
  switch (value) {
    case "sea-salt":
    case "vital-orange":
    case "retro-amber":
    case "rose-red":
    case "lemon-lime":
    case "flamingo":
    case "violet":
    case "lavender":
    case "peach-pink":
    case "sakura-pink":
      return value;
    default:
      return "nordic-blue";
  }
}

function fallbackLoadState(): DashboardState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return cloneSeed();
  }

  try {
    return JSON.parse(raw) as DashboardState;
  } catch {
    return cloneSeed();
  }
}

function pruneSignaturePromptCooldowns(
  record: Record<string, number>,
  now = Date.now(),
) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => Number.isFinite(value) && now - Number(value) < 30 * 24 * 60 * 60 * 1000),
  );
}

function loadSignaturePromptCooldowns() {
  try {
    const raw = localStorage.getItem(SIGNATURE_PROMPT_COOLDOWN_KEY);
    if (!raw) {
      return {};
    }

    return pruneSignaturePromptCooldowns(JSON.parse(raw) as Record<string, number>);
  } catch {
    return {};
  }
}

function persistSignaturePromptCooldowns(map: Map<string, number>) {
  try {
    localStorage.setItem(
      SIGNATURE_PROMPT_COOLDOWN_KEY,
      JSON.stringify(pruneSignaturePromptCooldowns(Object.fromEntries(map))),
    );
  } catch {
    // Ignore local storage failures; cooldowns are a UX hint, not source-of-truth data.
  }
}

function migrateLegacyState(state: DashboardState): DashboardState {
  const legacyVersion = Number(state.version) || 1;
  if (legacyVersion >= 3) {
    return state;
  }

  const baseSettings = {
    ...cloneSeed().settings,
    ...(state.settings ?? {}),
  };

  return {
    ...state,
    version: 3,
    settings: {
      ...baseSettings,
      themePreset: sanitizeThemePreset(baseSettings.themePreset),
    },
    accounts: Array.isArray(state.accounts)
      ? state.accounts.map((account) => {
          if (account.cluster !== "openai") {
            return account;
          }

          return {
            ...account,
            tokensUsed: undefined,
            usageHistory: [],
            liveUsage: account.liveUsage
              ? {
                  ...account.liveUsage,
                  totalTokens: undefined,
                  lastTokens: undefined,
                }
              : account.liveUsage,
          };
        })
      : state.accounts,
  };
}

function sortByPriority(records: AccountRecord[]) {
  return [...records].sort((left, right) => left.priority - right.priority);
}

function stripMerchantAlias(value?: string) {
  if (!value) {
    return value;
  }

  return value
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shadeHex(hex: string, factor: number) {
  const raw = hex.replace("#", "");
  const expanded = raw.length === 3 ? raw.split("").map((part) => `${part}${part}`).join("") : raw;
  if (expanded.length !== 6) {
    return hex;
  }

  const red = parseInt(expanded.slice(0, 2), 16);
  const green = parseInt(expanded.slice(2, 4), 16);
  const blue = parseInt(expanded.slice(4, 6), 16);

  const mix = (channel: number) => clampChannel(channel + (factor >= 0 ? (255 - channel) * factor : channel * factor));
  return `#${[mix(red), mix(green), mix(blue)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function ellipsePoint(cx: number, cy: number, rx: number, ry: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + Math.cos(rad) * rx,
    y: cy + Math.sin(rad) * ry,
  };
}

function ellipseSlicePath(cx: number, cy: number, rx: number, ry: number, startDeg: number, endDeg: number) {
  const sweep = endDeg - startDeg;
  if (sweep >= 359.999) {
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`;
  }

  const start = ellipsePoint(cx, cy, rx, ry, startDeg);
  const end = ellipsePoint(cx, cy, rx, ry, endDeg);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${rx} ${ry} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function visibleFrontIntervals(startDeg: number, endDeg: number) {
  const intervals: Array<[number, number]> = [];
  for (let bandStart = -360; bandStart <= 360; bandStart += 360) {
    const visibleStart = Math.max(startDeg, bandStart);
    const visibleEnd = Math.min(endDeg, bandStart + 180);
    if (visibleEnd > visibleStart) {
      intervals.push([visibleStart, visibleEnd]);
    }
  }
  return intervals;
}

function ellipseSidePath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  depth: number,
  startDeg: number,
  endDeg: number,
) {
  const topStart = ellipsePoint(cx, cy, rx, ry, startDeg);
  const topEnd = ellipsePoint(cx, cy, rx, ry, endDeg);
  const bottomStart = ellipsePoint(cx, cy + depth, rx, ry, startDeg);
  const bottomEnd = ellipsePoint(cx, cy + depth, rx, ry, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${topStart.x} ${topStart.y}`,
    `A ${rx} ${ry} 0 ${largeArc} 1 ${topEnd.x} ${topEnd.y}`,
    `L ${bottomEnd.x} ${bottomEnd.y}`,
    `A ${rx} ${ry} 0 ${largeArc} 0 ${bottomStart.x} ${bottomStart.y}`,
    "Z",
  ].join(" ");
}

function normalizePlanKey(value?: string) {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }

  if (raw.includes("chatgpt") || raw.includes("openai") || raw.includes("gpt")) {
    if (raw.includes("business") || raw.includes("team")) {
      return "chatgpt-business";
    }
    if (raw.includes("pro")) {
      return "chatgpt-pro";
    }
    if (raw.includes("plus")) {
      return "chatgpt-plus";
    }
  }

  if (raw.includes("claude")) {
    if (raw.includes("10x")) {
      return "claude-max-10x";
    }
    if (raw.includes("5x")) {
      return "claude-max-5x";
    }
    return "claude-pro";
  }

  if (raw.includes("gemini") || raw.includes("google ai")) {
    if (raw.includes("ultra")) {
      return "gemini-ai-ultra";
    }
    if (raw.includes("plus")) {
      return "gemini-ai-plus";
    }
    return "gemini-ai-pro";
  }

  if (raw.includes("kimi")) {
    if (raw.includes("allegro")) {
      return "kimi-allegro";
    }
    if (raw.includes("allegretto")) {
      return "kimi-allegretto";
    }
    return "kimi-moderato";
  }

  return raw;
}

function formatUiDateTime(value?: string | number, locale: LocaleMode = "zh-CN") {
  const timestamp = parseDateTimeValue(value);
  if (typeof timestamp !== "number") {
    return undefined;
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatShortUiDateTime(value?: string | number, locale: LocaleMode = "zh-CN") {
  const timestamp = parseDateTimeValue(value);
  if (typeof timestamp !== "number") {
    return undefined;
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function snapshotSourceTime(snapshot?: LiveUsageSnapshot) {
  return (
    snapshot?.sourceSyncedAtMs ??
    parseDateTimeValue(snapshot?.sourceSyncedAt) ??
    snapshot?.syncedAtMs ??
    parseDateTimeValue(snapshot?.syncedAt)
  );
}

function snapshotRecordedTime(snapshot?: LiveUsageSnapshot) {
  return (
    snapshot?.recordedAtMs ??
    parseDateTimeValue(snapshot?.recordedAt) ??
    snapshotSourceTime(snapshot)
  );
}

function snapshotFreshnessTime(snapshot?: LiveUsageSnapshot) {
  return snapshotSourceTime(snapshot) ?? snapshotRecordedTime(snapshot) ?? 0;
}

function subscriptionTime(snapshot?: Pick<LiveUsageSnapshot, "subscriptionActiveUntil" | "subscriptionActiveUntilMs">) {
  return (
    snapshot?.subscriptionActiveUntilMs ??
    parseDateTimeValue(snapshot?.subscriptionActiveUntil)
  );
}

function normalizeWindow(window?: RollingUsageWindow): RollingUsageWindow | undefined {
  if (!window) {
    return undefined;
  }

  const resetsAtMs = window.resetsAtMs ?? parseDateTimeValue(window.resetsAt);
  return {
    ...window,
    resetsAtMs,
    resetsAt: window.resetsAt ?? formatUiDateTime(resetsAtMs),
  };
}

function normalizeSnapshot(snapshot?: LiveUsageSnapshot, fallbackRecordedAt?: string | number): LiveUsageSnapshot | undefined {
  if (!snapshot) {
    return undefined;
  }

  const sourceSyncedAtMs =
    snapshot.sourceSyncedAtMs ??
    parseDateTimeValue(snapshot.sourceSyncedAt) ??
    snapshot.syncedAtMs ??
    parseDateTimeValue(snapshot.syncedAt);
  const recordedAtMs =
    snapshot.recordedAtMs ??
    parseDateTimeValue(snapshot.recordedAt) ??
    parseDateTimeValue(fallbackRecordedAt) ??
    sourceSyncedAtMs;
  const subscriptionActiveUntilMs =
    snapshot.subscriptionActiveUntilMs ??
    parseDateTimeValue(snapshot.subscriptionActiveUntil);
  const normalizedSourceLabel =
    formatUiDateTime(sourceSyncedAtMs) ??
    snapshot.sourceSyncedAt ??
    snapshot.syncedAt ??
    "未同步";
  const normalizedRecordedLabel =
    formatUiDateTime(recordedAtMs) ??
    snapshot.recordedAt ??
    normalizedSourceLabel;

  return {
    ...snapshot,
    sourceSyncedAtMs,
    sourceSyncedAt: normalizedSourceLabel,
    syncedAtMs: sourceSyncedAtMs,
    syncedAt: normalizedSourceLabel,
    recordedAtMs,
    recordedAt: normalizedRecordedLabel,
    subscriptionActiveUntilMs,
    subscriptionActiveUntil: formatUiDateTime(subscriptionActiveUntilMs) ?? snapshot.subscriptionActiveUntil,
    fiveHour: normalizeWindow(snapshot.fiveHour) ?? {},
    sevenDay: normalizeWindow(snapshot.sevenDay) ?? {},
  };
}

function coerceUsageHistoryEntries(
  value: AccountRecord["usageHistory"],
): UsageHistoryEntry[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object" && "snapshot" in value) {
    return [value as UsageHistoryEntry];
  }

  return [];
}

function normalizeUsageHistoryEntry(entry: UsageHistoryEntry): UsageHistoryEntry {
  const snapshot = normalizeSnapshot(entry.snapshot, entry.recordedAtMs ?? entry.recordedAt);
  const recordedAtMs =
    entry.recordedAtMs ??
    parseDateTimeValue(entry.recordedAt) ??
    snapshotRecordedTime(snapshot);

  return {
    ...entry,
    snapshot: snapshot ?? entry.snapshot,
    recordedAtMs,
    recordedAt: formatUiDateTime(recordedAtMs) ?? entry.recordedAt ?? nowLabel(),
  };
}

function snapshotRecordTime(
  record?: Pick<
    SnapshotRecord,
    "recordedAt" | "recordedAtMs" | "sourceSyncedAt" | "sourceSyncedAtMs" | "syncedAt" | "syncedAtMs"
  >,
) {
  return (
    record?.recordedAtMs ??
    parseDateTimeValue(record?.recordedAt) ??
    record?.sourceSyncedAtMs ??
    parseDateTimeValue(record?.sourceSyncedAt) ??
    record?.syncedAtMs ??
    parseDateTimeValue(record?.syncedAt)
  );
}

function normalizeSnapshotRecord(record: SnapshotRecord): SnapshotRecord {
  const recordedAtMs = snapshotRecordTime(record);
  const sourceSyncedAtMs =
    record.sourceSyncedAtMs ??
    parseDateTimeValue(record.sourceSyncedAt) ??
    record.syncedAtMs ??
    parseDateTimeValue(record.syncedAt);
  const subscriptionActiveUntilMs =
    record.subscriptionActiveUntilMs ?? parseDateTimeValue(record.subscriptionActiveUntil);
  const normalizedSourceLabel =
    formatUiDateTime(sourceSyncedAtMs) ??
    record.sourceSyncedAt ??
    record.syncedAt ??
    "未同步";
  const normalizedRecordedLabel =
    formatUiDateTime(recordedAtMs) ??
    record.recordedAt ??
    normalizedSourceLabel;

  return {
    ...record,
    recordedAtMs,
    recordedAt: normalizedRecordedLabel,
    sourceSyncedAtMs,
    sourceSyncedAt: normalizedSourceLabel,
    syncedAtMs: sourceSyncedAtMs,
    syncedAt: normalizedSourceLabel,
    subscriptionActiveUntilMs,
    subscriptionActiveUntil: formatUiDateTime(subscriptionActiveUntilMs) ?? record.subscriptionActiveUntil,
    fiveHour: normalizeWindow(record.fiveHour) ?? {},
    sevenDay: normalizeWindow(record.sevenDay) ?? {},
  };
}

function snapshotFromRecord(record: SnapshotRecord): LiveUsageSnapshot {
  const normalizedRecord = normalizeSnapshotRecord(record);
  return normalizeSnapshot(
    {
      provider: normalizedRecord.provider,
      accountEmail: normalizedRecord.email,
      plan: normalizedRecord.plan,
      sourceLabel: "snapshot-record",
      sourceSyncedAt: normalizedRecord.sourceSyncedAt,
      sourceSyncedAtMs: normalizedRecord.sourceSyncedAtMs,
      syncedAt: normalizedRecord.syncedAt,
      syncedAtMs: normalizedRecord.syncedAtMs,
      recordedAt: normalizedRecord.recordedAt,
      recordedAtMs: normalizedRecord.recordedAtMs,
      subscriptionActiveUntil: normalizedRecord.subscriptionActiveUntil,
      subscriptionActiveUntilMs: normalizedRecord.subscriptionActiveUntilMs,
      fiveHour: normalizedRecord.fiveHour,
      sevenDay: normalizedRecord.sevenDay,
      totalTokens: normalizedRecord.totalTokens,
      lastTokens: normalizedRecord.lastTokens,
    },
    normalizedRecord.recordedAtMs ?? normalizedRecord.recordedAt,
  )!;
}

function mergeStateWithSnapshotRecords(state: DashboardState, snapshotRecords: SnapshotRecord[]) {
  if (!Array.isArray(snapshotRecords) || snapshotRecords.length === 0) {
    return state;
  }

  const normalizedRecords = snapshotRecords.map(normalizeSnapshotRecord);
  const grouped = new Map<string, UsageHistoryEntry[]>();

  normalizedRecords.forEach((record) => {
    const targetAccount =
      state.accounts.find((account) => account.id === record.accountId && snapshotMatchesAccount(account, record)) ??
      state.accounts.find((account) => snapshotMatchesAccount(account, record));

    if (!targetAccount) {
      return;
    }

    const current = grouped.get(targetAccount.id) ?? [];
    current.push({
      id: record.id,
      recordedAt: formatUiDateTime(record.recordedAtMs ?? record.recordedAt) ?? record.recordedAt ?? nowLabel(),
      recordedAtMs: record.recordedAtMs ?? parseDateTimeValue(record.recordedAt),
      snapshot: snapshotFromRecord(record),
    });
    grouped.set(targetAccount.id, current);
  });

  if (grouped.size === 0) {
    return state;
  }

  const interimAccounts = state.accounts.map((account) => {
    const snapshotEntries = grouped.get(account.id);
    if (!snapshotEntries?.length) {
      return normalizeAccount(account, state.accounts);
    }

    const mergedHistory = [...(account.usageHistory ?? []).map(normalizeUsageHistoryEntry), ...snapshotEntries]
      .sort(compareUsageHistoryEntry);
    const dedupedHistory: UsageHistoryEntry[] = [];
    const seen = new Set<string>();

    for (const entry of mergedHistory) {
      const key = [
        snapshotRouteKey(entry.snapshot) ?? normalizeEmail(entry.snapshot.accountEmail) ?? "",
        snapshotRecordedTime(entry.snapshot) ?? entry.recordedAtMs ?? parseDateTimeValue(entry.recordedAt) ?? "",
        entry.snapshot.fiveHour.usedPercent ?? "",
        entry.snapshot.sevenDay.usedPercent ?? "",
      ].join("|");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      dedupedHistory.push(entry);
    }

    const latest = dedupedHistory[0]?.snapshot;
    return {
      ...account,
      liveUsage: latest ?? account.liveUsage,
      usageHistory: dedupedHistory.slice(0, 72),
      expiryAt: latest?.subscriptionActiveUntil ?? account.expiryAt,
    };
  });

  const normalizedAccounts = interimAccounts.map((account) => normalizeAccount(account, interimAccounts));
  return {
    ...state,
    accounts: normalizedAccounts,
    timelineLog: ensureTimelineLog({
      ...state,
      accounts: normalizedAccounts,
    }),
  };
}

function compareUsageHistoryEntry(left: UsageHistoryEntry, right: UsageHistoryEntry) {
  const leftFreshness = snapshotFreshnessTime(left.snapshot);
  const rightFreshness = snapshotFreshnessTime(right.snapshot);
  if (leftFreshness !== rightFreshness) {
    return rightFreshness - leftFreshness;
  }

  const leftRecorded =
    left.recordedAtMs ??
    parseDateTimeValue(left.recordedAt) ??
    snapshotRecordedTime(left.snapshot) ??
    0;
  const rightRecorded =
    right.recordedAtMs ??
    parseDateTimeValue(right.recordedAt) ??
    snapshotRecordedTime(right.snapshot) ??
    0;
  return rightRecorded - leftRecorded;
}

function snapshotRouteKey(
  snapshot?: Pick<LiveUsageSnapshot, "accountEmail" | "plan" | "subscriptionActiveUntil" | "subscriptionActiveUntilMs">,
) {
  const email = normalizeEmail(snapshot?.accountEmail);
  const planKey = normalizePlanKey(snapshot?.plan) ?? "unknown";
  const expiryMs = subscriptionTime(snapshot);
  if (!email || typeof expiryMs !== "number") {
    return undefined;
  }

  return `${email}|${planKey}|${expiryMs}`;
}

function signaturePromptKey(
  snapshot?: Pick<LiveUsageSnapshot, "accountEmail" | "plan" | "subscriptionActiveUntil" | "subscriptionActiveUntilMs">,
) {
  return snapshotRouteKey(snapshot) ?? `${normalizeEmail(snapshot?.accountEmail) ?? "unknown"}|${subscriptionTime(snapshot) ?? "none"}`;
}

function accountRouteKey(account?: AccountRecord) {
  if (!account) {
    return undefined;
  }

  const email = normalizeEmail(account.email);
  const planKey = normalizePlanKey(account.plan) ?? "unknown";
  const expiryMs = parseDateTimeValue(
    account.liveUsage?.subscriptionActiveUntilMs ?? account.liveUsage?.subscriptionActiveUntil ?? account.expiryAt,
  );
  if (!email || typeof expiryMs !== "number") {
    return undefined;
  }

  return `${email}|${planKey}|${expiryMs}`;
}

function snapshotBelongsToAccount(account: AccountRecord | undefined, snapshot: LiveUsageSnapshot | undefined) {
  if (!account || !snapshot) {
    return false;
  }

  const snapshotEmail = normalizeEmail(snapshot.accountEmail);
  const accountEmail = normalizeEmail(account.email);
  if (snapshotEmail && accountEmail && snapshotEmail !== accountEmail) {
    return false;
  }

  if (account.cluster === "openai") {
    const snapshotKey = snapshotRouteKey(snapshot);
    const accountKey = accountRouteKey(account);
    if (snapshotKey && accountKey) {
      return snapshotKey === accountKey;
    }
  }

  const snapshotExpiry = subscriptionTime(snapshot);
  const accountExpiry = parseDateTimeValue(
    account.liveUsage?.subscriptionActiveUntilMs ?? account.liveUsage?.subscriptionActiveUntil ?? account.expiryAt,
  );
  if (typeof snapshotExpiry === "number" && typeof accountExpiry === "number") {
    return snapshotExpiry === accountExpiry;
  }

  const snapshotPlan = normalizePlanKey(snapshot.plan);
  const accountPlan = normalizePlanKey(account.plan);
  if (snapshotPlan && accountPlan && snapshotPlan !== accountPlan) {
    return false;
  }

  return !snapshotEmail || snapshotEmail === accountEmail;
}

function repairAccountSnapshots(account: AccountRecord, allOpenAiAccounts: AccountRecord[]) {
  const historyEntries = Array.isArray(account.usageHistory)
    ? account.usageHistory.map(normalizeUsageHistoryEntry)
    : [];
  const normalizedLive = normalizeSnapshot(
    account.liveUsage,
    historyEntries[0]?.recordedAtMs ?? historyEntries[0]?.recordedAt,
  );

  const candidates = [
    ...(normalizedLive
      ? [
          {
            id: `live-${account.id}`,
            snapshot: normalizedLive,
            recordedAt: normalizedLive.recordedAt ?? nowLabel(),
            recordedAtMs: snapshotRecordedTime(normalizedLive),
          } satisfies UsageHistoryEntry,
        ]
      : []),
    ...historyEntries,
  ];

  const filtered = candidates
    .filter((entry) => snapshotBelongsToAccount(account, entry.snapshot))
    .sort(compareUsageHistoryEntry);

  const deduped: UsageHistoryEntry[] = [];
  const seen = new Set<string>();
  for (const entry of filtered) {
    const key = [
      snapshotRouteKey(entry.snapshot) ?? normalizeEmail(entry.snapshot.accountEmail) ?? "",
      snapshotSourceTime(entry.snapshot) ?? entry.recordedAtMs ?? parseDateTimeValue(entry.recordedAt) ?? "",
      entry.snapshot.fiveHour.usedPercent ?? "",
      entry.snapshot.sevenDay.usedPercent ?? "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }

  const latest = deduped[0]?.snapshot;

  return {
    ...account,
    liveUsage: latest,
    usageHistory: deduped.slice(0, 72),
    expiryAt:
      latest?.subscriptionActiveUntil ??
      account.liveUsage?.subscriptionActiveUntil ??
      account.expiryAt,
  };
}

function normalizeAccount(account: AccountRecord, allAccounts?: AccountRecord[]): AccountRecord {
  const baseAccount: AccountRecord = {
    ...account,
    accountLabel: stripMerchantAlias(account.accountLabel) ?? account.accountLabel,
    workspace: stripMerchantAlias(account.workspace) ?? account.workspace,
  };

  if (baseAccount.cluster !== "openai") {
    return {
      ...baseAccount,
      liveUsage: normalizeSnapshot(baseAccount.liveUsage),
      usageHistory: coerceUsageHistoryEntries(baseAccount.usageHistory)
        .map(normalizeUsageHistoryEntry)
        .sort(compareUsageHistoryEntry),
    };
  }

  const repaired = repairAccountSnapshots(
    {
      ...baseAccount,
      liveUsage: normalizeSnapshot(baseAccount.liveUsage),
      usageHistory: coerceUsageHistoryEntries(baseAccount.usageHistory).map(normalizeUsageHistoryEntry),
    },
    allAccounts ?? [baseAccount],
  );

  const latest = repaired.liveUsage;
  const weekDepleted = isWeekWindowDepleted(latest?.sevenDay);
  const fallbackResetAt = weekDepleted
    ? latest?.sevenDay?.resetsAt
    : latest?.fiveHour?.resetsAt;

  return {
    ...repaired,
    resetAt: fallbackResetAt ?? repaired.resetAt,
  };
}

function statusLabel(status: AccountStatus, locale: LocaleMode = "zh-CN") {
  const isEnglish = locale === "en";
  switch (status) {
    case "active":
      return isEnglish ? "Active" : "正在使用";
    case "ready":
      return isEnglish ? "Ready" : "待命";
    case "limited":
      return isEnglish ? "Near limit" : "接近上限";
    case "observe":
      return isEnglish ? "Watchlist" : "观察位";
    case "paused":
      return isEnglish ? "Paused" : "暂停使用";
    case "expired":
      return isEnglish ? "Expired" : "已到期";
  }
}

function compactNumber(value?: number) {
  if (typeof value !== "number") {
    return "—";
  }

  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function nowLabel() {
  return formatUiDateTime(Date.now()) ?? new Date().toLocaleString("zh-CN", { hour12: false });
}

function createActivity(kind: ActivityKind, title: string, detail: string): ActivityRecord {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: nowLabel(),
    kind,
    title,
    detail,
  };
}

function createTimelineLogEntry(
  kind: TimelineLogEntry["kind"],
  at: string,
  patch: Partial<TimelineLogEntry> = {},
): TimelineLogEntry {
  const atMs = patch.atMs ?? parseDateTimeValue(at);
  return {
    id: `timeline-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at,
    atMs,
    kind,
    ...patch,
  };
}

function formatPercent(value?: number) {
  return typeof value === "number" ? `${Math.round(value)}%` : "—";
}

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase();
}

function inferProductKey(account?: Pick<AccountRecord, "provider" | "plan" | "cluster" | "productKey">): AccountProduct {
  if (account?.productKey) {
    return account.productKey;
  }

  const provider = (account?.provider ?? "").toLowerCase();
  if (provider.includes("openai") || provider.includes("chatgpt")) {
    return "chatgpt";
  }
  if (provider.includes("claude") || provider.includes("anthropic")) {
    return "claude";
  }
  if (provider.includes("gemini") || provider.includes("google")) {
    return "gemini";
  }
  if (provider.includes("kimi") || provider.includes("moonshot")) {
    return "kimi";
  }
  if (provider.includes("qwen")) {
    return "qwen";
  }
  if (provider.includes("zhipu") || provider.includes("glm")) {
    return "glm-ocr";
  }

  return "custom";
}

function inferTierKey(account?: Pick<AccountRecord, "plan" | "tierKey" | "provider">) {
  if (account?.tierKey) {
    return account.tierKey;
  }

  const plan = (account?.plan ?? "").toLowerCase();
  const provider = inferProductKey(account as Pick<AccountRecord, "provider" | "plan" | "cluster" | "productKey">);

  switch (provider) {
    case "chatgpt":
      if (plan.includes("business") || plan.includes("team")) {
        return "business";
      }
      return plan.includes("pro") ? "pro" : "plus";
    case "claude":
      if (plan.includes("10x")) {
        return "max-10x";
      }
      if (plan.includes("5x")) {
        return "max-5x";
      }
      return "pro";
    case "gemini":
      if (plan.includes("ultra")) {
        return "ai-ultra";
      }
      if (plan.includes("plus")) {
        return "ai-plus";
      }
      return "ai-pro";
    case "kimi":
      if (plan.includes("allegro")) {
        return "allegro";
      }
      if (plan.includes("moderato")) {
        return "moderato";
      }
      return "allegretto";
    case "qwen":
      return "api";
    case "glm-ocr":
      return "quota-pack";
    case "custom":
      return "custom";
  }
}

function inferTeamMode(account?: Pick<AccountRecord, "teamMode" | "workspace" | "plan">): TeamMode {
  if (account?.teamMode) {
    return account.teamMode;
  }

  if (account?.workspace || account?.plan?.toLowerCase().includes("team")) {
    return "team";
  }

  return "none";
}

function buildPlanLabel(productKey: AccountProduct, tierKey: string, customPlanName?: string) {
  if (productKey === "chatgpt") {
    if (tierKey === "business") {
      return "ChatGPT Business";
    }
    return tierKey === "pro" ? "ChatGPT Pro" : "ChatGPT Plus";
  }

  if (productKey === "claude") {
    if (tierKey === "max-5x") {
      return "Claude Max 5x";
    }
    if (tierKey === "max-10x") {
      return "Claude Max 10x";
    }
    return "Claude Pro";
  }

  if (productKey === "gemini") {
    if (tierKey === "ai-ultra") {
      return "Google AI Ultra";
    }
    if (tierKey === "ai-plus") {
      return "Google AI Plus";
    }
    return "Google AI Pro";
  }

  if (productKey === "kimi") {
    const option = PRODUCT_CONFIG.kimi.plans.find((plan) => plan.value === tierKey);
    return option?.label.en ?? "Kimi Coding Plan";
  }

  if (productKey === "qwen") {
    return "Qwen API / Quota";
  }

  if (productKey === "glm-ocr") {
    return "GLM OCR Quota Pack";
  }

  return customPlanName?.trim() || "Custom Plan";
}

function editableProductKey(account?: AccountRecord): AccountProduct {
  const raw = inferProductKey(account);
  return raw === "qwen" || raw === "glm-ocr" ? "custom" : raw;
}

function deriveCustomProductName(account?: AccountRecord) {
  const productKey = inferProductKey(account);
  if (productKey === "qwen") {
    return "Qwen";
  }
  if (productKey === "glm-ocr") {
    return "GLM OCR";
  }
  return account?.provider ?? "";
}

function deriveProviderName(productKey: AccountProduct, customProductName?: string) {
  if (productKey === "custom") {
    return customProductName?.trim() || "Custom";
  }
  return PRODUCT_CONFIG[productKey].provider;
}

function usesWorkspaceField(productKey: AccountProduct, tierKey: string) {
  return productKey === "chatgpt" && tierKey === "business";
}

function parseDateTimeValue(value?: string | number | null) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  const trimmed = String(value).trim();
  const matched = trimmed.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/,
  );
  if (matched) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = matched;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).getTime();
  }

  const timestamp = Date.parse(trimmed);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function hasResetReached(value?: string | number, nowMs = Date.now()) {
  const timestamp = parseDateTimeValue(value);
  return typeof timestamp === "number" && timestamp <= nowMs;
}

function isWeekWindowDepleted(window?: RollingUsageWindow) {
  return window?.remainingPercent === 0;
}

function clampPercent(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function meterWidthPercent(value?: number, blocked?: boolean) {
  return blocked ? 100 : clampPercent(value);
}

function meterHue(percent?: number) {
  return Math.round((clampPercent(percent) / 100) * 140);
}

function buildMeterTone(percent?: number) {
  const safe = clampPercent(percent);
  const hue = meterHue(safe);
  const startHue = Math.max(0, hue - 18);
  const endHue = Math.min(145, hue + 8);
  const startLight = 36 + safe * 0.08;
  const midLight = 42 + safe * 0.09;
  const endLight = 50 + safe * 0.06;

  return {
    track: {
      background: `linear-gradient(90deg, hsla(${hue}, 92%, 58%, 0.2) 0%, rgba(255, 255, 255, 0.05) 100%)`,
      boxShadow: `inset 0 0 0 1px hsla(${hue}, 92%, 64%, 0.18)`,
    },
    fill: {
      background: `linear-gradient(90deg, hsl(${startHue}, 86%, ${startLight}%) 0%, hsl(${hue}, 92%, ${midLight}%) 56%, hsl(${endHue}, 96%, ${endLight}%) 100%)`,
      boxShadow: `0 0 16px hsla(${hue}, 92%, 60%, 0.28)`,
    },
  };
}

function meterTrackStyle(value?: number, blocked?: boolean) {
  return {
    background: "var(--meter-empty-bg)",
    boxShadow: "inset 0 0 0 1px var(--meter-empty-border)",
  };
}

function meterFillStyle(value?: number, blocked?: boolean) {
  if (blocked) {
    return {
      width: `${meterWidthPercent(value, blocked)}%`,
      background: "rgba(255, 255, 255, 0.7)",
      boxShadow: "none",
    };
  }

  return {
    width: `${meterWidthPercent(value, blocked)}%`,
    ...buildMeterTone(value).fill,
  };
}

function activityTimestamp(activity: ActivityRecord) {
  const fromId = Number(activity.id.split("-")[0]);
  if (!Number.isNaN(fromId) && fromId > 0) {
    return fromId;
  }

  const parsed = Date.parse(activity.at);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  return Date.now();
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function hourMinuteKey(date: Date) {
  return `${dayKey(date)}-${String(date.getHours()).padStart(2, "0")}-${String(date.getMinutes()).padStart(2, "0")}`;
}

function shortDayLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function shortMinuteLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localizedMonthTitle(date: Date, locale: LocaleMode) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function localizedWeekdayLabels(locale: LocaleMode) {
  const baseMonday = new Date(2026, 2, 16);
  return Array.from({ length: 7 }, (_, offset) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
      weekday: "short",
    }).format(new Date(baseMonday.getFullYear(), baseMonday.getMonth(), baseMonday.getDate() + offset)),
  );
}

function clampDataYear(value: number) {
  return Math.max(DATA_YEAR_MIN, Math.min(DATA_YEAR_MAX, value));
}

function monthBoundsForYear(year: number) {
  return {
    min: year === DATA_YEAR_MIN ? 3 : 1,
    max: year === DATA_YEAR_MAX ? 3 : 12,
  };
}

function clampDataMonth(year: number, value: number) {
  const bounds = monthBoundsForYear(year);
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

function selectableMonths(year: number) {
  const bounds = monthBoundsForYear(year);
  return Array.from({ length: bounds.max - bounds.min + 1 }, (_, index) => bounds.min + index);
}

function selectableYears() {
  return Array.from({ length: DATA_YEAR_MAX - DATA_YEAR_MIN + 1 }, (_, index) => DATA_YEAR_MIN + index);
}

function heatmapLevel(tokens: number) {
  if (!tokens) {
    return 0;
  }

  if (tokens >= 100_000_000) {
    return 5;
  }

  if (tokens > 50_000_000) {
    return 4;
  }

  if (tokens > 20_000_000) {
    return 3;
  }

  if (tokens > 10_000_000) {
    return 2;
  }

  return 1;
}

function formatWindowSummary(window?: RollingUsageWindow) {
  if (!window) {
    return "未同步";
  }

  return `${formatPercent(window.remainingPercent)} 剩余`;
}

function formatResetLabel(window?: RollingUsageWindow) {
  return formatUiDateTime(window?.resetsAtMs ?? window?.resetsAt) ?? "未同步";
}

function syncLabel(snapshot?: LiveUsageSnapshot) {
  return (
    formatUiDateTime(snapshot?.recordedAtMs ?? snapshot?.recordedAt) ??
    formatUiDateTime(snapshot?.sourceSyncedAtMs ?? snapshot?.sourceSyncedAt) ??
    formatUiDateTime(snapshot?.syncedAtMs ?? snapshot?.syncedAt) ??
    "尚未同步"
  );
}

function sourceSyncLabel(snapshot?: LiveUsageSnapshot) {
  return (
    formatUiDateTime(snapshot?.sourceSyncedAtMs ?? snapshot?.sourceSyncedAt) ??
    formatUiDateTime(snapshot?.syncedAtMs ?? snapshot?.syncedAt) ??
    "未同步"
  );
}

function fiveHourRecoveryLabel(account?: AccountRecord) {
  if (!account) {
    return "未同步";
  }

  if (isAccountWeekBlocked(account)) {
    return "受周窗阻断";
  }

  return formatResetLabel(displaySnapshot(account)?.fiveHour);
}

function sevenDayRecoveryLabel(account?: AccountRecord) {
  if (!account) {
    return "未同步";
  }

  return formatResetLabel(displaySnapshot(account)?.sevenDay);
}

function liveSubscriptionExpiryValue(account?: AccountRecord) {
  return latestKnownSnapshot(account)?.subscriptionActiveUntil;
}

function subscriptionExpiryLabel(account?: AccountRecord) {
  if (!account) {
    return "未记录";
  }

  const liveExpiry = liveSubscriptionExpiryValue(account);
  if (liveExpiry) {
    return formatUiDateTime(liveExpiry) ?? liveExpiry;
  }

  if (account.cluster === "openai") {
    return "待首次同步";
  }

  return formatUiDateTime(account.expiryAt) ?? account.expiryAt ?? "未记录";
}

function recoveryLabel(account?: AccountRecord) {
  if (!account) {
    return "未同步";
  }

  if (isAccountWeekBlocked(account)) {
    return sevenDayRecoveryLabel(account);
  }

  return fiveHourRecoveryLabel(account);
}

function looksLikeWorkspaceSwitch(currentSnapshot?: LiveUsageSnapshot, incomingSnapshot?: LiveUsageSnapshot) {
  if (!currentSnapshot || !incomingSnapshot) {
    return false;
  }

  if (sameLiveUsage(currentSnapshot, incomingSnapshot)) {
    return false;
  }

  const currentFive = clampPercent(currentSnapshot.fiveHour.remainingPercent);
  const currentSeven = clampPercent(currentSnapshot.sevenDay.remainingPercent);
  const nextFive = clampPercent(incomingSnapshot.fiveHour.remainingPercent);
  const nextSeven = clampPercent(incomingSnapshot.sevenDay.remainingPercent);
  const fiveDelta = nextFive - currentFive;
  const sevenDelta = nextSeven - currentSeven;
  const fiveResetChanged = currentSnapshot.fiveHour.resetsAt !== incomingSnapshot.fiveHour.resetsAt;
  const sevenResetChanged = currentSnapshot.sevenDay.resetsAt !== incomingSnapshot.sevenDay.resetsAt;
  const totalWentBackward =
    typeof currentSnapshot.totalTokens === "number" &&
    typeof incomingSnapshot.totalTokens === "number" &&
    incomingSnapshot.totalTokens < currentSnapshot.totalTokens;

  return (
    sevenDelta >= 6 ||
    (fiveDelta >= 18 && (sevenDelta >= 2 || fiveResetChanged)) ||
    (sevenResetChanged && sevenDelta >= 2) ||
    totalWentBackward
  );
}

function liveUsageHeadline(snapshot?: LiveUsageSnapshot) {
  if (!snapshot) {
    return "尚未同步当前 Codex 窗口";
  }

  return `7d 剩余 ${formatPercent(snapshot.sevenDay.remainingPercent)} · 5h 剩余 ${formatPercent(
    snapshot.fiveHour.remainingPercent,
  )}`;
}

function sameWindow(left?: RollingUsageWindow, right?: RollingUsageWindow) {
  return (
    left?.usedPercent === right?.usedPercent &&
    left?.remainingPercent === right?.remainingPercent &&
    parseDateTimeValue(left?.resetsAtMs ?? left?.resetsAt) === parseDateTimeValue(right?.resetsAtMs ?? right?.resetsAt)
  );
}

function sameLiveUsage(left?: LiveUsageSnapshot, right?: LiveUsageSnapshot) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.accountEmail === right.accountEmail &&
    normalizePlanKey(left.plan) === normalizePlanKey(right.plan) &&
    parseDateTimeValue(left.subscriptionActiveUntilMs ?? left.subscriptionActiveUntil) ===
      parseDateTimeValue(right.subscriptionActiveUntilMs ?? right.subscriptionActiveUntil) &&
    sameWindow(left.fiveHour, right.fiveHour) &&
    sameWindow(left.sevenDay, right.sevenDay) &&
    left.totalTokens === right.totalTokens &&
    left.lastTokens === right.lastTokens &&
    left.sourceLabel === right.sourceLabel
  );
}

function appendUsageHistory(
  history: UsageHistoryEntry[] | undefined,
  snapshot: LiveUsageSnapshot,
  note?: string,
) {
  const current = Array.isArray(history) ? history : [];
  const duplicate = current.find(
    (entry) =>
      snapshotSourceTime(entry.snapshot) ===
        snapshotSourceTime(snapshot) &&
      sameLiveUsage(entry.snapshot, snapshot) &&
      entry.note === note,
  );
  if (duplicate) {
    return current;
  }

  return [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      snapshot,
      recordedAt: snapshot.recordedAt ?? nowLabel(),
      recordedAtMs: snapshot.recordedAtMs ?? Date.now(),
      note,
    },
    ...current,
  ].slice(0, 24);
}

function mergeUsageHistory(account: AccountRecord, snapshot: LiveUsageSnapshot) {
  let nextHistory = Array.isArray(account.usageHistory) ? account.usageHistory : [];

  if (account.liveUsage) {
    nextHistory = appendUsageHistory(nextHistory, account.liveUsage);
  }

  return appendUsageHistory(nextHistory, snapshot);
}

function stampSnapshot(snapshot: LiveUsageSnapshot, recordedAtMs = Date.now()) {
  const normalized = normalizeSnapshot(snapshot, recordedAtMs) ?? snapshot;
  return {
    ...normalized,
    recordedAtMs,
    recordedAt: formatUiDateTime(recordedAtMs) ?? normalized.recordedAt ?? nowLabel(),
  };
}

function pickRecoverySnapshot(account: AccountRecord | undefined, incomingSnapshot?: LiveUsageSnapshot) {
  if (!account) {
    return undefined;
  }

  const normalizedIncoming = normalizeSnapshot(incomingSnapshot);
  const candidates = [
    ...(account.liveUsage ? [normalizeSnapshot(account.liveUsage)] : []),
    ...((account.usageHistory ?? []).map((entry) => normalizeSnapshot(entry.snapshot, entry.recordedAtMs ?? entry.recordedAt))),
  ].filter((item): item is LiveUsageSnapshot => Boolean(item));

  const matched = candidates
    .filter((snapshot) => snapshotBelongsToAccount(account, snapshot))
    .filter((snapshot) => !normalizedIncoming || !sameLiveUsage(snapshot, normalizedIncoming))
    .sort((left, right) => {
      const freshnessDiff = snapshotFreshnessTime(right) - snapshotFreshnessTime(left);
      if (freshnessDiff !== 0) {
        return freshnessDiff;
      }
      return (snapshotRecordedTime(right) ?? 0) - (snapshotRecordedTime(left) ?? 0);
    });

  if (matched.length > 0) {
    return matched[0];
  }

  return undefined;
}

function latestKnownSnapshot(account?: AccountRecord) {
  if (!account) {
    return undefined;
  }

  const candidates = [
    ...(account.liveUsage ? [normalizeSnapshot(account.liveUsage)] : []),
    ...((account.usageHistory ?? []).map((entry) => normalizeSnapshot(entry.snapshot, entry.recordedAtMs ?? entry.recordedAt))),
  ].filter((item): item is LiveUsageSnapshot => Boolean(item));

  const matched = candidates
    .filter((snapshot) => snapshotBelongsToAccount(account, snapshot))
    .sort((left, right) => {
      const freshnessDiff = snapshotFreshnessTime(right) - snapshotFreshnessTime(left);
      if (freshnessDiff !== 0) {
        return freshnessDiff;
      }
      return (snapshotRecordedTime(right) ?? 0) - (snapshotRecordedTime(left) ?? 0);
    });

  return matched[0];
}

function isSnapshotSourceRegression(
  previousSnapshot: LiveUsageSnapshot | undefined,
  incomingSnapshot: LiveUsageSnapshot | undefined,
  toleranceMs = 90_000,
) {
  const previousSourceTime = snapshotSourceTime(previousSnapshot);
  const incomingSourceTime = snapshotSourceTime(incomingSnapshot);

  if (typeof previousSourceTime !== "number" || typeof incomingSourceTime !== "number") {
    return false;
  }

  return incomingSourceTime + toleranceMs < previousSourceTime;
}

function resolveLiveUsageSnapshot(snapshot?: LiveUsageSnapshot, nowMs = Date.now()) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  if (!normalizedSnapshot) {
    return undefined;
  }

  const weekResetReached = hasResetReached(
    normalizedSnapshot.sevenDay.resetsAtMs ?? normalizedSnapshot.sevenDay.resetsAt,
    nowMs,
  );
  const effectiveSevenDay = weekResetReached
    ? {
        ...normalizedSnapshot.sevenDay,
        usedPercent: 0,
        remainingPercent: 100,
      }
    : normalizedSnapshot.sevenDay;
  const weekBlocked = isWeekWindowDepleted(effectiveSevenDay);
  const fiveHourResetReached = hasResetReached(
    normalizedSnapshot.fiveHour.resetsAtMs ?? normalizedSnapshot.fiveHour.resetsAt,
    nowMs,
  );
  const effectiveFiveHour =
    weekBlocked
      ? {
          ...normalizedSnapshot.fiveHour,
          usedPercent: 0,
          remainingPercent: 100,
        }
      : weekResetReached || fiveHourResetReached
        ? {
            ...normalizedSnapshot.fiveHour,
            usedPercent: 0,
            remainingPercent: 100,
          }
        : normalizedSnapshot.fiveHour;

  return {
    ...normalizedSnapshot,
    fiveHour: effectiveFiveHour,
    sevenDay: effectiveSevenDay,
  };
}

function displaySnapshot(account?: AccountRecord, nowMs = Date.now()) {
  return resolveLiveUsageSnapshot(latestKnownSnapshot(account), nowMs);
}

function subscriptionExpiryTimestamp(account?: AccountRecord) {
  if (!account) {
    return undefined;
  }

  const liveExpiry = liveSubscriptionExpiryValue(account);
  if (liveExpiry) {
    return parseDateTimeValue(liveExpiry);
  }

  if (account.cluster === "openai") {
    return undefined;
  }

  return parseDateTimeValue(account.expiryAt);
}

function snapshotExpiryValue(snapshot?: LiveUsageSnapshot) {
  return snapshot?.subscriptionActiveUntil;
}

function expiryMatchesAccount(account: AccountRecord, snapshot?: LiveUsageSnapshot) {
  const snapshotExpiry = snapshotExpiryValue(snapshot);
  if (!snapshotExpiry) {
    return false;
  }

  const accountExpiry = liveSubscriptionExpiryValue(account) ?? account.expiryAt;
  if (!accountExpiry) {
    return false;
  }

  return parseDateTimeValue(accountExpiry) === parseDateTimeValue(snapshotExpiry);
}

function buildSnapshotRecord(
  account: AccountRecord,
  snapshot: LiveUsageSnapshot,
  captureReason: SnapshotRecord["captureReason"] = "sync",
): SnapshotRecord {
  const stampedSnapshot = stampSnapshot(snapshot);
  const sourceSyncedAtMs = snapshotSourceTime(stampedSnapshot);
  const recordedAtMs = stampedSnapshot.recordedAtMs ?? Date.now();
  return {
    id: `${account.id}-${captureReason ?? "sync"}-${Date.now()}`,
    accountId: account.id,
    accountLabel: account.accountLabel,
    email: account.email,
    workspace: account.workspace,
    plan: account.plan,
    provider: account.provider,
    captureReason,
    sourceSyncedAt:
      formatUiDateTime(sourceSyncedAtMs) ??
      stampedSnapshot.sourceSyncedAt ??
      stampedSnapshot.syncedAt,
    sourceSyncedAtMs,
    syncedAt:
      formatUiDateTime(sourceSyncedAtMs) ??
      stampedSnapshot.sourceSyncedAt ??
      stampedSnapshot.syncedAt,
    syncedAtMs: sourceSyncedAtMs,
    recordedAt: formatUiDateTime(recordedAtMs) ?? stampedSnapshot.recordedAt ?? nowLabel(),
    recordedAtMs,
    subscriptionActiveUntil: stampedSnapshot.subscriptionActiveUntil,
    subscriptionActiveUntilMs: stampedSnapshot.subscriptionActiveUntilMs,
    fiveHour: stampedSnapshot.fiveHour,
    sevenDay: stampedSnapshot.sevenDay,
    totalTokens: stampedSnapshot.totalTokens,
    lastTokens: stampedSnapshot.lastTokens,
  };
}

function snapshotRecordPersistenceKey(record?: SnapshotRecord) {
  if (!record?.accountId) {
    return undefined;
  }

  return [
    record.accountId,
    record.captureReason ?? "sync",
    record.sourceSyncedAtMs ?? parseDateTimeValue(record.sourceSyncedAt) ?? parseDateTimeValue(record.syncedAt),
    record.subscriptionActiveUntilMs ?? parseDateTimeValue(record.subscriptionActiveUntil),
    clampPercent(record.fiveHour.remainingPercent),
    clampPercent(record.sevenDay.remainingPercent),
    typeof record.totalTokens === "number" ? record.totalTokens : "na",
    typeof record.lastTokens === "number" ? record.lastTokens : "na",
  ].join("|");
}

function snapshotMatchesAccount(account: AccountRecord | undefined, snapshot: SnapshotRecord) {
  return snapshotBelongsToAccount(account, {
    provider: snapshot.provider,
    accountEmail: snapshot.email,
    plan: snapshot.plan,
    subscriptionActiveUntil: snapshot.subscriptionActiveUntil,
    subscriptionActiveUntilMs: snapshot.subscriptionActiveUntilMs,
    fiveHour: snapshot.fiveHour,
    sevenDay: snapshot.sevenDay,
    totalTokens: snapshot.totalTokens,
    lastTokens: snapshot.lastTokens,
    sourceLabel: "snapshot-record",
    sourceSyncedAt: snapshot.sourceSyncedAt,
    sourceSyncedAtMs: snapshot.sourceSyncedAtMs,
    syncedAt: snapshot.syncedAt,
    syncedAtMs: snapshot.syncedAtMs,
    recordedAt: snapshot.recordedAt,
    recordedAtMs: snapshot.recordedAtMs,
  });
}

function isAccountExpired(account?: AccountRecord, nowMs = Date.now()) {
  if (!account) {
    return false;
  }

  if (account.status === "expired") {
    return true;
  }

  const expiryTimestamp = subscriptionExpiryTimestamp(account);
  return typeof expiryTimestamp === "number" && expiryTimestamp <= nowMs;
}

function isAccountWeekBlocked(account?: AccountRecord, nowMs = Date.now()) {
  return account?.cluster === "openai" && isWeekWindowDepleted(displaySnapshot(account, nowMs)?.sevenDay);
}

function displayStatus(account: AccountRecord, nowMs = Date.now()): AccountStatus {
  if (account.cluster !== "openai") {
    return account.status;
  }

  if (isAccountExpired(account, nowMs)) {
    return "expired";
  }

  const snapshot = displaySnapshot(account, nowMs);
  if (!snapshot) {
    return account.status;
  }

  if (isWeekWindowDepleted(snapshot.sevenDay)) {
    return "paused";
  }

  if (typeof snapshot.fiveHour.remainingPercent === "number" && snapshot.fiveHour.remainingPercent <= 8) {
    return "limited";
  }

  return account.isActive ? "active" : "ready";
}

function displayStatusDetail(account: AccountRecord, nowMs = Date.now()) {
  const snapshot = displaySnapshot(account, nowMs);
  if (!snapshot) {
    return account.statusDetail;
  }

  if (isWeekWindowDepleted(snapshot.sevenDay)) {
    return `Codex 本地窗口显示：本周窗口已用尽，暂停使用，等待 ${formatResetLabel(snapshot.sevenDay)} 恢复。`;
  }

  return `Codex 本地窗口显示：5 小时窗剩余 ${formatPercent(
    snapshot.fiveHour.remainingPercent,
  )}，7 天窗剩余 ${formatPercent(snapshot.sevenDay.remainingPercent)}。`;
}

function buildSeatCardStyle(account: AccountRecord): CSSProperties {
  const weekRemaining = displaySnapshot(account)?.sevenDay.remainingPercent;
  const blocked = isAccountWeekBlocked(account);
  const hue = blocked ? 0 : meterHue(weekRemaining);

  return {
    ["--seat-hue" as string]: String(hue),
    ["--seat-tint-alpha" as string]: blocked ? "0.24" : account.isActive ? "0.22" : "0.16",
    ["--seat-border-alpha" as string]: blocked ? "0.3" : account.isActive ? "0.34" : "0.18",
  };
}

function supportsWorkspaceLabel(account?: AccountRecord) {
  if (!account) {
    return false;
  }

  const productKey = inferProductKey(account);
  return productKey === "chatgpt" && inferTeamMode(account) === "team";
}

function workspaceNameLabel(account?: AccountRecord) {
  if (!account || !supportsWorkspaceLabel(account)) {
    return "";
  }

  return stripMerchantAlias(account.workspace) || "";
}

function requiresWorkspaceSignatureRouting(account?: AccountRecord) {
  if (!account || account.cluster !== "openai") {
    return false;
  }

  return inferTeamMode(account) === "team" && Boolean(stripMerchantAlias(account.workspace));
}

function compareNullableTime(left?: string, right?: string) {
  const leftValue = parseDateTimeValue(left);
  const rightValue = parseDateTimeValue(right);

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (typeof leftValue === "number") {
    return -1;
  }

  if (typeof rightValue === "number") {
    return 1;
  }

  return 0;
}

function queueRank(account: AccountRecord, nowMs = Date.now()) {
  if (isAccountExpired(account, nowMs)) {
    return 5;
  }

  if (account.isActive) {
    return 0;
  }

  const snapshot = displaySnapshot(account, nowMs);
  if (!snapshot) {
    return 4;
  }

  const fiveRemaining = clampPercent(snapshot.fiveHour.remainingPercent);
  const sevenRemaining = clampPercent(snapshot.sevenDay.remainingPercent);

  if (sevenRemaining === 0) {
    return 3;
  }

  if (fiveRemaining === 0) {
    return 2;
  }

  return 1;
}

function sortOverviewQueue(records: AccountRecord[], nowMs = Date.now()) {
  return [...records].sort((left, right) => {
    const leftRank = queueRank(left, nowMs);
    const rightRank = queueRank(right, nowMs);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftSnapshot = displaySnapshot(left, nowMs);
    const rightSnapshot = displaySnapshot(right, nowMs);
    const leftFive = clampPercent(leftSnapshot?.fiveHour.remainingPercent);
    const rightFive = clampPercent(rightSnapshot?.fiveHour.remainingPercent);
    const leftSeven = clampPercent(leftSnapshot?.sevenDay.remainingPercent);
    const rightSeven = clampPercent(rightSnapshot?.sevenDay.remainingPercent);

    switch (leftRank) {
      case 0:
        return left.priority - right.priority;
      case 1:
        if (rightFive !== leftFive) {
          return rightFive - leftFive;
        }
        if (rightSeven !== leftSeven) {
          return rightSeven - leftSeven;
        }
        return left.priority - right.priority;
      case 2: {
        const recoveryCompare = compareNullableTime(leftSnapshot?.fiveHour.resetsAt, rightSnapshot?.fiveHour.resetsAt);
        if (recoveryCompare !== 0) {
          return recoveryCompare;
        }
        if (rightSeven !== leftSeven) {
          return rightSeven - leftSeven;
        }
        return left.priority - right.priority;
      }
      case 3: {
        const recoveryCompare = compareNullableTime(leftSnapshot?.sevenDay.resetsAt, rightSnapshot?.sevenDay.resetsAt);
        if (recoveryCompare !== 0) {
          return recoveryCompare;
        }
        return left.priority - right.priority;
      }
      case 5: {
        const leftExpiry = subscriptionExpiryTimestamp(left);
        const rightExpiry = subscriptionExpiryTimestamp(right);
        if (typeof leftExpiry === "number" && typeof rightExpiry === "number" && leftExpiry !== rightExpiry) {
          return rightExpiry - leftExpiry;
        }
        if (typeof leftExpiry === "number") {
          return -1;
        }
        if (typeof rightExpiry === "number") {
          return 1;
        }
        return left.priority - right.priority;
      }
      default:
        return left.priority - right.priority;
    }
  });
}

function sanitizeSeededAccount(seedAccount: AccountRecord, existing: AccountRecord): AccountRecord {
  const merged: AccountRecord = {
    ...seedAccount,
    ...existing,
    notes: Array.isArray(existing.notes) ? existing.notes : seedAccount.notes,
    usageHistory: Array.isArray(existing.usageHistory) ? existing.usageHistory : seedAccount.usageHistory,
  };

  if (seedAccount.cluster !== "openai") {
    return normalizeAccount(merged);
  }

  const seedEmail = normalizeEmail(seedAccount.email);
  const snapshotEmail = normalizeEmail(merged.liveUsage?.accountEmail);
  const contaminatedByOtherEmail = Boolean(seedEmail && snapshotEmail && snapshotEmail !== seedEmail);
  const fallbackStatus =
    seedAccount.status === "active" && !merged.isActive ? "ready" : seedAccount.status;

  return normalizeAccount({
    ...merged,
    provider: seedAccount.provider,
    accountLabel: seedAccount.accountLabel,
    email: seedAccount.email,
    plan: seedAccount.plan,
    cluster: seedAccount.cluster,
    priority: seedAccount.priority,
    workspace: seedAccount.workspace,
    costLabel: seedAccount.costLabel,
    expiryAt: merged.liveUsage?.subscriptionActiveUntil ?? merged.expiryAt ?? seedAccount.expiryAt,
    liveUsage: contaminatedByOtherEmail ? undefined : merged.liveUsage,
    tokensUsed: contaminatedByOtherEmail ? seedAccount.tokensUsed : merged.tokensUsed,
    usagePercent: contaminatedByOtherEmail ? seedAccount.usagePercent : merged.usagePercent,
    trackingMode: contaminatedByOtherEmail ? seedAccount.trackingMode : merged.trackingMode,
    resetAt: contaminatedByOtherEmail ? seedAccount.resetAt : merged.resetAt,
    sourceLabel: contaminatedByOtherEmail ? seedAccount.sourceLabel : merged.sourceLabel,
    usageLabel: contaminatedByOtherEmail ? seedAccount.usageLabel : merged.usageLabel,
    statusDetail: contaminatedByOtherEmail ? seedAccount.statusDetail : merged.statusDetail,
    status: contaminatedByOtherEmail ? fallbackStatus : merged.status,
  });
}

function applyLiveUsage(account: AccountRecord, snapshot: LiveUsageSnapshot): AccountRecord {
  const stampedSnapshot = stampSnapshot(snapshot);
  const weekDepleted = isWeekWindowDepleted(stampedSnapshot.sevenDay);
  const fiveHourRemaining = stampedSnapshot.fiveHour.remainingPercent;
  const nextStatus =
    weekDepleted
      ? "paused"
      : typeof fiveHourRemaining === "number" && fiveHourRemaining <= 8
      ? "limited"
      : account.isActive
        ? "active"
        : account.status === "limited" || account.status === "paused"
          ? "ready"
          : account.status;
  const nextResetAt =
    weekDepleted
      ? stampedSnapshot.sevenDay.resetsAt ?? account.resetAt
      : stampedSnapshot.fiveHour.resetsAt ?? account.resetAt;
  const nextUsageLabel = weekDepleted
    ? `7d 剩余 ${formatPercent(stampedSnapshot.sevenDay.remainingPercent)} · 5h 剩余 100%`
    : `7d 剩余 ${formatPercent(stampedSnapshot.sevenDay.remainingPercent)} · 5h 剩余 ${formatPercent(
        stampedSnapshot.fiveHour.remainingPercent,
      )}`;
  const nextStatusDetail = weekDepleted
    ? `Codex 本地窗口已同步：本周窗口已用尽，暂停使用，等待 ${formatResetLabel(stampedSnapshot.sevenDay)} 恢复。`
    : `Codex 本地窗口已同步：5 小时窗剩余 ${formatPercent(
        stampedSnapshot.fiveHour.remainingPercent,
      )}，7 天窗剩余 ${formatPercent(stampedSnapshot.sevenDay.remainingPercent)}。`;

  return {
    ...account,
    email: account.email || stampedSnapshot.accountEmail || account.email,
    plan: account.plan || stampedSnapshot.plan || account.plan,
    status: nextStatus,
    trackingMode: "window",
    usagePercent: weekDepleted ? 100 : stampedSnapshot.fiveHour.usedPercent ?? account.usagePercent,
    resetAt: nextResetAt,
    expiryAt: stampedSnapshot.subscriptionActiveUntil ?? account.expiryAt,
    sourceLabel: stampedSnapshot.sourceLabel,
    usageLabel: nextUsageLabel,
    statusDetail: nextStatusDetail,
    tokensUsed: undefined,
    liveUsage: stampedSnapshot,
    usageHistory: mergeUsageHistory(account, stampedSnapshot),
  };
}

function resetAccountToSeed(account: AccountRecord): AccountRecord {
  const seedAccount = cloneSeed().accounts.find((item) => item.id === account.id);
  const fallbackStatus = account.status === "active" ? "ready" : account.status;

  return normalizeAccount({
    ...account,
    isActive: false,
    status: seedAccount ? (seedAccount.status === "active" ? "ready" : seedAccount.status) : fallbackStatus,
    usageLabel:
      account.usageHistory?.[0]?.snapshot
        ? `最近记录：7d ${formatPercent(account.usageHistory[0].snapshot.sevenDay.remainingPercent)} · 5h ${formatPercent(account.usageHistory[0].snapshot.fiveHour.remainingPercent)}`
        : seedAccount?.usageLabel ?? "等待重新同步",
    usagePercent: seedAccount?.usagePercent ?? 0,
    trackingMode: seedAccount?.trackingMode ?? "estimate",
    resetAt: seedAccount?.resetAt,
    sourceLabel: seedAccount?.sourceLabel ?? account.sourceLabel,
    statusDetail:
      account.usageHistory?.[0]?.snapshot
        ? `当前卡片已清回待确认状态；最近一次本地记录保留在 ${syncLabel(account.usageHistory[0].snapshot)}。`
        : seedAccount?.statusDetail ?? "当前卡片已清回待确认状态，等待重新同步。",
    tokensUsed: seedAccount?.tokensUsed,
    liveUsage: seedAccount?.liveUsage,
    usageHistory: account.usageHistory,
  });
}

function ensureTimelineLog(current: DashboardState): TimelineLogEntry[] {
  const existing: TimelineLogEntry[] = Array.isArray(current.timelineLog)
    ? [...current.timelineLog].map((entry) => {
        const legacyKind = entry.kind as TimelineLogEntry["kind"] | "switch";
        return {
          ...entry,
          kind: legacyKind === "switch" ? "login" : legacyKind,
          accountId: entry.accountId ?? entry.targetAccountId,
          atMs: entry.atMs ?? parseDateTimeValue(entry.at),
        };
      })
    : [];
  const hasEntry = (kind: TimelineLogEntry["kind"], accountId: string, at?: string | number) => {
    const atMs = parseDateTimeValue(at);
    return existing.some((entry) => {
      if (entry.kind !== kind || entry.accountId !== accountId) {
        return false;
      }
      if (typeof atMs !== "number") {
        return true;
      }
      return (entry.atMs ?? parseDateTimeValue(entry.at)) === atMs;
    });
  };
  const pushIfMissing = (
    kind: TimelineLogEntry["kind"],
    at: string | number | undefined,
    patch: Partial<TimelineLogEntry>,
  ) => {
    if (!patch.accountId || !at) {
      return;
    }
    if (hasEntry(kind, patch.accountId, at)) {
      return;
    }
    const atLabel = typeof at === "string" ? at : formatUiDateTime(at) ?? nowLabel();
    existing.push(
      createTimelineLogEntry(kind, atLabel, {
        ...patch,
        atMs: parseDateTimeValue(at),
      }),
    );
  };
  const fixedHistoricalBackfillAt =
    parseDateTimeValue("2026/03/19 18:00:00") ?? parseDateTimeValue("2026-03-19T18:00:00+08:00") ?? Date.now();
  const fixedBackfillTargets = new Set([
    "openai-old-fallback",
    "openai-primary-b",
    "openai-primary-c",
  ]);
  const blockedCycleByAccount = new Map<
    string,
    {
      currentResetMs?: number;
      canonicalDepletedAtMs?: number;
    }
  >();

  current.accounts.forEach((account) => {
    const snapshot = latestKnownSnapshot(account);
    if (!snapshot || snapshot.sevenDay.remainingPercent !== 0) {
      return;
    }

    const recordedAt =
      snapshot.recordedAtMs ??
      parseDateTimeValue(snapshot.recordedAt) ??
      snapshot.syncedAtMs ??
      parseDateTimeValue(snapshot.syncedAt);

    blockedCycleByAccount.set(account.id, {
      currentResetMs: parseDateTimeValue(snapshot.sevenDay.resetsAtMs ?? snapshot.sevenDay.resetsAt),
      canonicalDepletedAtMs: fixedBackfillTargets.has(account.id) ? fixedHistoricalBackfillAt : recordedAt,
    });
  });

  const dedupedExisting = existing.filter((entry, _, source) => {
    if (entry.kind !== "depleted7d" || !entry.accountId) {
      return true;
    }

    const cycle = blockedCycleByAccount.get(entry.accountId);
    if (!cycle?.currentResetMs || !cycle.canonicalDepletedAtMs) {
      return true;
    }

    const peerEntries = source.filter((candidate) => {
      if (candidate.kind !== "depleted7d" || candidate.accountId !== entry.accountId) {
        return false;
      }
      const candidateAtMs = candidate.atMs ?? parseDateTimeValue(candidate.at);
      return typeof candidateAtMs === "number" && candidateAtMs <= cycle.currentResetMs!;
    });

    if (peerEntries.length <= 1) {
      return true;
    }

    const bestEntry = [...peerEntries].sort((left, right) => {
      const leftAt = left.atMs ?? parseDateTimeValue(left.at) ?? 0;
      const rightAt = right.atMs ?? parseDateTimeValue(right.at) ?? 0;
      const leftDiff = Math.abs(leftAt - cycle.canonicalDepletedAtMs!);
      const rightDiff = Math.abs(rightAt - cycle.canonicalDepletedAtMs!);
      if (leftDiff !== rightDiff) {
        return leftDiff - rightDiff;
      }
      return leftAt - rightAt;
    })[0];

    return bestEntry?.id === entry.id;
  });
  existing.length = 0;
  existing.push(...dedupedExisting);

  current.accounts.forEach((account) => {
    const snapshot = latestKnownSnapshot(account);
    if (!snapshot) {
      return;
    }

    const recordedAt =
      snapshot.recordedAtMs ??
      parseDateTimeValue(snapshot.recordedAt) ??
      snapshot.syncedAtMs ??
      parseDateTimeValue(snapshot.syncedAt);
    const isWeekBlocked = snapshot.sevenDay.remainingPercent === 0;
    const isFiveBlocked = snapshot.fiveHour.remainingPercent === 0 && !isWeekBlocked;
    const depletionBackfillTime =
      fixedBackfillTargets.has(account.id) && isWeekBlocked ? fixedHistoricalBackfillAt : recordedAt;

    if (isWeekBlocked) {
      pushIfMissing("depleted7d", depletionBackfillTime, {
        accountId: account.id,
        note: fixedBackfillTargets.has(account.id) ? "历史周窗用尽事件补录" : "周窗已用尽，进入等待恢复。",
      });
      pushIfMissing("reset7d", snapshot.sevenDay.resetsAtMs ?? snapshot.sevenDay.resetsAt, {
        accountId: account.id,
        note: "周窗恢复时间",
      });
    }

    if (isFiveBlocked) {
      pushIfMissing("depleted5h", recordedAt, {
        accountId: account.id,
        note: "5 小时窗口已用尽，进入等待恢复。",
      });
      pushIfMissing("reset5h", snapshot.fiveHour.resetsAtMs ?? snapshot.fiveHour.resetsAt, {
        accountId: account.id,
        note: "5 小时窗口恢复时间",
      });
    }

    const expiryTimestamp = subscriptionExpiryTimestamp(account);
    if (typeof expiryTimestamp === "number") {
      pushIfMissing("expired", expiryTimestamp, {
        accountId: account.id,
        note: isAccountExpired(account, Date.now()) ? "订阅已到期" : "订阅到期时间",
      });
    }
  });

  return existing.sort((left, right) => {
    const leftTime = parseDateTimeValue(left.at) ?? 0;
    const rightTime = parseDateTimeValue(right.at) ?? 0;
    return leftTime - rightTime;
  });
}

function ensureCompleteState(state: DashboardState): DashboardState {
  const seed = cloneSeed();
  const migrated = migrateLegacyState(state);
  const mergedAccounts = seed.accounts.map((seedAccount) => {
    const existing = migrated.accounts.find((account) => account.id === seedAccount.id);
    if (!existing) {
      return normalizeAccount(seedAccount);
    }

    return sanitizeSeededAccount(seedAccount, existing);
  });
  const customAccounts = migrated.accounts
    .filter((account) => !seed.accounts.some((seedAccount) => seedAccount.id === account.id))
    .map((account) => normalizeAccount(account));
  const allAccounts = [...mergedAccounts, ...customAccounts];
  const normalizedAccounts = allAccounts.map((account) => normalizeAccount(account, allAccounts));

  return {
    ...seed,
    ...migrated,
    profile: {
      ...seed.profile,
      ...migrated.profile,
      title:
        migrated.profile?.title && migrated.profile.title !== "Token Chowhound"
          ? migrated.profile.title
          : seed.profile.title,
      strategyNotes: Array.isArray(migrated.profile?.strategyNotes)
        ? migrated.profile.strategyNotes
        : seed.profile.strategyNotes,
    },
    settings: {
      ...seed.settings,
      ...migrated.settings,
      themePreset: sanitizeThemePreset(migrated.settings?.themePreset),
    },
    accounts: normalizedAccounts,
    activityLog: Array.isArray(migrated.activityLog) ? migrated.activityLog : seed.activityLog,
    timelineLog: ensureTimelineLog({
      ...seed,
      ...migrated,
      accounts: normalizedAccounts,
      activityLog: Array.isArray(migrated.activityLog) ? migrated.activityLog : seed.activityLog,
      timelineLog: Array.isArray(migrated.timelineLog) ? migrated.timelineLog : seed.timelineLog,
    }),
  };
}

function App() {
  const isSettingsWindow = typeof window !== "undefined" && window.location.hash === "#settings";
  const [state, setState] = useState<DashboardState>(() => ensureCompleteState(fallbackLoadState()));
  const [clockNow, setClockNow] = useState<number>(() => Date.now());
  const [selectedId, setSelectedId] = useState<string>(() => {
    const initial = ensureCompleteState(fallbackLoadState());
    return initial.accounts.find((item) => item.isActive)?.id ?? initial.accounts[0]?.id ?? "";
  });
  const [view, setView] = useState<ViewId>(isSettingsWindow ? "settings" : "overview");
  const [savedAt, setSavedAt] = useState<string>("尚未写入");
  const [storagePath, setStoragePath] = useState<string>("本地浏览器存储");
  const [dataPaths, setDataPaths] = useState<DataPaths | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [snapshotIndexCache, setSnapshotIndexCache] = useState<SnapshotIndexCache | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [syncBusy, setSyncBusy] = useState<boolean>(false);
  const [selfCheckBusy, setSelfCheckBusy] = useState<boolean>(false);
  const [selfCheckReport, setSelfCheckReport] = useState<SelfCheckReport | null>(null);
  const [windowState, setWindowState] = useState<DesktopWindowState>({
    isMaximized: false,
    isVisible: true,
  });
  const [pendingSyncChoice, setPendingSyncChoice] = useState<PendingSyncChoice | null>(null);
  const [pendingSyncTargetId, setPendingSyncTargetId] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<AccountEditorDraft>({
    productKey: "chatgpt",
    tierKey: "plus",
    teamMode: "none",
    customProductName: "",
    customPlanName: "",
    observe: false,
    accountLabel: "",
    email: "",
    workspace: "",
    expiryAt: "",
    costLabel: "",
    notesText: "",
  });
  const [heatmapYearCursor, setHeatmapYearCursor] = useState<number>(() => clampDataYear(new Date().getFullYear()));
  const [heatmapMonthCursor, setHeatmapMonthCursor] = useState<number>(() =>
    clampDataMonth(clampDataYear(new Date().getFullYear()), new Date().getMonth() + 1),
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<DashboardState>(state);
  const snapshotsRef = useRef<SnapshotRecord[]>(snapshots);
  const pendingSyncChoiceRef = useRef<PendingSyncChoice | null>(null);
  const skipDesktopSaveRef = useRef<boolean>(false);
  const persistTimerRef = useRef<number | null>(null);
  const signaturePromptCooldownRef = useRef<Map<string, number>>(
    new Map(Object.entries(loadSignaturePromptCooldowns()).map(([key, value]) => [key, Number(value)])),
  );
  const resizeDragRef = useRef<ResizeDragState | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const resizePendingBoundsRef = useRef<DesktopWindowBounds | null>(null);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const [desktopState, listedSnapshots, cachedSnapshotIndex, nextPath, nextDataPaths] = await Promise.all([
        window.desktopApi?.loadState(),
        window.desktopApi?.listSnapshots?.(),
        window.desktopApi?.loadSnapshotIndexCache?.(),
        window.desktopApi?.getStoragePath(),
        window.desktopApi?.getDataPaths?.(),
      ]);
      const nextState = ensureCompleteState(desktopState ?? fallbackLoadState());
      const nextSnapshots = listedSnapshots?.map(normalizeSnapshotRecord) ?? [];
      const hydratedState = mergeStateWithSnapshotRecords(nextState, nextSnapshots);
      const nextSelected =
        hydratedState.accounts.find((item) => item.isActive)?.id ?? hydratedState.accounts[0]?.id ?? "";

      if (!active) {
        return;
      }

      setState(hydratedState);
      setSelectedId(nextSelected);
      setSnapshotIndexCache(cachedSnapshotIndex ?? null);
      setHydrated(true);

      if (active && nextPath) {
        setStoragePath(nextPath);
      }

      if (active && nextDataPaths) {
        setDataPaths(nextDataPaths);
      }

      if (active && nextSnapshots) {
        setSnapshots(nextSnapshots);
      }
    }

    hydrate().catch(() => {
      if (active) {
        setHydrated(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSavedAt(nowLabel());

      if (skipDesktopSaveRef.current) {
        skipDesktopSaveRef.current = false;
        persistTimerRef.current = null;
        return;
      }

      window.desktopApi?.saveState(state).catch(() => {
        // Keep the UI responsive even if file persistence fails.
      });
      persistTimerRef.current = null;
    }, 240);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [hydrated, state]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    pendingSyncChoiceRef.current = pendingSyncChoice;
  }, [pendingSyncChoice]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setClockNow(Date.now());
      }
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function flushResizeBounds() {
      resizeRafRef.current = null;
      const nextBounds = resizePendingBoundsRef.current;
      resizePendingBoundsRef.current = null;
      if (nextBounds) {
        void window.desktopApi?.setWindowBounds?.(nextBounds);
      }
    }

    function computeResizedBounds(
      dragState: ResizeDragState,
      screenX: number,
      screenY: number,
    ): DesktopWindowBounds {
      const deltaX = screenX - dragState.startScreenX;
      const deltaY = screenY - dragState.startScreenY;
      let nextX = dragState.startBounds.x;
      let nextY = dragState.startBounds.y;
      let nextWidth = dragState.startBounds.width;
      let nextHeight = dragState.startBounds.height;

      if (dragState.direction.includes("e")) {
        nextWidth = Math.max(MAIN_WINDOW_MIN_WIDTH, dragState.startBounds.width + deltaX);
      }
      if (dragState.direction.includes("s")) {
        nextHeight = Math.max(MAIN_WINDOW_MIN_HEIGHT, dragState.startBounds.height + deltaY);
      }
      if (dragState.direction.includes("w")) {
        const width = Math.max(MAIN_WINDOW_MIN_WIDTH, dragState.startBounds.width - deltaX);
        nextX = dragState.startBounds.x + (dragState.startBounds.width - width);
        nextWidth = width;
      }
      if (dragState.direction.includes("n")) {
        const height = Math.max(MAIN_WINDOW_MIN_HEIGHT, dragState.startBounds.height - deltaY);
        nextY = dragState.startBounds.y + (dragState.startBounds.height - height);
        nextHeight = height;
      }

      return {
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
      };
    }

    function handlePointerMove(event: PointerEvent) {
      const dragState = resizeDragRef.current;
      if (!dragState || isSettingsWindow || windowState.isMaximized) {
        return;
      }
      resizePendingBoundsRef.current = computeResizedBounds(dragState, event.screenX, event.screenY);
      if (!resizeRafRef.current) {
        resizeRafRef.current = window.requestAnimationFrame(flushResizeBounds);
      }
    }

    function stopResizeDrag() {
      resizeDragRef.current = null;
      resizePendingBoundsRef.current = null;
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizeDrag);
    window.addEventListener("pointercancel", stopResizeDrag);
    window.addEventListener("blur", stopResizeDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizeDrag);
      window.removeEventListener("pointercancel", stopResizeDrag);
      window.removeEventListener("blur", stopResizeDrag);
    };
  }, [isSettingsWindow, windowState.isMaximized]);

  useEffect(() => {
    setHeatmapMonthCursor((current) => clampDataMonth(heatmapYearCursor, current));
  }, [heatmapYearCursor]);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;

    async function bindWindowState() {
      const initialState = await window.desktopApi?.getWindowState?.();
      if (active && initialState) {
        setWindowState(initialState);
      }

      dispose = window.desktopApi?.onWindowStateChange?.((nextState) => {
        if (active) {
          setWindowState(nextState);
        }
      });
    }

    bindWindowState().catch(() => {
      // Window state is optional in browser-only mode.
    });

    return () => {
      active = false;
      dispose?.();
    };
  }, []);

  useEffect(() => {
    const dispose = window.desktopApi?.onStateUpdated?.((nextIncomingState) => {
      const nextState = mergeStateWithSnapshotRecords(ensureCompleteState(nextIncomingState), snapshots);
      skipDesktopSaveRef.current = true;
      setState(nextState);
      setSelectedId((currentSelectedId) => {
        if (nextState.accounts.some((account) => account.id === currentSelectedId)) {
          return currentSelectedId;
        }
        return nextState.accounts.find((account) => account.isActive)?.id ?? nextState.accounts[0]?.id ?? "";
      });
      setSavedAt(nowLabel());
    });

    return () => {
      dispose?.();
    };
  }, [snapshots]);

  useEffect(() => {
    const root = document.documentElement;
    const themeMode = state.settings.themeMode;
    const themePreset = state.settings.themePreset;
    const effectMode = state.settings.visualEffectMode;
    const performanceMode = state.settings.performanceMode;

    if (themeMode === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = themeMode;
    }

    root.dataset.preset = themePreset;
    root.dataset.effect = effectMode;
    root.dataset.performance = performanceMode ? "lite" : "normal";
  }, [
    state.settings.performanceMode,
    state.settings.themeMode,
    state.settings.themePreset,
    state.settings.visualEffectMode,
  ]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.desktopApi?.pruneSnapshots?.(state.settings.snapshotRetentionDays).then(() => {
      void refreshSnapshots();
    }).catch(() => {
      // ignore background prune failures
    });
  }, [hydrated, state.settings.snapshotRetentionDays]);

  function pushActivity(
    current: DashboardState,
    kind: ActivityKind,
    title: string,
    detail: string,
  ): DashboardState {
    return {
      ...current,
      activityLog: [...current.activityLog, createActivity(kind, title, detail)].slice(-120),
    };
  }

  function pushTimelineLog(current: DashboardState, entry: TimelineLogEntry): DashboardState {
    const timelineLog = [...(current.timelineLog ?? []), entry].slice(-800);
    return {
      ...current,
      timelineLog,
    };
  }

  function hasTimelineLogEntry(
    current: DashboardState,
    predicate: (entry: TimelineLogEntry) => boolean,
  ) {
    return (current.timelineLog ?? []).some(predicate);
  }

  function shouldThrottleSignaturePrompt(snapshot: LiveUsageSnapshot) {
    const key = signaturePromptKey(snapshot);
    const now = Date.now();
    const lastPromptAt = signaturePromptCooldownRef.current.get(key) ?? 0;
    if (lastPromptAt && now - lastPromptAt < 10 * 60 * 1000) {
      return true;
    }
    signaturePromptCooldownRef.current.set(key, now);
    persistSignaturePromptCooldowns(signaturePromptCooldownRef.current);
    return false;
  }

  function openPendingSyncSelector(prompt: PendingSyncChoice) {
    const fallbackId =
      (prompt.sourceAccountId && prompt.matchedIds.includes(prompt.sourceAccountId) ? prompt.sourceAccountId : undefined) ??
      prompt.matchedIds[0] ??
      "";
    setPendingSyncChoice(prompt);
    setPendingSyncTargetId(fallbackId);
  }

  function buildSnapshotCommit(
    current: DashboardState,
    snapshot: LiveUsageSnapshot,
    targetId: string,
    sourceAccountId?: string,
    sourceBackup?: AccountRecord,
  ) {
    const activeId = current.accounts.find((account) => account.isActive)?.id;
    const previousActive = activeId ? current.accounts.find((account) => account.id === activeId) : undefined;
    const currentTarget = current.accounts.find((account) => account.id === targetId);
    if (!currentTarget) {
      return null;
    }

    const nextTarget = applyLiveUsage(currentTarget, snapshot);
    const shouldSwitchActive = activeId !== targetId;
    const updated: DashboardState = {
      ...current,
      accounts: current.accounts.map((account) => {
        if (account.id === targetId) {
          return normalizeAccount(
            {
              ...nextTarget,
              isActive: true,
              status:
                nextTarget.status === "expired" || nextTarget.status === "paused" ? nextTarget.status : "active",
            },
            current.accounts,
          );
        }

        if (sourceAccountId && sourceAccountId !== targetId && account.id === sourceAccountId) {
          const recoverySnapshot = pickRecoverySnapshot(sourceBackup, snapshot);

            if (recoverySnapshot && sourceBackup) {
              const restored = applyLiveUsage(
                {
                  ...sourceBackup,
                isActive: false,
                status: sourceBackup.status === "active" ? "ready" : sourceBackup.status,
              },
                recoverySnapshot,
              );
              return normalizeAccount(
                {
                  ...restored,
                  isActive: false,
                  status: restored.status === "active" ? "ready" : restored.status,
                },
                current.accounts,
              );
            }

          return resetAccountToSeed(account);
        }

        if (shouldSwitchActive && account.id === activeId) {
          return {
            ...account,
            isActive: false,
            status: account.status === "active" ? "ready" : account.status,
          };
        }

        return account;
      }),
    };

    return {
      updated,
      nextTarget,
      previousActive,
      shouldSwitchActive,
      currentTarget,
    };
  }

  function appendTimelineTransitions(
    current: DashboardState,
    previousAccount: AccountRecord | undefined,
    nextAccount: AccountRecord,
    snapshot: LiveUsageSnapshot,
    previousActive?: AccountRecord,
  ) {
    let nextState = current;
    const previousSnapshot = latestKnownSnapshot(previousAccount);
    const eventAt =
      formatUiDateTime(snapshot.recordedAtMs ?? snapshot.recordedAt) ??
      formatUiDateTime(snapshot.syncedAtMs ?? snapshot.syncedAt) ??
      nowLabel();

    const appendIfMissing = (entry: TimelineLogEntry) => {
      const duplicate = hasTimelineLogEntry(
        nextState,
        (item) =>
          item.kind === entry.kind &&
          item.accountId === entry.accountId &&
          item.sourceAccountId === entry.sourceAccountId &&
          item.targetAccountId === entry.targetAccountId &&
          parseDateTimeValue(item.at) === parseDateTimeValue(entry.at),
      );
      if (!duplicate) {
        nextState = pushTimelineLog(nextState, entry);
      }
    };

    if (
      previousSnapshot?.sevenDay.remainingPercent !== 0 &&
      snapshot.sevenDay.remainingPercent === 0
    ) {
      appendIfMissing(
        createTimelineLogEntry("depleted7d", eventAt, {
          accountId: nextAccount.id,
          note: "周窗已用尽，进入等待恢复。",
        }),
      );
      appendIfMissing(
        createTimelineLogEntry("reset7d", snapshot.sevenDay.resetsAt ?? eventAt, {
          accountId: nextAccount.id,
          note: "周窗恢复时间",
        }),
      );
    }

    if (
      previousSnapshot?.fiveHour.remainingPercent !== 0 &&
      snapshot.fiveHour.remainingPercent === 0 &&
      snapshot.sevenDay.remainingPercent !== 0
    ) {
      appendIfMissing(
        createTimelineLogEntry("depleted5h", eventAt, {
          accountId: nextAccount.id,
          note: "5 小时窗口已用尽，进入等待恢复。",
        }),
      );
      appendIfMissing(
        createTimelineLogEntry("reset5h", snapshot.fiveHour.resetsAt ?? eventAt, {
          accountId: nextAccount.id,
          note: "5 小时窗口恢复时间",
        }),
      );
    }

    if (
      previousSnapshot?.sevenDay.remainingPercent === 0 &&
      snapshot.sevenDay.remainingPercent !== 0
    ) {
      appendIfMissing(
        createTimelineLogEntry("reset7d", snapshot.sevenDay.resetsAt ?? eventAt, {
          accountId: nextAccount.id,
          note: "周窗恢复。",
        }),
      );
    }

    if (
      previousSnapshot?.fiveHour.remainingPercent === 0 &&
      previousSnapshot?.sevenDay.remainingPercent !== 0 &&
      snapshot.fiveHour.remainingPercent !== 0
    ) {
      appendIfMissing(
        createTimelineLogEntry("reset5h", snapshot.fiveHour.resetsAt ?? eventAt, {
          accountId: nextAccount.id,
          note: "5 小时窗口恢复。",
        }),
      );
    }

    if (previousActive && previousActive.id !== nextAccount.id) {
      appendIfMissing(
        createTimelineLogEntry("login", eventAt, {
          accountId: nextAccount.id,
          sourceAccountId: previousActive.id,
          targetAccountId: nextAccount.id,
          note: `登录 ${getDisplayTitle(nextAccount)}（来自 ${getDisplayTitle(previousActive)}）`,
        }),
      );
    }

    return nextState;
  }

  async function commitPendingSyncChoice(targetId: string) {
    const pending = pendingSyncChoiceRef.current;
    if (!pending || !targetId) {
      return;
    }

    const current = stateRef.current;
    const committed = buildSnapshotCommit(
      current,
      pending.snapshot,
      targetId,
      pending.sourceAccountId,
      pending.sourceBackup,
    );
    if (!committed) {
      setPendingSyncChoice(null);
      setPendingSyncTargetId("");
      return;
    }

    const previousTargetSnapshot = latestKnownSnapshot(committed.currentTarget);
    if (committed.previousActive && committed.previousActive.id !== targetId) {
      await forceSnapshotBeforeSwitch(committed.previousActive, pending.snapshot);
    }
    const forcedDepletionRecord = await forceSnapshotOnFiveHourDepletion(
      committed.nextTarget,
      previousTargetSnapshot,
      pending.snapshot,
    );
    if (!forcedDepletionRecord) {
      await persistSnapshotRecord(buildSnapshotRecord(committed.nextTarget, pending.snapshot));
    }

    let nextState = appendTimelineTransitions(
      committed.updated,
      committed.currentTarget,
      committed.nextTarget,
      pending.snapshot,
      committed.previousActive,
    );
    const switchDetail =
      committed.previousActive && committed.previousActive.id !== targetId
        ? `${getDisplayTitle(committed.previousActive)} -> ${getDisplayTitle(committed.nextTarget)} · 手动确认当前流量归属`
        : `${getDisplayTitle(committed.nextTarget)} · 手动确认当前流量归属`;
    const syncDetail = `${getDisplayTitle(committed.nextTarget)} · 5h 剩余 ${formatPercent(
      pending.snapshot.fiveHour.remainingPercent,
    )} · 7d 剩余 ${formatPercent(pending.snapshot.sevenDay.remainingPercent)}`;

    nextState = pushActivity(nextState, "switch", "确认当前账号切换", switchDetail);
    nextState = pushActivity(nextState, "sync", "手动确认本次流量归属", syncDetail);
    setState(nextState);
    setSelectedId(targetId);
    setPendingSyncChoice(null);
    setPendingSyncTargetId("");
  }

  function dismissPendingSyncChoice() {
    const pending = pendingSyncChoiceRef.current;
    if (pending) {
      setState((current) =>
        pushActivity(current, "note", "本次流量归属已跳过", `${pending.reason} 这次未写入任何账号卡。`),
      );
    }
    setPendingSyncChoice(null);
    setPendingSyncTargetId("");
  }

  async function persistCriticalSnapshot(
    account: AccountRecord | undefined,
    snapshot: LiveUsageSnapshot | undefined,
    captureReason: Extract<SnapshotRecord["captureReason"], "forced-switch" | "forced-depleted5h">,
  ) {
    if (!account || account.cluster !== "openai" || !snapshot) {
      return null;
    }

    return persistSnapshotRecord(buildSnapshotRecord(account, snapshot, captureReason));
  }

  async function persistSnapshotRecord(record: SnapshotRecord) {
    const normalizedRecord = normalizeSnapshotRecord(record);
    const persistenceKey = snapshotRecordPersistenceKey(normalizedRecord);
    if (
      persistenceKey &&
      snapshotsRef.current.some((existingRecord) => snapshotRecordPersistenceKey(existingRecord) === persistenceKey)
    ) {
      return null;
    }

    const nextSnapshots = [normalizedRecord, ...snapshotsRef.current].slice(0, 4000);
    snapshotsRef.current = nextSnapshots;
    setSnapshots(nextSnapshots);
    await window.desktopApi?.saveOpenAiSnapshot?.(normalizedRecord);
    return normalizedRecord;
  }

  function shouldForceSwitchSnapshot(
    account: AccountRecord | undefined,
    incomingSnapshot: LiveUsageSnapshot | undefined,
  ) {
    const currentSnapshot = latestKnownSnapshot(account);
    if (!account || account.cluster !== "openai" || !currentSnapshot || !incomingSnapshot) {
      return false;
    }

    return !snapshotBelongsToAccount(account, incomingSnapshot) && looksLikeWorkspaceSwitch(currentSnapshot, incomingSnapshot);
  }

  function shouldForceFiveHourDepletionSnapshot(
    previousSnapshot: LiveUsageSnapshot | undefined,
    incomingSnapshot: LiveUsageSnapshot | undefined,
  ) {
    if (!previousSnapshot || !incomingSnapshot) {
      return false;
    }

    const previousFiveHour = clampPercent(previousSnapshot.fiveHour.remainingPercent);
    const incomingFiveHour = clampPercent(incomingSnapshot.fiveHour.remainingPercent);
    const incomingSevenDay = clampPercent(incomingSnapshot.sevenDay.remainingPercent);
    return previousFiveHour > 0 && incomingFiveHour === 0 && incomingSevenDay > 0;
  }

  async function forceSnapshotBeforeSwitch(
    account: AccountRecord | undefined,
    incomingSnapshot: LiveUsageSnapshot | undefined,
  ) {
    if (!shouldForceSwitchSnapshot(account, incomingSnapshot)) {
      return null;
    }

    return persistCriticalSnapshot(account, latestKnownSnapshot(account), "forced-switch");
  }

  async function forceSnapshotOnFiveHourDepletion(
    account: AccountRecord | undefined,
    previousSnapshot: LiveUsageSnapshot | undefined,
    incomingSnapshot: LiveUsageSnapshot | undefined,
  ) {
    if (!account || account.cluster !== "openai" || !shouldForceFiveHourDepletionSnapshot(previousSnapshot, incomingSnapshot)) {
      return null;
    }

    return persistCriticalSnapshot(account, incomingSnapshot, "forced-depleted5h");
  }

  async function syncCodexUsage(announce: boolean, preferredTargetId?: string) {
    if (!window.desktopApi?.probeCodexUsage) {
      if (announce) {
        window.alert("当前不是桌面环境，无法读取本机 Codex 使用情况。");
      }
      return;
    }

    if (pendingSyncChoiceRef.current && !preferredTargetId) {
      if (announce) {
        window.alert("还有一条待确认的切号同步，请先处理弹窗里的账号选择。");
      }
      return;
    }

    setSyncBusy(true);
    try {
      const probedSnapshot = await window.desktopApi.probeCodexUsage();
      if (!probedSnapshot) {
        if (announce) {
          window.alert("这次没有读到 Codex 使用数据。");
        }
        return;
      }
      const snapshot = stampSnapshot(probedSnapshot);
      const current = stateRef.current;
      const currentOpenAiAccounts = current.accounts.filter((account) => account.cluster === "openai");
      const activeId = current.accounts.find((account) => account.isActive)?.id ?? currentOpenAiAccounts[0]?.id;
      const normalizedSnapshotEmail = normalizeEmail(snapshot.accountEmail);
      const sameEmailAccounts = normalizedSnapshotEmail
        ? currentOpenAiAccounts.filter((account) => normalizeEmail(account.email) === normalizedSnapshotEmail)
        : [];
      const signatureMatches = currentOpenAiAccounts.filter((account) => snapshotBelongsToAccount(account, snapshot));
      const preferredTarget = preferredTargetId
        ? currentOpenAiAccounts.find((account) => account.id === preferredTargetId)
        : undefined;
      const preferredEmail = normalizeEmail(preferredTarget?.email);
      const preferredRequiresWorkspaceRouting = requiresWorkspaceSignatureRouting(preferredTarget);
      const preferredHasSignature = Boolean(accountRouteKey(preferredTarget));
      const hasSingleOpenAiAccount = currentOpenAiAccounts.length === 1;
      const preferredMatchesSnapshot =
        !preferredTarget ||
        snapshotBelongsToAccount(preferredTarget, snapshot) ||
        ((!normalizedSnapshotEmail || preferredEmail === normalizedSnapshotEmail) &&
          (!preferredHasSignature || !preferredRequiresWorkspaceRouting));
      const activeCandidate = currentOpenAiAccounts.find((account) => account.id === activeId);
      const activeMatchesSnapshotEmail = Boolean(
        activeCandidate &&
          (!normalizedSnapshotEmail || normalizeEmail(activeCandidate.email) === normalizedSnapshotEmail),
      );
      const singleSameEmailAccount = sameEmailAccounts.length === 1 ? sameEmailAccounts[0] : undefined;
      const singleSameEmailHasSignature = Boolean(accountRouteKey(singleSameEmailAccount));
      const singleSameEmailMatchesSignature = Boolean(
        singleSameEmailAccount && snapshotBelongsToAccount(singleSameEmailAccount, snapshot),
      );
      const singleSameEmailNeedsWorkspaceRouting = requiresWorkspaceSignatureRouting(singleSameEmailAccount);
      const targetId =
        preferredTarget && preferredMatchesSnapshot
          ? preferredTarget.id
          : signatureMatches.length === 1
            ? signatureMatches[0]?.id
            : sameEmailAccounts.length === 1 &&
                (!singleSameEmailHasSignature ||
                  singleSameEmailMatchesSignature ||
                  !singleSameEmailNeedsWorkspaceRouting)
              ? singleSameEmailAccount?.id
              : !normalizedSnapshotEmail && hasSingleOpenAiAccount
                ? currentOpenAiAccounts[0]?.id
                : undefined;
      const unmatchedSameEmailSignature = sameEmailAccounts.length > 0 && signatureMatches.length === 0;
      const hasAmbiguousSameEmailTeams =
        sameEmailAccounts.length > 1 && signatureMatches.length !== 1;
      const hasSingleSameEmailSignatureMismatch =
        sameEmailAccounts.length === 1 &&
        singleSameEmailHasSignature &&
        !singleSameEmailMatchesSignature &&
        singleSameEmailNeedsWorkspaceRouting;
      const skipReason = preferredTarget && !preferredMatchesSnapshot
        ? `当前同步源 ${snapshot.accountEmail}${snapshot.subscriptionActiveUntil ? ` / ${snapshot.subscriptionActiveUntil}` : ""} 和你指定的 ${getDisplayTitle(preferredTarget)} 路由签名不一致，已阻止写入。`
        : normalizedSnapshotEmail
          ? sameEmailAccounts.length === 0
            ? `当前同步源邮箱 ${snapshot.accountEmail} 没有和面板中的任何 OpenAI 账号建立对应关系。`
            : hasAmbiguousSameEmailTeams || hasSingleSameEmailSignatureMismatch
              ? `当前流量来自 ${snapshot.accountEmail}，已有账号和这次快照的订阅签名不一致。`
              : undefined
          : hasSingleOpenAiAccount || preferredTarget
            ? undefined
            : "当前同步源没有可识别邮箱，而且面板里有多个 OpenAI 账号，无法自动归属。";

      if (!preferredTargetId && (hasAmbiguousSameEmailTeams || hasSingleSameEmailSignatureMismatch)) {
        if (unmatchedSameEmailSignature && snapshot.subscriptionActiveUntil) {
          await forceSnapshotBeforeSwitch(activeCandidate, snapshot);
          if (shouldThrottleSignaturePrompt(snapshot)) {
            return;
          }
          const addNew = window.confirm(
            `检测到 ${snapshot.accountEmail} 出现了一个新的订阅签名（${snapshot.subscriptionActiveUntil}）。\n\n是否要新增一个账号？`,
          );
          if (addNew) {
            openAccountEditorForSnapshot(snapshot);
            setState((currentState) =>
              pushActivity(
                currentState,
                "note",
                "检测到新的订阅签名",
                `${snapshot.accountEmail} · ${snapshot.subscriptionActiveUntil}，已打开新增账号表单。`,
              ),
            );
            return;
          }

          const updateExisting = window.confirm(
            "如果这不是新账号，是否只是现有账号进入了新的订阅周期？\n\n选择“是”后，会让你从同邮箱账号里选一个并更新到这个订阅签名。",
          );
          if (!updateExisting) {
            setState((currentState) =>
              pushActivity(
                currentState,
                "note",
                "本次流量归属已跳过",
                `检测到新的订阅签名 ${snapshot.subscriptionActiveUntil}，但你没有新增或更新账号，已跳过这次写入。`,
              ),
            );
            return;
          }
        }

        await forceSnapshotBeforeSwitch(activeCandidate, snapshot);
        openPendingSyncSelector({
          snapshot,
          matchedIds: (signatureMatches.length > 1 ? signatureMatches : sameEmailAccounts).map((account) => account.id),
          sourceAccountId: activeMatchesSnapshotEmail ? activeCandidate?.id : undefined,
          sourceBackup: activeMatchesSnapshotEmail ? activeCandidate : undefined,
          reason: snapshot.subscriptionActiveUntil
            ? `当前流量来自 ${snapshot.accountEmail}，同邮箱下挂了多个 Team，但 subscriptionActiveUntil 仍未能唯一定位，请确认这次流量属于哪个账号。`
            : `当前流量来自 ${snapshot.accountEmail}，同邮箱下挂了多个 Team，且这次快照没有 subscriptionActiveUntil，请确认这次流量属于哪个账号。`,
        });
        return;
      }

      if (!targetId) {
        if (skipReason) {
          setState((currentState) =>
            pushActivity(currentState, "note", "同步已跳过", `${skipReason} 这次未写入任何账号卡。`),
          );
        }
        return;
      }

      const currentTarget = current.accounts.find((account) => account.id === targetId);
      if (!currentTarget) {
        return;
      }

      const previousTargetSnapshot = latestKnownSnapshot(currentTarget);
      if (isSnapshotSourceRegression(previousTargetSnapshot, snapshot)) {
        const previousSourceLabel = syncLabel(previousTargetSnapshot) ?? "未记录";
        const incomingSourceLabel = syncLabel(snapshot) ?? "未记录";
        setState((currentState) =>
          pushActivity(
            currentState,
            "note",
            "已跳过过时快照",
            `${getDisplayTitle(currentTarget)} 收到一条源时间倒退的旧快照（${incomingSourceLabel}），当前较新记录是 ${previousSourceLabel}，这次未写入。`,
          ),
        );
        return;
      }

      const nextActive = applyLiveUsage(currentTarget, snapshot);
      const shouldSwitchActive = activeId !== targetId;
      const noChange =
        !shouldSwitchActive &&
        sameLiveUsage(currentTarget.liveUsage, snapshot) &&
        currentTarget.email === nextActive.email &&
        currentTarget.plan === nextActive.plan &&
        currentTarget.status === nextActive.status &&
        currentTarget.usagePercent === nextActive.usagePercent &&
        currentTarget.resetAt === nextActive.resetAt &&
        currentTarget.expiryAt === nextActive.expiryAt &&
        currentTarget.sourceLabel === nextActive.sourceLabel &&
        currentTarget.usageLabel === nextActive.usageLabel &&
        currentTarget.statusDetail === nextActive.statusDetail;

      if (noChange) {
        return;
      }

      const sourceAccountId =
        activeMatchesSnapshotEmail && activeCandidate?.id && activeCandidate.id !== targetId
          ? activeCandidate.id
          : undefined;
      const committed = buildSnapshotCommit(current, snapshot, targetId, sourceAccountId, activeCandidate);
      if (!committed) {
        return;
      }

      const previousCommittedTargetSnapshot = latestKnownSnapshot(committed.currentTarget);
      let nextState = committed.updated;
      const previousActive = activeId ? current.accounts.find((account) => account.id === activeId) : undefined;
      const syncDetail = `${getDisplayTitle(committed.nextTarget)} · 5h 剩余 ${formatPercent(
        snapshot.fiveHour.remainingPercent,
      )} · 7d 剩余 ${formatPercent(snapshot.sevenDay.remainingPercent)}`;
      const switchReason =
        preferredTargetId && targetId === preferredTargetId
          ? "按手动指定当前号同步"
          : signatureMatches.length === 1
            ? "按订阅有效期自动识别"
            : sameEmailAccounts.length === 1
            ? "按邮箱自动对齐"
            : "按唯一账号自动对齐";
      const switchDetail =
        previousActive && previousActive.id !== targetId
          ? `${getDisplayTitle(previousActive)} -> ${getDisplayTitle(committed.nextTarget)} · ${switchReason}`
          : `${getDisplayTitle(committed.nextTarget)} · ${switchReason}`;

      if (committed.shouldSwitchActive && previousActive && previousActive.id !== targetId) {
        await forceSnapshotBeforeSwitch(previousActive, snapshot);
      }
      const forcedDepletionRecord = await forceSnapshotOnFiveHourDepletion(
        committed.nextTarget,
        previousCommittedTargetSnapshot,
        snapshot,
      );

      if (committed.shouldSwitchActive) {
        setSelectedId(targetId);
      }

      nextState = appendTimelineTransitions(
        nextState,
        committed.currentTarget,
        committed.nextTarget,
        snapshot,
        previousActive,
      );

      if (!announce && !committed.shouldSwitchActive) {
        setState(nextState);
        if (!forcedDepletionRecord) {
          await persistSnapshotRecord(buildSnapshotRecord(committed.nextTarget, snapshot));
        }
        void window.desktopApi?.pruneSnapshots?.(stateRef.current.settings.snapshotRetentionDays);
        return;
      }

      if (committed.shouldSwitchActive) {
        nextState = pushActivity(nextState, "switch", "检测到当前 Codex 已切号", switchDetail);
      }

      nextState = pushActivity(nextState, "sync", "同步当前 Codex 使用情况", syncDetail);
      setState(nextState);
      if (!forcedDepletionRecord) {
        await persistSnapshotRecord(buildSnapshotRecord(committed.nextTarget, snapshot));
      }
      void window.desktopApi?.pruneSnapshots?.(stateRef.current.settings.snapshotRetentionDays);
    } catch {
      if (announce) {
        window.alert("同步 Codex 使用情况失败。");
      }
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (state.settings.autoSyncOnLaunch) {
      void syncCodexUsage(false);
    }
    const timer = window.setInterval(() => {
      void syncCodexUsage(false);
    }, Math.max(1, state.settings.syncIntervalMinutes) * 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [hydrated, state.settings.autoSyncOnLaunch, state.settings.syncIntervalMinutes]);

  const selected = state.accounts.find((account) => account.id === selectedId) ?? state.accounts[0];
  const isAnalyticsView = view === "analytics";
  const openaiAccounts = sortByPriority(
    state.accounts.filter((account) => account.cluster === "openai"),
  );
  const observerAccounts = sortByPriority(
    state.accounts.filter((account) => account.cluster === "observer"),
  );
  const apiAccounts = sortByPriority(
    state.accounts.filter((account) => account.cluster === "api"),
  );
  const todayDayBucket = Math.floor(clockNow / 86_400_000);
  const todayDateKey = useMemo(() => dayKey(new Date(clockNow)), [todayDayBucket]);
  const activeAccount = state.accounts.find((account) => account.isActive) ?? openaiAccounts[0];
  const selectedOpenAi =
    openaiAccounts.find((account) => account.id === selectedId) ??
    openaiAccounts.find((account) => account.isActive) ??
    openaiAccounts[0] ??
    activeAccount;
  const accountRuntimeMap = useMemo(() => {
    const map = new Map<string, { snapshot?: LiveUsageSnapshot; blocked: boolean; status: AccountStatus }>();
    state.accounts.forEach((account) => {
      const snapshot = displaySnapshot(account, clockNow);
      const blocked = account.cluster === "openai" && isWeekWindowDepleted(snapshot?.sevenDay);
      let status = account.status;

      if (account.cluster === "openai") {
        if (isAccountExpired(account, clockNow)) {
          status = "expired";
        } else if (!snapshot) {
          status = account.status;
        } else if (isWeekWindowDepleted(snapshot.sevenDay)) {
          status = "paused";
        } else if (typeof snapshot.fiveHour.remainingPercent === "number" && snapshot.fiveHour.remainingPercent <= 8) {
          status = "limited";
        } else {
          status = account.isActive ? "active" : "ready";
        }
      }

      map.set(account.id, {
        snapshot,
        blocked,
        status,
      });
    });
    return map;
  }, [clockNow, state.accounts]);

  function currentSnapshot(account?: AccountRecord) {
    return account ? accountRuntimeMap.get(account.id)?.snapshot : undefined;
  }

  function currentBlocked(account?: AccountRecord) {
    return account ? accountRuntimeMap.get(account.id)?.blocked ?? false : false;
  }

  function currentStatus(account?: AccountRecord) {
    return account ? accountRuntimeMap.get(account.id)?.status ?? account.status : "paused";
  }

  const activeLiveUsage = currentSnapshot(activeAccount);
  const activeWeekBlocked = currentBlocked(activeAccount);
  const overviewQueue = useMemo(
    () => sortOverviewQueue(openaiAccounts, clockNow),
    [clockNow, openaiAccounts],
  );
  const desktopMode = window.desktopMeta?.isPackaged ? "已打包" : "开发模式";
  const desktopPlatform = window.desktopMeta?.platform ?? "web";
  const isMacPlatform = desktopPlatform === "darwin";

  const titleMap = useMemo(() => {
    const nextMap = new Map<string, string>();
    let teamIndex = 0;
    openaiAccounts.forEach((account) => {
      const normalizedPlan = (account.plan ?? "").toLowerCase();
      const isPlusSeat =
        account.id === "openai-old-fallback" ||
        normalizedPlan.includes("plus") ||
        normalizedPlan === "chatgpt plus";

      if (isPlusSeat) {
        nextMap.set(account.id, "Codex Plus");
        return;
      }

      teamIndex += 1;
      nextMap.set(account.id, `Codex Team ${teamIndex}`);
    });

    let claudeIndex = 0;
    observerAccounts.forEach((account) => {
      if (account.provider === "Claude") {
        claudeIndex += 1;
        nextMap.set(account.id, `Claude ${claudeIndex}`);
        return;
      }

      if (account.provider === "Gemini") {
        nextMap.set(account.id, "Gemini");
        return;
      }

      nextMap.set(account.id, stripMerchantAlias(account.accountLabel) ?? account.accountLabel);
    });

    apiAccounts.forEach((account) => {
      if (account.provider === "Kimi") {
        nextMap.set(account.id, "Kimi");
        return;
      }
      if (account.provider === "Qwen") {
        nextMap.set(account.id, "Qwen");
        return;
      }
      if (account.provider === "ZhipuAI") {
        nextMap.set(account.id, "GLM OCR");
        return;
      }
      nextMap.set(account.id, stripMerchantAlias(account.accountLabel) ?? account.accountLabel);
    });

    return nextMap;
  }, [apiAccounts, observerAccounts, openaiAccounts]);

  function getDisplayTitle(account: AccountRecord) {
    return titleMap.get(account.id) ?? stripMerchantAlias(account.accountLabel) ?? account.accountLabel;
  }

  function getDisplaySubtitle(account: AccountRecord) {
    if (account.cluster === "openai") {
      return stripMerchantAlias(account.workspace) || account.email;
    }

    return stripMerchantAlias(account.accountLabel) || account.email;
  }

  function renderLinkedWindowMeter(
    fiveHourRemaining?: number,
    sevenDayRemaining?: number,
    blocked = false,
  ) {
    const safeFive = clampPercent(fiveHourRemaining);
    const safeSeven = clampPercent(sevenDayRemaining);

    return (
      <div className={`linked-meter ${blocked ? "is-blocked" : ""}`}>
        <div className="linked-meter-row is-seven-day">
          <span className="linked-meter-key">7d</span>
          <div className="meter compact linked-meter-track is-seven-day" style={meterTrackStyle(safeSeven, false)}>
            <div className="meter-fill linked-meter-fill" style={meterFillStyle(safeSeven, false)} />
          </div>
          <strong className="linked-meter-value">{formatPercent(safeSeven)}</strong>
        </div>

        <div className="linked-meter-row is-five-hour">
          <span className="linked-meter-key">5h</span>
          <div className="meter compact linked-meter-track is-five-hour" style={meterTrackStyle(safeFive, blocked)}>
            <div className="meter-fill linked-meter-fill" style={meterFillStyle(safeFive, blocked)} />
          </div>
          <strong className="linked-meter-value">{formatPercent(safeFive)}</strong>
        </div>
      </div>
    );
  }

  function renderUsageBarColumn(
    label: string,
    value: number | undefined,
    recoveryText: string,
    blocked = false,
  ) {
    const safeValue = clampPercent(value);
    const spentPercent = Math.max(0, 100 - safeValue);
    const sandHue = meterHue(safeValue);
    const topSandColor =
      blocked && label === "5h"
        ? "rgba(255,255,255,0.88)"
        : blocked
          ? "#ff7b7b"
          : `hsl(${sandHue}, 84%, 66%)`;
    const bottomSandColor =
      blocked && label === "5h"
        ? "rgba(255,255,255,0.22)"
        : blocked
          ? "rgba(255, 123, 123, 0.82)"
          : `hsla(${sandHue}, 70%, 78%, 0.92)`;
    const streamColor =
      blocked && label === "5h"
        ? "rgba(255,255,255,0.46)"
        : blocked
          ? "#ff7b7b"
          : `hsl(${sandHue}, 90%, 70%)`;
    const svgIdBase = `usage-${label.toLowerCase()}-${blocked ? "blocked" : "live"}`;
    const topClipId = `${svgIdBase}-top-clip`;
    const bottomClipId = `${svgIdBase}-bottom-clip`;
    const topGradientId = `${svgIdBase}-top-gradient`;
    const bottomGradientId = `${svgIdBase}-bottom-gradient`;
    const streamGradientId = `${svgIdBase}-stream-gradient`;
    const glassGlossId = `${svgIdBase}-glass-gloss`;
    const topSurfaceEdgeY = 118 - (safeValue / 100) * 100;
    const clampedTopSurfaceY = Math.max(18, Math.min(118, topSurfaceEdgeY));
    const topLeftX = 24 + ((clampedTopSurfaceY - 18) / 100) * 44;
    const topRightX = 156 - ((clampedTopSurfaceY - 18) / 100) * 44;
    const topDip = safeValue <= 0 ? 0 : Math.max(4, (100 - safeValue) * 0.06);
    const topSurfaceCenterY = Math.min(118, clampedTopSurfaceY + topDip);
    const bottomSurfaceEdgeY = 242 - (spentPercent / 100) * 100;
    const clampedBottomSurfaceY = Math.max(142, Math.min(242, bottomSurfaceEdgeY));
    const bottomLeftX = 68 - ((clampedBottomSurfaceY - 142) / 100) * 44;
    const bottomRightX = 112 + ((clampedBottomSurfaceY - 142) / 100) * 44;
    const bottomPeakRise = spentPercent <= 0 ? 0 : Math.max(6, spentPercent * 0.08);
    const bottomPeakY = Math.max(142, clampedBottomSurfaceY - bottomPeakRise);
    const streamVisible = !blocked && safeValue > 0 && safeValue < 100;
    const streamEndY = spentPercent > 0 ? Math.min(236, bottomPeakY + 10) : 232;
    const topSandPath =
      safeValue <= 0
        ? ""
        : `M${topLeftX} ${clampedTopSurfaceY} L90 ${topSurfaceCenterY} L${topRightX} ${clampedTopSurfaceY} L112 118 L68 118 Z`;
    const bottomSandPath =
      spentPercent <= 0
        ? ""
        : `M${bottomLeftX} ${clampedBottomSurfaceY} L90 ${bottomPeakY} L${bottomRightX} ${clampedBottomSurfaceY} L156 242 L24 242 Z`;

      return (
        <div className="usage-bar-column">
          <div className="usage-headline">
            <span className="usage-window-label">{label}</span>
            <strong className="usage-remaining-label">{`剩余 ${formatPercent(value)}`}</strong>
          </div>
          <div className="usage-hourglass-shell">
            <svg className="usage-hourglass-svg" viewBox="0 0 180 260" aria-hidden="true">
            <defs>
              <clipPath id={topClipId}>
                <path d="M24 18 H156 L112 118 H68 Z" />
              </clipPath>
              <clipPath id={bottomClipId}>
                <path d="M68 142 H112 L156 242 H24 Z" />
              </clipPath>
              <linearGradient id={topGradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={topSandColor} stopOpacity="1" />
                <stop offset="100%" stopColor={topSandColor} stopOpacity={blocked ? "0.84" : "0.74"} />
              </linearGradient>
              <linearGradient id={bottomGradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={bottomSandColor} stopOpacity={blocked ? "0.92" : "0.82"} />
                <stop offset="100%" stopColor={bottomSandColor} stopOpacity={blocked ? "0.72" : "0.96"} />
              </linearGradient>
              <linearGradient id={streamGradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={streamColor} stopOpacity="0.18" />
                <stop offset="18%" stopColor={streamColor} stopOpacity="0.88" />
                <stop offset="82%" stopColor={streamColor} stopOpacity="0.9" />
                <stop offset="100%" stopColor={streamColor} stopOpacity="0.18" />
              </linearGradient>
              <linearGradient id={glassGlossId} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.9)" stopOpacity="0.52" />
                <stop offset="28%" stopColor="rgba(255,255,255,0.65)" stopOpacity="0.2" />
                <stop offset="55%" stopColor="rgba(255,255,255,0.14)" stopOpacity="0.06" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" stopOpacity="0" />
              </linearGradient>
            </defs>

            <ellipse className="usage-hourglass-cap outer top" cx="90" cy="18" rx="66" ry="6.5" />
            <ellipse className="usage-hourglass-cap inner top" cx="90" cy="18" rx="56" ry="3.2" />
            <ellipse className="usage-hourglass-cap gloss top" cx="78" cy="17.2" rx="18" ry="2.4" />
            <path className="usage-hourglass-outline top" d="M24 18 H156 L112 118 H68 Z" />
            <path className="usage-hourglass-outline bottom" d="M68 142 H112 L156 242 H24 Z" />
            <path className="usage-hourglass-inner-outline top" d="M31 24 H149 L108 114 H72 Z" />
            <path className="usage-hourglass-inner-outline bottom" d="M72 146 H108 L149 236 H31 Z" />
            <rect className="usage-hourglass-rail left" x="14" y="14" width="7" height="232" rx="999" />
            <rect className="usage-hourglass-rail right" x="159" y="14" width="7" height="232" rx="999" />
            <rect className="usage-hourglass-neck" x="80" y="116" width="20" height="28" rx="999" />
            <ellipse className="usage-hourglass-cap outer bottom" cx="90" cy="242" rx="66" ry="6.5" />
            <ellipse className="usage-hourglass-cap inner bottom" cx="90" cy="242" rx="56" ry="3.2" />
            <ellipse className="usage-hourglass-cap gloss bottom" cx="102" cy="241.2" rx="18" ry="2.4" />
            <path className="usage-hourglass-gloss top" d="M38 28 H88 L70 102 H55 Z" fill={`url(#${glassGlossId})`} />
            <path className="usage-hourglass-gloss bottom" d="M58 154 H86 L102 228 H78 Z" fill={`url(#${glassGlossId})`} />

            <g clipPath={`url(#${topClipId})`}>
              {topSandPath ? (
                <path className="usage-hourglass-surface top" d={topSandPath} fill={`url(#${topGradientId})`} />
              ) : null}
            </g>

            <g clipPath={`url(#${bottomClipId})`}>
              {bottomSandPath ? (
                <path className="usage-hourglass-surface bottom" d={bottomSandPath} fill={`url(#${bottomGradientId})`} />
              ) : null}
            </g>

            <g className={`usage-hourglass-stream-group ${streamVisible ? "is-flowing" : ""}`}>
              <line
                className="usage-hourglass-stream-base"
                x1="90"
                y1="130"
                x2="90"
                y2={streamEndY}
                stroke={streamColor}
              />
              <line
                className="usage-hourglass-stream-texture"
                x1="90"
                y1="130"
                x2="90"
                y2={streamEndY}
                stroke={`url(#${streamGradientId})`}
              />
            </g>
          </svg>
        </div>
        <small>{recoveryText}</small>
      </div>
    );
  }

  const openAiChartData = useMemo(
    () =>
      !isAnalyticsView
        ? []
        : openaiAccounts.map((account, index) => ({
            id: account.id,
            title: getDisplayTitle(account),
            shortTitle: `T${index + 1}`,
            fiveHour: clampPercent(currentSnapshot(account)?.fiveHour.remainingPercent),
            sevenDay: clampPercent(currentSnapshot(account)?.sevenDay.remainingPercent),
            isBlocked: currentBlocked(account),
            isActive: account.isActive,
          })),
    [isAnalyticsView, openaiAccounts, accountRuntimeMap],
  );
  const statusPalette: Record<AccountStatus, string> = {
    active: "#63f0bf",
    ready: "#59b7ff",
    limited: "#ffbe61",
    observe: "#c294ff",
    paused: "#8694b8",
    expired: "#ff7d7d",
  };
  const statusSegments = useMemo(
    () =>
      !isAnalyticsView
        ? []
        : ([
            "active",
            "ready",
            "limited",
            "observe",
            "paused",
            "expired",
          ] as const)
            .map((status) => {
              const count = state.accounts.filter((account) => currentStatus(account) === status).length;
              return {
                status,
                count,
                color: statusPalette[status],
              };
            })
            .filter((item) => item.count > 0),
    [isAnalyticsView, state.accounts, accountRuntimeMap],
  );
  const totalStatusCount = statusSegments.reduce((sum, item) => sum + item.count, 0);
  const statusPie3dSlices = useMemo(() => {
    const cx = 108;
    const cy = 62;
    const rx = 82;
    const ry = 34;
    const depth = 28;
    let cursor = -90;

    return statusSegments.map((item) => {
      const angle = totalStatusCount === 0 ? 0 : (item.count / totalStatusCount) * 360;
      const startDeg = cursor;
      const endDeg = cursor + angle;
      cursor = endDeg;

      return {
        ...item,
        startDeg,
        endDeg,
        topPath: ellipseSlicePath(cx, cy, rx, ry, startDeg, endDeg),
        visibleSides: visibleFrontIntervals(startDeg, endDeg).map(([start, end]) => ({
          path: ellipseSidePath(cx, cy, rx, ry, depth, start, end),
        })),
        sideColor: shadeHex(item.color, -0.28),
        topStroke: shadeHex(item.color, -0.18),
      };
    });
  }, [statusSegments, totalStatusCount]);
  const locale = state.settings.locale;
  const uiText = (zh: string, en: string) => (locale === "en" ? en : zh);
  const snapshotIndexSignature = useMemo(() => {
    const accountSignature = state.accounts
      .map((account) => [account.id, accountRouteKey(account) ?? "", normalizePlanKey(account.plan) ?? "", normalizeEmail(account.email) ?? ""].join("|"))
      .join("\n");
    return `${buildSnapshotIndexSignature(snapshots, normalizeSnapshotRecord, snapshotRecordTime)}::${accountSignature}`;
  }, [snapshots, state.accounts]);
  const snapshotIndex = useMemo(
    () => {
      if (!isAnalyticsView) {
        return hydrateSnapshotIndex();
      }

      if (snapshotIndexCache?.signature === snapshotIndexSignature) {
        return hydrateSnapshotIndex(snapshotIndexCache);
      }

      return buildSnapshotIndex({
        enabled: true,
        snapshots,
        accounts: state.accounts,
        normalizeRecord: normalizeSnapshotRecord,
        matchesAccount: snapshotMatchesAccount,
        recordTime: snapshotRecordTime,
      });
    },
    [isAnalyticsView, snapshots, state.accounts, snapshotIndexCache, snapshotIndexSignature],
  );
  useEffect(() => {
    if (!hydrated || !isAnalyticsView || !window.desktopApi?.saveSnapshotIndexCache) {
      return;
    }

    if (snapshotIndexCache?.signature === snapshotIndexSignature) {
      return;
    }

    const timer = window.setTimeout(() => {
      void window.desktopApi?.saveSnapshotIndexCache?.(serializeSnapshotIndex(snapshotIndexSignature, snapshotIndex)).catch(() => {
        // Ignore cache persistence failures and keep the UI responsive.
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hydrated, isAnalyticsView, snapshotIndex, snapshotIndexCache, snapshotIndexSignature]);
  const tokenRanking = useMemo(() => {
    if (!isAnalyticsView) {
      return [] as Array<{
        id: string;
        title: string;
        subtitle: string;
        tokens: number;
        lastTokens: number;
        isActive: boolean;
      }>;
    }

    const bucket = new Map<
      string,
      {
        id: string;
        title: string;
        subtitle: string;
        tokens: number;
        lastTokens: number;
        isActive: boolean;
      }
    >();

    openaiAccounts.forEach((account) => {
      bucket.set(account.id, {
        id: account.id,
        title: getDisplayTitle(account),
        subtitle: getDisplaySubtitle(account),
        tokens: 0,
        lastTokens: 0,
        isActive: account.isActive,
      });
    });

    snapshotIndex.tokenTotalsByAccount.forEach((totals, accountId) => {
      const current = bucket.get(accountId);
      if (!current) {
        return;
      }

      current.tokens = totals.tokens;
      current.lastTokens = totals.lastTokens;
    });

    return [...bucket.values()].sort((left, right) => right.tokens - left.tokens);
  }, [isAnalyticsView, openaiAccounts, snapshotIndex.tokenTotalsByAccount]);
  const tokenTrend = useMemo(() => {
    if (!isAnalyticsView) {
      return [] as Array<{
        label: string;
        tokens: number;
        date: Date;
        open: number;
        high: number;
        low: number;
        close: number;
        delta: number;
        volume: number;
      }>;
    }

    const now = new Date();
    const range = state.settings.analyticsRange;
    const bucket = new Map<string, { label: string; tokens: number; date: Date }>();

    if (range === "hour") {
      for (let minute = 0; minute < 60; minute += 1) {
        const point = new Date(now);
        point.setSeconds(0, 0);
        point.setMinutes(now.getMinutes() - (59 - minute));
        const key = hourMinuteKey(point);
        bucket.set(key, {
          label: shortMinuteLabel(point),
          tokens: 0,
          date: point,
        });
      }
    } else if (range === "day") {
      for (let hour = 0; hour < 24; hour += 1) {
        const point = new Date(now);
        point.setMinutes(0, 0, 0);
        point.setHours(now.getHours() - (23 - hour));
        const key = `${dayKey(point)}-${String(point.getHours()).padStart(2, "0")}`;
        bucket.set(key, {
          label: `${String(point.getHours()).padStart(2, "0")}:00`,
          tokens: 0,
          date: point,
        });
      }
    } else {
      const days = range === "week" ? 7 : 30;
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      for (let index = 0; index < days; index += 1) {
        const point = new Date(today);
        point.setDate(today.getDate() - (days - 1 - index));
        bucket.set(dayKey(point), {
          label: shortDayLabel(point),
          tokens: 0,
          date: point,
        });
      }
    }

    const sourceBuckets =
      range === "hour"
        ? snapshotIndex.minuteBuckets
        : range === "day"
          ? snapshotIndex.hourBuckets
          : snapshotIndex.dayBuckets;

    bucket.forEach((current, key) => {
      current.tokens = sourceBuckets.get(key)?.tokens ?? 0;
    });

    const series = [...bucket.values()];
    return series.map((item, index) => {
      const previousClose = index === 0 ? item.tokens : series[index - 1].tokens;
      const open = index === 0 ? item.tokens : previousClose;
      const close = item.tokens;
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      const delta = index === 0 ? close : close - open;

      return {
        ...item,
        open,
        high,
        low,
        close,
        delta,
        volume: index === 0 ? close : Math.abs(delta),
      };
    });
  }, [
    isAnalyticsView,
    snapshotIndex.dayBuckets,
    snapshotIndex.hourBuckets,
    snapshotIndex.minuteBuckets,
    state.settings.analyticsRange,
  ]);
  const heatmapYearView = useMemo(() => {
    if (!isAnalyticsView) {
      return {
        title: String(heatmapYearCursor),
        weekdayLabels: localizedWeekdayLabels(locale),
        weeks: [] as Array<
          Array<{
            key: string;
            date: Date;
            isCurrentYear: boolean;
            isToday: boolean;
            tokens: number;
            level: number;
            title: string;
          }>
        >,
        monthMarkers: [] as Array<{ key: string; label: string; weekIndex: number }>,
      };
    }

    const currentYear = heatmapYearCursor;

    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);
    const yearStartOffset = (yearStart.getDay() + 6) % 7;
    const yearEndOffset = (yearEnd.getDay() + 6) % 7;
    const gridStart = new Date(yearStart);
    gridStart.setDate(yearStart.getDate() - yearStartOffset);
    const gridEnd = new Date(yearEnd);
    gridEnd.setDate(yearEnd.getDate() + (6 - yearEndOffset));

    const weeks: Array<
      Array<{
        key: string;
        date: Date;
        isCurrentYear: boolean;
        isToday: boolean;
        tokens: number;
        level: number;
        title: string;
      }>
    > = [];
    const monthMarkers: Array<{ key: string; label: string; weekIndex: number }> = [];

    const cursor = new Date(gridStart);
    let weekIndex = 0;
    while (cursor <= gridEnd) {
      const week: Array<{
        key: string;
        date: Date;
        isCurrentYear: boolean;
        isToday: boolean;
        tokens: number;
        level: number;
        title: string;
      }> = [];

      for (let weekdayIndex = 0; weekdayIndex < 7; weekdayIndex += 1) {
        const currentDate = new Date(cursor);
        const isCurrentYear = currentDate.getFullYear() === currentYear;
        const key = dayKey(currentDate);
        const tokens = isCurrentYear ? snapshotIndex.dayBuckets.get(key)?.tokens ?? 0 : 0;
        const title = isCurrentYear
          ? `${localizedMonthTitle(currentDate, locale)} ${currentDate.getDate()} · ${compactNumber(tokens)}`
          : "";

        if (isCurrentYear && currentDate.getDate() === 1) {
          monthMarkers.push({
            key: `${currentYear}-${currentDate.getMonth() + 1}`,
            label:
              locale === "en"
                ? new Intl.DateTimeFormat("en-US", { month: "short" }).format(currentDate)
                : `${currentDate.getMonth() + 1}月`,
            weekIndex,
          });
        }

        week.push({
          key,
          date: currentDate,
          isCurrentYear,
          isToday: key === todayDateKey,
          tokens,
          level: heatmapLevel(tokens),
          title,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      weeks.push(week);
      weekIndex += 1;
    }

    return {
      title: String(currentYear),
      weekdayLabels: localizedWeekdayLabels(locale),
      weeks,
      monthMarkers,
    };
  }, [compactNumber, heatmapYearCursor, isAnalyticsView, locale, snapshotIndex.dayBuckets, todayDateKey]);
  const heatmapMonthView = useMemo(() => {
    if (!isAnalyticsView) {
      return {
        title: localizedMonthTitle(new Date(heatmapYearCursor, heatmapMonthCursor - 1, 1), locale),
        weekdayLabels: localizedWeekdayLabels(locale),
        cells: [] as Array<{
          key: string;
          isPlaceholder: boolean;
          dayNumber: string;
          tokens: number;
          level: number;
          title: string;
        }>,
      };
    }

    const currentYear = heatmapYearCursor;
    const currentMonth = heatmapMonthCursor - 1;
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const weekdayOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const cells = Array.from({ length: weekdayOffset + daysInMonth }, (_, index) => {
      if (index < weekdayOffset) {
        return {
          key: `empty-${index}`,
          isPlaceholder: true,
          dayNumber: "",
          tokens: 0,
          level: 0,
          title: "",
        };
      }

      const dayNumber = index - weekdayOffset + 1;
      const currentDate = new Date(currentYear, currentMonth, dayNumber);
      const tokens = snapshotIndex.dayBuckets.get(dayKey(currentDate))?.tokens ?? 0;

      return {
        key: dayKey(currentDate),
        isPlaceholder: false,
        dayNumber: String(dayNumber),
        tokens,
        level: heatmapLevel(tokens),
        title: `${localizedMonthTitle(currentDate, locale)} ${dayNumber} · ${compactNumber(tokens)}`,
      };
    });

    return {
      title: localizedMonthTitle(firstDayOfMonth, locale),
      weekdayLabels: localizedWeekdayLabels(locale),
      cells,
    };
  }, [compactNumber, heatmapMonthCursor, heatmapYearCursor, isAnalyticsView, locale, snapshotIndex.dayBuckets]);
  const navItems: Array<{ id: ViewId; label: string; hint: string }> = [
    { id: "overview", label: uiText("总览", "Overview"), hint: uiText("当前账号与窗口", "Current account and windows") },
    { id: "analytics", label: uiText("分析", "Analytics"), hint: uiText("消耗与热力图", "Usage and heatmap") },
    { id: "providers", label: uiText("Providers", "Providers"), hint: uiText("其他 provider", "Other providers") },
    { id: "timeline", label: uiText("时间线", "Timeline"), hint: uiText("周 / 月任务视图", "Week / month schedule") },
  ];
  const pendingChoiceAccounts = pendingSyncChoice
    ? pendingSyncChoice.matchedIds
        .map((id) => state.accounts.find((account) => account.id === id))
        .filter((account): account is AccountRecord => Boolean(account))
    : [];

  function updateSelected(patch: Partial<AccountRecord>) {
    setState((current) => ({
      ...current,
      accounts: current.accounts.map((account) =>
        account.id === selected.id ? normalizeAccount({ ...account, ...patch }) : account,
      ),
    }));
  }

  function updateSelectedNotes(value: string) {
    updateSelected({
      notes: value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    });
  }

  function handleSetActive(id: string, reason = "手动切换主力号") {
    setState((current) => {
      const nextActive = current.accounts.find((account) => account.id === id);
      if (!nextActive) {
        return current;
      }

      const previous = current.accounts.find((account) => account.isActive);
      const updated: DashboardState = {
        ...current,
        accounts: current.accounts.map((account) => ({
          ...account,
          isActive: account.id === id,
          status:
            account.id === id
              ? "active"
              : account.status === "active"
                ? "ready"
                : account.status,
        })),
      };

      const title = previous && previous.id !== id ? "切换当前账号" : "确认当前账号";
      const detail =
        previous && previous.id !== id
          ? `${getDisplayTitle(previous)} -> ${getDisplayTitle(nextActive)} · ${reason}`
          : `${getDisplayTitle(nextActive)} · ${reason}`;

      return pushActivity(updated, "switch", title, detail);
    });
    setSelectedId(id);
  }

  function handleSetActiveAndSync(id: string) {
    handleSetActive(id, "手动指定当前 Team");
    void syncCodexUsage(true, id);
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fries-snapshot.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = ensureCompleteState(JSON.parse(String(reader.result)) as DashboardState);
        if (!Array.isArray(parsed.accounts) || !parsed.profile) {
          throw new Error("invalid payload");
        }
        const imported = pushActivity(
          parsed,
          "import",
          "导入外部快照",
          `已从文件导入 ${file.name}`,
        );
        setState(imported);
        setSelectedId(imported.accounts.find((item) => item.isActive)?.id ?? imported.accounts[0]?.id ?? "");
      } catch {
        window.alert("导入失败：文件结构不正确。");
      }
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }

  function handleReset() {
    const next = pushActivity(
      cloneSeed(),
      "reset",
      "恢复默认样例",
      "已恢复成按当前订阅策略预填的初始状态。",
    );
    setState(ensureCompleteState(next));
    setSelectedId(next.accounts.find((item) => item.isActive)?.id ?? next.accounts[0]?.id ?? "");
  }

  function handleOpenDataDir() {
    window.desktopApi?.openDataDir().catch(() => {
      window.alert("打开数据目录失败。");
    });
  }

  function handleOpenDataFile() {
    window.desktopApi?.openDataFile().catch(() => {
      window.alert("打开数据文件失败。");
    });
  }

  function handleOpenTimelineLogsDir() {
    window.desktopApi?.openTimelineLogsDir?.().catch(() => {
      window.alert(uiText("打开时间线日志目录失败。", "Failed to open timeline log folder."));
    });
  }

  function handleOpenSettingsWindow() {
    window.desktopApi?.openSettingsWindow?.().catch(() => {
      window.alert(uiText("打开设置窗口失败。", "Failed to open settings window."));
    });
  }

  function updateSettings(patch: Partial<DashboardSettings>) {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...patch,
      },
    }));
  }

  async function refreshSnapshots() {
    const nextSnapshots = await window.desktopApi?.listSnapshots?.();
    if (nextSnapshots) {
      const normalizedSnapshots = nextSnapshots.map(normalizeSnapshotRecord);
      setSnapshots(normalizedSnapshots);
      setState((current) => mergeStateWithSnapshotRecords(current, normalizedSnapshots));
    }
  }

  async function handleSyncMemoryNow() {
    try {
      const result = await window.desktopApi?.syncAccountsMemory?.(state.accounts);
      setState((current) =>
        pushActivity(
          current,
          "sync",
          "同步 OpenAI 订阅到 memory",
          `已写回 ${result?.updated ?? 0} 个 OpenAI 账号的 subscriptionActiveUntil。`,
        ),
      );
    } catch {
      window.alert("写回 memory 失败。");
    }
  }

  async function handleRunSelfCheck() {
    if (!window.desktopApi?.runSelfCheck) {
      window.alert(uiText("当前环境不支持自检。", "Self-check is unavailable in this environment."));
      return;
    }

    setSelfCheckBusy(true);
    try {
      const report = await window.desktopApi.runSelfCheck();
      setSelfCheckReport(report);
      setState((current) =>
        pushActivity(
          current,
          report.ok ? "sync" : "note",
          report.ok ? "运行自检（通过）" : "运行自检（发现问题）",
          report.ok
            ? `自检通过：${report.summary.accounts} 个账号，${report.summary.snapshots} 条快照，${report.summary.timelineEvents} 条时间线事件。`
            : `自检发现 ${report.summary.errors} 个错误、${report.summary.warnings} 个警告。`,
        ),
      );
    } catch {
      window.alert(uiText("运行自检失败。", "Failed to run self-check."));
    } finally {
      setSelfCheckBusy(false);
    }
  }

  async function handleClearOpenAiCache() {
    try {
      await window.desktopApi?.clearOpenAiCache?.();
      setSnapshots([]);
      setState((current) => ({
        ...current,
        version: 2,
        accounts: current.accounts.map((account) => {
          if (account.cluster !== "openai") {
            return account;
          }
          return {
            ...account,
            tokensUsed: undefined,
            usageHistory: [],
            liveUsage: account.liveUsage
              ? {
                  ...account.liveUsage,
                  totalTokens: undefined,
                  lastTokens: undefined,
                }
              : account.liveUsage,
          };
        }),
        activityLog: [
          ...current.activityLog,
          createActivity("reset", "清空 OpenAI 快照缓存", "已清空历史快照与累计 token，保留当前总览展示状态。"),
        ].slice(-120),
      }));
    } catch {
      window.alert("清空快照缓存失败。");
    }
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  function handleOpenSnapshotsDir() {
    window.desktopApi?.openSnapshotsDir?.().catch(() => {
      window.alert("打开快照目录失败。");
    });
  }

  function handleOpenMemoryFile() {
    window.desktopApi?.openMemoryFile?.().catch(() => {
      window.alert("打开 memory 文件失败。");
    });
  }

  function editorDraftFromSnapshot(snapshot: LiveUsageSnapshot, target?: AccountRecord): AccountEditorDraft {
    const normalizedSnapshot = normalizeSnapshot(snapshot);
    const productKey = target ? editableProductKey(target) : "chatgpt";
    const tierKey = target
      ? inferTierKey(target)
      : inferTierKey({
          provider: normalizedSnapshot?.provider ?? "OpenAI",
          plan: normalizedSnapshot?.plan ?? "ChatGPT Business",
          cluster: "openai",
        } as AccountRecord);
    const expiryLabel =
      formatUiDateTime(subscriptionTime(normalizedSnapshot)) ??
      target?.expiryAt ??
      "";

    return {
      id: target?.id,
      productKey,
      tierKey,
      teamMode:
        productKey === "chatgpt" && tierKey === "business"
          ? (target ? inferTeamMode(target) : "team") === "team"
            ? "team"
            : "none"
          : "none",
      customProductName: productKey === "custom" ? deriveCustomProductName(target) : "",
      customPlanName: productKey === "custom" ? target?.plan ?? "" : "",
      observe: target?.status === "observe",
      accountLabel: target?.accountLabel ?? stripMerchantAlias(target?.workspace) ?? normalizedSnapshot?.accountEmail ?? "",
      email: target?.email ?? normalizedSnapshot?.accountEmail ?? "",
      workspace: usesWorkspaceField(productKey, tierKey) ? target?.workspace ?? "" : "",
      expiryAt: expiryLabel,
      costLabel: target?.costLabel ?? "",
      notesText: target?.notes?.join("\n") ?? "",
    };
  }

  function openAccountEditorForSnapshot(snapshot: LiveUsageSnapshot, target?: AccountRecord) {
    setEditingAccountId(target?.id ?? null);
    setEditorDraft(editorDraftFromSnapshot(snapshot, target));
    setEditorOpen(true);
  }

  function openAccountEditor(account?: AccountRecord) {
    const productKey = editableProductKey(account);
    const tierKey = inferTierKey(account);
    setEditingAccountId(account?.id ?? null);
    setEditorDraft({
      id: account?.id,
      productKey,
      tierKey,
      teamMode:
        productKey === "chatgpt" && tierKey === "business"
          ? inferTeamMode(account) === "team"
            ? "team"
            : "none"
          : "none",
      customProductName: productKey === "custom" ? deriveCustomProductName(account) : "",
      customPlanName: productKey === "custom" ? account?.plan ?? "" : "",
      observe: account?.status === "observe",
      accountLabel: account?.accountLabel ?? "",
      email: account?.email ?? "",
      workspace: account?.workspace ?? "",
      expiryAt: account?.expiryAt ?? "",
      costLabel: account?.costLabel ?? "",
      notesText: account?.notes?.join("\n") ?? "",
    });
    setEditorOpen(true);
  }

  function editorDraftRouteKey(draft: AccountEditorDraft) {
    const email = normalizeEmail(draft.email);
    const planKey = normalizePlanKey(buildPlanLabel(draft.productKey, draft.tierKey, draft.customPlanName));
    const expiryMs = parseDateTimeValue(draft.expiryAt);
    if (!email || !planKey || typeof expiryMs !== "number") {
      return undefined;
    }
    return `${email}|${planKey}|${expiryMs}`;
  }

  function findDuplicateAccountForDraft(current: DashboardState, draft: AccountEditorDraft, editingId?: string | null) {
    const draftRoute = editorDraftRouteKey(draft);
    const normalizedEmail = normalizeEmail(draft.email);
    const workspace = stripMerchantAlias(draft.workspace)?.toLowerCase();
    const productKey = draft.productKey;
    return current.accounts.find((account) => {
      if (account.id === editingId) {
        return false;
      }

      if (draftRoute && accountRouteKey(account) === draftRoute) {
        return true;
      }

      if (normalizeEmail(account.email) !== normalizedEmail) {
        return false;
      }

      if (productKey !== editableProductKey(account)) {
        return false;
      }

      if (draft.teamMode === "team") {
        return Boolean(workspace && stripMerchantAlias(account.workspace)?.toLowerCase() === workspace);
      }

      return true;
    });
  }

  function handleSaveAccountEditor() {
    const isCustom = editorDraft.productKey === "custom";
    const productConfig = PRODUCT_CONFIG[editorDraft.productKey];
    const effectiveTeamMode: TeamMode =
      editorDraft.productKey === "chatgpt" && editorDraft.tierKey === "business"
        ? editorDraft.teamMode
        : "none";
    const nextPlan = buildPlanLabel(editorDraft.productKey, editorDraft.tierKey, editorDraft.customPlanName);
    const existingAccount = state.accounts.find((account) => account.id === editingAccountId);
    const inferredCustomCluster =
      existingAccount?.cluster ??
      (/api|quota|ocr|glm|minimax|qwen|zhipu/i.test(
        `${editorDraft.customProductName} ${editorDraft.customPlanName}`,
      )
        ? "api"
        : "observer");
    const nextCluster = isCustom ? inferredCustomCluster : productConfig.cluster;
    const providerName = deriveProviderName(editorDraft.productKey, editorDraft.customProductName);
    const duplicateAccount = findDuplicateAccountForDraft(stateRef.current, editorDraft, editingAccountId);
    const resolvedTargetId =
      editingAccountId ??
      duplicateAccount?.id ??
      `${nextCluster}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const nextEmail = editorDraft.email.trim();
    const nextExpiryInput = editorDraft.expiryAt?.trim() || undefined;
    const nextExpiryMs = parseDateTimeValue(nextExpiryInput);
    const nextExpiryLabel =
      typeof nextExpiryMs === "number"
        ? formatUiDateTime(nextExpiryMs) ?? nextExpiryInput
        : nextExpiryInput;
    const nextNotes = editorDraft.notesText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    setState((current) => {
      const existingAccount = current.accounts.find((account) => account.id === resolvedTargetId);
      const exists = Boolean(existingAccount);
      const defaultStatus: AccountStatus = nextCluster === "openai" ? "ready" : "ready";
      const resolvedStatus: AccountStatus = editorDraft.observe
        ? "observe"
        : existingAccount?.status === "observe"
          ? defaultStatus
          : existingAccount?.status ?? defaultStatus;
      const nextLiveUsage =
        exists && existingAccount?.liveUsage
          ? normalizeSnapshot(
              {
                ...existingAccount.liveUsage,
                provider: providerName,
                accountEmail: nextEmail || existingAccount.liveUsage.accountEmail,
                plan: nextPlan,
                subscriptionActiveUntil:
                  nextCluster === "openai"
                    ? nextExpiryLabel ?? existingAccount.liveUsage.subscriptionActiveUntil
                    : existingAccount.liveUsage.subscriptionActiveUntil,
                subscriptionActiveUntilMs:
                  nextCluster === "openai"
                    ? nextExpiryMs ?? existingAccount.liveUsage.subscriptionActiveUntilMs
                    : existingAccount.liveUsage.subscriptionActiveUntilMs,
              },
              existingAccount.liveUsage.recordedAtMs ?? existingAccount.liveUsage.recordedAt,
            )
          : existingAccount?.liveUsage;
      const nextAccount: AccountRecord = normalizeAccount({
        id: resolvedTargetId,
        provider: providerName,
        productKey: editorDraft.productKey,
        tierKey: isCustom ? undefined : editorDraft.tierKey,
        teamMode: effectiveTeamMode,
        accountLabel:
          editorDraft.accountLabel.trim() ||
          (effectiveTeamMode === "team"
            ? editorDraft.workspace?.trim()
            : editorDraft.email.trim().split("@")[0]) ||
          providerName,
        email: nextEmail,
        plan: nextPlan,
        cluster: nextCluster,
        status: resolvedStatus,
        priority: exists ? existingAccount?.priority ?? current.accounts.length + 1 : current.accounts.length + 1,
        isActive: exists ? existingAccount?.isActive ?? false : false,
        workspace: effectiveTeamMode === "team" ? editorDraft.workspace?.trim() || undefined : undefined,
        statusDetail: exists
          ? existingAccount?.statusDetail ?? "手动维护的账号信息。"
          : "手动新增账号，等待同步或补充说明。",
        usageLabel: exists
          ? existingAccount?.usageLabel ?? "等待同步"
          : "等待同步",
        usagePercent: exists ? existingAccount?.usagePercent ?? 0 : 0,
        trackingMode:
          exists ? existingAccount?.trackingMode ?? (nextCluster === "api" ? "exact" : "estimate") : nextCluster === "api" ? "exact" : "estimate",
        resetAt: exists ? existingAccount?.resetAt : undefined,
        expiryAt: nextExpiryLabel,
        costLabel: editorDraft.costLabel?.trim() || undefined,
        tokensUsed: exists ? existingAccount?.tokensUsed : undefined,
        tokensRemaining: exists ? existingAccount?.tokensRemaining : undefined,
        liveUsage: nextLiveUsage,
        usageHistory: exists ? existingAccount?.usageHistory : [],
        sourceLabel: exists
          ? existingAccount?.sourceLabel ?? "手动录入"
          : "手动录入",
        notes: nextNotes,
      });

      const nextAccounts = exists
        ? current.accounts.map((account) => (account.id === resolvedTargetId ? nextAccount : account))
        : [...current.accounts, nextAccount];

      return pushActivity(
        {
          ...current,
          accounts: nextAccounts,
        },
        exists ? "note" : "import",
        exists ? "更新账号资料" : "新增账号",
        `${nextAccount.accountLabel} · ${nextAccount.email || "未记录邮箱"}`,
      );
    });

    if (nextCluster === "openai") {
      const draftRouteKey = editorDraftRouteKey({
        ...editorDraft,
        email: nextEmail,
        expiryAt: nextExpiryLabel,
      });
      if (draftRouteKey) {
        signaturePromptCooldownRef.current.delete(draftRouteKey);
        persistSignaturePromptCooldowns(signaturePromptCooldownRef.current);
      }
    }

    setSelectedId(resolvedTargetId);
    setEditorOpen(false);
  }

  function handleDeleteAccount(id: string) {
    setState((current) => {
      const target = current.accounts.find((account) => account.id === id);
      if (!target) {
        return current;
      }
      const nextAccounts = current.accounts.filter((account) => account.id !== id);
      return pushActivity(
        {
          ...current,
          accounts: nextAccounts,
        },
        "note",
        "删除账号",
        `${target.accountLabel} · ${target.email || "未记录邮箱"}`,
      );
    });
    setSelectedId((currentId) => (currentId === id ? state.accounts.find((account) => account.id !== id)?.id ?? "" : currentId));
  }

  function handleWindowMinimize() {
    void window.desktopApi?.minimizeWindow?.();
  }

  function handleWindowToggleMaximize() {
    void window.desktopApi?.toggleMaximizeWindow?.();
  }

  function handleWindowClose() {
    void window.desktopApi?.closeWindow?.();
  }

  async function handleResizePointerDown(direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) {
    if (
      isSettingsWindow ||
      windowState.isMaximized ||
      !window.desktopApi?.getWindowBounds ||
      !window.desktopApi?.setWindowBounds
    ) {
      return;
    }
    const startBounds = await window.desktopApi.getWindowBounds();
    resizeDragRef.current = {
      direction,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startBounds,
    };
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function renderResizeHandles() {
    if (isSettingsWindow || windowState.isMaximized) {
      return null;
    }
    const handles: { direction: ResizeDirection; className: string }[] = [
      { direction: "n", className: "window-resize-handle edge-n" },
      { direction: "s", className: "window-resize-handle edge-s" },
      { direction: "e", className: "window-resize-handle edge-e" },
      { direction: "w", className: "window-resize-handle edge-w" },
      { direction: "ne", className: "window-resize-handle corner-ne" },
      { direction: "nw", className: "window-resize-handle corner-nw" },
      { direction: "se", className: "window-resize-handle corner-se" },
      { direction: "sw", className: "window-resize-handle corner-sw" },
    ];
    return (
      <div className="window-resize-layer" aria-hidden="true">
        {handles.map((handle) => (
          <div
            key={handle.direction}
            className={handle.className}
            onPointerDown={(event) => {
              void handleResizePointerDown(handle.direction, event);
            }}
          />
        ))}
      </div>
    );
  }

  function renderWindowControls() {
    const controls = isMacPlatform
      ? [
          { key: "close", className: "close", label: uiText("关闭", "Close"), onClick: handleWindowClose },
          { key: "minimize", className: "minimize", label: uiText("最小化", "Minimize"), onClick: handleWindowMinimize },
          {
            key: "maximize",
            className: `maximize ${windowState.isMaximized ? "is-maximized" : ""}`,
            label: windowState.isMaximized ? uiText("还原", "Restore") : uiText("最大化", "Maximize"),
            onClick: handleWindowToggleMaximize,
          },
        ]
      : [
          { key: "minimize", className: "minimize", label: uiText("最小化", "Minimize"), onClick: handleWindowMinimize },
          {
            key: "maximize",
            className: `maximize ${windowState.isMaximized ? "is-maximized" : ""}`,
            label: windowState.isMaximized ? uiText("还原", "Restore") : uiText("最大化", "Maximize"),
            onClick: handleWindowToggleMaximize,
          },
          { key: "close", className: "close", label: uiText("关闭", "Close"), onClick: handleWindowClose },
        ];

    return (
      <div className={`window-controls-card ${isMacPlatform ? "mac-window-controls-card" : ""}`}>
        <div className={`window-controls ${isMacPlatform ? "mac-window-controls" : ""}`}>
          {controls.map((control) => (
            <button
              key={control.key}
              className={`window-control ${control.className} ${isMacPlatform ? "traffic-light" : ""}`}
              type="button"
              aria-label={control.label}
              title={control.label}
              onClick={control.onClick}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderCloseOnlyWindowControls() {
    return (
      <div className={`window-controls-card ${isMacPlatform ? "mac-window-controls-card" : ""}`}>
        <div className={`window-controls ${isMacPlatform ? "mac-window-controls" : ""}`}>
          <button
            className={`window-control close ${isMacPlatform ? "traffic-light" : ""}`}
            type="button"
            aria-label={uiText("关闭", "Close")}
            title={uiText("关闭", "Close")}
            onClick={handleWindowClose}
          />
        </div>
      </div>
    );
  }

  function renderMainTitlebar() {
    if (isMacPlatform) {
      return (
        <header className="window-titlebar mac-window-titlebar">
          <div className="titlebar-side titlebar-side-left">{renderWindowControls()}</div>
          <div className="window-drag-region mac-window-drag-region">
            <div className="window-title-card mac-window-title-card">
              <div className="window-title-stack">
                <span className="window-title-eyebrow">FRIES</span>
                <strong>{state.profile.title}</strong>
                <span className="window-title-subtext">{getDisplayTitle(activeAccount)}</span>
              </div>
            </div>
          </div>
          <div className="titlebar-side titlebar-side-right">
            <div className="window-action-card mac-window-action-card">
              <button
                className="window-action-button icon-only"
                type="button"
                onClick={handleOpenSettingsWindow}
                aria-label={uiText("打开设置", "Open settings")}
                title={uiText("打开设置", "Open settings")}
              >
                <span className="window-gear-icon" aria-hidden="true">
                  ⚙
                </span>
              </button>
            </div>
          </div>
        </header>
      );
    }

    return (
      <header className="window-titlebar">
        <div className="window-drag-region">
          <div className="window-title-card">
            <div className="window-title-stack">
              <span className="window-title-eyebrow">AI OPS</span>
              <strong>{state.profile.title}</strong>
              <span className="window-title-subtext">{getDisplayTitle(activeAccount)}</span>
            </div>
          </div>
        </div>
        <div className="window-action-card">
          <button
            className="window-action-button icon-only"
            type="button"
            onClick={handleOpenSettingsWindow}
            aria-label={uiText("打开设置", "Open settings")}
            title={uiText("打开设置", "Open settings")}
          >
            <span className="window-gear-icon" aria-hidden="true">
              ⚙
            </span>
          </button>
        </div>
        {renderWindowControls()}
      </header>
    );
  }

  function renderSettingsTitlebar() {
    if (isMacPlatform) {
      return (
        <header className="window-titlebar settings-titlebar mac-window-titlebar mac-settings-titlebar">
          <div className="titlebar-side titlebar-side-left">{renderCloseOnlyWindowControls()}</div>
          <div className="window-drag-region mac-window-drag-region">
            <div className="window-title-card mac-window-title-card">
              <div className="window-title-stack">
                <span className="window-title-eyebrow">SETTINGS</span>
                <strong>{uiText("设置", "Settings")}</strong>
                <span className="window-title-subtext">
                  {uiText("同步、主题、数据与账号结构", "Sync, themes, data and account schema")}
                </span>
              </div>
            </div>
          </div>
          <div className="titlebar-side titlebar-side-right titlebar-side-spacer" aria-hidden="true" />
        </header>
      );
    }

    return (
      <header className="window-titlebar settings-titlebar">
        <div className="window-drag-region">
          <div className="window-title-card">
            <div className="window-title-stack">
              <span className="window-title-eyebrow">SETTINGS</span>
              <strong>{uiText("设置", "Settings")}</strong>
              <span className="window-title-subtext">
                {uiText("同步、主题、数据与账号结构", "Sync, themes, data and account schema")}
              </span>
            </div>
          </div>
        </div>
        {renderCloseOnlyWindowControls()}
      </header>
    );
  }

  if (!selected || !activeAccount) {
    return null;
  }

  function renderOverview() {
    return (
      <div className="page">
        <section className="page-section">
          <div className="section-heading">
            <div>
              <span className="section-tag">OVERVIEW</span>
              <h3>当前状态</h3>
            </div>
            <p>这里只保留最关键的 4 项。</p>
          </div>
          <div className="overview-grid">
            <article className="focus-card primary overview-hero">
              <span>{uiText("当前主力号", "Current active")}</span>
              <strong>{getDisplayTitle(activeAccount)}</strong>
              <p>{getDisplaySubtitle(activeAccount)}</p>
              <div className="hero-inline-stats">
                <div>
                  <span>{uiText("最近一轮", "Last sync")}</span>
                  <strong>{compactNumber(activeLiveUsage?.lastTokens)}</strong>
                </div>
                <div>
                  <span>{uiText("累计", "Cumulative")}</span>
                  <strong>{compactNumber(activeLiveUsage?.totalTokens)}</strong>
                </div>
              </div>
              <p className="footnote">
                {uiText("自动同步已开启后，这里只展示当前已识别的主力账号。", "Auto sync is active; this card only shows the current resolved account.")}
              </p>
            </article>

            <article className="focus-card overview-usage">
              <div className="overview-usage-head">
                <div>
                  <span>{uiText("当前流量", "Current usage")}</span>
                  <strong>{uiText("7d / 5h 剩余", "7d / 5h remaining")}</strong>
                </div>
                <small>{`${uiText("同步时间", "Synced at")}：${syncLabel(activeLiveUsage)}`}</small>
              </div>
              <div className="usage-bar-chart">
                {renderUsageBarColumn(
                  "7d",
                  activeLiveUsage?.sevenDay.remainingPercent,
                  `7d 恢复于 ${sevenDayRecoveryLabel(activeAccount)}`,
                  false,
                )}
                {renderUsageBarColumn(
                  "5h",
                  activeLiveUsage?.fiveHour.remainingPercent,
                  `5h 恢复于 ${fiveHourRecoveryLabel(activeAccount)}`,
                  activeWeekBlocked,
                )}
              </div>
            </article>
          </div>

          <div className="overview-mainline-head">
            <div>
              <span className="section-tag">QUEUE</span>
              <h4>{uiText("主线速览", "Mainline queue")}</h4>
            </div>
              <p>{uiText("排序：当前使用 > 5h 可用按剩余降序 > 5h 用尽按恢复时间 > 7d 用尽 > 已过期沉底。", "Order: current > available 5h > 5h recovery > 7d recovery > expired.")}</p>
            </div>

            <div className="overview-mainline-grid">
              {overviewQueue.map((account) => {
                const accountSnapshot = currentSnapshot(account);
                const accountBlocked = currentBlocked(account);
                const accountStatus = currentStatus(account);

                return (
                  <article
                    key={account.id}
                    className={`focus-card overview-seat-card ${account.isActive ? "is-active" : ""} ${
                      accountBlocked ? "is-blocked" : ""
                    } ${accountStatus === "expired" ? "is-expired" : ""}`}
                    style={buildSeatCardStyle(account)}
                  >
                  <div className="overview-seat-head">
                    <div>
                      <strong>{getDisplayTitle(account)}</strong>
                      <div className="overview-seat-subtitles">
                        <span>{account.email || "未记录邮箱"}</span>
                        {workspaceNameLabel(account) ? <span>{workspaceNameLabel(account)}</span> : null}
                      </div>
                    </div>
                    <span className={`status-pill ${accountStatus}`}>{statusLabel(accountStatus, locale)}</span>
                  </div>

                  <div className="overview-seat-meter">
                    <div className={`overview-meter-stack ${accountBlocked ? "is-blocked" : ""}`}>
                      <div className="overview-meter-label">
                        <span>
                          {accountBlocked
                            ? "周窗已用尽"
                            : `周 ${formatPercent(accountSnapshot?.sevenDay.remainingPercent)} · 5h ${formatPercent(accountSnapshot?.fiveHour.remainingPercent)}`}
                        </span>
                        {accountBlocked ? <strong>暂停</strong> : null}
                      </div>
                      {renderLinkedWindowMeter(
                        accountSnapshot?.fiveHour.remainingPercent,
                        accountSnapshot?.sevenDay.remainingPercent,
                        accountBlocked,
                      )}
                    </div>
                  </div>

                  <div className="overview-seat-meta">
                    <div>
                      <span>5h 恢复于</span>
                      <strong>{fiveHourRecoveryLabel(account)}</strong>
                    </div>
                    <div>
                      <span>7d 恢复于</span>
                      <strong>{sevenDayRecoveryLabel(account)}</strong>
                    </div>
                    <div>
                      <span>订阅到期</span>
                      <strong>{subscriptionExpiryLabel(account)}</strong>
                    </div>
                    <div>
                      <span>同步时间</span>
                      <strong>{syncLabel(accountSnapshot)}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  function renderAnalytics() {
    const trendTotal = tokenTrend.reduce((sum, item) => sum + item.tokens, 0);
    const tokenMax = Math.max(1, ...tokenRanking.map((item) => item.tokens));

    return (
      <Suspense fallback={<div className="page"><section className="page-section"><div className="chart-card"><p>{uiText("正在加载分析面板…", "Loading analytics…")}</p></div></section></div>}>
        <AnalyticsPage
          uiText={uiText}
          locale={state.settings.locale}
          analyticsRange={state.settings.analyticsRange}
          heatmapScope={state.settings.heatmapScope}
          themeMode={state.settings.themeMode}
          themePreset={state.settings.themePreset}
          visualEffectMode={state.settings.visualEffectMode}
          updateSettings={updateSettings}
          openAiChartData={openAiChartData}
          statusPie3dSlices={statusPie3dSlices}
          statusSegments={statusSegments}
          statusLabel={statusLabel}
          trendTotal={trendTotal}
          tokenTrend={tokenTrend}
          tokenRanking={tokenRanking}
          tokenMax={tokenMax}
          compactNumber={compactNumber}
          buildMeterTone={buildMeterTone}
          heatmapYearCursor={heatmapYearCursor}
          heatmapMonthCursor={heatmapMonthCursor}
          setHeatmapYearCursor={setHeatmapYearCursor}
          setHeatmapMonthCursor={setHeatmapMonthCursor}
          selectableYears={selectableYears}
          selectableMonths={selectableMonths}
          heatmapMonthView={heatmapMonthView}
          heatmapYearView={heatmapYearView}
        />
      </Suspense>
    );
  }

  function renderOpenAi() {
    return (
      <div className="page">
        <section className="page-section">
          <div className="section-heading">
            <div>
              <span className="section-tag">OPENAI</span>
              <h3>主线账号</h3>
            </div>
            <p>{openaiAccounts.length} 个座位，像节点列表一样看就行。</p>
          </div>
          <div className="openai-shell">
            <div className="node-list">
              {openaiAccounts.map((account) => {
                const accountSnapshot = currentSnapshot(account);
                const accountStatus = currentStatus(account);

                return (
                  <button
                    key={account.id}
                    className={`node-row ${account.isActive ? "is-active" : ""} ${
                      selectedOpenAi.id === account.id ? "is-selected" : ""
                    }`}
                    onClick={() => setSelectedId(account.id)}
                    type="button"
                  >
                    <div className="node-main">
                      <div className="node-head">
                        <strong>{getDisplayTitle(account)}</strong>
                        <span className={`status-pill ${accountStatus}`}>{statusLabel(accountStatus, locale)}</span>
                      </div>
                      <span className="node-subtitle">{getDisplaySubtitle(account)}</span>
                    </div>

                    <div className="node-stats">
                      <div>
                        <span>7d</span>
                        <strong>{formatPercent(accountSnapshot?.sevenDay.remainingPercent)}</strong>
                      </div>
                      <div>
                        <span>5h</span>
                        <strong>{formatPercent(accountSnapshot?.fiveHour.remainingPercent)}</strong>
                      </div>
                    </div>

                    <div className="node-tail">
                      <small>{recoveryLabel(account)}</small>
                      <span>{subscriptionExpiryLabel(account)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <aside className="node-detail-panel">
              {(() => {
                const selectedSnapshot = currentSnapshot(selectedOpenAi);
                const selectedStatus = currentStatus(selectedOpenAi);

                return (
                  <>
              <span className="section-tag">SELECTED</span>
              <h3>{getDisplayTitle(selectedOpenAi)}</h3>
              <p>{getDisplaySubtitle(selectedOpenAi)}</p>

              <dl className="node-detail-list">
                <div>
                  <dt>实际 workspace</dt>
                  <dd>{selectedOpenAi.workspace ?? "未记录"}</dd>
                </div>
                <div>
                  <dt>7d</dt>
                  <dd>{formatWindowSummary(selectedSnapshot?.sevenDay)}</dd>
                </div>
                <div>
                  <dt>5h</dt>
                  <dd>{formatWindowSummary(selectedSnapshot?.fiveHour)}</dd>
                </div>
                <div>
                  <dt>5h 恢复于</dt>
                  <dd>{fiveHourRecoveryLabel(selectedOpenAi)}</dd>
                </div>
                <div>
                  <dt>7d 恢复于</dt>
                  <dd>{sevenDayRecoveryLabel(selectedOpenAi)}</dd>
                </div>
                <div>
                  <dt>订阅有效期</dt>
                  <dd>{subscriptionExpiryLabel(selectedOpenAi)}</dd>
                </div>
                <div>
                  <dt>同步时间</dt>
                  <dd>{syncLabel(selectedSnapshot)}</dd>
                </div>
                <div>
                  <dt>源时间</dt>
                  <dd>{sourceSyncLabel(selectedSnapshot)}</dd>
                </div>
                <div>
                  <dt>当前状态</dt>
                  <dd>{statusLabel(selectedStatus, locale)}</dd>
                </div>
              </dl>

              <p className="node-detail-note">{displayStatusDetail(selectedOpenAi, clockNow)}</p>
              <p className="node-detail-note node-detail-note--heuristic">
                {uiText(
                  "按当前实测：Codex / GPT-5.4 xhigh thinking 下，ChatGPT Plus 与 Team/Business 基本都可按 5h 满额 ≈ 7d 30% 理解。",
                  "Empirical rule: under Codex / GPT-5.4 xhigh thinking, ChatGPT Plus and Team/Business can usually be read as 5h full quota ≈ 7d 30%.",
                )}
              </p>
              {selectedOpenAi.usageHistory?.length ? (
                <div className="node-history">
                  <span className="section-tag">HISTORY</span>
                  <div className="node-history-list">
                    {selectedOpenAi.usageHistory.slice(0, 4).map((entry) => (
                      <div key={entry.id} className="node-history-item">
                        <strong>{syncLabel(entry.snapshot)}</strong>
                        <small>
                          {`5h ${formatPercent(entry.snapshot.fiveHour.remainingPercent)} · 7d ${formatPercent(
                            entry.snapshot.sevenDay.remainingPercent,
                          )}`}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="inline-actions">
                <button onClick={() => handleSetActive(selectedOpenAi.id)}>设为当前号</button>
                <button onClick={() => handleSetActiveAndSync(selectedOpenAi.id)}>切到这里并同步</button>
                <button className="ghost" onClick={() => setView("settings")}>
                  看设置
                </button>
              </div>
                  </>
                );
              })()}
            </aside>
          </div>
        </section>
      </div>
    );
  }

  function renderProviders() {
    return (
      <Suspense fallback={<div className="page page--placeholder"><section className="page-section"><p>Loading providers…</p></section></div>}>
        <ProvidersPage
          observerAccounts={observerAccounts}
          apiAccounts={apiAccounts}
          selectedId={selected.id}
          locale={locale}
          uiText={uiText}
          statusLabel={statusLabel}
          getDisplayTitle={getDisplayTitle}
          compactNumber={compactNumber}
          onSelect={setSelectedId}
        />
      </Suspense>
    );
  }

  function renderTimeline() {
    return (
      <Suspense fallback={<div className="page page--placeholder"><section className="page-section"><p>Loading timeline…</p></section></div>}>
        <TimelinePage
          uiText={uiText}
          locale={locale}
          clockNow={clockNow}
          accounts={state.accounts}
          timelineLog={state.timelineLog}
          timelineScope={state.settings.timelineScope}
          updateSettings={updateSettings}
          getDisplayTitle={getDisplayTitle}
          workspaceNameLabel={workspaceNameLabel}
        />
      </Suspense>
    );
  }

  function renderSettings() {
    return (
      <Suspense fallback={<div className="page page--placeholder"><section className="page-section"><p>Loading settings…</p></section></div>}>
        <SettingsPage
          uiText={uiText}
          settings={state.settings}
          accounts={state.accounts}
          dataPaths={dataPaths}
          storagePath={storagePath}
          savedAt={savedAt}
          desktopMode={window.desktopMeta?.isPackaged ? uiText("发布版", "Packaged") : uiText("开发模式", "Development")}
          platform={window.desktopMeta?.platform ?? "web"}
          snapshotsCount={snapshots.length}
          syncBusy={syncBusy}
          selfCheckBusy={selfCheckBusy}
          selfCheckReport={selfCheckReport}
          appVersion={APP_VERSION}
          appChineseName={APP_CHINESE_NAME}
          updateSettings={updateSettings}
          handleOpenDataFile={handleOpenDataFile}
          handleOpenDataDir={handleOpenDataDir}
          handleOpenSnapshotsDir={handleOpenSnapshotsDir}
          handleOpenMemoryFile={handleOpenMemoryFile}
          handleOpenTimelineLogsDir={handleOpenTimelineLogsDir}
          handleSyncMemoryNow={handleSyncMemoryNow}
          handleExport={handleExport}
          handleImportClick={handleImportClick}
          openAccountEditor={openAccountEditor}
          handleDeleteAccount={handleDeleteAccount}
          syncNow={() => syncCodexUsage(true)}
          runSelfCheck={handleRunSelfCheck}
          refreshSnapshots={refreshSnapshots}
          clearOpenAiCache={handleClearOpenAiCache}
          handleReset={handleReset}
          getDisplayTitle={getDisplayTitle}
          workspaceNameLabel={workspaceNameLabel}
          subscriptionExpiryLabel={subscriptionExpiryLabel}
        />
      </Suspense>
    );
  }

  return (
    <div
      className={`window-root platform-${desktopPlatform} ${isSettingsWindow ? "settings-window-root" : ""}`}
      data-platform={desktopPlatform}
    >
      {!isSettingsWindow && renderResizeHandles()}
      {isSettingsWindow ? (
        <>
          {renderSettingsTitlebar()}
          <main className="settings-window-content">
            {renderSettings()}
            <input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept="application/json"
              onChange={handleImport}
            />
          </main>
        </>
      ) : (
        <>
          {renderMainTitlebar()}
          <div className="shell">
            <aside className="sidebar">
              <div className="brand-block">
                <span className="brand-tag">AI OPS</span>
                <h1>{state.profile.title}</h1>
                <p>更轻的本地流量控制台</p>
              </div>

              <nav className="nav-stack">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    className={`nav-item ${view === item.id ? "active" : ""}`}
                    onClick={() => setView(item.id)}
                    type="button"
                  >
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </button>
                ))}
              </nav>
            </aside>

            <main className={`content ${view === "timeline" ? "content--timeline" : ""}`}>
              {view === "overview" && renderOverview()}
              {view === "analytics" && renderAnalytics()}
              {view === "providers" && renderProviders()}
              {view === "timeline" && renderTimeline()}

              <input
                ref={importInputRef}
                className="hidden-input"
                type="file"
                accept="application/json"
                onChange={handleImport}
              />
            </main>
          </div>

          <footer className="statusbar">
            <div className="statusbar-group">
              <span className="statusbar-item">
                <strong>{getDisplayTitle(activeAccount)}</strong>
              </span>
              <span className="statusbar-item">{`7d ${formatPercent(activeLiveUsage?.sevenDay.remainingPercent)}`}</span>
              <span className="statusbar-item">{`5h ${formatPercent(activeLiveUsage?.fiveHour.remainingPercent)}`}</span>
            </div>
            <div className="statusbar-group">
              <span className="statusbar-item">{`${uiText("本地自动保存", "Auto saved")}：${savedAt}`}</span>
              <span className="statusbar-item">{`${uiText("运行状态", "Runtime")}：${desktopMode} · ${window.desktopMeta?.platform ?? "web-shell"}`}</span>
              <button className="statusbar-button" type="button" onClick={handleOpenDataFile}>
                {uiText("打开数据文件", "Open data file")}
              </button>
            </div>
          </footer>
        </>
      )}

      {editorOpen ? (
        <div className="sync-choice-overlay">
          <section className="sync-choice-dialog settings-editor-dialog">
            <div className="sync-choice-head">
              <span className="section-tag">ACCOUNT</span>
              <h3>{editingAccountId ? uiText("编辑账号", "Edit account") : uiText("新增账号", "Add account")}</h3>
              <p>{uiText("通过 UI 管理账号与备注，不需要手写 JSON。", "Manage accounts from UI without hand editing JSON.")}</p>
            </div>

            <div className="field-grid">
              <label className="field">
                {uiText("产品", "Product")}
                <select
                  value={editorDraft.productKey}
                  onChange={(event) => {
                    const nextProductKey = event.target.value as AccountProduct;
                    const fallbackPlan = PRODUCT_CONFIG[nextProductKey].plans[0]?.value ?? "custom";
                    setEditorDraft((current) => ({
                      ...current,
                      productKey: nextProductKey,
                      tierKey: nextProductKey === "custom" ? "custom" : fallbackPlan,
                      teamMode: nextProductKey === "chatgpt" && fallbackPlan === "business" ? current.teamMode : "none",
                      workspace:
                        nextProductKey === "chatgpt" && fallbackPlan === "business" && current.teamMode === "team"
                          ? current.workspace
                          : "",
                    }));
                  }}
                >
                  {PRODUCT_PICKER_OPTIONS.map((productKey) => (
                    <option key={productKey} value={productKey}>
                      {uiText(PRODUCT_CONFIG[productKey].label.zh, PRODUCT_CONFIG[productKey].label.en)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {uiText("套餐", "Plan")}
                {editorDraft.productKey === "custom" ? (
                  <input
                    value={editorDraft.customPlanName}
                    onChange={(event) => setEditorDraft((current) => ({ ...current, customPlanName: event.target.value }))}
                    placeholder={uiText("例如：GLM-4.5 包月 / API 流量包", "For example: GLM-4.5 monthly / API quota")}
                  />
                ) : (
                  <select
                    value={editorDraft.tierKey}
                    onChange={(event) => {
                      const nextTierKey = event.target.value;
                      setEditorDraft((current) => ({
                        ...current,
                        tierKey: nextTierKey,
                        teamMode:
                          current.productKey === "chatgpt" && nextTierKey === "business" ? current.teamMode : "none",
                        workspace:
                          current.productKey === "chatgpt" && nextTierKey === "business" && current.teamMode === "team"
                            ? current.workspace
                            : "",
                      }));
                    }}
                  >
                    {PRODUCT_CONFIG[editorDraft.productKey].plans.map((plan) => (
                      <option key={plan.value} value={plan.value}>
                        {uiText(plan.label.zh, plan.label.en)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="field">
                Email
                <input
                  value={editorDraft.email}
                  onChange={(event) => setEditorDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="field checkbox-field">
                <span>{uiText("观察位", "Watchlist")}</span>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={editorDraft.observe}
                    onChange={(event) => setEditorDraft((current) => ({ ...current, observe: event.target.checked }))}
                  />
                  <span>{uiText("是", "Yes")}</span>
                </label>
              </label>
              {editorDraft.productKey === "chatgpt" ? (
                <label className="field">
                  {uiText("团队账号", "Team account")}
                  <select
                    disabled={editorDraft.tierKey !== "business"}
                    value={editorDraft.tierKey === "business" ? editorDraft.teamMode : "none"}
                    onChange={(event) => {
                      const nextTeamMode = event.target.value as TeamMode;
                      setEditorDraft((current) => ({
                        ...current,
                        teamMode: nextTeamMode,
                        workspace: nextTeamMode === "team" ? current.workspace : "",
                      }));
                    }}
                  >
                    <option value="none">{uiText("否", "No")}</option>
                    <option value="team">{uiText("是", "Yes")}</option>
                  </select>
                </label>
              ) : null}
              {editorDraft.productKey === "custom" ? (
                <label className="field">
                  {uiText("自定义产品", "Custom product")}
                  <input
                    list="custom-product-options"
                    value={editorDraft.customProductName}
                    onChange={(event) =>
                      setEditorDraft((current) => ({ ...current, customProductName: event.target.value }))
                    }
                    placeholder={uiText("例如：GLM / MiniMax / Qwen", "For example: GLM / MiniMax / Qwen")}
                  />
                  <datalist id="custom-product-options">
                    {CUSTOM_PRODUCT_SUGGESTIONS.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
              ) : null}
              <label className="field">
                {uiText("标题", "Title")}
                <input
                  value={editorDraft.accountLabel}
                  onChange={(event) => setEditorDraft((current) => ({ ...current, accountLabel: event.target.value }))}
                  placeholder={uiText("可留空，系统会自动生成", "Optional, auto generated if empty")}
                />
              </label>
              {editorDraft.teamMode === "team" ? (
                <label className="field">
                  {uiText("团队名", "Workspace")}
                  <input
                    value={editorDraft.workspace ?? ""}
                    onChange={(event) => setEditorDraft((current) => ({ ...current, workspace: event.target.value }))}
                  />
                </label>
              ) : null}
              <label className="field">
                {uiText("账面到期", "Fallback expiry")}
                <input
                  value={editorDraft.expiryAt ?? ""}
                  onChange={(event) => setEditorDraft((current) => ({ ...current, expiryAt: event.target.value }))}
                />
              </label>
              <label className="field">
                {uiText("成本说明", "Cost label")}
                <input
                  value={editorDraft.costLabel ?? ""}
                  onChange={(event) => setEditorDraft((current) => ({ ...current, costLabel: event.target.value }))}
                />
              </label>
            </div>

            <label className="field full">
              {uiText("备注", "Notes")}
              <textarea
                rows={6}
                value={editorDraft.notesText}
                onChange={(event) => setEditorDraft((current) => ({ ...current, notesText: event.target.value }))}
              />
            </label>

            <div className="inline-actions wide">
              <button onClick={handleSaveAccountEditor}>{uiText("保存", "Save")}</button>
              <button className="ghost" onClick={() => setEditorOpen(false)}>{uiText("取消", "Cancel")}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
