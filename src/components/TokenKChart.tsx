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

    if (range === "hour") {
      return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
        month: "numeric",
        day: "numeric",
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
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(date);
  };
}

export function TokenKChart({ data, mode, range, locale, themeKey }: TokenKChartProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const chartHost = chartHostRef.current;
    if (!wrapper || !chartHost) {
      return;
    }

    const gridColor = cssVar("--surface-border", "rgba(148, 163, 184, 0.24)");
    const textColor = cssVar("--text-muted", "#64748b");
    const accentColor = cssVar("--accent-strong", "#7ea9ca");
    const accentDeep = cssVar("--accent-deep", "#4f6f8a");
    const backgroundColor = cssVar("--card-glass-softer", "#171b21");
    const formatter = makeTokenFormatter(locale);
    const showDeltaBars = mode === "bar";

    const baseHeight = Math.max(showDeltaBars ? 680 : 600, wrapper.clientHeight || 0);

    const chart = createChart(chartHost, {
      width: Math.max(320, wrapper.clientWidth),
      height: baseHeight,
      layout: {
        textColor,
        background: {
          type: ColorType.Solid,
          color: backgroundColor,
        },
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor, style: LineStyle.Dashed },
        horzLines: { color: gridColor, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        autoScale: true,
        borderColor: gridColor,
        borderVisible: false,
        scaleMargins: {
          top: showDeltaBars ? 0.06 : 0.08,
          bottom: showDeltaBars ? 0.16 : 0.08,
        },
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: range === "hour" || range === "day",
        secondsVisible: false,
        rightOffset: 1,
        minBarSpacing: range === "hour" ? 8 : range === "day" ? 11 : 14,
        tickMarkFormatter: makeTickFormatter(range, locale),
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
        vertLine: { color: accentDeep, labelBackgroundColor: accentDeep },
        horzLine: { color: accentDeep, labelBackgroundColor: accentDeep },
      },
      localization: {
        locale: locale === "en" ? "en-US" : "zh-CN",
        priceFormatter: (price: number) => formatter.format(price),
        timeFormatter: makeCrosshairTimeFormatter(range, locale),
      },
    });

    const risingColor = locale === "en" ? "#38b46c" : "#e05a5a";
    const fallingColor = locale === "en" ? "#d65c5c" : "#2d9d61";

    if (showDeltaBars) {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: risingColor,
        downColor: fallingColor,
        borderVisible: true,
        borderUpColor: risingColor,
        borderDownColor: fallingColor,
        wickUpColor: risingColor,
        wickDownColor: fallingColor,
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
      candleSeries.priceScale().applyOptions({
        borderVisible: false,
        scaleMargins: {
          top: 0.06,
          bottom: 0.16,
        },
      });
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: accentColor,
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
      lineSeries.priceScale().applyOptions({
        borderVisible: false,
        scaleMargins: {
          top: 0.08,
          bottom: 0.08,
        },
      });
    }

    if (showDeltaBars) {
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          priceLineVisible: false,
          lastValueVisible: false,
          base: 0,
          color: accentColor,
          priceFormat: {
            type: "volume",
          },
        },
        1,
      );

      volumeSeries.setData(
        data.map((item) => ({
          time: toUtcTimestamp(item.date),
          value: item.volume,
          color: item.delta >= 0 ? risingColor : fallingColor,
        })),
      );
      volumeSeries.priceScale().applyOptions({
        visible: false,
        borderVisible: false,
        scaleMargins: {
          top: 0.18,
          bottom: 0.04,
        },
      });
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      chart.applyOptions({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(showDeltaBars ? 680 : 600, Math.floor(entry.contentRect.height)),
      });
      const panes = chart.panes();
      if (showDeltaBars && panes.length >= 2) {
        panes[0].setHeight(Math.max(360, Math.floor(entry.contentRect.height * 0.74)));
        panes[1].setHeight(Math.max(150, Math.floor(entry.contentRect.height * 0.2)));
      }
    });

    observer.observe(wrapper);
    const panes = chart.panes();
    if (showDeltaBars && panes.length >= 2) {
      panes[0].setHeight(Math.max(360, Math.floor(Math.max(baseHeight, wrapper.clientHeight) * 0.74)));
      panes[1].setHeight(Math.max(150, Math.floor(Math.max(baseHeight, wrapper.clientHeight) * 0.2)));
    }
    chartRef.current = chart;

    return () => {
      observer.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [data, locale, mode, range, themeKey]);

  if (data.length === 0) {
    return <div className="token-k-chart empty">暂无 token 快照数据</div>;
  }

  return (
    <div ref={wrapperRef} className="token-k-chart">
      <div ref={chartHostRef} className="token-k-chart-host" />
    </div>
  );
}
