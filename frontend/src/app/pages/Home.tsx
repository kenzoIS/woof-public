import { InsightText } from "../components/InsightText";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { PawPrint, DollarSign, ShoppingCart, Zap, Check, X, Play, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ArrowRight, CloudSun, CloudRain, Sun, Layers, Receipt, Sparkles, RotateCcw, Calendar } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";
import { ErrorModal, ErrorType } from "../components/ErrorModal";
import { SuccessModal, SuccessType } from "../components/SuccessModal";
import { getCurrentWeather, getHomeOverview, getActiveAlerts, getActiveOpportunities, SystemAlert, UserNotification } from "../lib/api";
import { InfoTooltip } from "../components/InfoTooltip";
import { KpiDetailModal, KpiDetailData } from "../components/KpiDetailModal";
import { PriorityAlertBanner } from "../components/PriorityAlertBanner";
import homeAiImg from "../../imports/no_bg_Home_2.png";
import homeInsightImg from "../../imports/no_bg_Home-3.png";

const fallbackHeatmapDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
  date: "",
  dayLabel: day,
  label: day,
}));
const heatmapHours = Array.from({ length: 12 }, (_, index) => index + 7);

const formatDateKeyInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
};

const buildHeatmapDaysFromAnchor = (anchorDate?: string | null) => {
  const anchor = anchorDate ? new Date(`${anchorDate.slice(0, 10)}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(anchor.getTime())) return fallbackHeatmapDays;

  const anchorKey = formatDateKeyInTimeZone(anchor, "Asia/Manila");
  const anchorNoon = new Date(`${anchorKey}T12:00:00.000Z`);

  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(anchorNoon);
    value.setUTCDate(anchorNoon.getUTCDate() + index);
    const date = value.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat("en-PH", {
      weekday: "short",
      timeZone: "UTC",
    }).format(value);
    const monthDay = new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(value);
    return {
      date,
      dayLabel: weekday,
      label: `${weekday} ${monthDay}`,
    };
  });
};

interface HomeSuggestion {
  id: number;
  title: string;
  trigger: string;
  discount: string;
  historicalEvidence: string;
  confidence: string;
  reason: string;
  detailedExplanation: string;
}

export interface RetailPlatformBreakdown {
  channel: string;
  label: string;
  shortLabel: string;
  revenue: number;
  orders: number;
  percent: number;
  color: string;
}

interface HomeOverview {
  anchorDate: string | null;
  heatmapAnchorDate: string | null;
  window?: {
    start: string;
    end: string;
    previousStart?: string;
    previousEnd?: string;
  } | null;
  kpis: {
    totalRevenue: number;
    totalOrders: number;
    retailRevenue: number;
    avgOrderValue?: number;
    previousRevenue?: number;
    previousOrders?: number;
    previousAvgOrderValue?: number;
    aovChangePercent?: number | null;
    revenueChangePercent: number | null;
    ordersChangePercent: number | null;
    busiestSector: string;
    pendingSuggestions: number;
  };
  retailBreakdown?: RetailPlatformBreakdown[];
  insight: string;
  omnichannelSeries: Array<{
    hour: string;
    cafe: number;
    services: number;
    retail: number;
    retail_pos?: number;
    retail_shopee?: number;
    retail_tiktok?: number;
  }>;
  sectorSummary: Array<{ sector: string; revenue: number; orders: number }>;
  channelSummary: Array<{ channel: string; revenue: number; count: number }>;
  channelBalance: Array<{ category: string; channel: string; physical: number; online: number; count: number }>;
  heatmapDays: Array<{ date: string; dayLabel: string; label: string }>;
  heatmap: Array<{ date?: string; dayOfWeek: number; dayLabel?: string; hourBucket: number; sector: string; revenue: number; intensity: number; sampleDays?: number }>;
  suggestions: HomeSuggestion[];
  nextAction: HomeSuggestion | null;
}

interface CurrentWeather {
  tempCelsius: number;
  rainfallMm: number;
  humidityPercent: number;
  windSpeedKph?: number;
  source?: string;
  isSynthetic?: boolean;
  observedAt?: string;
}

const toNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const getManilaDateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function Home() {
  const router = useRouter();
  // Dedicated Home graph filter state: defaults to "matched" (Matched 1-Year, 2025-2026) to display seamless omnichannel trends across all sectors
  const [homeActiveFilter, setHomeActiveFilter] = useState("matched");
  const [showCustomFilterSection4, setShowCustomFilterSection4] = useState(false);
  const [showCustomFilterSection5, setShowCustomFilterSection5] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("2025-05-02");
  const [customEndDate, setCustomEndDate] = useState("2026-05-02");
  const [realtimeRefresh, setRealtimeRefresh] = useState(0);
  const [expandedSuggestions, setExpandedSuggestions] = useState<number[]>([]);
  const [approvedSuggestions, setApprovedSuggestions] = useState<number[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<number[]>([]);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const desktopSuggestionsTrackRef = useRef<HTMLDivElement>(null);
  const mobileSuggestionsCarouselRef = useRef<HTMLDivElement>(null);
  const carouselAnimationOffsetRef = useRef(0);
  const [homeOverview, setHomeOverview] = useState<HomeOverview | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [manilaDateKey, setManilaDateKey] = useState(getManilaDateKey);
  const [selectedKpi, setSelectedKpi] = useState<KpiDetailData | null>(null);
  const [mobileHeatmapWindow, setMobileHeatmapWindow] = useState<"morning" | "afternoon">("morning");

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextDateKey = getManilaDateKey();
      setManilaDateKey((current) => current === nextDateKey ? current : nextDateKey);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [filterTrigger, setFilterTrigger] = useState(0);

  const handleApplyGraphFilter = (filterKey: string) => {
    setHomeActiveFilter(filterKey);
    setFilterTrigger((prev) => prev + 1);
  };

  const handleApplyCustomFilter = () => {
    if (!customStartDate || !customEndDate) return;
    const filterKey = `custom:${customStartDate}:${customEndDate}`;
    handleApplyGraphFilter(filterKey);
    setShowCustomFilterSection4(false);
    setShowCustomFilterSection5(false);
  };

  // The header controls the shared dashboard range. Home's in-page graph
  // controls remain local: changing one does not overwrite the header range
  // or filters in another feature.
  useEffect(() => {
    const applyGlobalRange = (range: string | null) => {
      if (!range) return;
      setHomeActiveFilter((current) => (current === range ? current : range));
    };

    applyGlobalRange(window.localStorage.getItem("globalDateRange"));
    const handleGlobalDateChange = (event: Event) => {
      applyGlobalRange((event as CustomEvent<string>).detail);
    };
    window.addEventListener("globalDateRangeChanged", handleGlobalDateChange);
    return () => window.removeEventListener("globalDateRangeChanged", handleGlobalDateChange);
  }, []);

  // Auto-recalibrate when new data arrives (CSV upload processed, warehouse ETL complete)
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

  const toggleSuggestionExplanation = (id: number) => {
    setExpandedSuggestions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const moveSuggestionsCarousel = (direction: -1 | 1) => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      const track = desktopSuggestionsTrackRef.current;
      if (!track) return;

      // Shift the running marquee's timeline without stopping its automatic effect.
      carouselAnimationOffsetRef.current -= direction * 5;
      track.style.animationDelay = `${carouselAnimationOffsetRef.current}s`;
      return;
    }

    const carousel = mobileSuggestionsCarouselRef.current;
    if (!carousel) return;

    carousel.scrollBy({
      left: direction * Math.max(280, carousel.clientWidth * 0.82),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    let active = true;
    setHomeLoading(true);
    getHomeOverview(homeActiveFilter)
      .then((data) => {
        if (!active) return;
        setHomeOverview(data);
        setHomeError(null);
      })
      .catch((error) => {
        if (!active) return;
        setHomeError(error instanceof Error ? error.message : "Unable to load Home analytics");
      })
      .finally(() => {
        if (active) setHomeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [homeActiveFilter, filterTrigger, realtimeRefresh, manilaDateKey]);

  useEffect(() => {
    let active = true;
    getCurrentWeather()
      .then((data) => {
        if (active) setCurrentWeather(data);
      })
      .catch(() => {
        if (active) setCurrentWeather(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const formatCurrency = (value: unknown) =>
    `PHP ${Math.round(toNumber(value)).toLocaleString()}`;

  const formatPercent = (value: unknown) => {
    const number = toNumber(value);
    const clamped = Math.max(-100, Math.min(100, number));
    return `${clamped >= 0 ? "+" : ""}${clamped.toFixed(1)}%`;
  };

  const suggestions = useMemo(() => homeOverview?.suggestions || [], [homeOverview?.suggestions]);

  // Dynamically linked to "WOOF Autonomous Suggestions — Pending Review"
  const pendingSuggestionsCount = useMemo(() => {
    if (!suggestions || suggestions.length === 0) return 0;
    return suggestions.filter(
      (s) => !approvedSuggestions.includes(s.id) && !dismissedSuggestions.includes(s.id),
    ).length;
  }, [suggestions, approvedSuggestions, dismissedSuggestions]);

  const scaledKPIs = useMemo(() => {
    const kpis = homeOverview?.kpis;
    const totalRevenue = toNumber(kpis?.totalRevenue);
    const totalOrders = toNumber(kpis?.totalOrders);
    const aovValue = toNumber(kpis?.avgOrderValue || (totalOrders > 0 ? totalRevenue / totalOrders : 0));
    const hasRevChange = kpis?.revenueChangePercent != null && Number.isFinite(Number(kpis.revenueChangePercent));
    const revChange = hasRevChange ? toNumber(kpis.revenueChangePercent) : null;
    const hasOrdChange = kpis?.ordersChangePercent != null && Number.isFinite(Number(kpis.ordersChangePercent));
    const ordChange = hasOrdChange ? toNumber(kpis.ordersChangePercent) : null;
    const hasAovChange = kpis?.aovChangePercent != null && Number.isFinite(Number(kpis.aovChangePercent));
    const aovChange = hasAovChange ? toNumber(kpis.aovChangePercent) : null;

    const formatDate = (iso?: string) =>
      iso ? new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : "";

    const prevRevenue = toNumber(kpis?.previousRevenue);
    const prevOrders = toNumber(kpis?.previousOrders);
    const prevAov = toNumber(kpis?.previousAvgOrderValue);

    return {
      rawRevenue: totalRevenue,
      rawOrders: totalOrders,
      rawAov: aovValue,
      prevRevenue,
      prevOrders,
      prevAov,
      rangeStart: formatDate(homeOverview?.window?.start),
      rangeEnd: formatDate(homeOverview?.window?.end),
      prevRangeStart: formatDate(homeOverview?.window?.previousStart),
      prevRangeEnd: formatDate(homeOverview?.window?.previousEnd),
      revenue: formatCurrency(totalRevenue),
      orders: totalOrders.toLocaleString(),
      aov: formatCurrency(aovValue),
      aovPercent: aovChange != null ? `${formatPercent(aovChange)} vs previous period` : null,
      aovColorClass: aovChange != null && aovChange >= 0 ? "text-green-600" : "text-rose-600",
      revenuePercent: revChange != null ? `${formatPercent(revChange)} vs previous period` : null,
      ordersPercent: ordChange != null ? `${formatPercent(ordChange)} vs previous period` : null,
      revenueColorClass: revChange != null && revChange >= 0 ? "text-green-600" : "text-rose-600",
      ordersColorClass: ordChange != null && ordChange >= 0 ? "text-green-600" : "text-rose-600",
      revGrowth: revChange != null ? { text: formatPercent(revChange), className: revChange >= 0 ? "text-green-600 font-semibold" : "text-rose-600 font-semibold" } : { text: "", className: "hidden" },
      ordGrowth: ordChange != null ? { text: formatPercent(ordChange), className: ordChange >= 0 ? "text-green-600 font-semibold" : "text-rose-600 font-semibold" } : { text: "", className: "hidden" },
      aovGrowth: aovChange != null ? { text: formatPercent(aovChange), className: aovChange >= 0 ? "text-green-600 font-semibold" : "text-rose-600 font-semibold" } : { text: "", className: "hidden" },
      busiestSector: kpis?.busiestSector || "None",
      pending: pendingSuggestionsCount,
    };
  }, [homeOverview, pendingSuggestionsCount]);

  const dynamicOmnichannelData = homeOverview?.omnichannelSeries || [];
  const separatedEquilibriumData = useMemo(() => {
    const raw = homeOverview?.channelBalance || [];
    const flattened: Array<{
      category: string;
      revenue: number;
      channel: string;
      fill: string;
    }> = [];

    const getFill = (channel: string) => {
      switch (channel) {
        case "pos":
          return "#D42A7D"; // Vibrant WOOF brand magenta/pink
        case "shopee":
          return "#F97316"; // Shopee Orange
        case "tiktok":
          return "#8B5CF6"; // TikTok Shop Purple
        case "pethub":
          return "#06B6D4"; // PetHub Cyan
        default:
          return "#06B6D4";
      }
    };

    raw.forEach((item: any) => {
      // If legacy/cached backend sent merged 'Digital Channels' row
      if (item.category === "Digital Channels") {
        if (Number(item.shopee) > 0) {
          flattened.push({
            category: "Shopee",
            revenue: Number(item.shopee),
            channel: "shopee",
            fill: getFill("shopee"),
          });
        }
        if (Number(item.tiktok) > 0) {
          flattened.push({
            category: "TikTok Shop",
            revenue: Number(item.tiktok),
            channel: "tiktok",
            fill: getFill("tiktok"),
          });
        }
        if (Number(item.pethub) > 0) {
          flattened.push({
            category: "PetHub",
            revenue: Number(item.pethub),
            channel: "pethub",
            fill: getFill("pethub"),
          });
        }
      } else {
        const cat = item.category || "Offline Channel (POS)";
        let ch = item.channel;
        if (!ch) {
          if (cat.toLowerCase().includes("pos")) ch = "pos";
          else if (cat.toLowerCase().includes("shopee")) ch = "shopee";
          else if (cat.toLowerCase().includes("tiktok")) ch = "tiktok";
          else if (cat.toLowerCase().includes("pethub")) ch = "pethub";
          else ch = "pos";
        }
        const rev = Number(item.revenue ?? item[ch] ?? item.pos ?? item.shopee ?? item.tiktok ?? item.pethub ?? 0);
        flattened.push({
          category: cat,
          revenue: rev,
          channel: ch,
          fill: getFill(ch),
        });
      }
    });

    // Fallback: If Shopee is missing from flattened channel balance but exists in retailBreakdown
    const hasShopee = flattened.some((d) => d.channel === "shopee" && d.revenue > 0);
    if (!hasShopee && homeOverview?.retailBreakdown) {
      const shopeeBreakdown = homeOverview.retailBreakdown.find((b) => b.channel === "shopee" && Number(b.revenue) > 0);
      if (shopeeBreakdown) {
        flattened.push({
          category: "Shopee",
          revenue: Number(shopeeBreakdown.revenue),
          channel: "shopee",
          fill: getFill("shopee"),
        });
      }
    }

    // Fallback: If TikTok Shop is missing but in retailBreakdown
    const hasTiktok = flattened.some((d) => d.channel === "tiktok" && d.revenue > 0);
    if (!hasTiktok && homeOverview?.retailBreakdown) {
      const tiktokBreakdown = homeOverview.retailBreakdown.find((b) => b.channel === "tiktok" && Number(b.revenue) > 0);
      if (tiktokBreakdown) {
        flattened.push({
          category: "TikTok Shop",
          revenue: Number(tiktokBreakdown.revenue),
          channel: "tiktok",
          fill: getFill("tiktok"),
        });
      }
    }

    return flattened;
  }, [homeOverview?.channelBalance, homeOverview?.retailBreakdown]);
  const equilibriumData = separatedEquilibriumData;
  const channelBalanceAxis = useMemo(() => {
    const maxVal = Math.max(0, ...separatedEquilibriumData.map((d) => d.revenue));
    if (maxVal <= 0) {
      return {
        domain: [0, 500000] as [number, number],
        ticks: [0, 100000, 200000, 300000, 400000, 500000],
      };
    }
    // Clean, realistic step increments (by 5k, 10k, 20k, 50k, 100k)
    let step = 500000;
    if (maxVal <= 30000) step = 5000;
    else if (maxVal <= 80000) step = 10000;
    else if (maxVal <= 180000) step = 20000;
    else if (maxVal <= 400000) step = 50000;
    else if (maxVal <= 800000) step = 100000;
    else if (maxVal <= 1800000) step = 250000;
    else if (maxVal <= 4000000) step = 500000;
    else if (maxVal <= 8000000) step = 1000000;
    else step = 2000000;

    const upper = Math.ceil((maxVal * 1.05) / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= upper; v += step) {
      ticks.push(v);
    }
    return {
      domain: [0, upper] as [number, number],
      ticks,
    };
  }, [separatedEquilibriumData]);
  const clientHeatmapDays = useMemo(
    () => buildHeatmapDaysFromAnchor(homeOverview?.heatmapAnchorDate),
    [homeOverview?.heatmapAnchorDate],
  );
  const displayHeatmapDays =
    homeOverview?.heatmapDays && homeOverview.heatmapDays.length > 0
      ? homeOverview.heatmapDays
      : clientHeatmapDays;
  const carouselSuggestions = useMemo(
    () => (suggestions.length > 2 ? [...suggestions, ...suggestions] : suggestions),
    [suggestions],
  );
  const shouldAnimateSuggestions = suggestions.length > 2;
  const [currentDateFormatted, setCurrentDateFormatted] = useState<string>(() => {
    return new Date().toLocaleDateString("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  const [greeting, setGreeting] = useState<string>(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  });

  useEffect(() => {
    const now = new Date();
    setCurrentDateFormatted(
      now.toLocaleDateString("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    );
    const hour = now.getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);
  const [opportunities, setOpportunities] = useState<UserNotification[]>([]);

  useEffect(() => {
    getActiveAlerts()
      .then((data) => setSystemAlerts(Array.isArray(data) ? data : []))
      .catch(() => {});

    getActiveOpportunities()
      .then((data) => setOpportunities(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  const weatherIcon =
    currentWeather && toNumber(currentWeather.rainfallMm) > 0.5
      ? CloudRain
      : currentWeather && toNumber(currentWeather.tempCelsius) >= 30
        ? Sun
        : CloudSun;
  const WeatherIcon = weatherIcon;
  const weatherSummary = currentWeather
    ? `${Math.round(toNumber(currentWeather.tempCelsius))}°C · ${Math.round(toNumber(currentWeather.humidityPercent))}% humidity`
    : "Weather unavailable";
  const rainfallSummary = currentWeather
    ? `${toNumber(currentWeather.rainfallMm).toFixed(1)} mm rain`
    : "No live reading";
  const legendData = useMemo(() => {
    const sectorTotal = (sector: string) =>
      toNumber(homeOverview?.sectorSummary.find((item) => item.sector === sector)?.revenue);
    const sectorOrders = (sector: string) =>
      homeOverview?.sectorSummary.find((item) => item.sector === sector)?.orders ?? 0;
    const total = sectorTotal("Cafe") + sectorTotal("Services") + sectorTotal("Retail");
    return [
      { key: "cafe", label: "Cafe", color: "#F53799", value: sectorTotal("Cafe"), orders: sectorOrders("Cafe") },
      { key: "services", label: "Services", color: "#0EA5E9", value: sectorTotal("Services"), orders: sectorOrders("Services") },
      { key: "retail", label: "Retail", color: "#F59E0B", value: sectorTotal("Retail"), orders: sectorOrders("Retail") },
    ].map((item) => ({
      ...item,
      total: formatCurrency(item.value),
      percent: total > 0 ? `${((toNumber(item.value) / total) * 100).toFixed(1)}%` : "0.0%",
    }));
  }, [homeOverview]);

  const [heatmapFilter, setHeatmapFilter] = useState("allsectors");
  const [hoveredHeatmapCell, setHoveredHeatmapCell] = useState<{
    label: string;
    revenue: number;
    intensity: number;
    x: number;
    y: number;
  } | null>(null);
  const [visibleSeries, setVisibleSeries] = useState({
    cafe: true,
    services: true,
    retail: true,
    retail_pos: true,
    retail_tiktok: true,
    retail_shopee: true,
  });
  const [retailSplitMode, setRetailSplitMode] = useState(false);
  const [isRetailPlatformsOpen, setIsRetailPlatformsOpen] = useState(false);
  const retailDropdownRef = useRef<HTMLDivElement>(null);

  const distinguishedPlatformCards = useMemo(() => {
    const sectorItem = (sec: string) =>
      homeOverview?.sectorSummary.find((item) => item.sector === sec);
    const cafeRev = toNumber(sectorItem("Cafe")?.revenue);
    const cafeOrders = sectorItem("Cafe")?.orders ?? 0;

    const servicesRev = toNumber(sectorItem("Services")?.revenue);
    const servicesOrders = sectorItem("Services")?.orders ?? 0;

    const retailRev = toNumber(sectorItem("Retail")?.revenue);
    const totalOmnichannel = cafeRev + servicesRev + retailRev;

    const defaultRetailBreakdown = [
      {
        channel: "pos",
        label: "In-Store POS",
        shortLabel: "POS",
        revenue: 0,
        orders: 0,
        percent: 0,
        color: "#D42A7D",
      },
      {
        channel: "tiktok",
        label: "TikTok Shop",
        shortLabel: "TikTok",
        revenue: 0,
        orders: 0,
        percent: 0,
        color: "#8B5CF6",
      },
      {
        channel: "shopee",
        label: "Shopee",
        shortLabel: "Shopee",
        revenue: 0,
        orders: 0,
        percent: 0,
        color: "#F97316",
      },
    ];

    const actualRetailBreakdown =
      homeOverview?.retailBreakdown && homeOverview.retailBreakdown.length > 0
        ? homeOverview.retailBreakdown
        : defaultRetailBreakdown;

    const retailCards = actualRetailBreakdown.map((item) => {
      const channelKey =
        item.channel === "pos"
          ? ("retail_pos" as const)
          : item.channel === "tiktok"
          ? ("retail_tiktok" as const)
          : ("retail_shopee" as const);

      const omniShare =
        totalOmnichannel > 0
          ? `${((toNumber(item.revenue) / totalOmnichannel) * 100).toFixed(1)}%`
          : "0.0%";

      const sublabel =
        item.channel === "pos"
          ? "Storefront Counter"
          : item.channel === "tiktok"
          ? "Social Commerce"
          : "Marketplace Mall";

      const bgTint =
        item.channel === "pos"
          ? "#FFF2FA"
          : item.channel === "tiktok"
          ? "#FAF5FF"
          : "#FFF7ED";

      const borderTint =
        item.channel === "pos"
          ? "#FFD9EC"
          : item.channel === "tiktok"
          ? "#E9D5FF"
          : "#FED7AA";

      return {
        key: channelKey,
        sector: "Retail",
        channel: item.channel,
        label: item.label,
        sublabel,
        badge: "Retail Channel",
        color: item.color || (item.channel === "pos" ? "#D42A7D" : item.channel === "tiktok" ? "#8B5CF6" : "#F97316"),
        bgTint,
        borderTint,
        revenue: item.revenue,
        total: formatCurrency(item.revenue),
        orders: item.orders,
        retailPercent: `${toNumber(item.percent).toFixed(1)}% of Retail`,
        omniPercent: `${omniShare} total`,
        route: "/retail",
      };
    });

    const cafeOmniShare =
      totalOmnichannel > 0
        ? `${((cafeRev / totalOmnichannel) * 100).toFixed(1)}%`
        : "0.0%";

    const servicesOmniShare =
      totalOmnichannel > 0
        ? `${((servicesRev / totalOmnichannel) * 100).toFixed(1)}%`
        : "0.0%";

    return [
      {
        key: "cafe" as const,
        sector: "Cafe",
        channel: "pos",
        label: "Cafe",
        sublabel: "Dining & Drinks",
        badge: "Physical POS",
        color: "#F53799",
        bgTint: "#FFF2FA",
        borderTint: "#FFD9EC",
        revenue: cafeRev,
        total: formatCurrency(cafeRev),
        orders: cafeOrders,
        retailPercent: null,
        omniPercent: `${cafeOmniShare} total`,
        route: "/cafe",
      },
      {
        key: "services" as const,
        sector: "Services",
        channel: "pos",
        label: "Services",
        sublabel: "Grooming & Care",
        badge: "In-Store & Appt",
        color: "#0EA5E9",
        bgTint: "#F0F9FF",
        borderTint: "#BAE6FD",
        revenue: servicesRev,
        total: formatCurrency(servicesRev),
        orders: servicesOrders,
        retailPercent: null,
        omniPercent: `${servicesOmniShare} total`,
        route: "/services",
      },
      ...retailCards,
    ];
  }, [homeOverview]);

  const handleSetRetailSplitMode = (mode: boolean) => {
    setRetailSplitMode(mode);
    if (mode) {
      setVisibleSeries((prev) => ({
        ...prev,
        retail_pos: true,
        retail_tiktok: true,
        retail_shopee: true,
      }));
    } else {
      setVisibleSeries((prev) => ({
        ...prev,
        retail: true,
      }));
    }
  };

  const setAllSeries = (enabled: boolean) => {
    setVisibleSeries({
      cafe: enabled,
      services: enabled,
      retail: enabled,
      retail_pos: enabled,
      retail_tiktok: enabled,
      retail_shopee: enabled,
    });
  };

  const isolateRetailChannelsOnly = () => {
    setVisibleSeries({
      cafe: false,
      services: false,
      retail: true,
      retail_pos: true,
      retail_tiktok: true,
      retail_shopee: true,
    });
  };

  const isolatePhysicalOnly = () => {
    setVisibleSeries({
      cafe: true,
      services: true,
      retail: false,
      retail_pos: true,
      retail_tiktok: false,
      retail_shopee: false,
    });
  };

  const isolateMarketplacesOnly = () => {
    setVisibleSeries({
      cafe: false,
      services: false,
      retail: false,
      retail_pos: false,
      retail_tiktok: true,
      retail_shopee: true,
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        retailDropdownRef.current &&
        !retailDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRetailPlatformsOpen(false);
      }
    };

    if (isRetailPlatformsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRetailPlatformsOpen]);

  // Dynamic Y-axis scale calibrated to user preference:
  // - Sectors View: ₱3,000 (when <= ₱24k) or ₱5,000 (up to ₱70k)
  // - Distinguish Retail Platforms: ₱5,000 (when <= ₱35k) or ₱10,000 (for higher volumes)
  const omnichannelAxis = useMemo(() => {
    let maxVal = 0;
    for (const d of dynamicOmnichannelData) {
      if (visibleSeries.cafe) maxVal = Math.max(maxVal, toNumber(d.cafe));
      if (visibleSeries.services) maxVal = Math.max(maxVal, toNumber(d.services));
      if (!retailSplitMode && visibleSeries.retail) maxVal = Math.max(maxVal, toNumber(d.retail));
      if (retailSplitMode) {
        if (visibleSeries.retail_pos) maxVal = Math.max(maxVal, toNumber(d.retail_pos));
        if (visibleSeries.retail_tiktok) maxVal = Math.max(maxVal, toNumber(d.retail_tiktok));
        if (visibleSeries.retail_shopee) maxVal = Math.max(maxVal, toNumber(d.retail_shopee));
      }
    }

    if (maxVal <= 0) {
      return {
        domain: [0, 50000] as [number, number],
        ticks: [0, 10000, 20000, 30000, 40000, 50000],
      };
    }

    let step = 5000;
    if (!retailSplitMode) {
      // Sectors View: step by ₱3k when viewing Cafe/Services (< 24k), or ₱5k for higher volumes
      if (maxVal <= 24000) {
        step = 3000;
      } else if (maxVal <= 70000) {
        step = 5000;
      } else {
        step = 10000;
      }
    } else {
      // Distinguish Retail Platforms: step by ₱5k (<= 35k), or ₱10k for higher platform volume
      if (maxVal <= 35000) {
        step = 5000;
      } else if (maxVal <= 120000) {
        step = 10000;
      } else {
        step = 20000;
      }
    }

    // Add 5% headroom so the peak curve doesn't clip against the ceiling
    const upper = Math.ceil((maxVal * 1.05) / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= upper; v += step) {
      ticks.push(v);
    }

    return {
      domain: [0, upper] as [number, number],
      ticks,
    };
  }, [dynamicOmnichannelData, visibleSeries, retailSplitMode]);

  const CustomOmnichannelTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    const cafe = toNumber(data.cafe);
    const services = toNumber(data.services);
    const retail = toNumber(data.retail);
    const retailPos = toNumber(data.retail_pos);
    const retailShopee = toNumber(data.retail_shopee);
    const retailTiktok = toNumber(data.retail_tiktok);

    // Only sum what's actually visible in the chart right now
    const visibleTotal = retailSplitMode
      ? (visibleSeries.cafe ? cafe : 0)
        + (visibleSeries.services ? services : 0)
        + (visibleSeries.retail_pos ? retailPos : 0)
        + (visibleSeries.retail_tiktok ? retailTiktok : 0)
        + (visibleSeries.retail_shopee ? retailShopee : 0)
      : (visibleSeries.cafe ? cafe : 0)
        + (visibleSeries.services ? services : 0)
        + (visibleSeries.retail ? retail : 0);

    return (
      <div className="bg-white/95 backdrop-blur-md border border-[#FFD9EC] rounded-xl p-3 shadow-xl text-xs space-y-2 min-w-[200px]">
        <div className="font-bold text-[#223047] border-b border-[#FFD9EC] pb-1 flex items-center justify-between">
          <span>
            {typeof label === "string" && label.includes("-") && label.split("-").length === 3
              ? new Date(`${label}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : label}
          </span>
          <span className="text-[10px] text-[#223047]/60 font-normal">{retailSplitMode ? "Split View" : "Sectors"}</span>
        </div>
        <div className="space-y-1.5">
          {visibleSeries.cafe && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[#F53799] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#F53799]" />
                Cafe:
              </span>
              <span className="font-bold text-[#223047]">{formatCurrency(cafe)}</span>
            </div>
          )}
          {visibleSeries.services && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[#0EA5E9] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#0EA5E9]" />
                Services:
              </span>
              <span className="font-bold text-[#223047]">{formatCurrency(services)}</span>
            </div>
          )}
          {!retailSplitMode && visibleSeries.retail && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[#F59E0B] font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                Retail:
              </span>
              <span className="font-bold text-[#223047]">{formatCurrency(retail)}</span>
            </div>
          )}
          {retailSplitMode && visibleSeries.retail_pos && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[#D42A7D] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#D42A7D]" />
                In-Store POS:
              </span>
              <span className="font-bold text-[#223047]">{formatCurrency(retailPos)}</span>
            </div>
          )}
          {retailSplitMode && visibleSeries.retail_tiktok && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[#8B5CF6] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                TikTok Shop:
              </span>
              <span className="font-bold text-[#223047]">{formatCurrency(retailTiktok)}</span>
            </div>
          )}
          {retailSplitMode && visibleSeries.retail_shopee && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[#F97316] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#F97316]" />
                Shopee:
              </span>
              <span className="font-bold text-[#223047]">{formatCurrency(retailShopee)}</span>
            </div>
          )}
        </div>
        {visibleTotal > 0 && (
          <div className="border-t border-[#FFD9EC] pt-1 flex justify-between font-bold text-[#223047]">
            <span>Visible Total:</span>
            <span className="text-[#F53799]">{formatCurrency(visibleTotal)}</span>
          </div>
        )}
      </div>
    );
  };

  const [errorModal, setErrorModal] = useState<{ isOpen: boolean; type: ErrorType | null }>({
    isOpen: false,
    type: null,
  });
  const [successModal, setSuccessModal] = useState<{ isOpen: boolean; type: SuccessType | null }>({
    isOpen: false,
    type: null,
  });

  const scrollToSuggestions = () => {
    if (suggestionsRef.current) {
      suggestionsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      suggestionsRef.current.classList.add("ring-4", "ring-[#06B6D4]/40", "transition-all", "duration-500");
      setTimeout(() => {
        suggestionsRef.current?.classList.remove("ring-4", "ring-[#06B6D4]/40");
      }, 2500);
    }
  };

  const openChatbot = () => {
    // Trigger chatbot open - the WOOFChatbot component listens to this event
    window.dispatchEvent(new CustomEvent("openWoofChatbot"));
  };

  const handleApprove = (id: number) => {
    setApprovedSuggestions((prev) => [...prev, id]);
    toast.success("Promotion approved and scheduled!", {
      description: "The live recommendation has been added to your review queue.",
    });
  };

  const handleDismiss = (id: number) => {
    setDismissedSuggestions((prev) => [...prev, id]);
    toast.info("Suggestion dismissed", {
      description: "WOOF will learn from this feedback.",
    });
  };

  const triggerConnectionLost = () => {
    window.dispatchEvent(new Event("simulateOffline"));
  };

  const handleExecuteNow = () => {
    const nextAction = homeOverview?.nextAction;
    if (!nextAction) {
      toast.info("No live action is currently queued.", {
        description: "Upload transaction data to generate Home recommendations.",
      });
      return;
    }
    handleApprove(nextAction.id);
  };

  const handleRefreshData = () => {
    setErrorModal({ isOpen: false, type: null });
    toast.info("Refreshing data...");
    setTimeout(() => {
      // Simulate successful data refresh by approving the suggestion that was blocked
      setApprovedSuggestions((prev) => {
        // If suggestion 2 isn't already approved, approve it
        if (!prev.includes(2)) {
          return [...prev, 2];
        }
        return prev;
      });
      toast.success("Data refreshed successfully!", {
        description: "The promotion has been approved and scheduled.",
      });
    }, 1000);
  };

  const toggleSeries = (series: keyof typeof visibleSeries) => {
    setVisibleSeries((prev) => ({ ...prev, [series]: !prev[series] }));
  };

  const getHeatmapColor = (value: number) => {
    if (value <= 0) return "#FFFFFF";
    if (value <= 40) return "#10B981";
    if (value <= 60) return "#F59E0B";
    if (value <= 80) return "#FFD9EC";
    return "#F53799";
  };

  const getHeatmapRevenue = (date: string, hour: number) =>
    (homeOverview?.heatmap || [])
      .filter((row) => {
        const sector = row.sector.toLowerCase();
        return (
          row.date === date &&
          row.hourBucket === hour &&
          ["cafe", "services"].includes(sector) &&
          (heatmapFilter === "allsectors" || sector === heatmapFilter)
        );
      })
      .reduce((total, row) => total + toNumber(row.revenue), 0);

  const maxHeatmapRevenue = useMemo(() => {
    let max = 0;
    displayHeatmapDays.forEach((day) => {
      heatmapHours.forEach((hour) => {
        const rev = getHeatmapRevenue(day.date, hour);
        if (rev > max) max = rev;
      });
    });
    return Math.max(1, max);
  }, [displayHeatmapDays, homeOverview?.heatmap, heatmapFilter]);

  const getHeatmapIntensity = (date: string, hour: number) =>
    maxHeatmapRevenue > 0
      ? (getHeatmapRevenue(date, hour) / maxHeatmapRevenue) * 100
      : 0;

  const updateHeatmapTooltip = (
    event: React.MouseEvent<HTMLDivElement> | React.FocusEvent<HTMLDivElement>,
    label: string,
    revenue: number,
    intensity: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const isMouseEvent = "clientX" in event && event.clientX > 0;
    setHoveredHeatmapCell({
      label,
      revenue,
      intensity,
      x: isMouseEvent ? event.clientX : rect.left + rect.width / 2,
      y: isMouseEvent ? event.clientY : rect.top,
    });
  };
  const heatmapDateLabel = `${displayHeatmapDays[0]?.label || "Today"} – ${displayHeatmapDays[displayHeatmapDays.length - 1]?.label || ""}`;

  const renderSuggestionCard = (
    suggestion: HomeSuggestion,
    index: number,
    isMobile = false
  ) => (
    <div
      key={`${isMobile ? "mobile" : "desktop"}-${suggestion.id}-${index}`}
      aria-hidden={!isMobile && index >= suggestions.length}
      className={`${
        isMobile
          ? "w-[85vw] max-w-[340px] shrink-0 snap-center p-4 space-y-3"
          : "w-[280px] md:w-[340px] lg:w-[380px] shrink-0 p-4 md:p-6 lg:p-7 space-y-3 md:space-y-4"
      } bg-white border border-[#FFD9EC] rounded-2xl md:rounded-[20px] transition-all ${
        approvedSuggestions.includes(suggestion.id)
          ? "bg-green-50 border-green-300"
          : dismissedSuggestions.includes(suggestion.id)
          ? "opacity-40 line-through"
          : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-base font-bold text-[#223047] flex-1">
          {suggestion.title}
        </h3>
        <Badge className="bg-[#06B6D4] text-white hover:bg-[#06B6D4] text-xs">
          {suggestion.confidence}
        </Badge>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-[#223047] opacity-60">
          <span className="font-medium">Trigger:</span>
          <span>{suggestion.trigger}</span>
        </div>
        <div className="flex items-center gap-2 text-[#223047] opacity-60">
          <span className="font-medium">Discount:</span>
          <span>{suggestion.discount}</span>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#223047] opacity-50 mb-1">
          Historical evidence
        </div>
        <div className="text-xl md:text-2xl font-extrabold text-[#F53799]">
          {suggestion.historicalEvidence}
        </div>
      </div>

      <p className="text-xs text-[#223047] opacity-50" style={{ lineHeight: "1.6" }}>
        {suggestion.reason}
      </p>

      {/* Collapsible Dropdown Explanation */}
      <div className="pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleSuggestionExplanation(suggestion.id)}
          className="w-full justify-between text-xs text-[#F53799] hover:bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg py-1 px-3 h-8"
        >
          <span className="font-semibold">Explanation</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              expandedSuggestions.includes(suggestion.id) ? "rotate-180" : ""
            }`}
          />
        </Button>
        {expandedSuggestions.includes(suggestion.id) && (
          <div
            className="mt-2 p-2 bg-[#FFF7FB] rounded-lg border border-[#FFD9EC] text-xs text-[#223047] opacity-80 animate-in fade-in slide-in-from-top-1 duration-200"
            style={{ lineHeight: "1.6" }}
          >
            {suggestion.detailedExplanation}
          </div>
        )}
      </div>

      {!approvedSuggestions.includes(suggestion.id) &&
        !dismissedSuggestions.includes(suggestion.id) && (
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => handleApprove(suggestion.id)}
              className="flex-1 bg-[#F53799] hover:bg-[#D42A7D]"
            >
              <Check className="w-4 h-4 mr-2" />
              Approve
            </Button>
            <Button
              onClick={() => handleDismiss(suggestion.id)}
              variant="outline"
              className="flex-1 border-[#FFD9EC]"
            >
              <X className="w-4 h-4 mr-2" />
              Dismiss
            </Button>
          </div>
        )}

      {approvedSuggestions.includes(suggestion.id) && (
        <div className="flex items-center justify-center gap-2 py-2 text-green-600 font-semibold">
          <Check className="w-5 h-5" />
          <span>Approved & Scheduled</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-8 lg:space-y-12">
      {/* PRIORITY ALERT BANNER (Immediately noticeable upon opening WOOF) */}
      <PriorityAlertBanner
        alerts={systemAlerts}
        onAlertAcknowledged={(id) =>
          setSystemAlerts((prev) => prev.filter((a) => a.id !== id))
        }
      />

      {/* SECTION 1 — HERO BANNER */}
      <div
        className="rounded-2xl md:rounded-3xl overflow-hidden relative"
      >
        {/* Background Image covering full hero */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1200&h=600&fit=crop')",
          }}
        >
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#223047]/95 via-[#223047]/85 to-[#223047]/70" />
        </div>

        <div className="relative z-10 p-5 md:p-8 lg:p-10">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-4 md:space-y-6">
            <div>
              <div className="text-sm md:text-base text-white/80 mb-1 md:mb-2">
                {greeting}, Happy Tails
              </div>
              <h1 className="text-2xl md:text-3xl lg:text-[40px] font-extrabold text-white leading-tight mb-2 md:mb-3">
                Today's Revenue Intelligence
              </h1>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm text-white/70">
                <span>{currentDateFormatted}</span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline">Lucena City, Philippines</span>
                <Badge variant="outline" className="gap-1.5 border-white/30 text-white">
                  <span>{homeOverview?.anchorDate ? "Live uploaded data" : "No uploaded data"}</span>
                </Badge>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
              <Button
                onClick={scrollToSuggestions}
                className="bg-[#F53799] hover:bg-[#D42A7D] text-white rounded-full px-6"
              >
                View AI Suggestions
              </Button>
              <Button
                onClick={openChatbot}
                className="bg-white text-[#F53799] hover:bg-white/90 rounded-full px-6"
              >
                Ask WOOF
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/12 p-4 text-white shadow-2xl backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70">
                  Today's Weather
                  <InfoTooltip
                    label="Weather is shown because WOOF can use local conditions as context for demand forecasts and sales scenarios."
                    side="left"
                  />
                </div>
                <div className="mt-2 text-2xl font-extrabold">{weatherSummary}</div>
                <div className="mt-1 text-sm text-white/75">{rainfallSummary}</div>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#F53799]">
                <WeatherIcon className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/75">
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-white/55">Source</div>
                <div className="font-semibold text-white">{currentWeather?.isSynthetic ? "Fallback" : currentWeather?.source || "Live API"}</div>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-white/55">Location</div>
                <div className="font-semibold text-white">Lucena City</div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>


      {homeError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {homeError}
        </div>
      )}

      <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />

      {/* SECTION 2 — PRIMARY KPI ROW */}
      <div className="woof-kpi-row bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Total Revenue Today */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: "Total Omnichannel Revenue",
              current: scaledKPIs.rawRevenue,
              previous: scaledKPIs.prevRevenue,
              currentLabel: "Current Period",
              previousLabel: "Previous Period",
              rangeStart: scaledKPIs.rangeStart,
              rangeEnd: scaledKPIs.rangeEnd,
              prevRangeStart: scaledKPIs.prevRangeStart,
              prevRangeEnd: scaledKPIs.prevRangeEnd,
              formatter: formatCurrency,
              icon: <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              growth: scaledKPIs.revGrowth,
              description: "Total revenue across all sales channels (physical POS, Shopee, TikTok Shop) for the active date range. Compared against the previous equivalent period.",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#223047] opacity-60 truncate flex items-center">
                <span className="flex items-center gap-1">
                  Total Revenue
                  <InfoTooltip label="Total money earned from uploaded transactions in the selected period. Growth indicator is capped at +100.0% max (standard bounded industry metric) reflecting business expansion: prior period was single-store POS only (~₱4.33M), whereas current period includes nationwide Shopee (₱12.4M) and TikTok Shop (₱1.48M) online channels." />
                </span>
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{scaledKPIs.revenue}</div>
              {scaledKPIs.revenuePercent && (
                <div className={`text-xs ${scaledKPIs.revenueColorClass} font-medium hidden md:block`}>{scaledKPIs.revenuePercent}</div>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>

          {/* Omnichannel Orders */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: "Omnichannel Orders",
              current: scaledKPIs.rawOrders,
              previous: scaledKPIs.prevOrders,
              currentLabel: "Current Period",
              previousLabel: "Previous Period",
              rangeStart: scaledKPIs.rangeStart,
              rangeEnd: scaledKPIs.rangeEnd,
              prevRangeStart: scaledKPIs.prevRangeStart,
              prevRangeEnd: scaledKPIs.prevRangeEnd,
              formatter: (v) => Number(v).toLocaleString(),
              icon: <ShoppingCart className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              growth: scaledKPIs.ordGrowth,
              description: "Total completed order volume fulfilled across physical store POS and digital e-commerce channels.",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#223047] opacity-60 truncate flex items-center">
                <span className="flex items-center gap-1">
                  Orders
                  <InfoTooltip label="Total completed orders across all channels. Growth indicator is capped at +100.0% max (standard bounded industry metric) reflecting the jump from 8,403 physical store transactions to 32,275 omnichannel orders after opening digital marketplaces." />
                </span>
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{scaledKPIs.orders}</div>
              {scaledKPIs.ordersPercent && (
                <div className={`text-xs ${scaledKPIs.ordersColorClass} font-medium hidden md:block`}>{scaledKPIs.ordersPercent}</div>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>

          {/* Average Order Value (AOV) */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: "Average Order Value (AOV)",
              current: scaledKPIs.rawAov,
              previous: scaledKPIs.prevAov,
              currentLabel: "Current Period",
              previousLabel: "Previous Period",
              rangeStart: scaledKPIs.rangeStart,
              rangeEnd: scaledKPIs.rangeEnd,
              prevRangeStart: scaledKPIs.prevRangeStart,
              prevRangeEnd: scaledKPIs.prevRangeEnd,
              formatter: formatCurrency,
              icon: <Receipt className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              growth: scaledKPIs.aovGrowth,
              description: "Average spend per transaction across Cafe, Services, and Retail. Directly measures customer basket size and multi-line cross-selling.",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
              <Receipt className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#223047] opacity-60 truncate flex items-center">
                <span className="flex items-center gap-1">
                  <span className="sm:hidden">Avg Order Value</span>
                  <span className="hidden sm:inline">Avg Order Value (AOV)</span>
                  <InfoTooltip label="Average spend per transaction across Cafe, Services, and Retail. Directly measures customer basket size and multi-line cross-selling." />
                </span>
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{scaledKPIs.aov}</div>
              {scaledKPIs.aovPercent && (
                <div className={`text-xs ${scaledKPIs.aovColorClass} font-medium hidden md:block`}>
                  {scaledKPIs.aovPercent}
                </div>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>

          {/* WOOF Suggestions */}
          <div 
            onClick={scrollToSuggestions}
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#06B6D4]/50 transition-all group"
            title="Click to view WOOF Autonomous Suggestions"
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>WOOF Suggestions</span>
                <InfoTooltip label="AI-assisted recommendations generated from sales, demand, and pattern analysis. Dynamically linked to WOOF Autonomous Suggestions — Pending Review." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{scaledKPIs.pending}</div>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  scrollToSuggestions();
                }}
                size="sm"
                className={`text-white h-6 md:h-7 text-xs mt-1 px-2 md:px-3 hidden md:inline-flex transition-colors ${
                  scaledKPIs.pending === 0
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-[#F53799] hover:bg-[#D42A7D]"
                }`}
              >
                {scaledKPIs.pending === 0 ? "All Reviewed" : "Review"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 4 — OMNICHANNEL REVENUE STREAM */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047] whitespace-nowrap">
              Omnichannel Revenue Accumulation
            </h2>
            <InfoTooltip label="Revenue buildup across channels. Omnichannel combines sales from POS, Shopee, TikTok Shop, and PetHub." />
          </div>

          {/* Recommended Time Range Filters (Identical to Section 5) */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:flex-wrap">
            {[
              { key: "matched", label: "Matched 1-Year (2025-2026)" },
              { key: "all", label: "All-Time" },
              { key: "last-90-days", label: "Last 90 Days" },
              { key: "last-30-days", label: "Last 30 Days" },
            ].map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={homeActiveFilter === item.key ? "default" : "outline"}
                onClick={() => {
                  setShowCustomFilterSection4(false);
                  handleApplyGraphFilter(item.key);
                }}
                className={`text-xs shrink-0 whitespace-nowrap transition-all ${
                  homeActiveFilter === item.key
                    ? "bg-[#F53799] hover:bg-[#D42A7D] text-white shadow-xs font-semibold"
                    : "border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA]"
                }`}
              >
                {item.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={homeActiveFilter.startsWith("custom:") || showCustomFilterSection4 ? "default" : "outline"}
              onClick={() => setShowCustomFilterSection4((prev) => !prev)}
              className={`text-xs shrink-0 whitespace-nowrap transition-all ${
                homeActiveFilter.startsWith("custom:") || showCustomFilterSection4
                  ? "bg-[#F53799] hover:bg-[#D42A7D] text-white shadow-xs font-semibold"
                  : "border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA]"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1" />
              <span>
                {homeActiveFilter.startsWith("custom:")
                  ? (() => {
                      const [, s, e] = homeActiveFilter.split(":");
                      return s === e ? `Custom (${s})` : `Custom (${s} – ${e})`;
                    })()
                  : "Custom"}
              </span>
            </Button>
          </div>
        </div>

        {/* View Mode Toolbar: Sectors vs Split Retail Platforms */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-[#FFD9EC]/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#223047]/70">Breakdown:</span>
            <div className="inline-flex items-center bg-[#FFF2FA] border border-[#FFD9EC] p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => handleSetRetailSplitMode(false)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  !retailSplitMode
                    ? "bg-white text-[#223047] shadow-xs"
                    : "text-[#223047] opacity-70 hover:opacity-100"
                }`}
              >
                Sectors View
              </button>
              <button
                type="button"
                onClick={() => handleSetRetailSplitMode(true)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  retailSplitMode
                    ? "bg-white text-[#223047] shadow-xs"
                    : "text-[#223047] opacity-70 hover:opacity-100"
                }`}
              >
                Distinguish Retail Platforms
              </button>
            </div>
          </div>
          <span className="text-xs text-[#223047]/50 italic">
            {homeActiveFilter.startsWith("custom:") && homeActiveFilter.split(":")[1] === homeActiveFilter.split(":")[2]
              ? `Showing intra-day hourly breakdown for ${homeActiveFilter.split(":")[1]}`
              : !retailSplitMode
              ? "Showing aggregated Cafe, Services, and Retail"
              : "Splitting Retail into In-Store POS, Shopee, and TikTok Shop"}
          </span>
        </div>

        {showCustomFilterSection4 && (
          <div className="flex flex-wrap items-center gap-2 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#D42A7D]">
              <Calendar className="w-3.5 h-3.5 text-[#F53799]" />
              <span>Select Custom Range:</span>
            </div>
            <input
              type="date"
              min="2020-01-01"
              max="2026-12-31"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-8 rounded-lg border border-[#FFD9EC] bg-white px-2.5 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]"
            />
            <span className="text-xs text-[#223047]/60 font-semibold">to</span>
            <input
              type="date"
              min={customStartDate || "2020-01-01"}
              max="2026-12-31"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-8 rounded-lg border border-[#FFD9EC] bg-white px-2.5 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]"
            />
            <Button
              size="sm"
              onClick={handleApplyCustomFilter}
              className="h-8 bg-[#F53799] hover:bg-[#D42A7D] text-white text-xs font-semibold px-3 shadow-xs"
            >
              Apply Filter
            </Button>
            <button
              type="button"
              onClick={() => setShowCustomFilterSection4(false)}
              className="text-xs text-[#223047]/60 hover:text-[#223047] ml-1 px-2 py-1 rounded hover:bg-[#FFE5F4]"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="w-full h-[280px] md:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dynamicOmnichannelData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient key="cafeLuxe-gradient" id="cafeLuxe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F53799" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F53799" stopOpacity={0} />
                </linearGradient>
                <linearGradient key="servicesGrad-gradient" id="servicesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
                </linearGradient>
                <linearGradient key="retailGrad-gradient" id="retailGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
                <linearGradient key="posGrad-gradient" id="posGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D42A7D" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#D42A7D" stopOpacity={0} />
                </linearGradient>
                <linearGradient key="tiktokGrad-gradient" id="tiktokGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
                <linearGradient key="shopeeGrad-gradient" id="shopeeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" vertical={false} />
              <XAxis
                dataKey="hour"
                stroke="#223047"
                style={{ fontSize: "12px" }}
                minTickGap={35}
                tickFormatter={(val) => {
                  if (!val) return "";
                  if (typeof val === "string" && val.includes("-")) {
                    const parts = val.split("-");
                    if (parts.length === 3) {
                      const d = new Date(`${val}T12:00:00Z`);
                      if (!isNaN(d.getTime())) {
                        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      }
                    }
                  }
                  return String(val);
                }}
              />
              <YAxis
                domain={omnichannelAxis.domain}
                ticks={omnichannelAxis.ticks}
                interval={0}
                stroke="#223047"
                style={{ fontSize: "12px" }}
                width={65}
                tickFormatter={(value) => {
                  const num = Number(value);
                  if (!Number.isFinite(num) || num === 0) return "₱0";
                  if (num >= 1000000) return `₱${(num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1)}M`;
                  if (num >= 1000) {
                    const inK = num / 1000;
                    return `₱${inK % 1 === 0 ? inK : inK.toFixed(1)}k`;
                  }
                  return `₱${num}`;
                }}
              />
              <Tooltip content={<CustomOmnichannelTooltip />} />
              {visibleSeries.cafe && (
                <Area
                  key="cafe-area"
                  type="monotone"
                  dataKey="cafe"
                  name="Cafe"
                  stroke="#F53799"
                  strokeWidth={2.5}
                  fill="url(#cafeLuxe)"
                  animationDuration={800}
                />
              )}
              {visibleSeries.services && (
                <Area
                  key="services-area"
                  type="monotone"
                  dataKey="services"
                  name="Services"
                  stroke="#0EA5E9"
                  strokeWidth={2.5}
                  fill="url(#servicesGrad)"
                  animationDuration={800}
                />
              )}
              {!retailSplitMode && visibleSeries.retail && (
                <Area
                  key="retail-area"
                  type="monotone"
                  dataKey="retail"
                  name="Retail"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  fill="url(#retailGrad)"
                  animationDuration={800}
                />
              )}
              {retailSplitMode && (
                <>
                  {visibleSeries.retail_pos && (
                    <Area
                      key="retail-pos-area"
                      type="monotone"
                      dataKey="retail_pos"
                      name="In-Store POS (Retail)"
                      stroke="#D42A7D"
                      strokeWidth={2.2}
                      fill="url(#posGrad)"
                      animationDuration={800}
                    />
                  )}
                  {visibleSeries.retail_tiktok && (
                    <Area
                      key="retail-tiktok-area"
                      type="monotone"
                      dataKey="retail_tiktok"
                      name="TikTok Shop (Retail)"
                      stroke="#8B5CF6"
                      strokeWidth={2.2}
                      fill="url(#tiktokGrad)"
                      animationDuration={800}
                    />
                  )}
                  {visibleSeries.retail_shopee && (
                    <Area
                      key="retail-shopee-area"
                      type="monotone"
                      dataKey="retail_shopee"
                      name="Shopee (Retail)"
                      stroke="#F97316"
                      strokeWidth={2.2}
                      fill="url(#shopeeGrad)"
                      animationDuration={800}
                    />
                  )}
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Row / Detailed Platform Cards */}
        {!retailSplitMode ? (
          /* Macro 3-Sector View */
          <div className="grid grid-cols-1 sm:grid-cols-3 items-stretch gap-2 md:gap-4 !mt-3 md:!mt-4 pt-3 border-t border-[#FFD9EC]">
            {legendData.map((sector) => {
              const isRetail = sector.key === "retail";
              const isVisible = visibleSeries[sector.key as keyof typeof visibleSeries];
              return (
                <div
                  key={sector.key}
                  className={`relative flex items-center justify-between gap-2 md:gap-3 p-2.5 md:p-3 rounded-xl border transition-all ${
                    isVisible
                      ? "bg-[#FFF2FA] border-[#FFD9EC]"
                      : "opacity-40 hover:opacity-60 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                    <div
                      onClick={() => toggleSeries(sector.key as keyof typeof visibleSeries)}
                      className="w-3 h-3 rounded-full flex-shrink-0 cursor-pointer hover:scale-110 transition-transform"
                      style={{ backgroundColor: sector.color }}
                      title={`Toggle ${sector.label} line in chart`}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        onClick={() => toggleSeries(sector.key as keyof typeof visibleSeries)}
                        className="cursor-pointer"
                        title={`Toggle ${sector.label} line in chart`}
                      >
                        <div className="text-xs text-[#223047] opacity-60 font-medium">{sector.label}</div>
                        <div className="text-sm md:text-base font-bold text-[#223047]">{sector.total}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span
                          onClick={() => toggleSeries(sector.key as keyof typeof visibleSeries)}
                          className="text-xs text-[#223047] opacity-50 cursor-pointer"
                        >
                          {sector.percent}
                        </span>
                        {sector.orders > 0 && (
                          <>
                            <span className="text-[10px] text-[#223047]/30">•</span>
                            <span className="text-[11px] text-[#223047]/60 font-medium">
                              {sector.orders.toLocaleString()} orders
                            </span>
                          </>
                        )}
                        {isRetail && homeOverview?.retailBreakdown && homeOverview.retailBreakdown.length > 0 && (
                          <>
                            <span className="text-[10px] text-[#223047]/30">•</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsRetailPlatformsOpen((prev) => !prev);
                              }}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border shadow-2xs transition-all cursor-pointer ${
                                isRetailPlatformsOpen
                                  ? "bg-[#F53799] text-white border-[#F53799]"
                                  : "bg-white text-[#F53799] hover:bg-[#FFF2FA] border-[#FFD9EC]"
                              }`}
                            >
                              <span>Platform Origin</span>
                              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isRetailPlatformsOpen ? "rotate-180" : ""}`} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(sector.key === "cafe" ? "/cafe" : sector.key === "services" ? "/services" : "/retail")}
                    className="text-[11px] font-semibold text-[#F53799] hover:bg-white/80 h-7 px-2 shrink-0 self-center"
                  >
                    Deep Dive <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>

                  {/* Retail Platform Origin Dropdown */}
                  {isRetail && isRetailPlatformsOpen && homeOverview?.retailBreakdown && homeOverview.retailBreakdown.length > 0 && (
                    <div
                      ref={retailDropdownRef}
                      className="absolute top-[calc(100%+6px)] right-0 z-40 w-72 max-w-[calc(100vw-3rem)] bg-white/95 backdrop-blur-md border border-[#FFD9EC] rounded-xl p-3 shadow-xl space-y-2 animate-in fade-in-50 duration-200"
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-[#FFD9EC]/60">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#223047]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                          Retail Platform Origin
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setIsRetailPlatformsOpen(false); }}
                          className="text-[11px] text-[#F53799] hover:underline font-semibold cursor-pointer"
                        >
                          hide
                        </button>
                      </div>
                      <div className="space-y-1.5 pt-0.5">
                        {homeOverview.retailBreakdown.map((item) => (
                          <div key={item.channel} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="truncate text-[#223047] font-medium text-[11px]">{item.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-semibold text-[#223047] text-[11px]">{formatCurrency(item.revenue)}</span>
                              <span className="px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ backgroundColor: `${item.color}15`, color: item.color }}>
                                {item.percent}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Detailed All-Platforms View */
          <div className="space-y-3 !mt-3 md:!mt-4 pt-3 border-t border-[#FFD9EC]">
            {/* Preset Filters Ribbon */}
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#D42A7D]" />
                <span className="text-xs font-semibold text-[#223047]">5 Platform Streams</span>
                <span className="text-[10px] text-[#223047]/50 hidden md:inline">• Click card to toggle chart line</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-[#223047]/50 uppercase font-semibold">Presets:</span>
                <button type="button" onClick={() => setAllSeries(true)} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FFF2FA] hover:bg-white text-[#223047] border border-[#FFD9EC] transition-all cursor-pointer">All</button>
                <button type="button" onClick={isolateRetailChannelsOnly} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FAF5FF] hover:bg-white text-[#8B5CF6] border border-[#E9D5FF] transition-all cursor-pointer">Retail</button>
                <button type="button" onClick={isolatePhysicalOnly} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FFF2FA] hover:bg-white text-[#D42A7D] border border-[#FFD9EC] transition-all cursor-pointer">Physical</button>
                <button type="button" onClick={isolateMarketplacesOnly} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FFF7ED] hover:bg-white text-[#F97316] border border-[#FED7AA] transition-all cursor-pointer">Digital</button>
              </div>
            </div>

            {/* 5 Platform Cards — vertical layout */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
              {distinguishedPlatformCards.map((platform) => {
                const isVisible = visibleSeries[platform.key];
                return (
                  <div
                    key={platform.key}
                    onClick={() => toggleSeries(platform.key)}
                    className={`relative flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                      isVisible
                        ? "hover:shadow-sm hover:brightness-[0.98]"
                        : "opacity-40 hover:opacity-70 border-dashed border-slate-200"
                    }`}
                    style={{
                      backgroundColor: isVisible ? platform.bgTint : "#f8f9fa",
                      borderColor: isVisible ? platform.borderTint : undefined,
                    }}
                    title={`Click to ${isVisible ? "hide" : "show"} ${platform.label} in chart`}
                  >
                    {/* Top: dot + label */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: platform.color }}
                      />
                      <span className="text-[11px] font-semibold text-[#223047]/70 leading-tight">{platform.label}</span>
                    </div>

                    {/* Revenue */}
                    <div className="text-sm font-extrabold text-[#223047] leading-tight mb-1">
                      {platform.total}
                    </div>

                    {/* Percentage */}
                    <div className="mb-1">
                      {platform.retailPercent ? (
                        <div>
                          <span className="text-[11px] font-bold" style={{ color: platform.color }}>
                            {platform.retailPercent}
                          </span>
                          <div className="text-[10px] text-[#223047]/40">({platform.omniPercent})</div>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#223047]/50">{platform.omniPercent}</span>
                      )}
                    </div>

                    {/* Orders */}
                    {platform.orders > 0 && (
                      <div className="text-[10px] text-[#223047]/50 font-medium mb-2">
                        {platform.orders.toLocaleString()} orders
                      </div>
                    )}

                    {/* Deep Dive */}
                    <div className="mt-auto pt-2 border-t border-black/5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(platform.route); }}
                        className="inline-flex items-center gap-1 text-[10px] font-bold hover:underline transition-all"
                        style={{ color: platform.color }}
                      >
                        Deep Dive <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* SECTION 3 — VISUAL RELIEF DIVIDER - AI INSIGHT WITH MASCOT */}
      <div
        className="woof-insight-band rounded-2xl flex items-center justify-between px-4 md:px-8 py-4 relative overflow-hidden mb-4 md:mb-6"
        style={{ background: "linear-gradient(to right, #FFF7FB, #FFF2FA)" }}
      >
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs border-[#F53799]/40 text-[#D42A7D] bg-white font-semibold">
              WOOF Insight
            </Badge>
            <Badge variant="outline" className="border-[#8B5CF6]/40 text-[#8B5CF6] bg-[#8B5CF6]/10 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">
              GLM 5.3
            </Badge>
          </div>
          <InsightText text={homeLoading ? "Generating WOOF insight…" : homeOverview?.insight || "Upload transaction data to activate live Home insights."} />
        </div>
        <img
          src={homeInsightImg.src}
          alt="Home Insight Mascot"
          className="woof-mascot-motion w-24 h-24 md:w-32 md:h-32 object-contain flex-shrink-0 ml-6"
        />
      </div>

      {/* SECTION 5 — CHANNEL EQUILIBRIUM */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-5 md:space-y-7 mb-4 md:mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
              Offline vs. Online Channel Balance
            </h2>
            <InfoTooltip label="Fair comparison matching channel revenue. When you click any filter button here, top KPI cards recalculate for this period." />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:flex-wrap">
              {[
                { key: "matched", label: "Matched 1-Year (2025-2026)" },
                { key: "all", label: "All-Time" },
                { key: "last-90-days", label: "Last 90 Days" },
                { key: "last-30-days", label: "Last 30 Days" },
              ].map((item) => (
                <Button
                  key={item.key}
                  size="sm"
                  variant={homeActiveFilter === item.key ? "default" : "outline"}
                  onClick={() => {
                    setShowCustomFilterSection5(false);
                    handleApplyGraphFilter(item.key);
                  }}
                  className={`text-xs shrink-0 whitespace-nowrap transition-all ${
                    homeActiveFilter === item.key
                      ? "bg-[#D42A7D] hover:bg-[#B01E64] text-white shadow-xs font-semibold"
                      : "border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA]"
                  }`}
                >
                  {item.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant={homeActiveFilter.startsWith("custom:") || showCustomFilterSection5 ? "default" : "outline"}
                onClick={() => setShowCustomFilterSection5((prev) => !prev)}
                className={`text-xs shrink-0 whitespace-nowrap transition-all ${
                  homeActiveFilter.startsWith("custom:") || showCustomFilterSection5
                    ? "bg-[#D42A7D] hover:bg-[#B01E64] text-white shadow-xs font-semibold"
                    : "border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA]"
                }`}
              >
                <Calendar className="w-3.5 h-3.5 mr-1" />
                <span>
                  {homeActiveFilter.startsWith("custom:")
                    ? (() => {
                        const [, s, e] = homeActiveFilter.split(":");
                        return s === e ? `Custom (${s})` : `Custom (${s} – ${e})`;
                      })()
                    : "Custom"}
                </span>
              </Button>
            </div>

            <button
              type="button"
              onClick={() => router.push('/retail#retail-revenue-by-channel')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D42A7D] hover:text-[#B01E64] transition-all group cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-[#FFF2FA] border border-[#FFD9EC]"
            >
              <span>Retail Breakdown</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {showCustomFilterSection5 && (
          <div className="flex flex-wrap items-center gap-2 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#D42A7D]">
              <Calendar className="w-3.5 h-3.5 text-[#F53799]" />
              <span>Select Custom Range:</span>
            </div>
            <input
              type="date"
              min="2020-01-01"
              max="2026-12-31"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-8 rounded-lg border border-[#FFD9EC] bg-white px-2.5 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]"
            />
            <span className="text-xs text-[#223047]/60 font-semibold">to</span>
            <input
              type="date"
              min={customStartDate || "2020-01-01"}
              max="2026-12-31"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-8 rounded-lg border border-[#FFD9EC] bg-white px-2.5 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]"
            />
            <Button
              size="sm"
              onClick={handleApplyCustomFilter}
              className="h-8 bg-[#D42A7D] hover:bg-[#B01E64] text-white text-xs font-semibold px-3 shadow-xs"
            >
              Apply Filter
            </Button>
            <button
              type="button"
              onClick={() => setShowCustomFilterSection5(false)}
              className="text-xs text-[#223047]/60 hover:text-[#223047] ml-1 px-2 py-1 rounded hover:bg-[#FFE5F4]"
            >
              Cancel
            </button>
          </div>
        )}

        {separatedEquilibriumData.length === 0 && (
          <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 text-sm text-[#223047] opacity-70">
            Upload POS, Shopee, TikTok, or PetHub transactions to compare channel revenue.
          </div>
        )}
        {/* Mobile custom progress bars view */}
        <div className="space-y-3 md:hidden">
          {separatedEquilibriumData.map((item) => {
            const maxRev = Math.max(...separatedEquilibriumData.map((d) => d.revenue), 1);
            const pct = Math.max(4, Math.round((item.revenue / maxRev) * 100));
            return (
              <div
                key={`mobile-bar-${item.category}`}
                onClick={() => router.push('/retail#retail-revenue-by-channel')}
                className="p-3 rounded-xl bg-[#FFF7FB] border border-[#FFD9EC]/70 cursor-pointer active:scale-[0.99] transition-all"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />
                    <span className="font-bold text-[#223047] truncate">{item.category}</span>
                  </div>
                  <span className="font-extrabold text-[#223047] shrink-0 ml-2">{formatCurrency(item.revenue)}</span>
                </div>
                <div className="w-full bg-white h-2.5 rounded-full overflow-hidden border border-[#FFD9EC]/50">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: item.fill }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Recharts BarChart */}
        <div 
          className="w-full cursor-pointer group hidden md:block"
          style={{ height: Math.max(140, separatedEquilibriumData.length * 44 + 32) }}
          title="Click to view Retail Revenue by Channel"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={separatedEquilibriumData}
              layout="vertical"
              margin={{ top: 6, right: 32, bottom: 0, left: 24 }}
              barSize={24}
              onClick={() => router.push('/retail#retail-revenue-by-channel')}
              className="cursor-pointer"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" horizontal={false} />
              <XAxis
                type="number"
                domain={channelBalanceAxis.domain}
                ticks={channelBalanceAxis.ticks}
                interval={0}
                stroke="#223047"
                style={{ fontSize: "12px" }}
                tickFormatter={(val) => {
                  const n = Number(val);
                  if (n >= 1000000) return `₱${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
                  return `₱${n.toLocaleString()}`;
                }}
              />
              <YAxis
                type="category"
                dataKey="category"
                stroke="#223047"
                width={160}
                style={{ fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              />
              <Tooltip
                formatter={(value: any, _name: string, item: any) => {
                  const label = item?.payload?.category || "Revenue";
                  return [formatCurrency(Number(value) || 0), label];
                }}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #FFD9EC",
                  borderRadius: "12px",
                }}
              />
              <Bar 
                dataKey="revenue" 
                radius={[0, 6, 6, 0]} 
                animationDuration={800}
                className="cursor-pointer hover:opacity-85 transition-opacity"
                onClick={() => router.push('/retail#retail-revenue-by-channel')}
              >
                {separatedEquilibriumData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill} 
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 !mt-3 md:!mt-4 pt-3 border-t border-[#FFD9EC]/50">
          {separatedEquilibriumData.map((item) => (
            <div key={item.category} className="flex items-center gap-2 text-xs md:text-sm text-[#223047]">
              <span
                className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                style={{ backgroundColor: item.fill }}
              />
              <span className="font-semibold">{item.category}:</span>
              <span className="font-bold text-[#223047]/80">{formatCurrency(item.revenue)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 6 — SALES INTENSITY HEATMAP & AUTONOMOUS SUGGESTIONS */}
      <div className="space-y-4 md:space-y-6">
        
        {/* Sales Intensity Heatmap */}
        <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                  Sales Intensity Map
                </h2>
                <InfoTooltip label="Estimated hourly revenue for the next 7 days, anchored to the current date. Based on the same weekday and hour over the previous two years. Recent history receives more weight." />
              </div>
              <div className="mt-1 text-sm text-[#06B6D4] font-medium">
                7-day forecast · Starting Today ({displayHeatmapDays[0]?.label || "Today"}) – {displayHeatmapDays[displayHeatmapDays.length - 1]?.label || ""}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 md:justify-end">
              {["Cafe + Services", "Cafe", "Services"].map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={heatmapFilter === (filter === "Cafe + Services" ? "allsectors" : filter.toLowerCase()) ? "default" : "outline"}
                  onClick={() => setHeatmapFilter(filter === "Cafe + Services" ? "allsectors" : filter.toLowerCase())}
                  className={
                    heatmapFilter === (filter === "Cafe + Services" ? "allsectors" : filter.toLowerCase())
                      ? "bg-[#F53799] hover:bg-[#D42A7D] text-xs font-semibold"
                      : "border-[#FFD9EC] hover:bg-[#FFF2FA] text-xs"
                  }
                >
                  {filter}
                </Button>
              ))}
            </div>
          </div>

          {/* Mobile Morning / Afternoon Window Toggle */}
          <div className="flex items-center gap-1.5 md:hidden bg-[#FFF7FB] border border-[#FFD9EC] p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setMobileHeatmapWindow("morning")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mobileHeatmapWindow === "morning"
                  ? "bg-[#F53799] text-white shadow-xs"
                  : "text-[#223047]/70 hover:bg-[#FFF2FA]"
              }`}
            >
              Morning (7 AM – 12 PM)
            </button>
            <button
              type="button"
              onClick={() => setMobileHeatmapWindow("afternoon")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mobileHeatmapWindow === "afternoon"
                  ? "bg-[#F53799] text-white shadow-xs"
                  : "text-[#223047]/70 hover:bg-[#FFF2FA]"
              }`}
            >
              Afternoon (1 PM – 7 PM)
            </button>
          </div>

          {/* Mobile 6-Hour Grid (fits 100% within mobile viewport, no horizontal cut-off) */}
          <div className="md:hidden space-y-2">
            <div className="grid grid-cols-[4.5rem_repeat(6,minmax(0,1fr))] gap-1 items-center">
              <div className="text-[11px] font-semibold text-[#223047] opacity-60">Day</div>
              {(mobileHeatmapWindow === "morning" ? [7, 8, 9, 10, 11, 12] : [13, 14, 15, 16, 17, 18]).map((hour) => (
                <div key={`m-hdr-${hour}`} className="text-center text-[10px] font-bold text-[#223047] opacity-60">
                  {hour === 12 ? "12P" : hour < 12 ? `${hour}A` : `${hour - 12}P`}
                </div>
              ))}
            </div>
            {displayHeatmapDays.map((day, dayIdx) => {
              const isToday = dayIdx === 0;
              const hours = mobileHeatmapWindow === "morning" ? [7, 8, 9, 10, 11, 12] : [13, 14, 15, 16, 17, 18];
              return (
                <div key={`m-day-${day.date}`} className="grid grid-cols-[4.5rem_repeat(6,minmax(0,1fr))] items-center gap-1">
                  <div className="flex items-center gap-1 min-w-0 pr-1">
                    <span className="text-[11px] font-bold text-[#223047] truncate">
                      {isToday ? "Today" : day.dayLabel}
                    </span>
                    {isToday ? (
                      <span className="px-1 py-0.2 text-[7px] font-bold rounded bg-[#FFF2FA] text-[#F53799] border border-[#FFD9EC]">
                        NOW
                      </span>
                    ) : (
                      <span className="text-[9px] text-[#223047]/50 truncate">
                        {day.label.replace(day.dayLabel, "").trim()}
                      </span>
                    )}
                  </div>
                  {hours.map((hour) => {
                    const revenue = getHeatmapRevenue(day.date, hour);
                    const intensity = getHeatmapIntensity(day.date, hour);
                    const hourLabel = hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
                    const periodEnd = hour + 1;
                    const intervalLabel = `${hourLabel}–${periodEnd === 12 ? "12 PM" : periodEnd < 12 ? `${periodEnd} AM` : `${periodEnd - 12} PM`}`;
                    const dayTitle = isToday ? `Today (${day.label})` : day.label;
                    return (
                      <div
                        key={`m-cell-${day.date}-${hour}`}
                        tabIndex={0}
                        role="img"
                        aria-label={`${dayTitle}, ${intervalLabel} forecast ${formatCurrency(revenue)}, ${intensity.toFixed(0)}% intensity`}
                        onClick={(event) => updateHeatmapTooltip(event, `${dayTitle} · ${intervalLabel}`, revenue, intensity)}
                        className="h-8 rounded border border-[#FFD9EC] cursor-pointer hover:ring-2 hover:ring-[#F53799] focus:ring-2 focus:ring-[#F53799] transition-all"
                        style={{ backgroundColor: getHeatmapColor(intensity) }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Desktop 12-Hour Full Grid */}
          <div className="hidden md:block overflow-x-auto pb-1">
            <div className="min-w-[760px] space-y-2">
              <div className="grid grid-cols-[6rem_repeat(12,minmax(0,1fr))] gap-1.5 md:gap-2">
                <div className="text-xs font-semibold text-[#223047] opacity-60">Day</div>
                {heatmapHours.map((hour) => (
                  <div key={hour} className="text-center text-[10px] md:text-xs text-[#223047] opacity-60">
                    {hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                  </div>
                ))}
              </div>
              {displayHeatmapDays.map((day, dayIdx) => {
                const isToday = dayIdx === 0;
                return (
                  <div key={day.date} className="grid grid-cols-[6rem_repeat(12,minmax(0,1fr))] items-center gap-1.5 md:gap-2">
                    <div className="flex items-center gap-1 min-w-0 pr-1">
                      <span className="text-xs font-bold text-[#223047] truncate">
                        {isToday ? "Today" : day.dayLabel}
                      </span>
                      <span className="text-[10px] text-[#223047]/60 truncate">
                        {day.label.replace(day.dayLabel, "").trim()}
                      </span>
                      {isToday && (
                        <span className="px-1 py-0.5 text-[8px] font-bold rounded bg-[#FFF2FA] text-[#F53799] border border-[#FFD9EC]">
                          NOW
                        </span>
                      )}
                    </div>
                    {heatmapHours.map((hour) => {
                      const revenue = getHeatmapRevenue(day.date, hour);
                      const intensity = getHeatmapIntensity(day.date, hour);
                      const hourLabel = hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
                      const periodEnd = hour + 1;
                      const intervalLabel = `${hourLabel}–${periodEnd === 12 ? "12 PM" : periodEnd < 12 ? `${periodEnd} AM` : `${periodEnd - 12} PM`}`;
                      const dayTitle = isToday ? `Today (${day.label})` : day.label;
                      return (
                        <div
                          key={`${day.date}-${hour}`}
                          tabIndex={0}
                          role="img"
                          aria-label={`${dayTitle}, ${intervalLabel} forecast ${formatCurrency(revenue)}, ${intensity.toFixed(0)}% intensity`}
                          onMouseEnter={(event) => updateHeatmapTooltip(event, `${dayTitle} · ${intervalLabel}`, revenue, intensity)}
                          onMouseMove={(event) => updateHeatmapTooltip(event, `${dayTitle} · ${intervalLabel}`, revenue, intensity)}
                          onMouseLeave={() => setHoveredHeatmapCell(null)}
                          onFocus={(event) => updateHeatmapTooltip(event, `${dayTitle} · ${intervalLabel}`, revenue, intensity)}
                          onBlur={() => setHoveredHeatmapCell(null)}
                          className="h-8 md:h-11 rounded border border-[#FFD9EC] cursor-pointer hover:ring-2 hover:ring-[#F53799] focus:ring-2 focus:ring-[#F53799] transition-all"
                          style={{ backgroundColor: getHeatmapColor(intensity) }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {hoveredHeatmapCell && (
            <div
              role="status"
              className="fixed z-[100] pointer-events-none -translate-x-1/2 -translate-y-full rounded-lg border border-[#FFD9EC] bg-white px-3 py-2 shadow-lg text-xs text-[#223047]"
              style={{ left: hoveredHeatmapCell.x, top: hoveredHeatmapCell.y - 10 }}
            >
              <div className="font-semibold">{hoveredHeatmapCell.label}</div>
              <div className="font-bold text-[#06B6D4]">{hoveredHeatmapCell.intensity.toFixed(0)}% intensity</div>
              <div>Forecast revenue: {formatCurrency(hoveredHeatmapCell.revenue)}</div>
            </div>
          )}

          <div className="text-[10px] text-center text-[#223047] opacity-50">
            Hour blocks run from 7 AM through 7 PM; the final block is 6–7 PM.
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-6 text-[10px] sm:text-xs text-[#223047] opacity-80">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 border border-[#FFD9EC] rounded bg-[#FFFFFF]"></div><span>None (0%)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#10B981]"></div><span>Low (1-40%)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#F59E0B]"></div><span>Moderate (41-60%)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#FFD9EC]"></div><span>High (61-80%)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#F53799]"></div><span>Peak (&gt;80%)</span></div>
          </div>
        </div>

        {/* WOOF Autonomous Suggestions */}
        <div ref={suggestionsRef} className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 scroll-mt-24 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                WOOF Autonomous Suggestions — Pending Review
              </h2>
              <Badge className={`${scaledKPIs.pending === 0 ? "bg-emerald-500" : "bg-[#06B6D4]"} text-white text-xs`}>
                {scaledKPIs.pending} Pending
              </Badge>
              <InfoTooltip label="AI-generated promotion recommendations based on real-time pattern analysis. Dynamically updates the WOOF Suggestions KPI card." />
            </div>
            {suggestions.length > 1 && (
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => moveSuggestionsCarousel(-1)}
                  className="h-9 w-9 rounded-full border-[#FFD9EC] text-[#F53799] hover:bg-[#FFF2FA]"
                  aria-label="Show previous recommendations"
                  title="Previous recommendations"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => moveSuggestionsCarousel(1)}
                  className="h-9 w-9 rounded-full border-[#FFD9EC] text-[#F53799] hover:bg-[#FFF2FA]"
                  aria-label="Show next recommendations"
                  title="Next recommendations"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div
            className="woof-suggestions-carousel overflow-hidden"
            onMouseEnter={(event) => event.currentTarget.classList.add("is-paused")}
            onMouseLeave={(event) => event.currentTarget.classList.remove("is-paused")}
            onFocus={(event) => event.currentTarget.classList.add("is-paused")}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                event.currentTarget.classList.remove("is-paused");
              }
            }}
          >
            {suggestions.length === 0 && (
              <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 text-sm text-[#223047] opacity-70">
                Upload transaction data to generate live WOOF recommendations.
              </div>
            )}
            {suggestions.length > 0 && (
              <>
                {/* Desktop marquee carousel with manual timeline controls. */}
                <div
                  ref={desktopSuggestionsTrackRef}
                  className={`hidden md:flex gap-4 md:gap-6 ${
                    shouldAnimateSuggestions
                      ? "w-max animate-woof-suggestion-carousel"
                      : "flex-wrap"
                  }`}
                >
                  {carouselSuggestions.map((suggestion, index) =>
                    renderSuggestionCard(suggestion, index, false)
                  )}
                </div>

                {/* Mobile Snap Carousel */}
                <div className="md:hidden">
                  <div ref={mobileSuggestionsCarouselRef} className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-3 pb-3 -mx-2 px-2">
                    {suggestions.map((suggestion, index) =>
                      renderSuggestionCard(suggestion, index, true)
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 pt-2">
                    {suggestions.map((s, idx) => (
                      <span
                        key={`dot-${s.id}-${idx}`}
                        className="w-1.5 h-1.5 rounded-full bg-[#F53799]/40"
                      />
                    ))}
                    <span className="text-[11px] text-[#223047]/60 ml-1.5 font-medium">
                      Swipe to view {suggestions.length} recommendations
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>



      {/* Error Modal */}
      {errorModal.type && (
        <ErrorModal
          isOpen={errorModal.isOpen}
          onClose={() => setErrorModal({ isOpen: false, type: null })}
          errorType={errorModal.type}
          onRefresh={errorModal.type === "concurrent_modification" ? handleRefreshData : undefined}
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

      {/* Demo: Connection Lost Button (for testing - can be removed) */}
      <button
        onClick={triggerConnectionLost}
        className="woof-demo-control fixed bottom-4 left-1/2 -translate-x-1/2 lg:left-[calc(50%+4rem)] lg:translate-x-0 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-20 hover:opacity-100 transition-opacity z-40"
        title="Simulate connection lost (Demo)"
      >
        Test Connection
      </button>
    </div>
  );
}
