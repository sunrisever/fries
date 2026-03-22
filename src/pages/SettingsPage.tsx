import type {
  AccountRecord,
  DashboardSettings,
  DataPaths,
  LocaleMode,
  SelfCheckReport,
  HeatmapThresholdMode,
  ThemeMode,
  ThemePreset,
  VisualEffectMode,
} from "../types";

type SettingsPageProps = {
  uiText: (zh: string, en: string) => string;
  settings: DashboardSettings;
  accounts: AccountRecord[];
  dataPaths: DataPaths | null;
  storagePath: string;
  savedAt: string;
  desktopMode: string;
  platform: string;
  snapshotsCount: number;
  syncBusy: boolean;
  selfCheckBusy: boolean;
  selfCheckReport: SelfCheckReport | null;
  appVersion: string;
  appChineseName: string;
  updateSettings: (patch: Partial<DashboardSettings>) => void;
  handleOpenDataFile: () => void;
  handleOpenDataDir: () => void;
  handleOpenSnapshotsDir: () => void;
  handleOpenMemoryFile: () => void;
  handleOpenTimelineLogsDir: () => void;
  handleSyncMemoryNow: () => Promise<void>;
  handleExport: () => void;
  handleImportClick: () => void;
  openAccountEditor: (account?: AccountRecord) => void;
  handleDeleteAccount: (id: string) => void;
  syncNow: () => Promise<void>;
  runSelfCheck: () => Promise<void>;
  refreshSnapshots: () => Promise<void>;
  clearOpenAiCache: () => Promise<void>;
  handleReset: () => void;
  getDisplayTitle: (account: AccountRecord) => string;
  workspaceNameLabel: (account: AccountRecord) => string | undefined;
  subscriptionExpiryLabel: (account: AccountRecord) => string;
};

export default function SettingsPage({
  uiText,
  settings,
  accounts,
  dataPaths,
  storagePath,
  savedAt,
  desktopMode,
  platform,
  snapshotsCount,
  syncBusy,
  selfCheckBusy,
  selfCheckReport,
  appVersion,
  appChineseName,
  updateSettings,
  handleOpenDataFile,
  handleOpenDataDir,
  handleOpenSnapshotsDir,
  handleOpenMemoryFile,
  handleOpenTimelineLogsDir,
  handleSyncMemoryNow,
  handleExport,
  handleImportClick,
  openAccountEditor,
  handleDeleteAccount,
  syncNow,
  runSelfCheck,
  refreshSnapshots,
  clearOpenAiCache,
  handleReset,
  getDisplayTitle,
  workspaceNameLabel,
  subscriptionExpiryLabel,
}: SettingsPageProps) {
  return (
    <div className="page">
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">SETTINGS</span>
            <h3>{uiText("设置", "Settings")}</h3>
          </div>
          <p>{uiText("同步、主题、语言、缓存和数据路径都收在这里。", "Sync, theme, language, cache and data paths.")}</p>
        </div>

        <div className="settings-option-grid">
          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("界面语言", "Language")}</span>
            <small>{uiText("切换中英文界面。", "Switch between Chinese and English.")}</small>
            <select value={settings.locale} onChange={(event) => updateSettings({ locale: event.target.value as LocaleMode })}>
              <option value="zh-CN">简体中文</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("主题", "Theme")}</span>
            <small>{uiText("决定明暗模式。", "Choose light, dark, or follow system.")}</small>
            <select value={settings.themeMode} onChange={(event) => updateSettings({ themeMode: event.target.value as ThemeMode })}>
              <option value="system">{uiText("跟随系统", "Follow system")}</option>
              <option value="light">{uiText("浅色", "Light")}</option>
              <option value="dark">{uiText("深色", "Dark")}</option>
            </select>
          </label>

          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("配色方案", "Palette")}</span>
            <small>{uiText("主题中的强调色。", "Accent palette for charts and buttons.")}</small>
            <select value={settings.themePreset} onChange={(event) => updateSettings({ themePreset: event.target.value as ThemePreset })}>
              <option value="nordic-blue">{uiText("北欧蓝", "Nordic blue")}</option>
              <option value="sea-salt">{uiText("海盐灰蓝", "Sea salt")}</option>
              <option value="vital-orange">{uiText("活力橙", "Vital orange")}</option>
              <option value="retro-amber">{uiText("复古橙", "Retro amber")}</option>
              <option value="rose-red">{uiText("玫瑰红", "Rose red")}</option>
              <option value="lemon-lime">{uiText("柠檬绿", "Lemon lime")}</option>
              <option value="flamingo">{uiText("火烈鸟", "Flamingo")}</option>
              <option value="violet">{uiText("紫罗兰", "Violet")}</option>
              <option value="lavender">{uiText("薰衣草", "Lavender")}</option>
              <option value="peach-pink">{uiText("桃红", "Peach pink")}</option>
              <option value="sakura-pink">{uiText("樱花粉", "Sakura pink")}</option>
            </select>
          </label>

          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("界面效果", "Visual effect")}</span>
            <small>{uiText("透明与纯色两种界面风格。", "Choose between frosted and solid UI.")}</small>
            <select
              value={settings.visualEffectMode}
              onChange={(event) => updateSettings({ visualEffectMode: event.target.value as VisualEffectMode })}
            >
              <option value="frosted">{uiText("透明 / Frosted", "Transparent / Frosted")}</option>
              <option value="solid">{uiText("纯色 / Solid", "Opaque / Solid")}</option>
            </select>
          </label>

          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("性能模式", "Performance mode")}</span>
            <small>
              {uiText(
                "减少透明、阴影和动画开销，纯色主题会走更轻的渲染路径。",
                "Reduce transparency, shadow, and animation cost for a lighter solid-theme path.",
              )}
            </small>
            <select
              value={settings.performanceMode ? "on" : "off"}
              onChange={(event) => updateSettings({ performanceMode: event.target.value === "on" })}
            >
              <option value="off">{uiText("关闭", "Off")}</option>
              <option value="on">{uiText("开启", "On")}</option>
            </select>
          </label>

          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("自动同步", "Auto sync")}</span>
            <small>{uiText("启动后自动读取本机 Codex 状态。", "Auto-read local Codex usage on launch.")}</small>
            <select
              value={settings.autoSyncOnLaunch ? "yes" : "no"}
              onChange={(event) => updateSettings({ autoSyncOnLaunch: event.target.value === "yes" })}
            >
              <option value="yes">{uiText("开启", "Enabled")}</option>
              <option value="no">{uiText("关闭", "Disabled")}</option>
            </select>
          </label>

          <label className={`settings-option-card ${settings.autoSyncOnLaunch ? "" : "is-disabled"}`}>
            <span className="settings-option-title">{uiText("自动同步周期", "Sync interval")}</span>
            <small>
              {settings.autoSyncOnLaunch
                ? uiText("开启自动同步后，每隔多少分钟同步一次。", "Minutes between automatic sync runs.")
                : uiText("需先开启自动同步。", "Enable auto sync first.")}
            </small>
            <input
              type="number"
              min={1}
              max={60}
              disabled={!settings.autoSyncOnLaunch}
              value={settings.syncIntervalMinutes}
              onChange={(event) => updateSettings({ syncIntervalMinutes: Number(event.target.value || 1) })}
            />
          </label>

          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("缓存自动清理", "Cache retention")}</span>
            <small>{uiText("超过保留期的快照会自动删除。", "Snapshots older than this are pruned automatically.")}</small>
            <select
              value={settings.snapshotRetentionDays}
              onChange={(event) => updateSettings({ snapshotRetentionDays: Number(event.target.value) })}
            >
              {[7, 14, 30].map((days) => (
                <option key={days} value={days}>
                  {uiText(`${days} 天`, `${days} days`)}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-option-card">
            <span className="settings-option-title">{uiText("热力图阈值", "Heatmap thresholds")}</span>
            <small>
              {uiText(
                "自动阈值会按历史日消耗分布重新标定；固定阈值便于跨时间比较。",
                "Auto thresholds adapt to historical daily usage; fixed thresholds are better for long-term comparison.",
              )}
            </small>
            <select
              value={settings.heatmapThresholdMode}
              onChange={(event) => updateSettings({ heatmapThresholdMode: event.target.value as HeatmapThresholdMode })}
            >
              <option value="auto">{uiText("自动阈值", "Auto thresholds")}</option>
              <option value="fixed">{uiText("固定阈值", "Fixed thresholds")}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">DATA</span>
            <h3>{uiText("数据目录", "Data paths")}</h3>
          </div>
        </div>

        <div className="detail-grid">
          <article className="detail-card path-card">
            <span>{uiText("状态文件", "State file")}</span>
            <strong>subscriptions.json</strong>
            <p>{dataPaths?.stateFile ?? storagePath}</p>
            <div className="inline-actions">
              <button className="ghost" onClick={handleOpenDataFile}>{uiText("打开文件", "Open file")}</button>
            </div>
          </article>
          <article className="detail-card path-card">
            <span>{uiText("快照目录", "Snapshots")}</span>
            <strong>{uiText("统一快照缓存", "Unified snapshot cache")}</strong>
            <p>{dataPaths?.snapshotsDir ?? uiText("未读取", "Unavailable")}</p>
            <small>{dataPaths?.snapshotIndexCacheFile ?? uiText("未读取索引缓存", "Snapshot index cache unavailable")}</small>
            <div className="inline-actions">
              <button className="ghost" onClick={handleOpenSnapshotsDir}>{uiText("打开目录", "Open folder")}</button>
            </div>
          </article>
          <article className="detail-card path-card">
            <span>{uiText("导入目录", "Imports")}</span>
            <strong>{uiText("手动导入数据", "Manual imports")}</strong>
            <p>{dataPaths?.importsDir ?? uiText("未读取", "Unavailable")}</p>
            <div className="inline-actions">
              <button className="ghost" onClick={handleOpenDataDir}>{uiText("打开目录", "Open folder")}</button>
            </div>
          </article>
          <article className="detail-card path-card">
            <span>Memory</span>
            <strong>accounts.md</strong>
            <p>{dataPaths?.memoryFile ?? uiText("未读取", "Unavailable")}</p>
            <div className="inline-actions">
              <button className="ghost" onClick={handleOpenMemoryFile}>{uiText("打开文件", "Open file")}</button>
              <button onClick={() => void handleSyncMemoryNow()}>{uiText("写回 OpenAI 到期", "Write OpenAI expiry")}</button>
            </div>
          </article>
          <article className="detail-card path-card">
            <span>{uiText("时间线日志", "Timeline log")}</span>
            <strong>timeline-events.json</strong>
            <p>{dataPaths?.timelineLogFile ?? uiText("未读取", "Unavailable")}</p>
            <small>{dataPaths?.timelineLogsDir ?? uiText("未读取日志目录", "Timeline log folder unavailable")}</small>
            <div className="inline-actions">
              <button className="ghost" onClick={handleOpenTimelineLogsDir}>{uiText("打开目录", "Open folder")}</button>
            </div>
          </article>
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">ROUTING</span>
            <h3>{uiText("自动识别字段", "Auto-routing fields")}</h3>
          </div>
          <p>
            {uiText(
              "同邮箱下不同 Team 的自动归属，优先依赖 subscriptionActiveUntil（秒级）来区分。",
              "For same-email Teams, auto-routing primarily relies on second-level subscriptionActiveUntil.",
            )}
          </p>
        </div>

        <div className="detail-grid">
          <article className="detail-card">
            <span>accountEmail</span>
            <strong>{uiText("登录邮箱", "Signed-in email")}</strong>
            <p>{uiText("先按邮箱缩小候选范围。", "Used as the first candidate filter.")}</p>
          </article>
          <article className="detail-card">
            <span>liveUsage.subscriptionActiveUntil</span>
            <strong>{uiText("登录态订阅有效期", "Live subscription expiry")}</strong>
            <p>
              {uiText(
                "来自当前 Codex 登录态，精确到秒；同邮箱下几乎可以唯一识别 Team。",
                "Read from the current Codex auth state and precise to seconds; usually unique within one email.",
              )}
            </p>
          </article>
          <article className="detail-card">
            <span>plan</span>
            <strong>{uiText("套餐类型", "Plan")}</strong>
            <p>{uiText("作为辅助约束，避免 Plus / Team / Pro 串号。", "Secondary constraint to avoid cross-plan contamination.")}</p>
          </article>
          <article className="detail-card">
            <span>workspace</span>
            <strong>{uiText("团队名 / Workspace", "Workspace / team name")}</strong>
            <p>{uiText("主要用于人工核对和设置页展示。", "Mainly for visual verification and settings display.")}</p>
          </article>
          <article className="detail-card">
            <span>sourceSyncedAt</span>
            <strong>{uiText("源时间", "Source synced at")}</strong>
            <p>{uiText("Codex 日志里原始返回的时间，不直接作为主显示时间。", "Raw timestamp from Codex logs; not used as the primary sync label.")}</p>
          </article>
          <article className="detail-card">
            <span>recordedAt</span>
            <strong>{uiText("本地写入时间", "Recorded at")}</strong>
            <p>{uiText("仪表盘真正展示的同步时间，以本地写入快照时刻为准。", "The dashboard-facing sync time, recorded when the snapshot is written locally.")}</p>
          </article>
          <article className="detail-card">
            <span>fiveHour.usedPercent</span>
            <strong>{uiText("5h 已使用", "5h used")}</strong>
            <p>{uiText("当前 5 小时窗口已经消耗的比例。", "Percent already consumed in the current 5-hour window.")}</p>
          </article>
          <article className="detail-card">
            <span>fiveHour.remainingPercent</span>
            <strong>{uiText("5h 剩余", "5h remaining")}</strong>
            <p>{uiText("当前 5 小时窗口还剩多少。", "How much remains in the current 5-hour window.")}</p>
          </article>
          <article className="detail-card">
            <span>fiveHour.resetsAt</span>
            <strong>{uiText("5h 恢复时间", "5h resets at")}</strong>
            <p>{uiText("下一次 5 小时窗口恢复的时间。", "The next reset time for the 5-hour window.")}</p>
          </article>
          <article className="detail-card">
            <span>sevenDay.usedPercent</span>
            <strong>{uiText("7d 已使用", "7d used")}</strong>
            <p>{uiText("当前 7 天窗口已经消耗的比例。", "Percent already consumed in the current 7-day window.")}</p>
          </article>
          <article className="detail-card">
            <span>sevenDay.remainingPercent</span>
            <strong>{uiText("7d 剩余", "7d remaining")}</strong>
            <p>{uiText("当前 7 天窗口还剩多少。", "How much remains in the current 7-day window.")}</p>
          </article>
          <article className="detail-card">
            <span>sevenDay.resetsAt</span>
            <strong>{uiText("7d 恢复时间", "7d resets at")}</strong>
            <p>{uiText("下一次 7 天窗口恢复的时间。", "The next reset time for the 7-day window.")}</p>
          </article>
          <article className="detail-card">
            <span>totalTokens</span>
            <strong>{uiText("累计 Token", "Total tokens")}</strong>
            <p>{uiText("当前这份本地快照上下文里的累计 token 参考值。", "Cumulative token reference inside the current local snapshot context.")}</p>
          </article>
          <article className="detail-card">
            <span>lastTokens</span>
            <strong>{uiText("最近一轮 Token", "Last tokens")}</strong>
            <p>{uiText("最近一次交互或最近一轮任务消耗的 token。", "Tokens consumed by the latest turn or task.")}</p>
          </article>
          <article className="detail-card">
            <span>syncedAt(recorded/source)</span>
            <strong>{uiText("同步时间", "Synced at")}</strong>
            <p>{uiText("主显示用 recordedAt，详情里额外保留 sourceSyncedAt。", "Primary UI uses recordedAt while sourceSyncedAt stays available in details.")}</p>
          </article>
          <article className="detail-card detail-card--wide">
            <span>quotaHeuristic</span>
            <strong>{uiText("窗口经验换算", "Quota heuristic")}</strong>
            <p>
              {uiText(
                "当前实测经验：在 Codex / GPT-5.4 xhigh thinking 下，ChatGPT Plus 与 Team/Business 基本都可按 5h 满额 ≈ 7d 30% 理解。这是经验口径，不是官方硬规则。",
                "Current empirical rule: under Codex / GPT-5.4 xhigh thinking, ChatGPT Plus and Team/Business can usually be interpreted as 5h full quota ≈ 7d 30%. This is a working heuristic, not an official hard limit.",
              )}
            </p>
          </article>
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">ACCOUNTS</span>
            <h3>{uiText("账号管理", "Accounts")}</h3>
          </div>
          <div className="inline-actions">
            <button onClick={() => openAccountEditor()}>{uiText("新增账号", "Add account")}</button>
            <button className="ghost" onClick={handleExport}>{uiText("导出 JSON", "Export JSON")}</button>
            <button className="ghost" onClick={handleImportClick}>{uiText("导入 JSON", "Import JSON")}</button>
          </div>
        </div>

        <div className="settings-account-list">
          {accounts.map((account) => (
            <article key={account.id} className="settings-account-card">
              <div className="settings-account-main">
                <strong>{getDisplayTitle(account)}</strong>
                <p className="settings-account-line">{account.email || "未记录邮箱"}</p>
                {workspaceNameLabel(account) ? <p className="settings-account-line">{workspaceNameLabel(account)}</p> : null}
                <small>{`${account.plan} · ${uiText("到期", "Expiry")}: ${subscriptionExpiryLabel(account)}`}</small>
                <small>
                  {uiText("登录态有效期", "Live expiry")}:{" "}
                  {account.liveUsage?.subscriptionActiveUntil ?? uiText("待同步", "Pending sync")}
                </small>
              </div>
              <div className="settings-account-actions">
                <button className="ghost small" onClick={() => openAccountEditor(account)}>{uiText("编辑", "Edit")}</button>
                <button className="ghost small" onClick={() => handleDeleteAccount(account.id)}>{uiText("删除", "Delete")}</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">MAINTENANCE</span>
            <h3>{uiText("维护操作", "Maintenance")}</h3>
          </div>
        </div>
        <div className="inline-actions wide">
          <button onClick={() => void syncNow()} disabled={syncBusy}>
            {syncBusy ? uiText("同步中...", "Syncing...") : uiText("立即同步", "Sync now")}
          </button>
          <button className="ghost" onClick={() => void runSelfCheck()} disabled={selfCheckBusy}>
            {selfCheckBusy ? uiText("自检中...", "Checking...") : uiText("运行自检", "Run self-check")}
          </button>
          <button className="ghost" onClick={() => void refreshSnapshots()}>{uiText("刷新快照列表", "Reload snapshots")}</button>
          <button className="ghost" onClick={() => void clearOpenAiCache()}>{uiText("清空 OpenAI 快照与 token 累计", "Clear OpenAI snapshots and token totals")}</button>
          <button className="ghost" onClick={handleReset}>{uiText("恢复默认样例", "Reset sample data")}</button>
        </div>
        {selfCheckReport ? (
          <div className="detail-grid">
            <article className="detail-card">
              <span>{uiText("最近自检", "Last self-check")}</span>
              <strong>{selfCheckReport.ok ? uiText("通过", "Passed") : uiText("发现问题", "Needs attention")}</strong>
              <p>{selfCheckReport.checkedAt}</p>
            </article>
            <article className="detail-card">
              <span>{uiText("摘要", "Summary")}</span>
              <strong>{`${selfCheckReport.summary.errors} ${uiText("错误", "errors")} · ${selfCheckReport.summary.warnings} ${uiText("警告", "warnings")}`}</strong>
              <p>
                {`${selfCheckReport.summary.accounts} ${uiText("账号", "accounts")} · ${selfCheckReport.summary.snapshots} ${uiText("快照", "snapshots")} · ${selfCheckReport.summary.timelineEvents} ${uiText("事件", "events")}`}
              </p>
            </article>
            <article className="detail-card detail-card--wide">
              <span>{uiText("自检结果", "Findings")}</span>
              <strong>{uiText("最新诊断", "Latest diagnostics")}</strong>
              <div className="settings-check-list">
                {selfCheckReport.issues.slice(0, 8).map((issue) => (
                  <div key={`${issue.code}-${issue.title}`} className={`settings-check-item ${issue.severity}`}>
                    <strong>{issue.title}</strong>
                    <p>{issue.detail}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        ) : null}
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">ABOUT</span>
            <h3>{uiText("关于", "About")}</h3>
          </div>
        </div>

        <div className="detail-grid">
          <article className="detail-card">
            <span>{uiText("产品名", "Product")}</span>
            <strong>{`Fries / ${appChineseName}`}</strong>
            <p>{uiText("面向多账号流量与订阅监控的桌面仪表盘。", "Desktop dashboard for multi-account quota and subscription ops.")}</p>
          </article>
          <article className="detail-card">
            <span>{uiText("版本", "Version")}</span>
            <strong>{appVersion}</strong>
            <p>{savedAt}</p>
          </article>
          <article className="detail-card">
            <span>{uiText("当前运行", "Runtime")}</span>
            <strong>{desktopMode}</strong>
            <p>{platform}</p>
          </article>
          <article className="detail-card">
            <span>{uiText("快照数", "Snapshot count")}</span>
            <strong>{snapshotsCount}</strong>
            <p>{uiText("会按保留天数自动清理。", "Old snapshots are pruned automatically.")}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
