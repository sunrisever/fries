import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  AccountRecord,
  DashboardSettings,
  LocaleMode,
  TimelineLogEntry,
  TimelineScope,
} from "../types";

const TIMELINE_HOUR_HEIGHT = 72;
const DATA_YEAR_MIN = 2026;
const DATA_YEAR_MAX = 2036;

type TimelineEventView = {
  id: string;
  kind: "depleted5h" | "depleted7d" | "reset5h" | "reset7d" | "expired" | "login";
  timestamp: number;
  when: string;
  account: AccountRecord;
  sourceAccount?: AccountRecord;
  note?: string;
};

type TimelinePageProps = {
  uiText: (zh: string, en: string) => string;
  locale: LocaleMode;
  clockNow: number;
  accounts: AccountRecord[];
  timelineLog?: TimelineLogEntry[];
  timelineScope: TimelineScope;
  updateSettings: (patch: Partial<DashboardSettings>) => void;
  getDisplayTitle: (account: AccountRecord) => string;
  workspaceNameLabel: (account?: AccountRecord) => string;
};

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

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfWeek(base: Date) {
  const next = new Date(base);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - ((next.getDay() + 6) % 7));
  return next;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function weekKeyFromDate(base: Date) {
  return dayKey(startOfWeek(base));
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

function selectableWeeksForMonth(year: number, month: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const weeks: Array<{ key: string; start: Date; end: Date; slot: number }> = [];
  let cursor = startOfWeek(monthStart);
  let slot = 1;

  while (cursor <= monthEnd) {
    const start = new Date(cursor);
    const end = addDays(start, 6);
    weeks.push({
      key: weekKeyFromDate(start),
      start,
      end,
      slot,
    });
    cursor = addDays(cursor, 7);
    slot += 1;
  }

  return weeks;
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

function TimelinePageComponent({
  uiText,
  locale,
  clockNow,
  accounts,
  timelineLog,
  timelineScope,
  updateSettings,
  getDisplayTitle,
  workspaceNameLabel,
}: TimelinePageProps) {
  const [expandedTimelineEventId, setExpandedTimelineEventId] = useState<string>("");
  const [timelinePopoverStyle, setTimelinePopoverStyle] = useState<CSSProperties | null>(null);
  const [timelineCalendarYear, setTimelineCalendarYear] = useState<number>(() =>
    clampDataYear(new Date(clockNow).getFullYear()),
  );
  const [timelineWeekYear, setTimelineWeekYear] = useState<number>(() => clampDataYear(new Date(clockNow).getFullYear()));
  const [timelineWeekMonth, setTimelineWeekMonth] = useState<number>(() =>
    clampDataMonth(clampDataYear(new Date(clockNow).getFullYear()), new Date(clockNow).getMonth() + 1),
  );
  const [timelineWeekKey, setTimelineWeekKey] = useState<string>(() => weekKeyFromDate(new Date(clockNow)));
  const weekTimelineScrollRef = useRef<HTMLDivElement>(null);
  const weekTimelineShellRef = useRef<HTMLDivElement>(null);
  const monthTimelineShellRef = useRef<HTMLDivElement>(null);

  const timelineEventsView = useMemo(() => {
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const events: TimelineEventView[] = [];

    for (const entry of timelineLog ?? []) {
      const account =
        (entry.targetAccountId && accountMap.get(entry.targetAccountId)) ||
        (entry.accountId && accountMap.get(entry.accountId));
      if (!account) {
        continue;
      }

      const timestamp = entry.atMs ?? parseDateTimeValue(entry.at);
      if (typeof timestamp !== "number") {
        continue;
      }

      const sourceAccount = entry.sourceAccountId ? accountMap.get(entry.sourceAccountId) : undefined;
      events.push({
        id: entry.id,
        kind: entry.kind,
        timestamp,
        when: entry.at,
        account,
        sourceAccount,
        note: entry.note,
      });
    }

    return events.sort((left, right) => left.timestamp - right.timestamp);
  }, [accounts, timelineLog]);

  useEffect(() => {
    setTimelineWeekMonth((current) => clampDataMonth(timelineWeekYear, current));
  }, [timelineWeekYear]);

  useEffect(() => {
    const options = selectableWeeksForMonth(timelineWeekYear, timelineWeekMonth);
    if (options.length === 0) {
      return;
    }

    if (options.some((option) => option.key === timelineWeekKey)) {
      return;
    }

    const now = new Date(clockNow);
    const nowKey = weekKeyFromDate(now);
    const fallback = options.find((option) => option.key === nowKey) ?? options[0];
    setTimelineWeekKey(fallback.key);
  }, [clockNow, timelineWeekKey, timelineWeekMonth, timelineWeekYear]);

  useEffect(() => {
    if (timelineScope !== "week") {
      return;
    }

    const target = weekTimelineScrollRef.current;
    if (!target) {
      return;
    }

    const now = new Date(clockNow);
    const selectedWeekStart = startOfWeek(new Date(timelineWeekKey));
    const selectedWeekEnd = addDays(selectedWeekStart, 7);
    const isCurrentWeek = now >= selectedWeekStart && now < selectedWeekEnd;
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const currentTop = isCurrentWeek ? (minuteOfDay / 60) * TIMELINE_HOUR_HEIGHT : 0;

    const raf = window.requestAnimationFrame(() => {
      const nextScrollTop = Math.max(0, currentTop - target.clientHeight * 0.32);
      target.scrollTo({
        top: nextScrollTop,
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [clockNow, timelineScope, timelineWeekKey]);

  useEffect(() => {
    if (timelineScope !== "month") {
      return;
    }

    const shell = monthTimelineShellRef.current;
    if (!shell) {
      return;
    }

    const now = new Date(clockNow);
    const targetDay = timelineCalendarYear === now.getFullYear() ? dayKey(now) : "";
    const target =
      (targetDay
        ? shell.querySelector<HTMLElement>(`[data-calendar-day='${targetDay}']`)
        : shell.querySelector<HTMLElement>("[data-calendar-month]")) ?? null;

    if (!target) {
      return;
    }

    const raf = window.requestAnimationFrame(() => {
      shell.scrollTo({
        top: Math.max(0, target.offsetTop - 16),
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [clockNow, timelineScope, timelineCalendarYear]);

  useEffect(() => {
    if (!expandedTimelineEventId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest(".timeline-event-card") || target.closest(".timeline-event-popover")) {
        return;
      }
      setExpandedTimelineEventId("");
      setTimelinePopoverStyle(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [expandedTimelineEventId]);

  const weekOptions = selectableWeeksForMonth(timelineWeekYear, timelineWeekMonth);
  const selectedWeekOption =
    weekOptions.find((option) => option.key === timelineWeekKey) ??
    weekOptions[0] ?? {
      key: weekKeyFromDate(new Date(clockNow)),
      start: startOfWeek(new Date(clockNow)),
      end: addDays(startOfWeek(new Date(clockNow)), 6),
      slot: 1,
    };
  const weekStart = new Date(selectedWeekOption.start);
  const weekEnd = addDays(weekStart, 7);
  const weekBoardHeight = 24 * TIMELINE_HOUR_HEIGHT;
  const selectedWeekLabel = uiText(
    `第${selectedWeekOption.slot}周 · ${selectedWeekOption.start.getMonth() + 1}/${selectedWeekOption.start.getDate()} - ${selectedWeekOption.end.getMonth() + 1}/${selectedWeekOption.end.getDate()}`,
    `Week ${selectedWeekOption.slot} · ${selectedWeekOption.start.getMonth() + 1}/${selectedWeekOption.start.getDate()} - ${selectedWeekOption.end.getMonth() + 1}/${selectedWeekOption.end.getDate()}`,
  );

  const todayKey = dayKey(new Date(clockNow));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return {
      key: dayKey(date),
      date,
      weekday: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        weekday: "short",
      }).format(date),
      monthDay: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        month: "2-digit",
        day: "2-digit",
      }).format(date),
      isToday: dayKey(date) === todayKey,
    };
  });

  const jumpToWeek = (base: Date) => {
    const start = startOfWeek(base);
    const center = addDays(start, 3);
    const nextYear = clampDataYear(center.getFullYear());
    const nextMonth = clampDataMonth(nextYear, center.getMonth() + 1);
    setTimelineWeekYear(nextYear);
    setTimelineWeekMonth(nextMonth);
    setTimelineWeekKey(weekKeyFromDate(start));
  };

  const weekEvents = timelineEventsView.filter(
    (event) => event.timestamp >= weekStart.getTime() && event.timestamp < weekEnd.getTime(),
  );
  const weekEventsByDay = weekDays.map((day) => {
    const dayEvents = weekEvents
      .filter((event) => dayKey(new Date(event.timestamp)) === day.key)
      .sort((left, right) => left.timestamp - right.timestamp);

    let lastTop = -Infinity;
    let collisionOffset = 0;

    return dayEvents.map((event) => {
      const eventDate = new Date(event.timestamp);
      const minuteOfDay = eventDate.getHours() * 60 + eventDate.getMinutes();
      const rawTop = (minuteOfDay / 60) * TIMELINE_HOUR_HEIGHT;

      if (rawTop - lastTop < 58) {
        collisionOffset += 16;
      } else {
        collisionOffset = 0;
      }

      const top = Math.min(weekBoardHeight - 90, rawTop + collisionOffset);
      lastTop = top;

      return {
        ...event,
        top,
        timeLabel: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(eventDate),
      };
    });
  });

  const calendarYearStart = new Date(timelineCalendarYear, 0, 1);
  calendarYearStart.setHours(0, 0, 0, 0);
  const calendarYearEnd = new Date(timelineCalendarYear + 1, 0, 1);
  const calendarEvents = timelineEventsView.filter(
    (event) =>
      event.timestamp >= calendarYearStart.getTime() &&
      event.timestamp < calendarYearEnd.getTime() &&
      (event.kind === "depleted7d" || event.kind === "reset7d" || event.kind === "expired"),
  );
  const calendarEventMap = calendarEvents.reduce((map, event) => {
    const key = dayKey(new Date(event.timestamp));
    const current = map.get(key) ?? [];
    current.push(event);
    map.set(key, current);
    return map;
  }, new Map<string, typeof calendarEvents>());
  const calendarMonths = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthStart = new Date(timelineCalendarYear, monthIndex, 1);
    const daysInMonth = new Date(timelineCalendarYear, monthIndex + 1, 0).getDate();
    const monthOffset = (monthStart.getDay() + 6) % 7;
    const cells = Array.from({ length: monthOffset + daysInMonth }, (_, index) => {
      if (index < monthOffset) {
        return {
          key: `empty-${timelineCalendarYear}-${monthIndex + 1}-${index}`,
          isPlaceholder: true,
          dayNumber: "",
          events: [] as typeof calendarEvents,
          isToday: false,
        };
      }

      const dayNumber = index - monthOffset + 1;
      const date = new Date(timelineCalendarYear, monthIndex, dayNumber);
      const dateKey = dayKey(date);
      return {
        key: dateKey,
        isPlaceholder: false,
        dayNumber: String(dayNumber),
        events: calendarEventMap.get(dateKey) ?? [],
        isToday: dateKey === dayKey(new Date(clockNow)),
      };
    });

    return {
      key: `${timelineCalendarYear}-${monthIndex + 1}`,
      month: monthIndex + 1,
      title: localizedMonthTitle(monthStart, locale),
      cells,
    };
  });

  const timelineLabel = (
    kind: "depleted5h" | "depleted7d" | "reset5h" | "reset7d" | "expired" | "login",
  ) => {
    switch (kind) {
      case "depleted5h":
        return uiText("5h 用完等待恢复", "5h exhausted");
      case "depleted7d":
        return uiText("7d 用完等待恢复", "7d exhausted");
      case "reset5h":
        return uiText("恢复 5h 额度", "5h restored");
      case "reset7d":
        return uiText("恢复 7d 额度", "7d restored");
      case "expired":
        return uiText("订阅过期", "Subscription expired");
      case "login":
        return uiText("登录账号", "Account login");
    }
  };

  const timelineClass = (
    kind: "depleted5h" | "depleted7d" | "reset5h" | "reset7d" | "expired" | "login",
  ) => {
    switch (kind) {
      case "depleted5h":
        return "kind-depleted5h";
      case "depleted7d":
        return "kind-depleted7d";
      case "reset5h":
        return "kind-reset5h";
      case "reset7d":
        return "kind-reset7d";
      case "expired":
        return "kind-expired";
      case "login":
        return "kind-login";
    }
  };

  const fallbackTimeFormatter = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function renderTimelineEventCard(
    timelineEvent: TimelineEventView & { top?: number; timeLabel?: string },
    compact = false,
  ) {
    const expanded = expandedTimelineEventId === timelineEvent.id;
    const workspaceLabel = workspaceNameLabel(timelineEvent.account);
    const timeLabel = timelineEvent.timeLabel ?? fallbackTimeFormatter.format(new Date(timelineEvent.timestamp));
    const className = [
      "timeline-event-card",
      compact ? "compact" : "",
      timelineClass(timelineEvent.kind),
      expanded ? "is-active" : "",
      expanded ? "is-expanded" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const title = [timelineLabel(timelineEvent.kind), timelineEvent.account.email, workspaceLabel, timeLabel]
      .filter(Boolean)
      .join(" · ");

    function openPopover(event: ReactMouseEvent<HTMLElement>) {
      const container = timelineScope === "week" ? weekTimelineShellRef.current : monthTimelineShellRef.current;
      const cardRect = event.currentTarget.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();

      if (containerRect) {
        const desiredWidth = compact ? 292 : 312;
        const fallbackLeft = Math.max(12, cardRect.left - containerRect.left);
        const preferredLeft = fallbackLeft + Math.min(cardRect.width + 14, 48);
        const maxLeft = Math.max(12, containerRect.width - desiredWidth - 12);
        const left = Math.min(preferredLeft, maxLeft);
        const top = Math.max(12, cardRect.top - containerRect.top - 6);
        setTimelinePopoverStyle({
          left,
          top,
          width: desiredWidth,
        });
      } else {
        setTimelinePopoverStyle(null);
      }

      setExpandedTimelineEventId((current) => (current === timelineEvent.id ? "" : timelineEvent.id));
    }

    return (
      <article
        key={timelineEvent.id}
        className={className}
        style={typeof timelineEvent.top === "number" ? { top: `${timelineEvent.top}px` } : undefined}
        onClick={openPopover}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPopover(event as unknown as ReactMouseEvent<HTMLElement>);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        title={title}
      >
        <strong>{timelineLabel(timelineEvent.kind)}</strong>
        <span className="timeline-event-summary">{timelineEvent.account.email}</span>
        {timelineEvent.sourceAccount ? (
          <small className="timeline-event-meta">
            {`${getDisplayTitle(timelineEvent.sourceAccount)} -> ${getDisplayTitle(timelineEvent.account)}`}
          </small>
        ) : null}
        <small className="timeline-event-meta">{timeLabel}</small>
      </article>
    );
  }

  const currentWeekLineTop = (() => {
    const now = new Date(clockNow);
    if (now < weekStart || now >= weekEnd) {
      return null;
    }

    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    return (minuteOfDay / 60) * TIMELINE_HOUR_HEIGHT;
  })();
  const activeTimelineEvent = expandedTimelineEventId
    ? timelineEventsView.find((event) => event.id === expandedTimelineEventId) ?? null
    : null;
  const activeTimelineEventTimeLabel = activeTimelineEvent
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(activeTimelineEvent.timestamp))
    : "";
  const activeTimelinePopover = activeTimelineEvent ? (
    <div
      className={`timeline-event-popover ${timelineClass(activeTimelineEvent.kind)}`}
      style={timelinePopoverStyle ?? undefined}
    >
      <div className="timeline-detail-head">
        <div>
          <span className="section-tag">{uiText("事件详情", "Event detail")}</span>
          <h4>{timelineLabel(activeTimelineEvent.kind)}</h4>
        </div>
        <button
          className="ghost"
          onClick={() => {
            setExpandedTimelineEventId("");
            setTimelinePopoverStyle(null);
          }}
          type="button"
        >
          {uiText("关闭", "Close")}
        </button>
      </div>
      <div className="timeline-detail-grid">
        <div className="timeline-detail-item">
          <span>{uiText("邮箱", "Email")}</span>
          <strong>{activeTimelineEvent.account.email}</strong>
        </div>
        {workspaceNameLabel(activeTimelineEvent.account) ? (
          <div className="timeline-detail-item">
            <span>{uiText("团队名", "Workspace")}</span>
            <strong>{workspaceNameLabel(activeTimelineEvent.account)}</strong>
          </div>
        ) : null}
        <div className="timeline-detail-item">
          <span>{uiText("事件时间", "Event time")}</span>
          <strong>{activeTimelineEventTimeLabel}</strong>
        </div>
        <div className="timeline-detail-item">
          <span>{uiText("账号", "Account")}</span>
          <strong>{getDisplayTitle(activeTimelineEvent.account)}</strong>
        </div>
        {activeTimelineEvent.sourceAccount ? (
          <div className="timeline-detail-item">
            <span>{uiText("登录来源", "Login source")}</span>
            <strong>{`${getDisplayTitle(activeTimelineEvent.sourceAccount)} -> ${getDisplayTitle(activeTimelineEvent.account)}`}</strong>
          </div>
        ) : null}
        {activeTimelineEvent.note ? (
          <div className="timeline-detail-item">
            <span>{uiText("说明", "Note")}</span>
            <strong>{activeTimelineEvent.note}</strong>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div className="page page--timeline">
      <section className="page-section page-section--timeline">
        <div className="section-heading">
          <div>
            <span className="section-tag">TIMELINE</span>
            <h3>{uiText("时间线", "Timeline")}</h3>
          </div>
          <div className="inline-actions mode-switcher">
            <button
              className={timelineScope === "week" ? "" : "ghost"}
              onClick={() => updateSettings({ timelineScope: "week" })}
            >
              {uiText("周视图", "Week")}
            </button>
            <button
              className={timelineScope === "month" ? "" : "ghost"}
              onClick={() => updateSettings({ timelineScope: "month" })}
            >
              {uiText("日历视图", "Calendar")}
            </button>
            <label className="toolbar-select">
              <span>{uiText("年份", "Year")}</span>
              <select
                value={timelineScope === "week" ? timelineWeekYear : timelineCalendarYear}
                onChange={(event) => {
                  const nextYear = clampDataYear(Number(event.target.value));
                  if (timelineScope === "week") {
                    setTimelineWeekYear(nextYear);
                  } else {
                    setTimelineCalendarYear(nextYear);
                  }
                }}
              >
                {selectableYears().map((year) => (
                  <option key={year} value={year}>
                    {uiText(`${year}年`, String(year))}
                  </option>
                ))}
              </select>
            </label>
            {timelineScope === "week" ? (
              <>
                <label className="toolbar-select">
                  <span>{uiText("月份", "Month")}</span>
                  <select
                    value={timelineWeekMonth}
                    onChange={(event) => {
                      setTimelineWeekMonth(clampDataMonth(timelineWeekYear, Number(event.target.value)));
                    }}
                  >
                    {selectableMonths(timelineWeekYear).map((month) => (
                      <option key={month} value={month}>
                        {uiText(
                          `${month}月`,
                          new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(2026, month - 1, 1)),
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="toolbar-select toolbar-select--wide">
                  <span>{uiText("周次", "Week")}</span>
                  <select value={selectedWeekOption.key} onChange={(event) => setTimelineWeekKey(event.target.value)}>
                    {weekOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {uiText(
                          `第${option.slot}周 · ${option.start.getMonth() + 1}/${option.start.getDate()} - ${option.end.getMonth() + 1}/${option.end.getDate()}`,
                          `Week ${option.slot} · ${option.start.getMonth() + 1}/${option.start.getDate()} - ${option.end.getMonth() + 1}/${option.end.getDate()}`,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="inline-actions timeline-week-nav">
                  <button className="ghost" onClick={() => jumpToWeek(addDays(weekStart, -7))}>
                    {uiText("上一周", "Prev")}
                  </button>
                  <button className="ghost" onClick={() => jumpToWeek(new Date())}>
                    {uiText("本周", "This week")}
                  </button>
                  <button className="ghost" onClick={() => jumpToWeek(addDays(weekStart, 7))}>
                    {uiText("下一周", "Next")}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
        {timelineScope === "week" ? (
          <div className="timeline-week-shell" ref={weekTimelineShellRef}>
            <div className="timeline-week-frame">
              <div className="timeline-week-caption">{selectedWeekLabel}</div>
              <div className="timeline-week-head">
                <div className="timeline-week-axis-head">{uiText("时刻", "Time")}</div>
                <div className="timeline-week-dayheads">
                  {weekDays.map((day) => (
                    <div key={day.key} className={`timeline-week-dayhead ${day.isToday ? "is-today" : ""}`}>
                      <strong>{day.weekday}</strong>
                      <span>{day.monthDay}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="timeline-week-scroll" ref={weekTimelineScrollRef}>
                <div className="timeline-week-body" style={{ height: `${weekBoardHeight}px` }}>
                  <div className="timeline-week-axis">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <span
                        key={`axis-${hour}`}
                        className="timeline-week-axis-tick"
                        style={{ top: `${hour * TIMELINE_HOUR_HEIGHT}px` }}
                      >
                        {`${String(hour).padStart(2, "0")}:00`}
                      </span>
                    ))}
                  </div>

                  <div className="timeline-week-lanes">
                    {Array.from({ length: 25 }, (_, hour) => (
                      <div
                        key={`line-${hour}`}
                        className="timeline-week-hour-line"
                        style={{ top: `${hour * TIMELINE_HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {currentWeekLineTop !== null ? (
                      <div className="timeline-week-now-line" style={{ top: `${currentWeekLineTop}px` }}>
                        <span>
                          {uiText("当前", "Now")}{" "}
                          {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          }).format(new Date(clockNow))}
                        </span>
                      </div>
                    ) : null}

                    {weekDays.map((day, dayIndex) => (
                      <div key={day.key} className={`timeline-week-daylane ${day.isToday ? "is-today" : ""}`}>
                        {weekEventsByDay[dayIndex].map((event) => renderTimelineEventCard(event))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {activeTimelinePopover}
          </div>
        ) : (
          <div className="timeline-month-shell">
            <div className="timeline-month-head">
              <strong>{uiText(`${timelineCalendarYear} 全年日历`, `${timelineCalendarYear} annual calendar`)}</strong>
              <span>
                {uiText(
                  "全年月历滚动查看 7d 用尽 / 恢复与订阅到期。",
                  "Scrollable annual calendar for 7d depletion, recovery, and expiry.",
                )}
              </span>
            </div>
            <div className="timeline-calendar-scroll" ref={monthTimelineShellRef}>
              <div className="timeline-calendar-year">
                {calendarMonths.map((month) => (
                  <section key={month.key} className="timeline-calendar-month" data-calendar-month={month.month}>
                    <div className="timeline-month-head">
                      <strong>{month.title}</strong>
                      <span>{uiText("点击事件卡查看完整信息。", "Click cards to inspect details.")}</span>
                    </div>
                    <div className="timeline-month-weekdays">
                      {localizedWeekdayLabels(locale).map((label) => (
                        <span key={`${month.key}-${label}`}>{label}</span>
                      ))}
                    </div>
                    <div className="timeline-month-grid">
                      {month.cells.map((cell) => (
                        <div
                          key={cell.key}
                          data-calendar-day={cell.isPlaceholder ? undefined : cell.key}
                          className={`timeline-month-cell ${cell.isPlaceholder ? "is-placeholder" : ""} ${cell.isToday ? "is-today" : ""}`}
                        >
                          {!cell.isPlaceholder ? (
                            <>
                              <div className="timeline-month-day">{cell.dayNumber}</div>
                              <div className="timeline-month-events">
                                {cell.events.map((event) =>
                                  renderTimelineEventCard(
                                    {
                                      ...event,
                                      timeLabel: new Date(event.timestamp).toLocaleTimeString(
                                        locale === "en" ? "en-US" : "zh-CN",
                                        {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: false,
                                        },
                                      ),
                                    },
                                    true,
                                  ),
                                )}
                              </div>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            {activeTimelinePopover}
          </div>
        )}
      </section>
    </div>
  );
}

export default memo(TimelinePageComponent);
