import { memo } from "react";
import { TokenKChart } from "../components/TokenKChart";
import type {
  AccountStatus,
  AnalyticsRange,
  DashboardSettings,
  HeatmapScope,
  LocaleMode,
  ThemeMode,
  ThemePreset,
  VisualEffectMode,
} from "../types";

type StatusSegment = {
  status: AccountStatus;
  count: number;
  color: string;
};

type StatusSlice = StatusSegment & {
  startDeg: number;
  endDeg: number;
  topPath: string;
  visibleSides: Array<{ path: string }>;
  sideColor: string;
  topStroke: string;
};

type ChartAccount = {
  id: string;
  title: string;
  shortTitle: string;
  fiveHour: number;
  sevenDay: number;
  isBlocked: boolean;
  isActive: boolean;
};

type RankingItem = {
  id: string;
  title: string;
  subtitle: string;
  tokens: number;
  lastTokens: number;
  isActive: boolean;
};

type TrendItem = {
  label: string;
  tokens: number;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  delta: number;
  volume: number;
};

type HeatmapMonthCell = {
  key: string;
  isPlaceholder: boolean;
  dayNumber: string;
  tokens: number;
  level: number;
  title: string;
};

type HeatmapYearCell = {
  key: string;
  date: Date;
  isCurrentYear: boolean;
  isToday: boolean;
  tokens: number;
  level: number;
  title: string;
};

type HeatmapMonthView = {
  title: string;
  weekdayLabels: string[];
  cells: HeatmapMonthCell[];
};

type HeatmapYearView = {
  title: string;
  weekdayLabels: string[];
  weeks: HeatmapYearCell[][];
  monthMarkers: Array<{ key: string; label: string; weekIndex: number }>;
};

type AnalyticsPageProps = {
  uiText: (zh: string, en: string) => string;
  locale: LocaleMode;
  analyticsRange: AnalyticsRange;
  heatmapScope: HeatmapScope;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  visualEffectMode: VisualEffectMode;
  updateSettings: (patch: Partial<DashboardSettings>) => void;
  openAiChartData: ChartAccount[];
  statusPie3dSlices: StatusSlice[];
  statusSegments: StatusSegment[];
  statusLabel: (status: AccountStatus, locale?: LocaleMode) => string;
  trendTotal: number;
  tokenTrend: TrendItem[];
  tokenRanking: RankingItem[];
  tokenMax: number;
  compactNumber: (value?: number) => string;
  buildMeterTone: (percent?: number) => { track: Record<string, string>; fill: Record<string, string> };
  heatmapYearCursor: number;
  heatmapMonthCursor: number;
  setHeatmapYearCursor: (value: number) => void;
  setHeatmapMonthCursor: (value: number) => void;
  selectableYears: () => number[];
  selectableMonths: (year: number) => number[];
  heatmapMonthView: HeatmapMonthView;
  heatmapYearView: HeatmapYearView;
};

function AnalyticsPageComponent({
  uiText,
  locale,
  analyticsRange,
  heatmapScope,
  themeMode,
  themePreset,
  visualEffectMode,
  updateSettings,
  openAiChartData,
  statusPie3dSlices,
  statusSegments,
  statusLabel,
  trendTotal,
  tokenTrend,
  tokenRanking,
  tokenMax,
  compactNumber,
  buildMeterTone,
  heatmapYearCursor,
  heatmapMonthCursor,
  setHeatmapYearCursor,
  setHeatmapMonthCursor,
  selectableYears,
  selectableMonths,
  heatmapMonthView,
  heatmapYearView,
}: AnalyticsPageProps) {
  return (
    <div className="page">
      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">ANALYTICS</span>
            <h3>{uiText("统计与分析", "Analytics")}</h3>
          </div>
          <p>{uiText("保留主线剩余额度和账号状态占比，重点看 token 消耗。", "Mainline capacity plus token analytics.")}</p>
        </div>

        <div className="chart-grid">
          <article className="chart-card">
            <div className="chart-head">
              <div>
                <span className="chart-tag">BAR</span>
                <h4>{uiText("主线剩余额度", "Mainline remaining")}</h4>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot five-hour" />
                  5h
                </span>
                <span>
                  <i className="legend-dot seven-day" />
                  7d
                </span>
              </div>
            </div>

            <div className="bar-chart">
              {openAiChartData.map((item) => (
                <div key={item.id} className={`bar-group ${item.isActive ? "is-active" : ""}`}>
                  <div className="bar-stack">
                    <div className="bar-rail">
                      <div
                        className="bar-fill five-hour"
                        style={{
                          height: `${item.fiveHour}%`,
                          ...(item.isBlocked
                            ? {
                                background: "rgba(255, 255, 255, 0.72)",
                                boxShadow: "none",
                              }
                            : buildMeterTone(item.fiveHour).fill),
                        }}
                      />
                    </div>
                    <div className="bar-rail">
                      <div
                        className="bar-fill seven-day"
                        style={{
                          height: `${item.sevenDay}%`,
                          ...buildMeterTone(item.sevenDay).fill,
                        }}
                      />
                    </div>
                  </div>
                  <strong>{item.shortTitle}</strong>
                  <small>{item.title}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="chart-card">
            <div className="chart-head">
              <div>
                <span className="chart-tag">PIE</span>
                <h4>{uiText("账号状态占比", "Status breakdown")}</h4>
              </div>
            </div>

            <div className="donut-layout">
              <div className="pie3d-shell">
                <svg className="pie3d-svg" viewBox="0 0 216 170" aria-hidden="true">
                  {statusPie3dSlices.flatMap((slice) =>
                    slice.visibleSides.map((side, index) => (
                      <path
                        key={`${slice.status}-side-${index}`}
                        d={side.path}
                        fill={slice.sideColor}
                        stroke={slice.sideColor}
                        strokeWidth="1"
                      />
                    )),
                  )}
                  {statusPie3dSlices.map((slice) => (
                    <path
                      key={`${slice.status}-top`}
                      d={slice.topPath}
                      fill={slice.color}
                      stroke={slice.topStroke}
                      strokeWidth="1.2"
                    />
                  ))}
                  <ellipse className="pie3d-gloss" cx="108" cy="54" rx="78" ry="24" />
                </svg>
              </div>

              <div className="status-breakdown">
                {statusSegments.map((item) => (
                  <div key={item.status} className="status-row">
                    <div className="status-row-label">
                      <i className="legend-dot" style={{ background: item.color }} />
                      <span>{statusLabel(item.status, locale)}</span>
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">TOKEN</span>
            <h3>{uiText("Token 面板", "Token board")}</h3>
          </div>
          <div className="inline-actions mode-switcher">
            <button className={analyticsRange === "hour" ? "" : "ghost"} onClick={() => updateSettings({ analyticsRange: "hour" })}>
              {uiText("时K", "Hour")}
            </button>
            <button className={analyticsRange === "day" ? "" : "ghost"} onClick={() => updateSettings({ analyticsRange: "day" })}>
              {uiText("日K", "Day")}
            </button>
            <button className={analyticsRange === "week" ? "" : "ghost"} onClick={() => updateSettings({ analyticsRange: "week" })}>
              {uiText("周K", "Week")}
            </button>
            <button className={analyticsRange === "month" ? "" : "ghost"} onClick={() => updateSettings({ analyticsRange: "month" })}>
              {uiText("月K", "Month")}
            </button>
          </div>
        </div>

        <div className="chart-grid chart-grid--token">
          <article className="chart-card chart-card--trend">
            <div className="chart-head">
              <div>
                <span className="chart-tag">{uiText("折线", "Line")}</span>
                <h4>{uiText("Token 消耗走势", "Token trend")}</h4>
              </div>
              <strong className="chart-summary">{compactNumber(trendTotal)}</strong>
            </div>

            <div className="trend-shell">
              <TokenKChart
                data={tokenTrend}
                mode="line"
                range={analyticsRange}
                locale={locale}
                themeKey={`${themeMode}:${themePreset}:${visualEffectMode}`}
              />
            </div>
          </article>

          <article className="chart-card chart-card--rank">
            <div className="chart-head">
              <div>
                <span className="chart-tag">RANK</span>
                <h4>{uiText("各 Team 累计消耗排行", "Token ranking")}</h4>
              </div>
            </div>

            <div className="rank-list">
              {tokenRanking.map((item, index) => (
                <div key={item.id} className={`rank-row ${item.isActive ? "is-active" : ""}`}>
                  <div className="rank-index">{index + 1}</div>
                  <div className="rank-main">
                    <div className="rank-top">
                      <div className="rank-head">
                        <strong title={item.title}>{item.title}</strong>
                        <small title={item.subtitle}>{item.subtitle}</small>
                      </div>
                      <div className="rank-meta">
                        <strong>{compactNumber(item.tokens)}</strong>
                        <small>{uiText("最近一轮", "Last") + " " + compactNumber(item.lastTokens)}</small>
                      </div>
                    </div>
                    <div className="rank-track">
                      <div className="rank-fill" style={{ width: `${(item.tokens / tokenMax) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <span className="section-tag">HEATMAP</span>
            <h3>{uiText("Token 热力图", "Token heatmap")}</h3>
            <p className="heatmap-description">
              {heatmapScope === "month"
                ? uiText("真实月历视图，按日期和星期展示每日 token 热度。", "Real month calendar with daily token intensity.")
                : uiText("全年按真实日期展开，像 GitHub 一样展示 365 / 366 天热力。", "Full-year daily heatmap, GitHub-style with all 365 / 366 days.")}
            </p>
          </div>
          <div className="inline-actions mode-switcher">
            <button className={heatmapScope === "month" ? "" : "ghost"} onClick={() => updateSettings({ heatmapScope: "month" })}>
              {uiText("月视图", "Month")}
            </button>
            <button className={heatmapScope === "year" ? "" : "ghost"} onClick={() => updateSettings({ heatmapScope: "year" })}>
              {uiText("年视图", "Year")}
            </button>
            <label className="toolbar-select">
              <span>{uiText("年份", "Year")}</span>
              <select value={heatmapYearCursor} onChange={(event) => setHeatmapYearCursor(Number(event.target.value))}>
                {selectableYears().map((year) => (
                  <option key={year} value={year}>
                    {uiText(`${year}年`, String(year))}
                  </option>
                ))}
              </select>
            </label>
            {heatmapScope === "month" ? (
              <label className="toolbar-select">
                <span>{uiText("月份", "Month")}</span>
                <select value={heatmapMonthCursor} onChange={(event) => setHeatmapMonthCursor(Number(event.target.value))}>
                  {selectableMonths(heatmapYearCursor).map((month) => (
                    <option key={month} value={month}>
                      {uiText(`${month}月`, new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2026, month - 1, 1)))}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        {heatmapScope === "month" ? (
          <div className="heatmap-calendar">
            <div className="heatmap-calendar-head">
              <strong>{heatmapMonthView.title}</strong>
              <span>{uiText("热度阈值：0 / 100万 / 1000万 / 2000万 / 5000万 / 1亿+", "Levels: 0 / 1M / 10M / 20M / 50M / 100M+")}</span>
            </div>
            <div className="heatmap-weekday-row">
              {heatmapMonthView.weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="heatmap-grid month-calendar">
              {heatmapMonthView.cells.map((cell) => (
                <div
                  key={cell.key}
                  className={`heatmap-calendar-cell level-${cell.level} ${cell.isPlaceholder ? "is-placeholder" : ""}`}
                  title={cell.title}
                >
                  {!cell.isPlaceholder ? (
                    <>
                      <span>{cell.dayNumber}</span>
                      <strong>{compactNumber(cell.tokens)}</strong>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="heatmap-year-shell">
            <div className="heatmap-calendar-head">
              <strong>{heatmapYearView.title}</strong>
              <span>{uiText("全年每日热度一览。", "Full-year daily heatmap.")}</span>
            </div>
            <div className="heatmap-year-board">
              <div className="heatmap-year-months">
                {heatmapYearView.monthMarkers.map((marker) => (
                  <span key={marker.key} className="heatmap-year-month-label" style={{ gridColumnStart: marker.weekIndex + 1 }}>
                    {marker.label}
                  </span>
                ))}
              </div>
              <div className="heatmap-year-main">
                <div className="heatmap-year-weekdays">
                  {heatmapYearView.weekdayLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="heatmap-year-columns">
                  {heatmapYearView.weeks.map((week, index) => (
                    <div key={`week-${index}`} className="heatmap-year-week">
                      {week.map((cell) => (
                        <div
                          key={cell.key}
                          className={`heatmap-year-cell level-${cell.level} ${cell.isCurrentYear ? "" : "is-placeholder"} ${cell.isToday ? "is-today" : ""}`}
                          title={cell.title}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default memo(AnalyticsPageComponent);
