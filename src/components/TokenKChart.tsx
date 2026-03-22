import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineStyle,
  LineSeries,
  type IChartApi,
  TickMarkType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

import type { AnalyticsChartMode, AnalyticsRange, LocaleMode } from "../types";

type TrendPoint = {
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

type TokenKChartProps = {
  data: TrendPoint[];
  mode: AnalyticsChartMode;
  range: AnalyticsRange;
  locale: LocaleMode;
  themeKey: string;
};

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function toUtcTimestamp(date: Date) {
  return Math.floor(date.getTime() / 1000) as UTCTimestamp;
}

function makeTokenFormatter(locale: LocaleMode) {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function timeToDate(time: Time) {
  if (typeof time === "number") {
    return new Date(time * 1000);
  }

  if (typeof time === "string") {
    return new Date(time);
  }

  return new Date(time.year, time.month - 1, time.day);
}

function makeTickFormatter(range: AnalyticsRange, locale: LocaleMode) {
  return (time: Time, _tickMarkType: TickMarkType, _localizationLocale: string) => {
    const date = timeToDate(time);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    if (range === "hour") {
      return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }

    if (range === "day") {
      return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }

    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
      month: "numeric",
      day: "numeric",
    }).format(date);
  };
}

function makeCrosshairTimeFormatter(range: AnalyticsRange, locale: LocaleMode) {
  return (time: Time) => {
    const date = timeToDate(time);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    if (range === "hour" || range === "day") {
      return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    }

    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(date);
  };
}

function buildChartColors(locale: LocaleMode) {
  return {
    gridColor: cssVar("--surface-border", "rgba(148, 163, 184, 0.24)"),
    textColor: cssVar("--text-muted", "#94a3b8"),
    accentColor: cssVar("--accent-strong", "#7ea9ca"),
    accentDeep: cssVar("--accent-deep", "#4f6f8a"),
    backgroundColor: cssVar("--card-glass-softer", "#171b21"),
    risingColor: locale === "en" ? "#38b46c" : "#e05a5a",
    fallingColor: locale === "en" ? "#d65c5c" : "#2d9d61",
  };
}

function createBaseChart(
  host: HTMLDivElement,
  width: number,
  height: number,
  range: AnalyticsRange,
  locale: LocaleMode,
  colors: ReturnType<typeof buildChartColors>,
  showTimeScale: boolean,
) {
  const formatter = makeTokenFormatter(locale);
  return createChart(host, {
    width,
    height,
    layout: {
      textColor: colors.textColor,
      background: {
        type: ColorType.Solid,
        color: colors.backgroundColor,
      },
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: colors.gridColor, style: LineStyle.Dashed },
      horzLines: { color: colors.gridColor, style: LineStyle.Dashed },
    },
    rightPriceScale: {
      visible: true,
      autoScale: true,
      borderColor: colors.gridColor,
      borderVisible: false,
      ticksVisible: true,
      entireTextOnly: true,
    },
    leftPriceScale: {
      visible: false,
    },
    timeScale: {
      visible: true,
      borderColor: colors.gridColor,
      timeVisible: showTimeScale && (range === "hour" || range === "day"),
      secondsVisible: false,
      rightOffset: 1,
      minBarSpacing: range === "hour" ? 8 : range === "day" ? 11 : 14,
      tickMarkFormatter: showTimeScale ? makeTickFormatter(range, locale) : undefined,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: {
        time: true,
        price: false,
      },
    },
    crosshair: {
      vertLine: { color: colors.accentDeep, labelBackgroundColor: colors.accentDeep },
      horzLine: { color: colors.accentDeep, labelBackgroundColor: colors.accentDeep },
    },
    localization: {
      locale: locale === "en" ? "en-US" : "zh-CN",
      priceFormatter: (price: number) => formatter.format(price),
      timeFormatter: makeCrosshairTimeFormatter(range, locale),
    },
  });
}

export function TokenKChart({ data, mode, range, locale, themeKey }: TokenKChartProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const upperHostRef = useRef<HTMLDivElement | null>(null);
  const lowerHostRef = useRef<HTMLDivElement | null>(null);
  const upperChartRef = useRef<IChartApi | null>(null);
  const lowerChartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const upperHost = upperHostRef.current;
    const lowerHost = lowerHostRef.current;
    if (!wrapper || !upperHost || !lowerHost) {
      return;
    }

    const colors = buildChartColors(locale);
    const formatter = makeTokenFormatter(locale);
    const width = Math.max(320, wrapper.clientWidth);
    const topHeight = Math.max(320, Math.floor((wrapper.clientHeight || 620) * 0.68));
    const bottomHeight = Math.max(150, Math.floor((wrapper.clientHeight || 620) * 0.22));
    const showCandles = mode === "bar";

    const upperChart = createBaseChart(upperHost, width, topHeight, range, locale, colors, false);
    const lowerChart = createBaseChart(lowerHost, width, bottomHeight, range, locale, colors, true);

    if (showCandles) {
      const candleSeries = upperChart.addSeries(CandlestickSeries, {
        upColor: colors.risingColor,
        downColor: colors.fallingColor,
        borderVisible: true,
        borderUpColor: colors.risingColor,
        borderDownColor: colors.fallingColor,
        wickUpColor: colors.risingColor,
        wickDownColor: colors.fallingColor,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      candleSeries.setData(
        data.map((item) => ({
          time: toUtcTimestamp(item.date),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        })),
      );
    } else {
      const lineSeries = upperChart.addSeries(LineSeries, {
        color: colors.accentColor,
        lineWidth: 3,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      });

      lineSeries.setData(
        data.map((item) => ({
          time: toUtcTimestamp(item.date),
          value: item.close,
        })),
      );
    }

    const volumeSeries = lowerChart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: true,
      base: 0,
      color: colors.accentColor,
      priceFormat: {
        type: "custom",
        minMove: 1,
        formatter: (price: number) => {
          const sign = price < 0 ? "-" : "";
          return `${sign}${formatter.format(Math.abs(price))}`;
        },
      },
    });

    volumeSeries.setData(
      data.map((item) => ({
        time: toUtcTimestamp(item.date),
        value: item.delta,
        color: item.delta >= 0 ? colors.risingColor : colors.fallingColor,
      })),
    );
    volumeSeries.priceScale().applyOptions({
      visible: true,
      autoScale: true,
      borderVisible: false,
      ticksVisible: true,
      entireTextOnly: true,
    });

    upperChart.timeScale().fitContent();
    lowerChart.timeScale().fitContent();

    let syncing = false;
    const syncTimeRange = (source: IChartApi, target: IChartApi) => {
      source.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
        if (syncing || logicalRange === null) {
          return;
        }
        syncing = true;
        target.timeScale().setVisibleLogicalRange(logicalRange);
        syncing = false;
      });
    };

    syncTimeRange(upperChart, lowerChart);
    syncTimeRange(lowerChart, upperChart);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextWidth = Math.max(320, Math.floor(entry.contentRect.width));
      const nextTopHeight = Math.max(320, Math.floor(entry.contentRect.height * 0.68));
      const nextBottomHeight = Math.max(150, Math.floor(entry.contentRect.height * 0.22));
      upperChart.applyOptions({ width: nextWidth, height: nextTopHeight });
      lowerChart.applyOptions({ width: nextWidth, height: nextBottomHeight });
    });

    observer.observe(wrapper);
    upperChartRef.current = upperChart;
    lowerChartRef.current = lowerChart;

    return () => {
      observer.disconnect();
      upperChartRef.current?.remove();
      lowerChartRef.current?.remove();
      upperChartRef.current = null;
      lowerChartRef.current = null;
    };
  }, [data, locale, mode, range, themeKey]);

  if (data.length === 0) {
    return <div className="token-k-chart empty">暂无 token 快照数据</div>;
  }

  return (
    <div ref={wrapperRef} className="token-k-chart token-k-chart--dual">
      <div className="token-k-chart-pane">
        <div className="token-k-chart-pane-label">{locale === "en" ? "Trend" : "趋势"}</div>
        <div ref={upperHostRef} className="token-k-chart-host token-k-chart-host--upper" />
      </div>
      <div className="token-k-chart-pane token-k-chart-pane--delta">
        <div className="token-k-chart-pane-label">{locale === "en" ? "Delta" : "增量"}</div>
        <div ref={lowerHostRef} className="token-k-chart-host token-k-chart-host--lower" />
      </div>
    </div>
  );
}
