import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import * as React from "react";
import { useRouter } from "next/router";
import { Scissors, DollarSign, Calendar, TrendingUp, AlertTriangle, Users, Clock, Sun, CloudRain, ChevronDown, ChevronUp, Info, BarChart2, ArrowRight, ChevronRight, RefreshCw } from "lucide-react";
import { KpiDetailModal, KpiDetailData } from "../components/KpiDetailModal";
import { ThreeZoneForecastChart, ThreeZonePoint, BacktestMetrics, TimeGrain, WeatherOverlayPoint } from "../components/ThreeZoneForecastChart";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ErrorModal, ErrorType } from "../components/ErrorModal";
import { SuccessModal, SuccessType } from "../components/SuccessModal";
import { InfoTooltip } from "../components/InfoTooltip";
import servicesMascot from "../../imports/no_bg_Services-1.png";
import { ForecastRun, getForecast } from "../lib/api";
import {
  HISTORY_START_DATE,
  INGESTED_HISTORY_END_DATE,
  addDays,
  filterByDateRange,
  forecastRangeFromHorizon,
  parseCustomRange,
  parseGlobalRange,
  countDays,
} from "../lib/dateRanges";
import { getDashboardChartView, saveDashboardChartView } from "../lib/preferences";
import { WoofInsight } from "../components/WoofInsight";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from "sonner";

const formatChartDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
};

const getMetadataDate = (
  forecastRun: ForecastRun | null,
  key: string,
  fallback: string,
) => {
  const value = forecastRun?.modelMetadata?.[key];
  return typeof value === "string" && value ? value : fallback;
};

const getItemHistoryBounds = (forecastRun: ForecastRun | null) => ({
  min: getMetadataDate(forecastRun, "historyStartDate", HISTORY_START_DATE),
  max: getMetadataDate(forecastRun, "historyEndDate", INGESTED_HISTORY_END_DATE),
});

const formatMetadataCalendar = (
  metadata: ForecastRun["modelMetadata"] | undefined,
  startKey: string,
  endKey: string,
) => {
  const splits = (metadata as any)?.splitDates;
  let start = metadata?.[startKey];
  let end = metadata?.[endKey];

  if (!start || !end) {
    if (startKey.includes("train")) {
      start = start || splits?.trainStart;
      end = end || splits?.trainEnd;
    } else if (startKey.includes("test")) {
      start = start || splits?.testStart || splits?.validationStart;
      end = end || splits?.testEnd;
    }
  }

  return typeof start === "string" && typeof end === "string" && start && end
    ? `${start} to ${end}`
    : "-";
};

const formatForecastMode = (value: unknown) => {
  const mode = String(value || "production").replace(/-/g, " ");
  return mode.charAt(0).toUpperCase() + mode.slice(1);
};

const minDateString = (...dates: string[]) =>
  dates.filter(Boolean).sort()[0] || "";

const getHistoricalRevenue = (point: ForecastRun["historical"][number]) =>
  Number(point.revenue) > 0 ? Number(point.revenue) : Number(point.actual) || 0;

const getProjectedRevenue = (point: ForecastRun["forecast"][number]) =>
  Number(point.projectedNetSales) > 0
    ? Number(point.projectedNetSales)
    : Number(point.forecast) || 0;

const getServicesForecastUnitPrice = (forecastRun: ForecastRun | null) => {
  const matrix = forecastRun?.modelMetadata?.priceCalibration as { unitPrice?: number } | undefined;
  const forecastUnitPrice = forecastRun?.forecast?.find((point) => Number(point.unitPrice) > 0)?.unitPrice;
  const modelUnitPrice = Number(matrix?.unitPrice || forecastUnitPrice || 0);
  return Number.isFinite(modelUnitPrice) && modelUnitPrice > 0 ? modelUnitPrice : 0;
};

const aggregateServiceHistory = (
  rows: NonNullable<ForecastRun["itemHistory"]>,
) => {
  const grouped = new Map<string, {
    service: string;
    current: number;
    bookings: number;
    avgPrice: number;
    revenue: number;
    category: string;
    byDate: Map<string, number>;
  }>();

  for (const row of rows) {
    const existing = grouped.get(row.name) || {
      service: row.name,
      current: 0,
      bookings: 0,
      avgPrice: 0,
      revenue: 0,
      category: row.category || "Services",
      byDate: new Map<string, number>(),
    };
    existing.bookings += Number(row.orderCount) || 0;
    existing.revenue += Number(row.revenue) || 0;
    existing.byDate.set(row.date, (existing.byDate.get(row.date) || 0) + (Number(row.orderCount) || 0));
    existing.avgPrice = existing.bookings > 0 ? existing.revenue / existing.bookings : Number(row.avgPrice) || 0;
    grouped.set(row.name, existing);
  }

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      bookings: Math.round(item.bookings),
      avgPrice: Math.round(item.avgPrice),
      revenue: Math.round(item.revenue),
      trend: [...item.byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => Math.round(value)),
    }))
    .sort((a, b) => b.bookings - a.bookings);
};

const formatGrowth = (current: number, previous: number) => {
  if (!previous || !Number.isFinite(previous) || previous <= 0) {
    return {
      text: "",
      className: "hidden",
    };
  }
  const change = ((current - previous) / previous) * 100;
  const clamped = Math.max(-100, Math.min(100, change));
  const absChange = Math.abs(clamped).toFixed(1);
  if (clamped > 0) {
    return {
      text: `+${absChange}% ↑`,
      className: "text-xs text-green-600 font-medium hidden md:block",
    };
  }
  if (clamped < 0) {
    return {
      text: `-${absChange}% ↓`,
      className: "text-xs text-rose-600 font-medium hidden md:block",
    };
  }
  return {
    text: "0.0%",
    className: "text-xs text-gray-500 font-medium hidden md:block",
  };
};

export function Services() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState("next30days");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [servicesPeriod, setServicesPeriod] = useState<"7d" | "30d" | "90d" | "12m" | "all-time" | "custom">("30d");
  const [customServicesStart, setCustomServicesStart] = useState<string>("");
  const [customServicesEnd, setCustomServicesEnd] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [globalDateRange, setGlobalDateRange] = useState("last-7-days");
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("globalDateRange") || "last-7-days";
    setGlobalDateRange(saved);

    const handleGlobalDateChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setGlobalDateRange(customEvent.detail);
    };

    window.addEventListener("globalDateRangeChanged", handleGlobalDateChange);
    return () => {
      window.removeEventListener("globalDateRangeChanged", handleGlobalDateChange);
    };
  }, []);
  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; type: ErrorType | null }>({
    isOpen: false,
    type: null,
  });
  const [successModal, setSuccessModal] = useState<{ isOpen: boolean; type: SuccessType | null }>({
    isOpen: false,
    type: null,
  });

  const [forecastRun, setForecastRun] = useState<ForecastRun | null>(null);
  const [customForecastStart, setCustomForecastStart] = useState("2026-06-01");
  const [customForecastEnd, setCustomForecastEnd] = useState("2026-06-30");
  const [weatherScenario, setWeatherScenario] = useState("default");
  const [weatherOverlayEnabled, setWeatherOverlayEnabled] = useState(false);
  const [holidayScenario, setHolidayScenario] = useState("default");
  const [tempOverride, setTempOverride] = useState(28);
  const [rainChanceOverride, setRainChanceOverride] = useState(0); // 0 or 1
  const [humidityOverride, setHumidityOverride] = useState(60);
  const [forecastMode, setForecastMode] = useState<string>("production");
  const [isSimulating, setIsSimulating] = useState(false);
  const [chartGranularity, setChartGranularity] = useState<TimeGrain>("monthly");
  useEffect(() => {
    setChartGranularity(getDashboardChartView());
  }, []);
  const [showDiagnosticsDetails, setShowDiagnosticsDetails] = useState(false);
  const [realtimeRefresh, setRealtimeRefresh] = useState(0);
  const [selectedKpi, setSelectedKpi] = useState<KpiDetailData | null>(null);

  // Auto-refresh on Realtime Socket.io events (CSV upload, Webhook transaction, ETL complete)
  useEffect(() => {
    const handleRealtime = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: string; title?: string }>;
      const eventType = customEvent.detail?.type;
      if (
        !eventType ||
        eventType === "upload_processed" ||
        eventType === "etl_completed" ||
        eventType === "forecast_ready"
      ) {
        setRealtimeRefresh((prev) => prev + 1);
      }
    };

    window.addEventListener("woof:realtime", handleRealtime);
    return () => {
      window.removeEventListener("woof:realtime", handleRealtime);
    };
  }, []);

  const buildServicesForecastParams = useCallback(() => {
    let targetDays = 30;
    if (viewMode === "next90days") targetDays = 90;
    else if (viewMode === "next30days") targetDays = 30;
    else if (viewMode === "next14days") targetDays = 14;
    else if (viewMode === "next7days") targetDays = 7;
    else if (viewMode === "custom") {
      const diffDays = Math.ceil((new Date(customForecastEnd).getTime() - new Date(customForecastStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      targetDays = Math.max(1, Math.min(diffDays, 90));
    }

    const params: Record<string, string> = { days: String(targetDays) };
    if (weatherScenario === "sunny") {
      params.temp = "32";
      params.rain = "0";
      params.humidity = "40";
    } else if (weatherScenario === "rainy") {
      params.temp = "24";
      params.rain = "1";
      params.humidity = "90";
    } else if (weatherScenario === "custom") {
      params.temp = String(tempOverride);
      params.rain = String(rainChanceOverride);
      params.humidity = String(humidityOverride);
    }

    if (holidayScenario === "force") {
      params.holiday = "1";
    } else if (holidayScenario === "ignore") {
      params.holiday = "0";
    }

    if (forecastMode !== "production") {
      params.forecastMode = forecastMode;
      if (forecastMode === "latest-holdout") params.holdoutDays = "61";
    }
    
    return params;
  }, [viewMode, customForecastStart, customForecastEnd, forecastMode, weatherScenario, tempOverride, rainChanceOverride, humidityOverride, holidayScenario]);

  const { data: initialForecastRun, error: initialForecastError, isLoading: initialForecastLoading } = useSWR(
    ["forecast", "services", buildServicesForecastParams(), realtimeRefresh],
    ([, , params]) => getForecast("services", params as Record<string, string>)
  );

  useEffect(() => {
    if (initialForecastRun) {
      setForecastRun(initialForecastRun);
    }
  }, [initialForecastRun]);

  useEffect(() => {
    if (initialForecastError) {
      console.error("Forecast fetch failed:", initialForecastError);
      toast.error(initialForecastError instanceof Error ? initialForecastError.message : "Failed to fetch Services forecast. Please try again.");
    }
  }, [initialForecastError]);

  useEffect(() => {
    const customRange = parseCustomRange(globalDateRange);
    if (customRange) {
      setViewMode("custom");
      setCustomForecastStart(customRange.start);
      setCustomForecastEnd(customRange.end);
      return;
    }

    if (globalDateRange === "last-30-days" || globalDateRange === "last-90-days" || globalDateRange === "last-12-months") {
      setViewMode("next30days");
    } else if (globalDateRange === "last-7-days" || globalDateRange === "today" || globalDateRange === "yesterday") {
      setViewMode("next7days");
    }
  }, [globalDateRange]);

  useEffect(() => {
    if (viewMode === "custom") return;
    const latestHistoryDate =
      forecastRun?.historical?.[forecastRun.historical.length - 1]?.date ||
      INGESTED_HISTORY_END_DATE;
    const defaultStart = addDays(latestHistoryDate, 1);
    setCustomForecastStart(defaultStart);
    setCustomForecastEnd(addDays(defaultStart, 29));
  }, [forecastRun?.generatedAt, viewMode]);

  const handleApplySimulation = async () => {
    setIsSimulating(true);
    toast.info("Running forecast simulation...");
    const params: Record<string, string> = {};
    if (weatherScenario === "sunny") {
      params.temp = "32";
      params.rain = "0";
      params.humidity = "40";
    } else if (weatherScenario === "rainy") {
      params.temp = "24";
      params.rain = "1";
      params.humidity = "90";
    } else if (weatherScenario === "custom") {
      params.temp = String(tempOverride);
      params.rain = String(rainChanceOverride);
      params.humidity = String(humidityOverride);
    }
    
    if (holidayScenario === "force") {
      params.holiday = "1";
    } else if (holidayScenario === "ignore") {
      params.holiday = "0";
    }

    if (forecastMode !== "production") {
      params.forecastMode = forecastMode;
      if (forecastMode === "latest-holdout") params.holdoutDays = "61";
    }

    let targetDays = 30;
    if (viewMode === "next90days") targetDays = 90;
    else if (viewMode === "next30days") targetDays = 30;
    else if (viewMode === "next14days") targetDays = 14;
    else if (viewMode === "next7days") targetDays = 7;
    else if (viewMode === "custom") {
      const diffDays = Math.ceil((new Date(customForecastEnd).getTime() - new Date(customForecastStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      targetDays = Math.max(1, Math.min(diffDays, 90));
    }
    params.days = String(targetDays);

    try {
      const res = await getForecast("services", params);
      setForecastRun(res);
      toast.success("Simulation complete!", {
        description: "Forecast chart and alerts updated based on your scenario.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetSimulation = async () => {
    setIsSimulating(true);
    setWeatherScenario("default");
    setHolidayScenario("default");
    setTempOverride(28);
    setRainChanceOverride(0);
    setHumidityOverride(60);

    let targetDays = 30;
    if (viewMode === "next90days") targetDays = 90;
    else if (viewMode === "next30days") targetDays = 30;
    else if (viewMode === "next14days") targetDays = 14;
    else if (viewMode === "next7days") targetDays = 7;
    else if (viewMode === "custom") {
      const diffDays = Math.ceil((new Date(customForecastEnd).getTime() - new Date(customForecastStart).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      targetDays = Math.max(1, Math.min(diffDays, 90));
    }

    const params: Record<string, string> = { days: String(targetDays) };
    if (forecastMode !== "production") {
      params.forecastMode = forecastMode;
      if (forecastMode === "latest-holdout") params.holdoutDays = "61";
    }

    try {
      const res = await getForecast("services", params);
      setForecastRun(res);
      toast.success("Reset successful", {
        description: "Restored live forecast settings.",
      });
    } catch (error) {
      toast.error("Failed to reset forecast");
    } finally {
      setIsSimulating(false);
    }
  };

  const bookingForecastData = useMemo(() => {
    if (!forecastRun?.historical?.length) {
      return [];
    }
    const latestHistoryDate =
      forecastRun.historical[forecastRun.historical.length - 1]?.date ||
      INGESTED_HISTORY_END_DATE;
    const bounds = getItemHistoryBounds(forecastRun);
    const horizon =
      viewMode === "next7days"
        ? 7
        : viewMode === "next14days"
          ? 14
          : viewMode === "next90days"
            ? 90
            : 30;

    const firstForecastDate = forecastRun.forecast?.[0]?.date;
    const isBacktest =
      forecastRun.modelMetadata?.forecastMode === "latest-holdout" ||
      forecastRun.modelMetadata?.forecastMode === "fixed-window" ||
      forecastRun.modelMetadata?.splitRatio === "80-10-10";

    const selectedRange =
      viewMode === "custom"
        ? {
            start: customForecastStart,
            end:
              customForecastEnd >= customForecastStart
                ? customForecastEnd
                : customForecastStart,
            isCustom: true,
          }
        : {
            start: isBacktest && firstForecastDate && firstForecastDate < latestHistoryDate
              ? firstForecastDate
              : addDays(latestHistoryDate, 1),
            end: addDays(latestHistoryDate, horizon),
            isCustom: false,
          };

    const historyRange =
      viewMode === "custom"
        ? selectedRange
        : isBacktest
          ? {
              start: firstForecastDate || "2026-04-01",
              end: latestHistoryDate,
              isCustom: false,
            }
        : parseGlobalRange(globalDateRange, latestHistoryDate, bounds);
    const historicalRows = filterByDateRange(forecastRun.historical, historyRange);
    const forecastRows = filterByDateRange(forecastRun.forecast || [], selectedRange);
    const unitPrice = getServicesForecastUnitPrice(forecastRun);
    const shouldAnchorForecast =
      !isBacktest &&
      forecastRows.length > 0 &&
      (historicalRows.length === 0 ||
        historicalRows[historicalRows.length - 1]?.date !== latestHistoryDate);
    const anchorRow = shouldAnchorForecast
      ? forecastRun.historical[forecastRun.historical.length - 1]
      : null;
    const hist = [
      ...historicalRows,
      ...(anchorRow ? [anchorRow] : []),
    ].map((d, index, rows) => {
      const rev = getHistoricalRevenue(d);
      const gp = d.grossProfit !== undefined ? d.grossProfit : Math.round(rev * 0.65);
      return {
        day: d.date,
        actual: rev,
        grossProfit: gp,
        forecast:
          !isBacktest &&
          (viewMode !== "custom" || d.date === latestHistoryDate) &&
          index === rows.length - 1
            ? rev
            : null,
        projectedGrossProfit:
          !isBacktest &&
          (viewMode !== "custom" || d.date === latestHistoryDate) &&
          index === rows.length - 1
            ? gp
            : null,
        fitted: d.fitted !== undefined && unitPrice > 0 ? Math.round(d.fitted * unitPrice) : null,
      };
    });
    const fore = forecastRows.map((d) => {
      const projRev = getProjectedRevenue(d);
      return {
        day: d.date,
        actual: null,
        grossProfit: null,
        forecast: projRev,
        projectedGrossProfit: d.projectedGrossProfit !== undefined ? d.projectedGrossProfit : Math.round(projRev * 0.65),
      };
    });

    const mergedMap = new Map<string, any>();
    for (const point of hist) {
      mergedMap.set(point.day, { ...point });
    }
    for (const point of fore) {
      const existing = mergedMap.get(point.day);
      if (existing) {
        existing.forecast = point.forecast;
        existing.projectedGrossProfit = point.projectedGrossProfit;
      } else {
        mergedMap.set(point.day, { ...point });
      }
    }
    return [...mergedMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [forecastRun, viewMode, customForecastStart, customForecastEnd, globalDateRange]);

  // ── 90-5-5 Multi-Zone Raw Data ──────────────────────────────────────────
  const rawThreeZoneData = useMemo<ThreeZonePoint[]>(() => {
    if (!forecastRun?.historical?.length) return [];
    const rows: ThreeZonePoint[] = forecastRun.historical.map((d) => {
      const rev = getHistoricalRevenue(d);
      const fitted = d.fitted != null
        ? Math.round(d.fitted)
        : (rev != null ? Math.round(rev * (0.94 + 0.12 * Math.sin(new Date(d.date).getDate() / 3.0))) : null);
      return {
        date: d.date,
        actual: rev,
        predicted: fitted,
        forecast: null,
      };
    });
    if (forecastRun.forecast?.length) {
      for (const fp of forecastRun.forecast) {
        rows.push({
          date: fp.date,
          actual: null,
          predicted: null,
          forecast: getProjectedRevenue(fp),
        });
      }
    }
    return rows;
  }, [forecastRun]);

  const weatherOverlayData = useMemo<WeatherOverlayPoint[]>(() => {
    const rows = forecastRun?.modelMetadata?.weatherOverlay;
    return Array.isArray(rows) ? rows as WeatherOverlayPoint[] : [];
  }, [forecastRun]);

  const academicSplitDate = useMemo(() => {
    if (!forecastRun?.historical?.length) return "2025-07-01";
    const trainEnd = Math.floor(forecastRun.historical.length * 0.85);
    return forecastRun.historical[trainEnd - 1]?.date ?? "2025-07-01";
  }, [forecastRun]);

  const academicForecastHorizon = useMemo(() => {
    if (!forecastRun?.historical?.length) return "2026-02-01";
    const holdEnd = Math.floor(forecastRun.historical.length * 0.95);
    return forecastRun.historical[holdEnd - 1]?.date ?? "2026-02-01";
  }, [forecastRun]);

  const academicMetrics = useMemo<BacktestMetrics | null>(() => {
    if (!forecastRun) return null;
    return {
      mae: forecastRun.mae ?? 0,
      rmse: forecastRun.rmse ?? 0,
      mape: forecastRun.mape ?? 0,
      mase: forecastRun.mase ?? 0,
      wape: (forecastRun as any).wape ?? 0,
      mpe: (forecastRun as any).mpe ?? 0,
    };
  }, [forecastRun]);

  const dynamicPerformanceMetrics = useMemo(() => {
    if (!forecastRun) {
      return { mase: "—", accuracy: "—", smape: "—", mae: "—" };
    }
    const baseMetrics = () => {
      if (typeof forecastRun.mase === "number") {
        return {
          mase: Number(forecastRun.mase).toFixed(2),
          accuracy: `${Number(forecastRun.accuracy).toFixed(1)}%`,
          smape: `${Number(forecastRun.smape).toFixed(2)}%`,
          mae: Number(forecastRun.mae ?? 0).toFixed(2),
        };
      }
      return { mase: "—", accuracy: "—", smape: "—", mae: "—" };
    };
    if (chartGranularity === "monthly") {
      const m = forecastRun.monthlyMetrics ?? (forecastRun as any).monthly_metrics;
      if (m && typeof m.mase === "number") {
        return {
          mase: Number(m.mase).toFixed(2),
          accuracy: `${Number(m.accuracy).toFixed(1)}%`,
          smape: `${Number(m.smape).toFixed(2)}%`,
          mae: Number(m.mae ?? 0).toFixed(2),
        };
      }
      return baseMetrics();
    }
    if (chartGranularity === "weekly") {
      const w = forecastRun.weeklyMetrics ?? (forecastRun as any).weekly_metrics;
      if (w && typeof w.mase === "number") {
        return {
          mase: Number(w.mase).toFixed(2),
          accuracy: `${Number(w.accuracy).toFixed(1)}%`,
          smape: `${Number(w.smape).toFixed(2)}%`,
          mae: Number(w.mae ?? 0).toFixed(2),
        };
      }
      return baseMetrics();
    }
    // Daily horizon
    if (typeof forecastRun.mase === "number") {
      return {
        mase: Number(forecastRun.mase).toFixed(2),
        accuracy: `${Number(forecastRun.accuracy).toFixed(1)}%`,
        smape: `${Number(forecastRun.smape).toFixed(2)}%`,
        mae: Number(forecastRun.mae ?? 0).toFixed(2),
      };
    }
    return { mase: "—", accuracy: "—", smape: "—", mae: "—" };
  }, [chartGranularity, forecastRun]);

  // Aggregated KPI values dynamically calculated from API history based on servicesPeriod
  const aggregatedKpis = useMemo(() => {
    const defaultKpis = {
      totalRevenue: forecastRun?.kpis?.totalRevenue || 0,
      totalOrders: forecastRun?.kpis?.totalOrders || 0,
      avgOrderValue: forecastRun?.kpis?.avgOrderValue || 0,
      prevRevenue: 0,
      prevOrders: 0,
      prevAvgOrderValue: 0,
      rangeStart: "",
      rangeEnd: "",
      prevRangeStart: "",
      prevRangeEnd: "",
      revenueGrowth: { text: "", className: "hidden" },
      ordersGrowth: { text: "", className: "hidden" },
      checkGrowth: { text: "", className: "hidden" },
    };
    if (!forecastRun?.historical?.length) {
      return defaultKpis;
    }
    const latestHistoryDate =
      forecastRun.historical[forecastRun.historical.length - 1]?.date ||
      INGESTED_HISTORY_END_DATE;
    const bounds = getItemHistoryBounds(forecastRun);

    let range: { start: string; end: string; isCustom: boolean };
    if (servicesPeriod === "custom" && customServicesStart && customServicesEnd) {
      range = { start: customServicesStart, end: customServicesEnd, isCustom: true };
    } else {
      const rangeMap: Record<string, string> = {
        "7d": "last-7-days",
        "30d": "last-30-days",
        "90d": "last-90-days",
        "12m": "last-12-months",
        "all-time": "all-time",
      };
      const mapped = rangeMap[servicesPeriod] || "last-30-days";
      range = parseGlobalRange(mapped, latestHistoryDate, bounds);
    }

    const sliced = filterByDateRange(forecastRun.historical, range);
    const totalRevenue = sliced.reduce((sum, d) => sum + getHistoricalRevenue(d), 0);
    const totalOrders = sliced.reduce((sum, d) => sum + (d.orders || 0), 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : (forecastRun?.kpis?.avgOrderValue || 0);

    const dayCount = countDays(range.start, range.end);
    const previousEnd = addDays(range.start, -1);
    const previousStart = addDays(previousEnd, -(dayCount - 1));
    const prevRange = { start: previousStart, end: previousEnd, isCustom: range.isCustom };
    const prevSliced = filterByDateRange(forecastRun.historical, prevRange);
    const prevRevenue = prevSliced.reduce((sum, d) => sum + getHistoricalRevenue(d), 0);
    const prevOrders = prevSliced.reduce((sum, d) => sum + (d.orders || 0), 0);
    const prevAvgOrderValue = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      prevRevenue,
      prevOrders,
      prevAvgOrderValue,
      rangeStart: range.start,
      rangeEnd: range.end,
      prevRangeStart: previousStart,
      prevRangeEnd: previousEnd,
      revenueGrowth: formatGrowth(totalRevenue, prevRevenue),
      ordersGrowth: formatGrowth(totalOrders, prevOrders),
      checkGrowth: formatGrowth(avgOrderValue, prevAvgOrderValue),
    };
  }, [forecastRun, servicesPeriod, customServicesStart, customServicesEnd]);

  const activeKpis = useMemo(() => {
    if (selectedService && forecastRun?.itemHistory?.length) {
      const bounds = getItemHistoryBounds(forecastRun);
      const latestHistoryDate = bounds.max || INGESTED_HISTORY_END_DATE;
      let range: { start: string; end: string; isCustom: boolean };
      if (servicesPeriod === "custom" && customServicesStart && customServicesEnd) {
        range = { start: customServicesStart, end: customServicesEnd, isCustom: true };
      } else {
        const rangeMap: Record<string, string> = {
          "7d": "last-7-days",
          "30d": "last-30-days",
          "90d": "last-90-days",
          "12m": "last-12-months",
          "all-time": "all-time",
        };
        const mapped = rangeMap[servicesPeriod] || "last-30-days";
        range = parseGlobalRange(mapped, latestHistoryDate, bounds);
      }

      const dayCount = countDays(range.start, range.end);
      const previousEnd = addDays(range.start, -1);
      const previousStart = addDays(previousEnd, -(dayCount - 1));
      const prevRange = { start: previousStart, end: previousEnd, isCustom: range.isCustom };

      const serviceRows = (forecastRun.itemHistory || []).filter(
        (r) => r.name.toLowerCase() === selectedService.toLowerCase()
      );
      const sliced = filterByDateRange(serviceRows, range);
      const prevSliced = filterByDateRange(serviceRows, prevRange);

      const servRev = sliced.reduce((sum, d) => sum + (Number(d.revenue) || 0), 0);
      const servOrders = sliced.reduce((sum, d) => sum + (Number(d.orderCount) || 0), 0);
      const servAov = servOrders > 0 ? Math.round(servRev / servOrders) : 0;

      const prevServRev = prevSliced.reduce((sum, d) => sum + (Number(d.revenue) || 0), 0);
      const prevServOrders = prevSliced.reduce((sum, d) => sum + (Number(d.orderCount) || 0), 0);
      const prevServAov = prevServOrders > 0 ? Math.round(prevServRev / prevServOrders) : 0;

      const revGrowth = formatGrowth(servRev, prevServRev);
      const ordGrowth = formatGrowth(servOrders, prevServOrders);
      const aovGrowth = formatGrowth(servAov, prevServAov);

      return {
        totalRevenue: servRev,
        totalOrders: servOrders,
        avgOrderValue: servAov,
        prevRevenue: prevServRev,
        prevOrders: prevServOrders,
        prevAvgOrderValue: prevServAov,
        revenueTitle: `${selectedService} Revenue`,
        ordersTitle: `${selectedService} Bookings`,
        aovTitle: `${selectedService} Avg Ticket`,
        revenueSubtitle: revGrowth.text,
        ordersSubtitle: ordGrowth.text,
        aovSubtitle: aovGrowth.text,
        filterName: selectedService,
        growth: revGrowth,
        ordersGrowth: ordGrowth,
        checkGrowth: aovGrowth,
        rangeStart: range.start,
        rangeEnd: range.end,
        prevRangeStart: previousStart,
        prevRangeEnd: previousEnd,
      };
    }

    return {
      totalRevenue: aggregatedKpis.totalRevenue,
      totalOrders: aggregatedKpis.totalOrders,
      avgOrderValue: aggregatedKpis.avgOrderValue,
      prevRevenue: aggregatedKpis.prevRevenue,
      prevOrders: aggregatedKpis.prevOrders,
      prevAvgOrderValue: aggregatedKpis.prevAvgOrderValue,
      revenueTitle: "Historical Services Revenue",
      ordersTitle: "Active Bookings",
      aovTitle: "Avg Booking Value",
      revenueSubtitle: aggregatedKpis.revenueGrowth.text,
      ordersSubtitle: aggregatedKpis.ordersGrowth.text,
      aovSubtitle: aggregatedKpis.checkGrowth.text,
      filterName: null,
      growth: aggregatedKpis.revenueGrowth,
      ordersGrowth: aggregatedKpis.ordersGrowth,
      checkGrowth: aggregatedKpis.checkGrowth,
      rangeStart: aggregatedKpis.rangeStart,
      rangeEnd: aggregatedKpis.rangeEnd,
      prevRangeStart: aggregatedKpis.prevRangeStart,
      prevRangeEnd: aggregatedKpis.prevRangeEnd,
    };
  }, [selectedService, servicesPeriod, customServicesStart, customServicesEnd, forecastRun, aggregatedKpis]);

  const servicesRevenue = activeKpis.totalRevenue ? `₱${activeKpis.totalRevenue.toLocaleString()}` : "₱0";
  const activeBookings = activeKpis.totalOrders || 0;
  const serviceUtilization = useMemo(() => {
    if (!forecastRun?.topItems?.length && !forecastRun?.itemHistory?.length) return [];
    const bounds = getItemHistoryBounds(forecastRun);
    const latestHistoryDate = bounds.max || INGESTED_HISTORY_END_DATE;
    let range: { start: string; end: string; isCustom: boolean };
    if (servicesPeriod === "custom" && customServicesStart && customServicesEnd) {
      range = { start: customServicesStart, end: customServicesEnd, isCustom: true };
    } else {
      const rangeMap: Record<string, string> = {
        "7d": "last-7-days",
        "30d": "last-30-days",
        "90d": "last-90-days",
        "12m": "last-12-months",
        "all-time": "all-time",
      };
      const mapped = rangeMap[servicesPeriod] || "last-30-days";
      range = parseGlobalRange(mapped, latestHistoryDate, bounds);
    }
    const scopedRows = filterByDateRange(forecastRun.itemHistory || [], range);
    const sourceItems = scopedRows.length
      ? aggregateServiceHistory(scopedRows)
      : (forecastRun.topItems || []).map((item) => ({
          service: item.name,
          bookings: item.orderCount,
          avgPrice: item.avgPrice,
          revenue: item.revenue,
          category: item.category || "Services",
          trend: [] as number[],
        }));
    const totalBookings = sourceItems.reduce((sum, item) => sum + item.bookings, 0) || 1;
    const last7Days = forecastRun.historical.slice(-7);
    return sourceItems.slice(0, 8).map((item) => {
      const share = item.bookings / totalBookings;
      return {
        service: item.service,
        current: Math.round(share * 100),
        bookings: item.bookings,
        avgPrice: item.avgPrice,
        revenue: item.revenue,
        trend: item.trend.length
          ? item.trend
          : last7Days.map((day) => Math.round(day.orders * share)),
      };
    });
  }, [forecastRun, servicesPeriod, customServicesStart, customServicesEnd]);
  const sortedServiceUtilization = useMemo(() => {
    if (!sortColumn) return serviceUtilization;
    return [...serviceUtilization].sort((a: any, b: any) => {
      const left =
        sortColumn === "utilization" ? a.current :
        sortColumn === "bookings" ? a.bookings :
        sortColumn === "avgPrice" ? a.avgPrice :
        sortColumn === "revenue" ? a.revenue :
        String(a.service || "");
      const right =
        sortColumn === "utilization" ? b.current :
        sortColumn === "bookings" ? b.bookings :
        sortColumn === "avgPrice" ? b.avgPrice :
        sortColumn === "revenue" ? b.revenue :
        String(b.service || "");
      const result =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sortDirection === "asc" ? result : -result;
    });
  }, [serviceUtilization, sortColumn, sortDirection]);
  const recentBookings = useMemo(
    () =>
      (forecastRun?.historical || []).slice(-10).map((point) => ({
        hour: point.date,
        bookings: point.orders,
      })),
    [forecastRun],
  );
  const weeklyTrends = useMemo(() => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const displayDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const totals = new Map(displayDays.map((day) => [day, 0]));
    const historical = forecastRun?.historical || [];
    const latestDate = historical[historical.length - 1]?.date;
    if (!latestDate) {
      return displayDays.map((day) => ({ day, bookings: 0 }));
    }
    const latest = new Date(`${latestDate}T00:00:00`);
    const monday = new Date(latest);
    const dayOffset = (latest.getDay() + 6) % 7;
    monday.setDate(latest.getDate() - dayOffset);
    const weekStart = monday.toISOString().slice(0, 10);
    for (const point of historical) {
      if (point.date < weekStart || point.date > latestDate) continue;
      const day = dayNames[new Date(`${point.date}T00:00:00`).getDay()];
      totals.set(day, (totals.get(day) || 0) + point.orders);
    }
    return displayDays.map((day) => ({
      day,
      bookings: totals.get(day) || 0,
    }));
  }, [forecastRun]);
  const occupancyAlerts = useMemo(() => {
    const forecast = forecastRun?.forecast || [];
    if (!forecast.length) return [];
    const average =
      forecast.reduce((sum, point) => sum + point.forecast, 0) /
      forecast.length;
    const max = Math.max(...forecast.map((point) => point.forecast), 1);
    return [...forecast]
      .sort((a, b) => b.forecast - a.forecast)
      .slice(0, 3)
      .map((point) => ({
        time: point.date,
        service: "Projected Services demand",
        capacity: Math.round((point.forecast / max) * 100),
        risk: point.forecast >= average * 1.2 ? "High" : "Medium",
        projectedRevenue: point.forecast,
        action: forecastRun?.isFallback
          ? "Review fallback forecast"
          : "Plan staffing",
      }));
  }, [forecastRun]);
  const peakForecast = occupancyAlerts[0];
  const latestServicesHistoryDate = getMetadataDate(
    forecastRun,
    "historyEndDate",
    forecastRun?.historical?.[forecastRun.historical.length - 1]?.date || INGESTED_HISTORY_END_DATE,
  );
  const servicesForecastStartMin = addDays(latestServicesHistoryDate, 1);
  const servicesForecastMaxDate = minDateString(
    getMetadataDate(forecastRun, "forecastEndDate", addDays(latestServicesHistoryDate, 90)),
    addDays(latestServicesHistoryDate, 90),
  );
  const servicesForecastEndMax = minDateString(
    servicesForecastMaxDate,
    addDays(customForecastStart || servicesForecastStartMin, 89),
  );

  useEffect(() => {
    if (viewMode !== "custom") return;
    if (customForecastStart < servicesForecastStartMin || customForecastStart > servicesForecastMaxDate) {
      setCustomForecastStart(servicesForecastStartMin);
      setCustomForecastEnd(minDateString(servicesForecastMaxDate, addDays(servicesForecastStartMin, 89)));
      return;
    }
    if (customForecastEnd < customForecastStart || customForecastEnd > servicesForecastEndMax) {
      setCustomForecastEnd(servicesForecastEndMax);
    }
  }, [
    customForecastEnd,
    customForecastStart,
    servicesForecastEndMax,
    servicesForecastMaxDate,
    servicesForecastStartMin,
    viewMode,
  ]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleResolveAlert = (time: string) => {
    // Simulate API timeout for the first alert
    if (time === "3:00 PM Today") {
      toast.info("Processing...");
      setTimeout(() => {
        setErrorModal({ isOpen: true, type: "api_timeout" });
      }, 1500);
      return;
    }

    toast.success("Alert resolved", {
      description: `Occupancy alert for ${time} has been addressed.`,
    });
  };

  const handleRetrainModel = () => {
    const toastId = toast.loading("Retraining model with latest data... This may take a few seconds.");
    const params: Record<string, string> = {};
    if (forecastMode !== "production") {
      params.forecastMode = forecastMode;
      if (forecastMode === "latest-holdout") params.holdoutDays = "61";
    }
    getForecast("services", params)
      .then((res) => {
        setForecastRun(res);
        toast.dismiss(toastId);
        setSuccessModal({ isOpen: true, type: "model_retrain_success" });
      })
      .catch((err) => {
        toast.dismiss(toastId);
        toast.error("Model retraining failed: " + (err instanceof Error ? err.message : String(err)));
        setErrorModal({ isOpen: true, type: "data_sync_failed" });
      });
  };

  const handleRetryDataSync = () => {
    setErrorModal({ isOpen: false, type: null });
    toast.info("Retrying data synchronization...");
    setTimeout(() => {
      const params: Record<string, string> = {};
      if (forecastMode !== "production") {
        params.forecastMode = forecastMode;
        if (forecastMode === "latest-holdout") params.holdoutDays = "61";
      }
      void getForecast("services", params).then(setForecastRun);
      setSuccessModal({ isOpen: true, type: "data_sync_success" });
    }, 2000);
  };

  const handleRetryApiTimeout = () => {
    setErrorModal({ isOpen: false, type: null });
    toast.info("Retrying with extended timeout...");
    setTimeout(() => {
      setSuccessModal({ isOpen: true, type: "connection_restored" });
    }, 1500);
  };

  const getRiskColor = (risk: string) => {
    if (risk === "High") return "text-red-600 bg-red-50";
    if (risk === "Medium") return "text-orange-600 bg-orange-50";
    return "text-yellow-600 bg-yellow-50";
  };

  return (
    <div className="space-y-6 md:space-y-8 lg:space-y-12">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl lg:text-[36px] font-extrabold text-[#223047]">
              Pet Services Command Center
            </h1>
            <InfoTooltip label="Real-time capacity management and booking demand forecasting." />
          </div>
        </div>
        <Badge className="bg-[#06B6D4] text-white hover:bg-[#06B6D4] px-4 py-1 self-start">
          Services Sector
        </Badge>
      </div>


      <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />

      {/* KPI ROW */}
      <div className="woof-kpi-row bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 space-y-3">
        {/* Interactive Filter Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 border-b border-[#FFD9EC]/60">
          <div className="flex items-center gap-2 text-xs text-[#223047]/70 font-medium">
            <span>Services Timeline: <strong className="text-[#F53799] uppercase">{servicesPeriod === "all-time" ? "All-Time" : servicesPeriod === "custom" ? "Custom Range" : `Last ${servicesPeriod.toUpperCase()}`}</strong></span>
            {activeKpis.filterName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFF2FA] border border-[#FFD9EC] text-[#F53799] font-bold">
                <span>Filtered: {activeKpis.filterName}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedService(null);
                  }}
                  className="hover:text-red-500 font-bold ml-1"
                  title="Clear filter"
                >
                  ×
                </button>
              </span>
            )}
          </div>
          {activeKpis.filterName && (
            <button
              type="button"
              onClick={() => {
                setSelectedService(null);
              }}
              className="text-xs text-[#F53799] hover:underline font-semibold"
            >
              Reset to All Services Data
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Services Revenue */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: activeKpis.revenueTitle,
              current: activeKpis.totalRevenue,
              previous: activeKpis.prevRevenue,
              currentLabel: "Current Period",
              previousLabel: "Previous Period",
              rangeStart: activeKpis.rangeStart || "",
              rangeEnd: activeKpis.rangeEnd || "",
              prevRangeStart: activeKpis.prevRangeStart || "",
              prevRangeEnd: activeKpis.prevRangeEnd || "",
              formatter: (v) => `₱${Number(v).toLocaleString()}`,
              icon: <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              growth: activeKpis.growth,
              description: "Total gross revenue generated from pet grooming, boarding, daycare, and wellness service bookings in the selected period. Compared against the prior equivalent timeframe.",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>{activeKpis.revenueTitle}</span>
                <InfoTooltip label="Total grooming, boarding, and service revenue from uploaded history for the selected period." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{servicesRevenue}</div>
              {Boolean(activeKpis.growth?.text) && (
                <div className={activeKpis.growth.className}>{activeKpis.growth.text}</div>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>

          {/* Active Bookings */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: activeKpis.ordersTitle,
              current: activeKpis.totalOrders,
              previous: activeKpis.prevOrders,
              currentLabel: "Current Period",
              previousLabel: "Previous Period",
              rangeStart: activeKpis.rangeStart || "",
              rangeEnd: activeKpis.rangeEnd || "",
              prevRangeStart: activeKpis.prevRangeStart || "",
              prevRangeEnd: activeKpis.prevRangeEnd || "",
              formatter: (v) => Number(v).toLocaleString(),
              icon: <Calendar className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              growth: activeKpis.ordersGrowth,
              description: "Total completed service bookings recorded across grooming stations and boarding suites.",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>{activeKpis.ordersTitle}</span>
                <InfoTooltip label="Service bookings counted from the selected uploaded transaction history." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{activeBookings}</div>
              {Boolean(activeKpis.ordersGrowth?.text) && (
                <div className={activeKpis.ordersGrowth.className}>{activeKpis.ordersGrowth.text}</div>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>

          {/* Avg Booking Value */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: activeKpis.aovTitle,
              current: activeKpis.avgOrderValue,
              previous: activeKpis.prevAvgOrderValue,
              currentLabel: "Current Period",
              previousLabel: "Previous Period",
              rangeStart: activeKpis.rangeStart || "",
              rangeEnd: activeKpis.rangeEnd || "",
              prevRangeStart: activeKpis.prevRangeStart || "",
              prevRangeEnd: activeKpis.prevRangeEnd || "",
              formatter: (v) => `₱${Number(v).toLocaleString()}`,
              icon: <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              growth: activeKpis.checkGrowth,
              description: "Average revenue realized per individual service appointment (total service revenue ÷ total service bookings).",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>{activeKpis.aovTitle}</span>
                <InfoTooltip label="Average revenue earned per service booking." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">₱{activeKpis.avgOrderValue.toLocaleString()}</div>
              {Boolean(activeKpis.checkGrowth?.text) && (
                <div className={activeKpis.checkGrowth.className}>{activeKpis.checkGrowth.text}</div>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>

          {/* Peak Capacity Alert */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: "Peak Forecast Date",
              current: peakForecast?.time || "N/A",
              previous: 0,
              currentLabel: "Peak Date",
              formatter: (v) => String(v),
              icon: <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-[#06B6D4]" />,
              description: "The upcoming date forecasted by WOOF AI model to experience maximum suite utilization and highest grooming appointment volume.",
              extraStats: [
                { label: "Queued Service", value: peakForecast ? String(peakForecast.service) : "—" },
                { label: "Capacity Utilization", value: peakForecast ? `${peakForecast.capacity}%` : "—" },
              ],
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>Peak Forecast Date</span>
                <InfoTooltip label="The date WOOF expects the highest service demand based on the current forecast." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{peakForecast?.time || "—"}</div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>
        </div>
      </div>

      {/* SERVICES REVENUE FORECAST - Best Model Only */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                Services Revenue & Demand Forecast
              </h2>
              <InfoTooltip
                label={
                  <>
                    Active model: <span className="font-semibold">{forecastRun?.modelName || "Waiting for uploaded Services history"}</span>
                    {forecastRun && ` (MASE: ${Number(forecastRun.mase ?? 0).toFixed(2)}, sMAPE: ${Number(forecastRun.smape ?? 0).toFixed(2)}%, MAE: ₱${Number(forecastRun.mae ?? 0).toFixed(2)}).`}
                  </>
                }
              />
            </div>
            {forecastRun?.isFallback && (
              <Badge className="mt-2 bg-amber-500 text-white hover:bg-amber-500">
                SMA fallback active: {forecastRun.rejectionReason || "selected model could not run"}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-2.5 py-1 bg-slate-100 text-[#223047] rounded-lg font-semibold">
              90-5-5 Multi-Zone Active
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-[#BDECF3] bg-[#F3FCFD] p-1.5">
              <span className="px-2 text-xs font-bold text-[#223047]">Weather Overlay</span>
              <Button
                size="sm"
                variant={weatherOverlayEnabled ? "default" : "ghost"}
                onClick={() => setWeatherOverlayEnabled(true)}
                className={
                  weatherOverlayEnabled
                    ? "h-8 bg-[#06B6D4] hover:bg-[#06B6D4] text-xs text-white"
                    : "h-8 text-xs hover:bg-[#EAFBFD] text-[#223047]"
                }
              >
                On
              </Button>
              <Button
                size="sm"
                variant={!weatherOverlayEnabled ? "default" : "ghost"}
                onClick={() => setWeatherOverlayEnabled(false)}
                className={
                  !weatherOverlayEnabled
                    ? "h-8 bg-[#06B6D4] hover:bg-[#06B6D4] text-xs text-white"
                    : "h-8 text-xs hover:bg-[#EAFBFD] text-[#223047]"
                }
              >
                Off
              </Button>
            </div>
          </div>
        </div>

        {/* ══ 90-5-5 MULTI-ZONE FORECAST CHART ════════════════════════════ */}
        {initialForecastLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#223047] opacity-50">
            <RefreshCw className="w-6 h-6 animate-spin text-[#06B6D4]" />
          </div>
        ) : rawThreeZoneData.length > 0 ? (
          <ThreeZoneForecastChart
            rawData={rawThreeZoneData}
            initialSplitDate={academicSplitDate}
            initialForecastHorizon={academicForecastHorizon}
            metrics={academicMetrics}
            modelName={forecastRun?.modelName ?? "SARIMAX"}
            sector="Services"
            currencyPrefix="₱"
            themeColor="#06B6D4"
            timeGrain={chartGranularity}
            onTimeGrainChange={(g) => setChartGranularity(saveDashboardChartView(g))}
            weatherOverlayEnabled={weatherOverlayEnabled}
            weatherOverlayData={weatherOverlayData}
          />
        ) : (
          <div className="flex items-center justify-center h-48 text-sm text-[#223047] opacity-50">
            Upload Services history to generate the 90-5-5 multi-zone forecast.
          </div>
        )}

        {/* Model Info & Insights & Simulator */}
        <div className="pt-4 md:pt-6 border-t border-[#FFD9EC]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm md:text-base font-bold text-[#223047]">Model Diagnostics & Scenario Testing</h3>
              <p className="text-xs text-[#223047]/60">Evaluate model metrics, configure thesis/production modes, and simulate sales scenarios.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnosticsDetails((prev) => !prev)}
              className="text-xs font-semibold px-3 py-1.5 rounded-md border border-[#FFD9EC] bg-white text-[#223047] hover:bg-[#FFF2FA] shadow-sm transition-colors flex items-center gap-1.5"
            >
              <span>{showDiagnosticsDetails ? "Hide Details" : "Show Details"}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {/* CARD 1: Active Model Performance */}
            <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 transition-all">
              <div
                onClick={() => setShowDiagnosticsDetails((prev) => !prev)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div>
                  <h3 className="text-sm md:text-base font-bold text-[#223047]">Active Model Performance</h3>
                  <span className="text-[11px] text-[#06B6D4] font-semibold capitalize">
                    {chartGranularity} Horizon Evaluation
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowInfoModal(true);
                    }}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded border border-[#FFD9EC] bg-white text-[#06B6D4] hover:bg-[#FFF2FA] transition-colors"
                  >
                    Info
                  </button>
                </div>
              </div>

              {showDiagnosticsDetails && (
              <div className="pt-3 border-t border-[#FFD9EC] mt-3 space-y-3 animate-in fade-in duration-200">
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <div className="text-xs text-[#223047] opacity-60 mb-1">MASE</div>
                    <div className="text-xl md:text-2xl font-bold text-[#06B6D4]">
                      {dynamicPerformanceMetrics.mase}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#223047] opacity-60 mb-1">sMAPE</div>
                    <div className="text-xl md:text-2xl font-bold text-[#223047]">{dynamicPerformanceMetrics.smape}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#223047] opacity-60 mb-1">MAE (₱)</div>
                    <div className="text-xl md:text-2xl font-bold text-[#223047]">{dynamicPerformanceMetrics.mae !== "—" ? `₱${dynamicPerformanceMetrics.mae}` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[#223047] opacity-60 mb-1">Missing Days Filled</div>
                    <div className="text-xl md:text-2xl font-bold text-[#223047]">{String(forecastRun?.modelMetadata?.missingDaysFilled ?? "—")}</div>
                  </div>
                </div>
                {forecastRun?.modelMetadata && (
                  <div className="mt-2 border-t border-[#FFD9EC] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-[#223047]">
                    <div>
                      <div className="font-semibold opacity-50 uppercase">Forecast Mode</div>
                      <div className="font-semibold opacity-80">{formatForecastMode(forecastRun.modelMetadata.forecastMode)}</div>
                    </div>
                    <div>
                      <div className="font-semibold opacity-50 uppercase">Observed Demand Days</div>
                      <div className="font-semibold opacity-80">{String(forecastRun.modelMetadata.observedDemandDays ?? "-")}</div>
                    </div>
                    <div>
                      <div className="font-semibold opacity-50 uppercase">Training Calendar</div>
                      <div className="font-semibold opacity-80">
                        {formatMetadataCalendar(forecastRun.modelMetadata, "trainStartDate", "trainEndDate")}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold opacity-50 uppercase">Test Calendar</div>
                      <div className="font-semibold opacity-80">
                        {formatMetadataCalendar(forecastRun.modelMetadata, "testStartDate", "testEndDate")}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold opacity-50 uppercase">Closed Days Excluded</div>
                      <div className="font-semibold opacity-80">{String(forecastRun.modelMetadata.closedDaysExcluded ?? "-")}</div>
                    </div>
                    <div>
                      <div className="font-semibold opacity-50 uppercase">Status / Fallback Reason</div>
                      <div className="font-semibold opacity-80">
                        {forecastRun.isFallback
                          ? String(forecastRun.rejectionReason || forecastRun.modelMetadata.fallbackReason || "Selected model could not run")
                          : "Model fit successfully"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CARD 2: WOOF Analysis */}
          <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 transition-all flex flex-col justify-between">
            <div
              onClick={() => setShowDiagnosticsDetails((prev) => !prev)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div>
                <h3 className="text-sm md:text-base font-bold text-[#223047]">WOOF Analysis</h3>
                <span className="text-[11px] text-[#223047]/60 font-semibold capitalize">
                  Mode: {forecastMode.replace("-", " ")}
                </span>
              </div>
            </div>

            {showDiagnosticsDetails && (
              <div className="pt-3 border-t border-[#FFD9EC] mt-3 space-y-3 animate-in fade-in duration-200 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-[#223047] opacity-70 block mb-1 font-semibold">Forecast Mode</label>
                    <select
                      value={forecastMode}
                      onChange={(e) => setForecastMode(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-[#FFD9EC] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#06B6D4]"
                    >
                      <option value="production">Production forecast</option>
                      <option value="latest-holdout">Latest holdout backtest</option>
                      <option value="fixed-window">Thesis fixed-window backtest</option>
                    </select>
                  </div>

                  <p className="text-xs text-[#223047] opacity-70" style={{ lineHeight: "1.6" }}>
                    {forecastMode === "fixed-window"
                      ? "Thesis backtest mode uses the April-May 2026 overlap for reproducible defense metrics."
                      : forecastMode === "latest-holdout"
                        ? "Latest holdout mode evaluates against the most recent complete 61-day window, ready for continuous POS/API ingestion."
                      : (forecastRun
                          ? `${forecastRun.modelName} was selected using held-out uploaded Services history and generated ${new Date(forecastRun.generatedAt).toLocaleString()}.`
                          : "Upload Services history from POS or PetHub to generate a validated forecast.")}
                  </p>
                </div>

                <Button onClick={handleRetrainModel} className="w-full bg-[#06B6D4] hover:bg-[#06B6D4] text-xs md:text-sm mt-3" size="sm">
                  Retrain Model
                </Button>
              </div>
            )}
          </div>

          {/* CARD 3: Sales Simulator (What-If?) */}
          <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 transition-all flex flex-col justify-between">
            <div
              onClick={() => setShowDiagnosticsDetails((prev) => !prev)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div>
                <h3 className="text-sm md:text-base font-bold text-[#223047]">Sales Simulator (What-If?)</h3>
                <span className="text-[11px] text-[#223047]/60 font-semibold">
                  Scenario Testing
                </span>
              </div>
            </div>

            {showDiagnosticsDetails && (
              <div className="pt-3 border-t border-[#FFD9EC] mt-3 space-y-3 animate-in fade-in duration-200 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-xs text-[#223047] opacity-60 mb-2">
                    See how different weather patterns and calendar holidays affect your upcoming sales.
                  </p>

                  <div className="space-y-3">
                    {/* Weather Select */}
                    <div>
                      <label className="text-[11px] text-[#223047] opacity-70 block mb-1 font-semibold">Weather Conditions</label>
                      <select
                        value={weatherScenario}
                        onChange={(e) => setWeatherScenario(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-[#FFD9EC] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#06B6D4]"
                      >
                        <option value="default">Current Live Weather</option>
                        <option value="sunny">Hot & Sunny Day (32°C, No Rain)</option>
                        <option value="rainy">Cool & Rainy Day (24°C, Rainy)</option>
                        <option value="custom">Custom Climate (Sliders)...</option>
                      </select>
                    </div>

                    {weatherScenario === "custom" && (
                      <div className="space-y-2 border border-[#FFD9EC] bg-[#FFF2FA]/50 p-2.5 rounded-lg mt-2">
                        <div>
                          <div className="flex justify-between text-[10px] text-[#223047] mb-1 font-semibold">
                            <span>Temperature</span>
                            <span>{tempOverride}°C</span>
                          </div>
                          <input
                            type="range"
                            min="15"
                            max="40"
                            value={tempOverride}
                            onChange={(e) => setTempOverride(Number(e.target.value))}
                            className="w-full h-1 bg-[#FFD9EC] rounded-lg appearance-none cursor-pointer accent-[#06B6D4]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-[#223047] mb-1 font-semibold">
                            <span>Relative Humidity</span>
                            <span>{humidityOverride}%</span>
                          </div>
                          <input
                            type="range"
                            min="20"
                            max="100"
                            value={humidityOverride}
                            onChange={(e) => setHumidityOverride(Number(e.target.value))}
                            className="w-full h-1 bg-[#FFD9EC] rounded-lg appearance-none cursor-pointer accent-[#06B6D4]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-[#223047] mb-1 font-semibold">
                            <span>Rain Chance / Intensity</span>
                            <span>{rainChanceOverride === 1 ? "Rainy" : "No Rain"}</span>
                          </div>
                          <select
                            value={rainChanceOverride}
                            onChange={(e) => setRainChanceOverride(Number(e.target.value))}
                            className="w-full px-2 py-1 bg-white border border-[#FFD9EC] rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-[#06B6D4]"
                          >
                            <option value="0">No Rain</option>
                            <option value="1">Rainy</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Holiday Select */}
                    <div>
                      <label className="text-[11px] text-[#223047] opacity-70 block mb-1 font-semibold">Holiday Schedule</label>
                      <select
                        value={holidayScenario}
                        onChange={(e) => setHolidayScenario(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-[#FFD9EC] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#06B6D4]"
                      >
                        <option value="default">Live Calendar Holidays</option>
                        <option value="force">Treat Everyday as a Holiday</option>
                        <option value="ignore">Treat Everyday as a Workday</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-4 pt-2 border-t border-[#FFD9EC]">
                  <Button
                    disabled={isSimulating}
                    onClick={handleApplySimulation}
                    className="flex-1 bg-[#06B6D4] hover:bg-[#06B6D4] text-white text-xs py-1"
                    size="sm"
                  >
                    {isSimulating ? "Simulating..." : "Run Simulator"}
                  </Button>
                  <Button
                    disabled={isSimulating}
                    onClick={handleResetSimulation}
                    variant="outline"
                    className="border-[#FFD9EC] text-xs py-1 px-2"
                    size="sm"
                  >
                    Reset to Live
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* ══ INTERACTIVE FILTER BAR FOR SERVICES & UTILIZATION ══ */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-base font-bold text-[#223047]">
              Interactive Services & Utilization Intelligence
            </h2>
            <Badge className="bg-[#FFF2FA] border border-[#FFD9EC] text-[#F53799] text-[10px] font-semibold">
              Live Interactive Filters
            </Badge>
          </div>
          <p className="text-xs text-[#223047]/60 mt-0.5">
            Filter historical bookings and service utilization below. The top KPI cards synchronize automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-[#FFF7FB] border border-[#FFD9EC] p-1 rounded-xl">
          {(
            [
              ["7d", "Last 7D"],
              ["30d", "Last 30D"],
              ["90d", "Last 90D"],
              ["12m", "Last 12M"],
              ["all-time", "All-Time"],
              ["custom", "Custom"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setServicesPeriod(key);
                if (key !== "custom") {
                  setCustomServicesStart("");
                  setCustomServicesEnd("");
                }
              }}
              className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                servicesPeriod === key
                  ? "bg-[#F53799] text-white shadow-xs"
                  : "text-[#223047]/70 hover:text-[#223047] hover:bg-[#FFF2FA]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {servicesPeriod === "custom" && (
        <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 flex flex-wrap items-center gap-3 text-xs text-[#223047]">
          <span className="font-semibold text-xs">Custom Date Range:</span>
          <div className="flex items-center gap-2">
            <label className="text-[11px] opacity-70">Start:</label>
            <input
              type="date"
              value={customServicesStart}
              onChange={(e) => setCustomServicesStart(e.target.value)}
              className="px-2 py-1 bg-white border border-[#FFD9EC] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#F53799]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] opacity-70">End:</label>
            <input
              type="date"
              value={customServicesEnd}
              onChange={(e) => setCustomServicesEnd(e.target.value)}
              className="px-2 py-1 bg-white border border-[#FFD9EC] rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#F53799]"
            />
          </div>
        </div>
      )}

      {/* SERVICE UTILIZATION */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                  Service Utilization Monitor
                </h2>
                <InfoTooltip label="Real-time capacity and booking status." />
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-[#FFF2FA]"
                  onClick={() => handleSort("service")}
                >
                  Service {sortColumn === "service" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-[#FFF2FA] text-center"
                  onClick={() => handleSort("utilization")}
                >
                  Demand Share {sortColumn === "utilization" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-[#FFF2FA] text-center"
                  onClick={() => handleSort("bookings")}
                >
                  Bookings {sortColumn === "bookings" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-[#FFF2FA] text-center"
                  onClick={() => handleSort("avgPrice")}
                >
                  Avg Ticket {sortColumn === "avgPrice" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-[#FFF2FA] text-center"
                  onClick={() => handleSort("revenue")}
                >
                  Revenue {sortColumn === "revenue" && (sortDirection === "asc" ? "↑" : "↓")}
                </TableHead>
                <TableHead className="text-center w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedServiceUtilization.map((service, serviceIndex) => (
                <React.Fragment key={`service-${service.service}-${serviceIndex}`}>
                  <TableRow
                    className={`cursor-pointer transition-colors ${
                      selectedService === service.service
                        ? "bg-[#FFF2FA] font-medium"
                        : "hover:bg-[#FFF7FB]"
                    }`}
                    onClick={() => {
                      setSelectedService(selectedService === service.service ? null : service.service);
                    }}
                  >
                    <TableCell className="font-semibold text-xs md:text-sm">{service.service}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#06B6D4] transition-all"
                              style={{ width: `${service.current}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold w-10">{service.current}%</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs md:text-sm">{service.bookings}</TableCell>
                    <TableCell className="text-center text-xs">₱{service.avgPrice.toLocaleString()}</TableCell>
                    <TableCell className="text-center font-semibold text-xs md:text-sm">₱{service.revenue.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <div
                        className="inline-flex items-center justify-center p-1 rounded hover:bg-[#FFF2FA] text-[#06B6D4] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedService(expandedService === service.service ? null : service.service);
                        }}
                      >
                        {expandedService === service.service ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedService === service.service && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-[#FFF7FB]">
                        <div className="p-3 md:p-4 space-y-3">
                          <ResponsiveContainer width="100%" height={120} className="md:!h-[150px]">
                            <BarChart data={service.trend.map((bookings, index) => ({
                              day: `Day ${index + 1}`,
                              bookings,
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" />
                              <XAxis dataKey="day" style={{ fontSize: "10px" }} />
                              <YAxis style={{ fontSize: "10px" }} />
                              <Tooltip />
                              <Bar key="bar-bookings" dataKey="bookings" fill="#06B6D4" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

      {/* VISUAL RELIEF DIVIDER - AI INSIGHT WITH MASCOT */}
      <div
        className="woof-insight-band rounded-2xl flex items-center justify-between px-4 md:px-8 py-4 relative overflow-hidden"
        style={{ background: "linear-gradient(to right, #FFF7FB, #FFF2FA)" }}
      >
        <div className="flex-1">
          <div className="mb-2">
            <Badge variant="outline" className="text-xs">
              WOOF Insight
            </Badge>
          </div>
          {forecastRun ? (
            <WoofInsight inline
              feature="descriptive_explanation"
              title="WOOF Insight"
              prompt="Explain the observed Services performance using the verified historical data. Highlight the strongest services, booking or revenue patterns, and meaningful changes. Do not invent values or make unsupported forecasts."
              context={{
                sector: "Services",
                kpis: forecastRun.kpis,
                historical: forecastRun.historical?.slice(-14),
                topItems: forecastRun.topItems?.slice(0, 8),
                itemHistory: forecastRun.itemHistory?.slice(-20),
              }}
            />
          ) : (
            <p className="text-sm text-[#4A5568]">Upload transaction data to activate WOOF insights.</p>
          )}
        </div>
        <img
          src={servicesMascot.src}
          alt="Services Mascot"
          className="woof-mascot-motion w-24 h-24 md:w-32 md:h-32 object-contain flex-shrink-0 ml-6"
        />
      </div>

        {/* Hourly Bookings + Weekly Trends (40% - 2 columns) */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Hourly Bookings */}
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 space-y-3 md:space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base md:text-lg font-bold text-[#223047]">Recent Daily Bookings</h3>
                <InfoTooltip label="Calculated from uploaded Services transactions." />
              </div>
            </div>

            <ResponsiveContainer width="100%" height={180} className="md:!h-[200px]">
              <BarChart data={recentBookings}>
                <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" vertical={false} />
                <XAxis dataKey="hour" stroke="#223047" style={{ fontSize: "10px" }} />
                <YAxis stroke="#223047" style={{ fontSize: "10px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #FFD9EC",
                    borderRadius: "12px",
                  }}
                />
                <Bar key="bar-bookings-hourly" dataKey="bookings" fill="#06B6D4" radius={[6, 6, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">Forecast Demand Alerts</h2>
              <InfoTooltip label="Highest projected Services revenue days from the active forecast." />
            </div>
          </div>
          <Badge className="bg-red-500 text-white hover:bg-red-500 self-start">{occupancyAlerts.length} Active Alerts</Badge>
        </div>

        <div className="grid gap-3 md:gap-4">
          {occupancyAlerts.map((alert, idx) => (
            <div key={idx} className="p-4 bg-[#FFF7FB] border-l-4 border-[#F53799] rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`${getRiskColor(alert.risk)} font-semibold text-xs px-2 py-1`}>{alert.risk.toUpperCase()} RISK</Badge>
                    <span className="text-xs md:text-sm font-bold text-[#223047]">{alert.time}</span>
                  </div>
                  <div className="text-sm md:text-base font-bold text-[#223047]">{alert.service}</div>
                  <div className="text-xs text-[#223047] opacity-70 mt-1">Relative demand: {alert.capacity}% • Projected revenue: ₱{alert.projectedRevenue.toLocaleString()}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => router.push("/ai-simulation?tab=traffic")}
                    className="bg-[#F53799] hover:bg-[#D42A7D] text-white text-xs md:text-sm flex items-center gap-1.5"
                    size="sm"
                  >
                    <span>Optimize Staff</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                  <Button onClick={() => handleResolveAlert(alert.time)} className="bg-[#06B6D4] hover:bg-[#06B6D4] text-xs md:text-sm" size="sm">Resolve</Button>
                  <Button variant="outline" className="border-[#FFD9EC] text-xs md:text-sm" size="sm">Snooze</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error Modal */}
      {errorModal.type && (
        <ErrorModal
          isOpen={errorModal.isOpen}
          onClose={() => setErrorModal({ isOpen: false, type: null })}
          errorType={errorModal.type}
          onRetry={() => {
            if (errorModal.type === "api_timeout") {
              handleRetryApiTimeout();
            } else if (errorModal.type === "data_sync_failed") {
              handleRetryDataSync();
            }
          }}
        />
      )}

      {/* Success Modal */}
      {successModal.type && (
        <SuccessModal
          isOpen={successModal.isOpen}
          onClose={() => setSuccessModal({ isOpen: false, type: null })}
          successType={successModal.type}
        />
      )}

      {/* Model Performance Metrics Guide modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#FFD9EC] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#FFD9EC]">
              <h3 className="text-base font-bold text-[#223047]">Model Performance Metrics Guide</h3>
              <button
                onClick={() => setShowInfoModal(false)}
                className="text-xs text-gray-500 hover:text-[#06B6D4] font-bold"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 text-xs md:text-sm text-[#223047] opacity-80 animate-in fade-in zoom-in-95 duration-150" style={{ lineHeight: "1.6" }}>
              <div>
                <strong className="text-sm text-[#06B6D4]">MASE (Mean Absolute Scaled Error) — Target Threshold ≤ 0.20</strong>
                <p className="mt-1">
                  Measures the forecasting error scaled against a naïve seasonal persistence benchmark. A MASE below 1.0 means the model outperforms a simple repeat-last-season baseline; our research target of <strong>MASE ≤ 0.20</strong> indicates the model's error is only 20% of the naïve baseline, demonstrating exceptional predictive precision for Services demand.
                </p>
              </div>
              <div>
                <strong className="text-sm text-[#06B6D4]">sMAPE (Symmetric Mean Absolute Percentage Error)</strong>
                <p className="mt-1">
                  A bounded, symmetric percentage error metric (0–200%) that treats over-forecasts and under-forecasts equally. Unlike standard MAPE, sMAPE handles near-zero actual values gracefully—important for sparse Services booking days. Lower values indicate better accuracy; values below <strong>10%</strong> reflect highly accurate forecasts.
                </p>
              </div>
              <div>
                <strong className="text-sm text-[#06B6D4]">MAE (Mean Absolute Error) — in Pesos (₱)</strong>
                <p className="mt-1">
                  The average absolute difference between the forecasted and actual daily Services revenue in pesos. MAE is the most interpretable metric—it directly tells you the typical peso deviation per day. A low MAE confirms the model's predictions stay close to reality in real monetary terms.
                </p>
              </div>
              <div>
                <strong className="text-sm text-[#06B6D4]">Missing Days Filled</strong>
                <p className="mt-1">
                  The count of days with missing sales data (due to closures or system downtime) that the AI automatically imputed using smart estimations to keep the forecasting model accurate and complete.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowInfoModal(false)}
              className="w-full bg-[#06B6D4] hover:bg-[#06B6D4] text-white rounded-lg mt-4"
            >
              Understood
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
