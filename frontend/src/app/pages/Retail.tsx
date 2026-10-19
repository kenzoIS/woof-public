import { RetailInventoryMonitor } from "../components/RetailInventoryMonitor";
import React, { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useRouter } from "next/router";
import { DollarSign, TrendingUp, Package, AlertCircle, Target, ArrowRight, Percent, Store, ShoppingBag, TrendingDown, ShieldCheck, Scale, ChevronRight, ChevronDown } from "lucide-react";
import { KpiDetailModal, KpiDetailData } from "../components/KpiDetailModal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { InfoTooltip } from "../components/InfoTooltip";
import { WoofInsight } from "../components/WoofInsight";
import { getDashboard, getRetailForecastByChannel } from "../lib/api";
import {
  HISTORY_START_DATE,
  INGESTED_HISTORY_END_DATE,
  filterByDateRange,
  parseCustomRange,
  parseGlobalRange,
  addDays,
  countDays,
} from "../lib/dateRanges";
import retailMascot from "../../imports/no_bg_Retail.png";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RePieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

// Fallback data for velocity / forecast

const retailSentimentData = [
  { name: "Positive", value: 72, color: "#06B6D4" },
  { name: "Neutral", value: 18, color: "#CCCCCC" },
  { name: "Negative", value: 10, color: "#F53799" },
];

const flaggedRetailReviews = [
  {
    platform: "Shopee",
    text: "Product arrived with missing accessories and the listing description was misleading.",
    date: "Apr 14, 2026",
    product: "Premium Dog Food 5kg",
    keywords: ["missing", "misleading"],
  },
  {
    platform: "Physical Store",
    text: "Shelf label was incorrect and the cashier gave conflicting pricing information.",
    date: "Apr 13, 2026",
    product: "Cat Litter Premium 10L",
    keywords: ["incorrect", "conflicting"],
  },
  {
    platform: "TikTok",
    text: "Packaging felt cheap and the purchase experience was slower than expected.",
    date: "Apr 12, 2026",
    product: "Pet Collar Deluxe",
    keywords: ["cheap", "slower"],
  },
];

const formatChartDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
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

function inferRetailCategory(category?: string | null, name?: string | null): string {
  const cleanCat = (category || "").trim();
  const lowerCat = cleanCat.toLowerCase();
  const lowerName = (name || "").toLowerCase();

  // If already a valid specific category other than generic uncategorized/general
  if (
    cleanCat &&
    lowerCat !== "uncategorized" &&
    lowerCat !== "general retail" &&
    lowerCat !== "unknown" &&
    lowerCat !== "other" &&
    lowerCat !== "general" &&
    lowerCat !== "retail"
  ) {
    if (lowerCat.includes("pet supplies") || lowerCat.includes("supplies")) {
      if (
        lowerName.includes("cat food") ||
        lowerName.includes("wet cat") ||
        lowerName.includes("dry cat") ||
        lowerName.includes("zoi") ||
        lowerName.includes("instinctive")
      ) {
        return "Cat Food & Treats";
      }
      if (
        lowerName.includes("dog food") ||
        lowerName.includes("nutri chunks") ||
        lowerName.includes("kibble")
      ) {
        return "Dog Food & Treats";
      }
      return "Pet Supplies & Accessories";
    }
    return cleanCat;
  }

  // Medication & Parasiticides / Dewormers
  if (
    lowerName.includes("worm") ||
    lowerName.includes("dewormer") ||
    lowerName.includes("nematocide") ||
    lowerName.includes("parasite")
  ) {
    return "Medication & Parasiticides";
  }

  // Ear & Eye Care
  if (
    lowerName.includes("ear drop") ||
    lowerName.includes("ear cleaner") ||
    lowerName.includes("eye rinse") ||
    lowerName.includes("eye drop") ||
    /\bear\b/.test(lowerName) ||
    /\beye\b/.test(lowerName)
  ) {
    return "Ear & Eye Care";
  }

  // Cat Food & Treats
  if (
    lowerName.includes("cat food") ||
    lowerName.includes("cat dry") ||
    lowerName.includes("wet cat") ||
    lowerName.includes("zoi") ||
    lowerName.includes("instinctive")
  ) {
    return "Cat Food & Treats";
  }

  // Dog Food & Treats
  if (
    lowerName.includes("dog food") ||
    lowerName.includes("nutri chunks") ||
    lowerName.includes("kibble") ||
    lowerName.includes("canine food")
  ) {
    return "Dog Food & Treats";
  }

  // Grooming & Bath
  if (
    lowerName.includes("shampoo") ||
    lowerName.includes("bath") ||
    lowerName.includes("conditioner") ||
    lowerName.includes("grooming") ||
    lowerName.includes("hypoallergenic")
  ) {
    return "Grooming & Bath";
  }

  // Training & Behavior Aids
  if (
    lowerName.includes("anti-coprophagic") ||
    lowerName.includes("behavior") ||
    lowerName.includes("training")
  ) {
    return "Training & Behavior Aids";
  }

  // Vitamins, Supplements & Pet Wellness
  if (
    lowerName.includes("chewable") ||
    lowerName.includes("chewables") ||
    lowerName.includes("yeast") ||
    lowerName.includes("multivitamin") ||
    lowerName.includes("calcium") ||
    lowerName.includes("glucosamine") ||
    lowerName.includes("arthropet") ||
    lowerName.includes("allergy") ||
    lowerName.includes("heart") ||
    lowerName.includes("liver") ||
    lowerName.includes("vision") ||
    lowerName.includes("uri-aid") ||
    lowerName.includes("supplement") ||
    lowerName.includes("vitamin") ||
    lowerName.includes("paw gel")
  ) {
    return "Vitamins & Supplements";
  }

  if (lowerName.includes("toy")) return "Toys & Enrichment";
  if (lowerName.includes("collar") || lowerName.includes("leash") || lowerName.includes("harness")) return "Collars & Leashes";
  if (lowerName.includes("litter")) return "Litter & Hygiene";

  return "Pet Wellness & Care";
}

export function Retail() {
  const router = useRouter();
  const [omnichannelMode, setOmnichannelMode] = useState<"overall" | "header">("overall");
  const [keywords, setKeywords] = useState(["missing", "misleading", "incorrect", "slow", "damaged"]);
  const [newKeyword, setNewKeyword] = useState("");
  const [selectedKpi, setSelectedKpi] = useState<KpiDetailData | null>(null);
  const [globalDateRange, setGlobalDateRange] = useState("last-7-days");
  const [retailActiveFilter, setRetailActiveFilter] = useState("matched");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customMode, setCustomMode] = useState<"single" | "range">("single");
  const [customSingleDate, setCustomSingleDate] = useState("2026-05-01");
  const [customStartDate, setCustomStartDate] = useState("2025-05-02");
  const [customEndDate, setCustomEndDate] = useState("2026-05-02");
  const [channelGraphMode, setChannelGraphMode] = useState<"combined" | "split">("combined");
  const [activeChannelKey, setActiveChannelKey] = useState<"all" | "shopee" | "tiktok" | "physical" | "pethub">("all");
  const [expandedFeeChannels, setExpandedFeeChannels] = useState<Record<string, boolean>>({});
  const toggleFeeDropdown = (channel: string) => {
    setExpandedFeeChannels((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  const handleApplyFilter = (key: string) => {
    setRetailActiveFilter(key);
    setShowCustomFilter(false);
  };

  const handleApplyCustomFilter = () => {
    if (customMode === "single") {
      if (!customSingleDate) return;
      setRetailActiveFilter(`custom:${customSingleDate}:${customSingleDate}`);
    } else {
      if (!customStartDate || !customEndDate) return;
      const safeEnd = customEndDate >= customStartDate ? customEndDate : customStartDate;
      setRetailActiveFilter(`custom:${customStartDate}:${safeEnd}`);
    }
    setShowCustomFilter(false);
  };

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

  useEffect(() => {
    const handleScrollToTarget = () => {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const sectionQuery = router.query.section;
      if (hash === "#retail-revenue-by-channel" || sectionQuery === "retail-revenue-by-channel") {
        setTimeout(() => {
          const el = document.getElementById("retail-revenue-by-channel");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            el.classList.add("ring-4", "ring-[#D42A7D]/40", "transition-all", "duration-500");
            setTimeout(() => {
              el.classList.remove("ring-4", "ring-[#D42A7D]/40");
            }, 3000);
          }
        }, 300);
      }
    };

    handleScrollToTarget();
  }, [router.asPath, router.query]);

  // API data
  const [realtimeRefresh, setRealtimeRefresh] = useState(0);

  // Auto-refresh on Realtime Socket.io events
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

  const { data: dashboardData } = useSWR(['dashboard', 'retail', realtimeRefresh], () => getDashboard("retail"));
  const { data: channelForecast } = useSWR(['forecast', 'retail', realtimeRefresh], () => getRetailForecastByChannel());

  const activeRange = useMemo(() => {
    const latestAnchor = channelForecast?.latestDigitalDate || "2026-05-02";
    if (retailActiveFilter === "all") {
      return {
        start: HISTORY_START_DATE,
        end: INGESTED_HISTORY_END_DATE,
        isCustom: false,
      };
    }
    if (retailActiveFilter === "last-90-days") {
      return {
        start: addDays(latestAnchor, -89),
        end: latestAnchor,
        isCustom: false,
      };
    }
    if (retailActiveFilter === "last-30-days") {
      return {
        start: addDays(latestAnchor, -29),
        end: latestAnchor,
        isCustom: false,
      };
    }
    if (retailActiveFilter.startsWith("custom:")) {
      const parts = retailActiveFilter.split(":");
      const start = parts[1] || HISTORY_START_DATE;
      const end = parts[2] || start;
      return {
        start,
        end: end >= start ? end : start,
        isCustom: true,
      };
    }
    // Default: "matched" -> 1 Year (2025-05-02 to 2026-05-02)
    return {
      start: addDays(latestAnchor, -365),
      end: latestAnchor,
      isCustom: false,
    };
  }, [retailActiveFilter, channelForecast?.latestDigitalDate]);

  const forecastData = useMemo(() => {
    const phys = channelForecast?.physical?.historical || [];
    const tiktok = channelForecast?.tiktok?.historical || [];
    const shopee = channelForecast?.shopee?.historical || [];
    const pethub = channelForecast?.pethub?.historical || [];
    if (phys.length === 0 && tiktok.length === 0 && shopee.length === 0) return [];

    // Filter each series by activeRange [start, end]
    const physFiltered = phys.filter((d: any) => d.date >= activeRange.start && d.date <= activeRange.end);
    const tiktokFiltered = tiktok.filter((d: any) => d.date >= activeRange.start && d.date <= activeRange.end);
    const shopeeFiltered = shopee.filter((d: any) => d.date >= activeRange.start && d.date <= activeRange.end);
    const pethubFiltered = pethub.filter((d: any) => d.date >= activeRange.start && d.date <= activeRange.end);

    const dateMap: Record<
      string,
      {
        physical: number | null;
        online: number | null;
        tiktok: number | null;
        shopee: number | null;
        pethub: number | null;
        physicalProfit: number | null;
        onlineProfit: number | null;
        tiktokProfit: number | null;
        shopeeProfit: number | null;
        pethubProfit: number | null;
      }
    > = {};

    const getEntry = (date: string) => {
      if (!dateMap[date]) {
        dateMap[date] = {
          physical: null,
          online: null,
          tiktok: null,
          shopee: null,
          pethub: null,
          physicalProfit: null,
          onlineProfit: null,
          tiktokProfit: null,
          shopeeProfit: null,
          pethubProfit: null,
        };
      }
      return dateMap[date];
    };

    physFiltered.forEach((d: any) => {
      const entry = getEntry(d.date);
      entry.physical = Number(d.revenue) || 0;
      entry.physicalProfit = d.netProfit != null ? Number(d.netProfit) : Math.round(Number(d.revenue || 0) * 0.292);
    });

    tiktokFiltered.forEach((d: any) => {
      const entry = getEntry(d.date);
      entry.tiktok = Number(d.revenue) || 0;
      entry.tiktokProfit = d.netProfit != null ? Number(d.netProfit) : Math.round(Number(d.revenue || 0) * 0.215);
    });

    shopeeFiltered.forEach((d: any) => {
      const entry = getEntry(d.date);
      entry.shopee = Number(d.revenue) || 0;
      entry.shopeeProfit = d.netProfit != null ? Number(d.netProfit) : Math.round(Number(d.revenue || 0) * 0.195);
    });

    pethubFiltered.forEach((d: any) => {
      const entry = getEntry(d.date);
      entry.pethub = Number(d.revenue) || 0;
      entry.pethubProfit = d.netProfit != null ? Number(d.netProfit) : Math.round(Number(d.revenue || 0) * 0.395);
    });

    // If single day was selected and dateMap is empty, insert empty point for that day so chart displays
    if (activeRange.isCustom && activeRange.start === activeRange.end && !dateMap[activeRange.start]) {
      dateMap[activeRange.start] = {
        physical: 0,
        online: 0,
        tiktok: 0,
        shopee: 0,
        pethub: 0,
        physicalProfit: 0,
        onlineProfit: 0,
        tiktokProfit: 0,
        shopeeProfit: 0,
        pethubProfit: 0,
      };
    }

    const sorted = Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => {
        return {
          day: date,
          physical: vals.physical ?? 0,
          tiktok: vals.tiktok ?? 0,
          shopee: vals.shopee ?? 0,
          pethub: vals.pethub ?? 0,
          online: ((vals.tiktok ?? 0) + (vals.shopee ?? 0) + (vals.pethub ?? 0)),
          physicalRevenue: vals.physical ?? 0,
          tiktokRevenue: vals.tiktok ?? 0,
          shopeeRevenue: vals.shopee ?? 0,
          pethubRevenue: vals.pethub ?? 0,
          physicalProfit: vals.physicalProfit ?? 0,
          tiktokProfit: vals.tiktokProfit ?? 0,
          shopeeProfit: vals.shopeeProfit ?? 0,
          pethubProfit: vals.pethubProfit ?? 0,
        };
      });

    return sorted;
  }, [channelForecast, activeRange]);

  const channelStats = useMemo(() => {
    let maxShopee = 0;
    let maxTiktok = 0;
    let maxPhys = 0;
    let totalShopee = 0;
    let totalTiktok = 0;
    let totalPhys = 0;
    let totalPethub = 0;

    forecastData.forEach((d: any) => {
      const s = Number(d.shopee) || 0;
      const t = Number(d.tiktok) || 0;
      const p = Number(d.physical) || 0;
      const ph = Number(d.pethub) || 0;

      if (s > maxShopee) maxShopee = s;
      if (t > maxTiktok) maxTiktok = t;
      if (p > maxPhys) maxPhys = p;

      totalShopee += s;
      totalTiktok += t;
      totalPhys += p;
      totalPethub += ph;
    });

    return {
      maxShopee,
      maxTiktok,
      maxPhys,
      totalShopee,
      totalTiktok,
      totalPhys,
      totalPethub,
    };
  }, [forecastData]);

  const activeYDomain = useMemo(() => {
    if (activeChannelKey === "physical") {
      return [0, Math.max(100, Math.ceil(channelStats.maxPhys * 1.15))];
    }
    if (activeChannelKey === "tiktok") {
      return [0, Math.max(1000, Math.ceil(channelStats.maxTiktok * 1.15))];
    }
    if (activeChannelKey === "shopee") {
      return [0, Math.max(5000, Math.ceil(channelStats.maxShopee * 1.1))];
    }
    if (activeChannelKey === "pethub") {
      return [0, 100];
    }
    return [0, "auto"];
  }, [activeChannelKey, channelStats]);

  const kpis = dashboardData?.kpis || {};
  const aggregatedKpis = useMemo(() => {
    if (!channelForecast?.physical?.historical?.length) {
      return {
        totalRevenue: kpis?.totalRevenue || 0,
        revenueGrowth: { text: "", className: "hidden" },
      };
    }
    const range = activeRange;
    const physSliced = filterByDateRange(channelForecast.physical.historical, range);
    const onlineSliced = filterByDateRange(channelForecast.online?.historical || [], range);
    const physRevenue = physSliced.reduce((sum: number, d: any) => sum + d.revenue, 0);
    const onlineRevenue = onlineSliced.reduce((sum: number, d: any) => sum + d.revenue, 0);
    const totalRevenue = physRevenue + onlineRevenue;

    const dayCount = countDays(range.start, range.end);
    const previousEnd = addDays(range.start, -1);
    const previousStart = addDays(previousEnd, -(dayCount - 1));
    const prevRange = { start: previousStart, end: previousEnd, isCustom: range.isCustom };
    const physPrevSliced = filterByDateRange(channelForecast.physical.historical, prevRange);
    const onlinePrevSliced = filterByDateRange(channelForecast.online?.historical || [], prevRange);
    const physPrevRevenue = physPrevSliced.reduce((sum: number, d: any) => sum + d.revenue, 0);
    const onlinePrevRevenue = onlinePrevSliced.reduce((sum: number, d: any) => sum + d.revenue, 0);
    const previousRevenue = physPrevRevenue + onlinePrevRevenue;

    return {
      totalRevenue,
      previousRevenue,
      rangeStart: range.start,
      rangeEnd: range.end,
      prevRangeStart: previousStart,
      prevRangeEnd: previousEnd,
      revenueGrowth: formatGrowth(totalRevenue, previousRevenue),
    };
  }, [channelForecast, activeRange, kpis]);

  const retailRevenue = aggregatedKpis.totalRevenue ? `₱${aggregatedKpis.totalRevenue.toLocaleString()}` : "₱0";
  const activeSKUs = dashboardData?.topItems?.length || 0;
  const retailChannelPerformance = useMemo(() => {
    const getBaseRevenue = (channel: string) => {
      const row = dashboardData?.channelBreakdown?.find(
        (item: any) => item.channel === channel,
      );
      return Number(row?.revenue) || 0;
    };

    const basePos = getBaseRevenue("POS");
    const baseShopee = getBaseRevenue("Shopee");
    const baseTikTok = getBaseRevenue("TikTok Shop");
    const basePetHub = getBaseRevenue("PetHub");

    if (omnichannelMode === "header" && channelForecast?.physical?.historical) {
      const latestHistoryDate =
        channelForecast.physical.historical[channelForecast.physical.historical.length - 1]?.date ||
        INGESTED_HISTORY_END_DATE;
      const range = parseGlobalRange(globalDateRange, latestHistoryDate);
      const physSliced = filterByDateRange(channelForecast.physical.historical, range);
      const onlineSliced = filterByDateRange(channelForecast.online?.historical || [], range);

      const totalPhys = physSliced.reduce((sum: number, item: any) => sum + Number(item.revenue || 0), 0);
      const totalOnline = onlineSliced.reduce((sum: number, item: any) => sum + Number(item.revenue || 0), 0);

      const totalOnlineBase = baseShopee + baseTikTok + basePetHub;
      const shopeeRatio = totalOnlineBase ? baseShopee / totalOnlineBase : 0.33;
      const tiktokRatio = totalOnlineBase ? baseTikTok / totalOnlineBase : 0.33;
      const pethubRatio = totalOnlineBase ? basePetHub / totalOnlineBase : 0.34;

      return [
        {
          sector: "Retail",
          pos: Math.round(totalPhys),
          shopee: Math.round(totalOnline * shopeeRatio),
          tiktok: Math.round(totalOnline * tiktokRatio),
          pethub: Math.round(totalOnline * pethubRatio),
        },
      ];
    }

    return [
      {
        sector: "Retail",
        pos: basePos,
        shopee: baseShopee,
        tiktok: baseTikTok,
        pethub: basePetHub,
      },
    ];
  }, [dashboardData, omnichannelMode, channelForecast, globalDateRange]);

  // NOVA Retail Profit Paradox Analytics (Chapter 1L)
  const channelEconomics = useMemo(() => {
    const rawBreakdown: any[] = dashboardData?.channelBreakdown || [];

    const hasForecastHistory = Boolean(
      channelForecast?.physical?.historical?.length ||
      channelForecast?.shopee?.historical?.length ||
      channelForecast?.tiktok?.historical?.length
    );

    const getChannelStats = (chName: string) => {
      let series: any[] = [];
      let defaultCommRate = 0;
      let defaultCogsRatio = 0.708;
      let isPOS = false;
      let color = "#06B6D4";

      if (chName === "POS") {
        series = channelForecast?.physical?.historical || [];
        defaultCogsRatio = 0.708;
        isPOS = true;
        color = "#F53799";
      } else if (chName.includes("Shopee")) {
        series = channelForecast?.shopee?.historical || [];
        defaultCommRate = 19.92;
        defaultCogsRatio = 0.605;
        color = "#FBBF24";
      } else if (chName.includes("TikTok")) {
        series = channelForecast?.tiktok?.historical || [];
        defaultCommRate = 18.0;
        defaultCogsRatio = 0.605;
        color = "#8B5CF6";
      } else if (chName.includes("PetHub")) {
        series = channelForecast?.pethub?.historical || [];
        defaultCogsRatio = 0.605;
        color = "#06B6D4";
      }

      if (hasForecastHistory) {
        const filtered = series.filter(
          (d: any) => d.date >= activeRange.start && d.date <= activeRange.end
        );
        const rev = filtered.reduce((sum: number, d: any) => sum + Number(d.revenue || 0), 0);
        const orders = filtered.reduce((sum: number, d: any) => sum + Number(d.orders || 0), 0);
        const commFee = isPOS || chName.includes("PetHub")
          ? 0
          : filtered.reduce(
              (sum: number, d: any) =>
                sum + (d.commissionFee != null ? Number(d.commissionFee) : Number(d.revenue || 0) * (defaultCommRate / 100)),
              0
            );
        const costOfGoods = filtered.reduce(
          (sum: number, d: any) =>
            sum + (d.costOfGoods != null ? Number(d.costOfGoods) : Number(d.revenue || 0) * defaultCogsRatio),
          0
        );
        const grossProfit = Math.round((rev - costOfGoods) * 100) / 100;
        const profit = Math.max(0, Math.round((grossProfit - commFee) * 100) / 100);
        const grossSales = chName.includes("TikTok") ? Math.round(rev * 1.023 * 100) / 100 : rev;
        const discount = chName.includes("TikTok") ? Math.round(rev * 0.023 * 100) / 100 : 0;
        const commRate = rev > 0 && commFee > 0 ? (commFee / rev) * 100 : defaultCommRate;

        const feeBreakdown = {
          commission: commFee > 0 ? Math.round(rev * (chName.includes("Shopee") ? 0.1005 : 0.088) * 100) / 100 : 0,
          serviceFee: commFee > 0 ? Math.round(rev * (chName.includes("Shopee") ? 0.0723 : 0.065) * 100) / 100 : 0,
          transactionFee: commFee > 0 ? Math.round(rev * 0.0224 * 100) / 100 : 0,
          wht: commFee > 0 ? Math.round(rev * (chName.includes("Shopee") ? 0.0040 : 0.0045) * 100) / 100 : 0,
        };

        const grossMargin = rev > 0 ? (grossProfit / rev) * 100 : 0;
        const netMargin = rev > 0 ? (profit / rev) * 100 : 0;
        const cogsPct = rev > 0 ? (costOfGoods / rev) * 100 : 0;
        const aov = orders > 0 ? rev / orders : 0;
        const ppo = orders > 0 ? profit / orders : 0;

        return {
          channel: chName,
          revenue: Math.round(rev * 100) / 100,
          revenueShare: 0,
          profit,
          profitShare: 0,
          grossProfit,
          grossSales,
          discount,
          commFee: Math.round(commFee * 100) / 100,
          commRate: Number(commRate.toFixed(1)),
          feeBreakdown,
          costOfGoods: Math.round(costOfGoods * 100) / 100,
          cogsPct: Number(cogsPct.toFixed(1)),
          orders,
          orderShare: 0,
          grossMargin: Number(grossMargin.toFixed(1)),
          netMargin: Number(netMargin.toFixed(1)),
          aov: Math.round(aov),
          ppo: Math.round(ppo),
          color,
          isPOS,
        };
      }

      // Fallback to static breakdown if forecast history isn't loaded
      const c = rawBreakdown.find((item: any) => (item.channel || item._id) === chName) || {};
      const rev = Number(c.revenue) || 0;
      const commFee = Number(c.commissionFee) || 0;
      const costOfGoods = Number(c.costOfGoods) || Math.round(rev * defaultCogsRatio * 100) / 100;
      const grossProfit = Math.round((rev - costOfGoods) * 100) / 100;
      const profit = Math.max(0, Math.round((grossProfit - commFee) * 100) / 100);
      const orders = Number(c.orderCount ?? c.count) || 0;

      return {
        channel: chName,
        revenue: rev,
        revenueShare: 0,
        profit,
        profitShare: 0,
        grossProfit,
        grossSales: Number(c.grossSales) || rev,
        discount: Number(c.discount) || 0,
        commFee,
        commRate: Number(c.commissionRate) || defaultCommRate,
        feeBreakdown: c.feeBreakdown || {
          commission: commFee > 0 ? Math.round(rev * 0.10 * 100) / 100 : 0,
          serviceFee: commFee > 0 ? Math.round(rev * 0.07 * 100) / 100 : 0,
          transactionFee: commFee > 0 ? Math.round(rev * 0.0224 * 100) / 100 : 0,
          wht: commFee > 0 ? Math.round(rev * 0.004 * 100) / 100 : 0,
        },
        costOfGoods,
        cogsPct: rev > 0 ? Number(((costOfGoods / rev) * 100).toFixed(1)) : 0,
        orders,
        orderShare: 0,
        grossMargin: rev > 0 ? Number(((grossProfit / rev) * 100).toFixed(1)) : 0,
        netMargin: rev > 0 ? Number(((profit / rev) * 100).toFixed(1)) : 0,
        aov: orders > 0 ? Math.round(rev / orders) : 0,
        ppo: orders > 0 ? Math.round(profit / orders) : 0,
        color,
        isPOS,
      };
    };

    const channelNames = ["POS", "Shopee", "TikTok Shop", "PetHub"];
    const channels = channelNames.map(getChannelStats);

    const totalRevenue = channels.reduce((sum, c) => sum + c.revenue, 0);
    const totalProfit = channels.reduce((sum, c) => sum + c.profit, 0);
    const totalOrders = channels.reduce((sum, c) => sum + c.orders, 0);
    const totalCommission = channels.reduce((sum, c) => sum + c.commFee, 0);
    const totalCostOfGoods = channels.reduce((sum, c) => sum + c.costOfGoods, 0);
    const totalDiscounts = channels.reduce((sum, c) => sum + c.discount, 0);

    // Populate shares
    channels.forEach((c) => {
      c.revenueShare = totalRevenue > 0 ? Number(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0;
      c.profitShare = totalProfit > 0 ? Number(((c.profit / totalProfit) * 100).toFixed(1)) : 0;
      c.orderShare = totalOrders > 0 ? Number(((c.orders / totalOrders) * 100).toFixed(1)) : 0;
    });

    const onlineChannels = channels.filter((c) => !c.isPOS);
    const onlineRevShare = onlineChannels.reduce((sum, c) => sum + c.revenueShare, 0);
    const onlineOrderShare = onlineChannels.reduce((sum, c) => sum + c.orderShare, 0);
    const onlineCommissionTotal = onlineChannels.reduce((sum, c) => sum + c.commFee, 0);
    const onlineDiscountTotal = onlineChannels.reduce((sum, c) => sum + c.discount, 0);

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalOrders,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalCostOfGoods: Math.round(totalCostOfGoods * 100) / 100,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
      onlineRevShare: Number(onlineRevShare.toFixed(1)),
      onlineOrderShare: Number(onlineOrderShare.toFixed(1)),
      onlineCommissionTotal,
      onlineDiscountTotal,
      channels,
    };
  }, [channelForecast, dashboardData, activeRange]);

  // Dynamic Omnichannel Profitability Insight for WOOF Insight Banner
  const omnichannelInsightText = useMemo(() => {
    if (!channelEconomics || channelEconomics.totalRevenue === 0) {
      return "Upload Retail POS or e-commerce transaction data to activate live omnichannel profitability insights.";
    }

    const sortedByProfit = [...channelEconomics.channels]
      .filter((c) => c.profit > 0)
      .sort((a, b) => b.profit - a.profit);
    const topProfit = sortedByProfit[0];
    const pos = channelEconomics.channels.find((c) => c.isPOS);

    if (topProfit && pos && !topProfit.isPOS) {
      return `${topProfit.channel} leads omnichannel net profit at ₱${topProfit.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${topProfit.netMargin}% margin) across ${topProfit.orders.toLocaleString()} orders, while physical POS delivers 0% platform take-rate with ₱${pos.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} profit (${pos.netMargin}% margin).`;
    }

    if (topProfit && topProfit.isPOS) {
      return `Physical POS leads omnichannel profit at ₱${topProfit.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${topProfit.netMargin}% margin) across ${topProfit.orders.toLocaleString()} orders with 0% platform fees.`;
    }

    if (topProfit) {
      return `${topProfit.channel} leads omnichannel profit at ₱${topProfit.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${topProfit.orders.toLocaleString()} orders with an effective per-order take-rate of ${topProfit.commRate.toFixed(1)}%.`;
    }

    if (aggregatedKpis.totalRevenue > 0) {
      return `Omnichannel retail generated ₱${channelEconomics.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in net take-home profit across active channels.`;
    }

    return "Upload Retail POS or e-commerce transaction data to activate live omnichannel profitability insights.";
  }, [channelEconomics, aggregatedKpis.totalRevenue]);

  // Chart 1: Donut Chart Data for Channel Revenue Mix
  const channelMixData = useMemo(() => {
    const channels = [
      { key: "POS", label: "POS", color: "#D42A7D" },
      { key: "Shopee", label: "Shopee", color: "#F59E0B" },
      { key: "TikTok Shop", label: "TikTok Shop", color: "#8B5CF6" },
      { key: "PetHub", label: "PetHub", color: "#06B6D4" },
    ];
    const totalRev = channelEconomics.totalRevenue;
    return channels.map((ch) => {
      const match = channelEconomics.channels.find(
        (c: any) => c.channel === ch.key || c.channel === ch.label,
      );
      const rev = Number(match?.revenue || 0);
      return {
        name: ch.label,
        value: Math.round(rev),
        share: totalRev > 0 ? Number(((rev / totalRev) * 100).toFixed(1)) : 0,
        count: Number(match?.orders || 0),
        color: ch.color,
      };
    });
  }, [channelEconomics]);

  // Chart 2: Category Revenue Contribution Data (Horizontal Bar Chart)
  const categoryRevenueData = useMemo(() => {
    const items: any[] = dashboardData?.topItems || [];
    if (items.length === 0) return [];

    // Scale category revenue to match filtered retail revenue
    const allTimeRetailRev = (dashboardData?.channelBreakdown || []).reduce(
      (sum: number, c: any) => sum + (Number(c.revenue) || 0),
      0,
    );
    const filteredRetailRev = channelEconomics.totalRevenue;
    const scale = allTimeRetailRev > 0 ? filteredRetailRev / allTimeRetailRev : 1;

    const map = new Map<string, { category: string; revenue: number; quantity: number }>();
    items.forEach((item: any) => {
      const cat = inferRetailCategory(item.category, item.name);
      const existing = map.get(cat) || { category: cat, revenue: 0, quantity: 0 };
      const rawRev = Number(item.revenue || 0);
      const rawQty = Number(item.quantity || item.orderCount || 0);
      existing.revenue += rawRev * scale;
      existing.quantity += Math.round(rawQty * scale);
      map.set(cat, existing);
    });

    const totalRev = Array.from(map.values()).reduce((sum, c) => sum + c.revenue, 0);
    return Array.from(map.values())
      .map((c) => ({
        category: c.category,
        revenue: Math.round(c.revenue),
        quantity: c.quantity,
        share: totalRev > 0 ? Number(((c.revenue / totalRev) * 100).toFixed(1)) : 0,
      }))
      .filter((c) => c.revenue > 0 || filteredRetailRev === 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [dashboardData, channelEconomics.totalRevenue]);

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword("");
      toast.success("Keyword added");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
    toast.info("Keyword removed");
  };

  return (
    <div className="space-y-6 md:space-y-8 lg:space-y-12">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row items-start justify-between gap-3 md:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl lg:text-[36px] font-extrabold text-[#223047]">
              Retail Intelligence Center
            </h1>
            <InfoTooltip label="Inventory management and omnichannel performance tracking." />
          </div>
        </div>
        <Badge className="bg-[#D42A7D] text-white hover:bg-[#D42A7D] px-3 md:px-4 py-1 text-xs md:text-sm flex-shrink-0">
          Retail Sector
        </Badge>
      </div>


      {/* KPI ROW */}
      <div className="woof-kpi-row bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {/* Retail Revenue Today */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: "Historical Retail Revenue",
              current: aggregatedKpis.totalRevenue,
              previous: aggregatedKpis.previousRevenue,
              currentLabel: "Current Period",
              previousLabel: "Previous Period",
              rangeStart: aggregatedKpis.rangeStart || "",
              rangeEnd: aggregatedKpis.rangeEnd || "",
              prevRangeStart: aggregatedKpis.prevRangeStart || "",
              prevRangeEnd: aggregatedKpis.prevRangeEnd || "",
              formatter: (v) => `₱${Number(v).toLocaleString()}`,
              icon: <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              growth: aggregatedKpis.revenueGrowth,
              description: "Total retail product revenue generated across physical store POS, Shopee, and TikTok Shop channels for the selected period.",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>Historical Retail Revenue</span>
                <InfoTooltip label="Total retail product revenue from POS, Shopee, and TikTok Shop transaction history for the selected period." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{retailRevenue}</div>
              {Boolean(aggregatedKpis.revenueGrowth?.text) && (
                <div className={aggregatedKpis.revenueGrowth.className}>{aggregatedKpis.revenueGrowth.text}</div>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
          </div>

          {/* Active SKUs */}
          <div
            className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#06B6D4] hover:shadow-sm transition-all group"
            onClick={() => setSelectedKpi({
              title: "Active Catalog SKUs",
              current: activeSKUs,
              previous: 0,
              currentLabel: "Catalog SKUs",
              formatter: (v) => Number(v).toLocaleString(),
              icon: <Package className="w-4 h-4 md:w-5 md:h-5 text-white" />,
              description: "Total distinct stock keeping units (SKUs) actively maintained and sold in the retail product catalog.",
            })}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>Active SKUs</span>
                <InfoTooltip label="SKU means stock keeping unit: a unique product identifier used for inventory tracking." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">{activeSKUs}</div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#06B6D4] flex-shrink-0 transition-colors" />
          </div>

          {/* Stockout Alerts */}
          <div className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
                <span>Stockout Alerts</span>
                <InfoTooltip label="Items that may run out soon based on available stock and sales movement." />
              </div>
              <div className="text-base md:text-xl font-bold text-[#223047]">5</div>
              <Button size="sm" className="bg-[#D42A7D] hover:bg-[#F53799] text-white h-6 md:h-7 text-xs mt-1 px-2 md:px-3 hidden md:inline-flex">
                Review
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* RETAIL REVENUE BY CHANNEL */}
      <div id="retail-revenue-by-channel" className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-7 pb-3 md:pb-4 lg:pb-4 space-y-3 md:space-y-4 scroll-mt-24">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
              <span className="inline-flex items-center gap-2">
                Retail Revenue by Channel
                <InfoTooltip label="Daily retail performance across Physical (POS), TikTok Shop, Shopee, and PetHub. Fairly aligned to active marketplace dates. When you click any filter button here, Omnichannel Economics, Channel Mix, and Category Revenue recalculate for this period." />
              </span>
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: Combined vs Split - NO ICONS */}
            <div className="flex items-center rounded-lg border border-[#FFD9EC] p-0.5 bg-[#FFF7FB]">
              <button
                type="button"
                onClick={() => setChannelGraphMode("combined")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  channelGraphMode === "combined"
                    ? "bg-[#D42A7D] text-white shadow-sm"
                    : "text-[#223047] opacity-70 hover:opacity-100"
                }`}
              >
                Combined View
              </button>
              <button
                type="button"
                onClick={() => setChannelGraphMode("split")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  channelGraphMode === "split"
                    ? "bg-[#D42A7D] text-white shadow-sm"
                    : "text-[#223047] opacity-70 hover:opacity-100"
                }`}
              >
                Split Channels
              </button>
            </div>

            <div className="h-5 w-[1px] bg-[#FFD9EC] hidden sm:block" />

            {/* Filter buttons - NO ICONS */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: "matched", label: "Matched 1-Year (2025-2026)" },
                { key: "all", label: "All-Time" },
                { key: "last-90-days", label: "Last 90 Days" },
                { key: "last-30-days", label: "Last 30 Days" },
              ].map((item) => (
                <Button
                  key={item.key}
                  size="sm"
                  variant={retailActiveFilter === item.key ? "default" : "outline"}
                  onClick={() => handleApplyFilter(item.key)}
                  className={`text-xs transition-all ${
                    retailActiveFilter === item.key
                      ? "bg-[#D42A7D] hover:bg-[#B01E64] text-white shadow-xs font-semibold"
                      : "border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA]"
                  }`}
                >
                  {item.label}
                </Button>
              ))}

              <Button
                size="sm"
                variant={retailActiveFilter.startsWith("custom:") || showCustomFilter ? "default" : "outline"}
                onClick={() => setShowCustomFilter((prev) => !prev)}
                className={`text-xs transition-all ${
                  retailActiveFilter.startsWith("custom:") || showCustomFilter
                    ? "bg-[#D42A7D] hover:bg-[#B01E64] text-white shadow-xs font-semibold"
                    : "border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA]"
                }`}
              >
                <span>
                  {retailActiveFilter.startsWith("custom:")
                    ? (() => {
                        const [, s, e] = retailActiveFilter.split(":");
                        return s === e ? `Custom (${s})` : `Custom (${s} – ${e})`;
                      })()
                    : "Custom"}
                </span>
              </Button>
            </div>
          </div>
        </div>

        {showCustomFilter && (
          <div className="flex flex-wrap items-center gap-2.5 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-2.5 text-xs">
            <span className="font-bold text-[#D42A7D]">Select Custom Range:</span>

            {/* Mode selection without icons */}
            <div className="flex items-center rounded-lg border border-[#FFD9EC] p-0.5 bg-white">
              <button
                type="button"
                onClick={() => {
                  setCustomMode("single");
                  if (customStartDate) setCustomSingleDate(customStartDate);
                }}
                className={`px-2 py-0.5 text-xs font-semibold rounded transition-all ${
                  customMode === "single"
                    ? "bg-[#D42A7D] text-white"
                    : "text-[#223047] opacity-70 hover:opacity-100"
                }`}
              >
                Single Day
              </button>
              <button
                type="button"
                onClick={() => setCustomMode("range")}
                className={`px-2 py-0.5 text-xs font-semibold rounded transition-all ${
                  customMode === "range"
                    ? "bg-[#D42A7D] text-white"
                    : "text-[#223047] opacity-70 hover:opacity-100"
                }`}
              >
                Date Range
              </button>
            </div>

            {customMode === "single" ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  min={HISTORY_START_DATE}
                  max={INGESTED_HISTORY_END_DATE}
                  value={customSingleDate}
                  onChange={(e) => {
                    setCustomSingleDate(e.target.value);
                    setCustomStartDate(e.target.value);
                    setCustomEndDate(e.target.value);
                  }}
                  className="h-8 rounded-lg border border-[#FFD9EC] bg-white px-2 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#D42A7D]"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  min={HISTORY_START_DATE}
                  max={INGESTED_HISTORY_END_DATE}
                  value={customStartDate}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setCustomStartDate(newStart);
                    if (customEndDate < newStart) {
                      setCustomEndDate(newStart);
                    }
                  }}
                  className="h-8 rounded-lg border border-[#FFD9EC] bg-white px-2 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#D42A7D]"
                />
                <span className="text-[#223047]/60 font-semibold">to</span>
                <input
                  type="date"
                  min={customStartDate || HISTORY_START_DATE}
                  max={INGESTED_HISTORY_END_DATE}
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-8 rounded-lg border border-[#FFD9EC] bg-white px-2 text-xs text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#D42A7D]"
                />
              </div>
            )}

            <Button
              size="sm"
              onClick={handleApplyCustomFilter}
              className="h-8 bg-[#D42A7D] hover:bg-[#B01E64] text-white text-xs font-semibold px-3 shadow-xs"
            >
              Apply Filter
            </Button>
            <button
              type="button"
              onClick={() => setShowCustomFilter(false)}
              className="text-xs text-[#223047]/60 hover:text-[#223047] ml-1 px-2 py-1 rounded hover:bg-[#FFE5F4]"
            >
              Cancel
            </button>
          </div>
        )}

        {channelGraphMode === "combined" ? (
          <>
            {/* Channel Filter Pills - NO ICONS, NO HARDCODED RANGES */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1 border-b border-[#FFD9EC]/60">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-[#223047]/70 mr-1">Channel:</span>
                <button
                  type="button"
                  onClick={() => setActiveChannelKey("all")}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeChannelKey === "all"
                      ? "bg-[#223047] text-white shadow-xs"
                      : "border border-[#FFD9EC] bg-[#FFF7FB] text-[#223047] hover:bg-[#FFE5F4]"
                  }`}
                >
                  All Channels
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelKey((k) => k === "shopee" ? "all" : "shopee")}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeChannelKey === "shopee"
                      ? "bg-[#F59E0B] text-white shadow-xs"
                      : "border border-[#F59E0B]/30 bg-amber-50/50 text-[#B45309] hover:bg-amber-100/60"
                  }`}
                >
                  Shopee
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelKey((k) => k === "tiktok" ? "all" : "tiktok")}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeChannelKey === "tiktok"
                      ? "bg-[#8B5CF6] text-white shadow-xs"
                      : "border border-[#8B5CF6]/30 bg-purple-50/50 text-[#6D28D9] hover:bg-purple-100/60"
                  }`}
                >
                  TikTok Shop
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelKey((k) => k === "physical" ? "all" : "physical")}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeChannelKey === "physical"
                      ? "bg-[#D42A7D] text-white shadow-xs"
                      : "border border-[#D42A7D]/30 bg-pink-50/50 text-[#BE185D] hover:bg-pink-100/60"
                  }`}
                >
                  Physical (POS)
                </button>

                <button
                  type="button"
                  onClick={() => setActiveChannelKey((k) => k === "pethub" ? "all" : "pethub")}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeChannelKey === "pethub"
                      ? "bg-[#06B6D4] text-white shadow-xs"
                      : "border border-[#06B6D4]/30 bg-cyan-50/50 text-[#0E7490] hover:bg-cyan-100/60"
                  }`}
                >
                  PetHub
                </button>
              </div>

              {activeChannelKey !== "all" && (
                <span className="text-[11px] text-[#223047]/70 font-medium">
                  Showing {activeChannelKey === "physical" ? "Physical (POS)" : activeChannelKey === "tiktok" ? "TikTok Shop" : activeChannelKey === "shopee" ? "Shopee" : "PetHub"} sales
                </span>
              )}
            </div>

            {activeChannelKey === "pethub" && channelStats.totalPethub === 0 && (
              <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-xs text-[#223047] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="font-medium">
                  <span className="font-bold text-[#D42A7D]">PetHub Channel Notice:</span> No recorded retail sales during this timeframe. PetHub is designated for service bookings.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveChannelKey("all")}
                  className="text-xs font-semibold text-[#D42A7D] hover:underline whitespace-nowrap self-start sm:self-auto"
                >
                  Show All Channels
                </button>
              </div>
            )}

            <ResponsiveContainer width="100%" height={280} className="md:!h-[360px]">
              <LineChart data={forecastData} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#223047"
                  tickFormatter={formatChartDate}
                  minTickGap={28}
                  interval="preserveStartEnd"
                  style={{ fontSize: "10px" }}
                />
                <YAxis 
                  stroke="#223047" 
                  style={{ fontSize: "10px" }} 
                  domain={activeYDomain as any}
                  tickFormatter={(value) => `₱${Number(value).toLocaleString()}`}
                />
                <Tooltip
                  labelFormatter={(label) => formatChartDate(String(label))}
                  formatter={(value: any, name: any) => [
                    value != null ? `₱${Number(value).toLocaleString()}` : "₱0",
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #FFD9EC",
                    borderRadius: "12px",
                  }}
                />
                {(activeChannelKey === "all" || activeChannelKey === "physical") && (
                  <Line
                    key="line-physical-wide"
                    type="monotone"
                    dataKey="physical"
                    stroke="#D42A7D"
                    strokeWidth={activeChannelKey === "physical" ? 3 : 2.5}
                    dot={false}
                    animationDuration={600}
                    name="Physical (POS)"
                    connectNulls
                  />
                )}
                {(activeChannelKey === "all" || activeChannelKey === "tiktok") && (
                  <Line
                    key="line-tiktok-wide"
                    type="monotone"
                    dataKey="tiktok"
                    stroke="#8B5CF6"
                    strokeWidth={activeChannelKey === "tiktok" ? 3 : 2.5}
                    dot={false}
                    animationDuration={600}
                    name="TikTok Shop"
                    connectNulls
                  />
                )}
                {(activeChannelKey === "all" || activeChannelKey === "shopee") && (
                  <Line
                    key="line-shopee-wide"
                    type="monotone"
                    dataKey="shopee"
                    stroke="#F59E0B"
                    strokeWidth={activeChannelKey === "shopee" ? 3 : 2.5}
                    dot={false}
                    animationDuration={600}
                    name="Shopee"
                    connectNulls
                  />
                )}
                {(activeChannelKey === "all" || activeChannelKey === "pethub") && (
                  <Line
                    key="line-pethub-wide"
                    type="monotone"
                    dataKey="pethub"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={600}
                    name="PetHub"
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          /* SPLIT CHANNELS VIEW - NO ICONS, NO HARDCODED RANGES */
          <div className="space-y-4 pt-1">
            <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl px-4 py-2 text-xs text-[#223047] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <span>
                <b>Split Channels View:</b> Each retail channel has its own proportional Y-axis to reveal clear fluctuations without marketplace scale compression.
              </span>
              <span className="font-semibold text-[#D42A7D]">Synchronized Timeline</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* SHOPEE PANEL */}
              <div className="border border-amber-200 bg-amber-50/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs text-[#223047]">Shopee (Marketplace)</h3>
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={forecastData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FDE68A" vertical={false} />
                    <XAxis dataKey="day" stroke="#223047" tickFormatter={formatChartDate} minTickGap={32} style={{ fontSize: "9px" }} />
                    <YAxis stroke="#223047" style={{ fontSize: "9px" }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} domain={[0, Math.max(5000, Math.ceil(channelStats.maxShopee * 1.1))]} />
                    <Tooltip
                      labelFormatter={(l) => formatChartDate(String(l))}
                      formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, "Shopee"]}
                      contentStyle={{ backgroundColor: "white", border: "1px solid #FCD34D", borderRadius: "10px", fontSize: "11px" }}
                    />
                    <Line type="monotone" dataKey="shopee" stroke="#F59E0B" strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* TIKTOK SHOP PANEL */}
              <div className="border border-purple-200 bg-purple-50/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs text-[#223047]">TikTok Shop (Social)</h3>
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={forecastData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E9D5FF" vertical={false} />
                    <XAxis dataKey="day" stroke="#223047" tickFormatter={formatChartDate} minTickGap={32} style={{ fontSize: "9px" }} />
                    <YAxis stroke="#223047" style={{ fontSize: "9px" }} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} domain={[0, Math.max(1000, Math.ceil(channelStats.maxTiktok * 1.15))]} />
                    <Tooltip
                      labelFormatter={(l) => formatChartDate(String(l))}
                      formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, "TikTok Shop"]}
                      contentStyle={{ backgroundColor: "white", border: "1px solid #D8B4FE", borderRadius: "10px", fontSize: "11px" }}
                    />
                    <Line type="monotone" dataKey="tiktok" stroke="#8B5CF6" strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* PHYSICAL POS PANEL */}
              <div className="border border-pink-200 bg-pink-50/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs text-[#223047]">Physical POS (In-Store)</h3>
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={forecastData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FCE7F3" vertical={false} />
                    <XAxis dataKey="day" stroke="#223047" tickFormatter={formatChartDate} minTickGap={32} style={{ fontSize: "9px" }} />
                    <YAxis stroke="#223047" style={{ fontSize: "9px" }} tickFormatter={(v) => `₱${Number(v).toLocaleString()}`} domain={[0, Math.max(100, Math.ceil(channelStats.maxPhys * 1.15))]} />
                    <Tooltip
                      labelFormatter={(l) => formatChartDate(String(l))}
                      formatter={(v: any) => [`₱${Number(v).toLocaleString()}`, "Physical POS"]}
                      contentStyle={{ backgroundColor: "white", border: "1px solid #FBCFE8", borderRadius: "10px", fontSize: "11px" }}
                    />
                    <Line type="monotone" dataKey="physical" stroke="#D42A7D" strokeWidth={2.5} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PETHUB INACTIVE STRIP */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <span className="font-semibold text-slate-700">PetHub Direct Portal: Inactive for retail merchandise.</span>
              <span className="text-slate-400 font-medium">Channel Active for Service Bookings Only</span>
            </div>
          </div>
        )}
      </div>
      {/* VISUAL RELIEF DIVIDER - AI INSIGHT WITH MASCOT */}
      <div
        className="woof-insight-band rounded-2xl flex items-center justify-between px-4 md:px-8 py-4 relative overflow-hidden"
        style={{ background: "linear-gradient(to right, #FFF7FB, #FFF2FA)" }}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs">
              WOOF Insight
            </Badge>
          </div>
          {dashboardData ? (
            <WoofInsight inline
              feature="descriptive_explanation"
              title="WOOF Insight"
              prompt="Explain the observed Retail performance using the verified dashboard and channel data. Highlight revenue, product, inventory, and channel patterns that are actually supported by the context. Do not invent values or recommendations."
              context={{
                sector: "Retail",
                kpis: dashboardData.kpis,
                topItems: dashboardData.topItems?.slice(0, 8),
                channelBreakdown: dashboardData.channelBreakdown,
                physicalHistory: channelForecast?.physical?.historical?.slice(-14),
                onlineHistory: channelForecast?.online?.historical?.slice(-14),
              }}
            />
          ) : (
            <p className="text-sm text-[#4A5568]">Upload transaction data to activate WOOF insights.</p>
          )}
        </div>
        <img
          src={retailMascot.src}
          alt="Retail Mascot"
          className="woof-mascot-motion w-24 h-24 md:w-32 md:h-32 object-contain flex-shrink-0 ml-6"
        />
      </div>

      {/* OMNICHANNEL ECONOMICS */}
      <div className="woof-profit-paradox-section bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-2 border-b border-[#FFD9EC]/60">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                Omnichannel Economics & Profit Paradox
              </h2>
              <InfoTooltip label="Evaluating omnichannel profitability using empirical data from HappyTailsPOS.csv and marketplace seller statements. Marketplace platform fees are computed per order using verified fee schedules: Shopee PH 19%–21% (~19.9% avg: Commission ~10.1% + Service Fee 7.2% + Transaction 2.24% + WHT 0.40%) and TikTok Shop PH 17%–19% (~18.0% avg: Commission ~8.8% + Service Fee 6.5% + Transaction 2.24% + WHT 0.45%). Physical store POS and PetHub have 0% platform take-rate. Online price markup (+17% to +19%) reduces effective wholesale COGS to 60.5% (vs 70.8% in POS)." />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-[#06B6D4] text-[#06B6D4] text-xs font-semibold px-3 py-1 bg-[#06B6D4]/5">
              Per-Order Fee Analytics
            </Badge>
          </div>
        </div>

        <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />

        {/* TOP LEVEL ECONOMICS KPI STRIP */}
        <div className="woof-kpi-row grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <div
            className="p-3 md:p-4 rounded-xl bg-[#FFF7FB] border border-[#FFD9EC] cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group relative"
            onClick={() => setSelectedKpi({
              title: "Gross Retail Sales",
              current: channelEconomics.totalRevenue,
              formatter: (v) => `₱${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              icon: <DollarSign className="w-4 h-4 text-[#F53799]" />,
              description: "Total gross retail revenue generated across physical store POS, Shopee, and TikTok Shop channels before platform fees and discounts.",
              extraStats: channelEconomics.channels.map(ch => ({
                label: ch.channel,
                value: `₱${ch.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              })),
            })}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[11px] text-[#223047] opacity-70 font-medium">
                <span>Gross Retail Sales</span>
                <InfoTooltip label="Across 3 active channels." />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] transition-colors" />
            </div>
            <div className="text-base md:text-xl font-bold text-[#223047] mt-0.5">
              ₱{channelEconomics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div
            className="p-3 md:p-4 rounded-xl bg-[#FFF7FB] border border-[#FFD9EC] cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group relative"
            onClick={() => setSelectedKpi({
              title: "Platform Deductions",
              current: channelEconomics.totalCommission,
              formatter: (v) => `-₱${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              icon: <Percent className="w-4 h-4 text-[#E11D48]" />,
              description: "Total platform fees computed per order using official Shopee PH (19%–21%, ~19.9%) and TikTok Shop PH (17%–19%, ~18.0%) seller fee schedules: Commission Fee (Shopee ~10.1%, TikTok ~8.8%) + Service Fee / FSP (6.5%–7.2%) + Transaction Fee (2.24%) + Withholding Tax (~0.4%–0.5%). Direct channels (POS & PetHub) have 0% platform fee.",
              extraStats: channelEconomics.channels.map(ch => ({
                label: ch.channel,
                value: `-₱${ch.commFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              })),
            })}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-[#223047] opacity-70 font-medium">Platform Deductions</div>
              <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] transition-colors" />
            </div>
            <div className="text-base md:text-xl font-bold text-[#E11D48] mt-0.5">
              -₱{channelEconomics.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-[#E11D48] opacity-80 mt-1 font-medium">
              {channelEconomics.totalRevenue > 0 ? ((channelEconomics.totalCommission / channelEconomics.totalRevenue) * 100).toFixed(1) : 0}% effective rate (per-order)
            </div>
          </div>


          <div
            className="p-3 md:p-4 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] cursor-pointer hover:border-[#16A34A] hover:shadow-sm transition-all group relative"
            onClick={() => setSelectedKpi({
              title: "Net Take-Home Profit",
              current: channelEconomics.totalProfit,
              formatter: (v) => `₱${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              icon: <TrendingUp className="w-4 h-4 text-[#16A34A]" />,
              description: "True bottom-line net profit retained after deducting data-backed wholesale COGS (60.5% online reflecting price markup, 70.8% POS) and marketplace platform fees.",
              extraStats: channelEconomics.channels.map(ch => ({
                label: `${ch.channel} (${ch.netMargin}% margin)`,
                value: `₱${ch.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              })),
            })}
          >
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-[#166534] opacity-80 font-medium">Net Take-Home Profit</div>
              <ChevronRight className="w-3.5 h-3.5 text-[#166534]/30 group-hover:text-[#16A34A] transition-colors" />
            </div>
            <div className="text-base md:text-xl font-bold text-[#16A34A] mt-0.5">
              ₱{channelEconomics.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-[#166534] opacity-70 mt-1">
              After COGS & marketplace fees
            </div>
          </div>
        </div>

        {/* CHANNEL BY CHANNEL COMPARISON GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {channelEconomics.channels.map((ch) => (
            <div
              key={ch.channel}
              className={`woof-profit-channel-card p-4 md:p-5 rounded-2xl border transition-all hover:shadow-md flex flex-col justify-between ${
                ch.channel.toLowerCase().includes("pethub") ? "md:col-start-2" : ""
              }`}
              style={{
                borderColor: ch.isPOS ? "var(--profit-card-pos-border, #FFD9EC)" : "var(--profit-card-border, #E2E8F0)",
                backgroundColor: ch.isPOS ? "var(--profit-card-pos-bg, #FFF9FC)" : "var(--profit-card-bg, #FFFFFF)",
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-bold text-sm text-[#223047]">{ch.channel}</div>
                    <div className="text-[10px] text-[#223047] opacity-60">
                      {ch.isPOS ? "Physical In-Store POS" : ch.channel.includes("PetHub") ? "Direct Booking & App" : "Online Marketplace"}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-bold"
                    style={{
                      borderColor: ch.color,
                      color: ch.color,
                      backgroundColor: `${ch.color}10`,
                    }}
                  >
                    {ch.isPOS || ch.commRate === 0 ? "0% Take-Rate" : `${ch.commRate.toFixed(1)}% Per-Order Fee`}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs py-2 border-t border-b border-[#FFD9EC]/50 my-2">
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-[#223047] opacity-70 whitespace-nowrap">Gross Sales:</span>
                    <span className="font-semibold text-[#223047] tabular-nums whitespace-nowrap text-right">₱{ch.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-[#223047] opacity-70 whitespace-nowrap">Order Volume:</span>
                    <span className="font-semibold text-[#223047] tabular-nums whitespace-nowrap text-right">{ch.orders.toLocaleString()} orders ({ch.orderShare}%)</span>
                  </div>
                  <div
                    className={`flex justify-between items-center py-0.5 ${
                      ch.commFee > 0
                        ? "cursor-pointer group hover:bg-[#FFF2FA]/60 -mx-1.5 px-1.5 rounded transition-colors"
                        : ""
                    }`}
                    onClick={() => {
                      if (ch.commFee > 0) toggleFeeDropdown(ch.channel);
                    }}
                    title={ch.commFee > 0 ? "Click to toggle fee breakdown" : undefined}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[#223047] opacity-70 whitespace-nowrap">Platform Fees:</span>
                      {ch.commFee > 0 && (
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-[#D42A7D] transition-transform duration-200 ${
                            expandedFeeChannels[ch.channel] ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </div>
                    <span
                      className={`font-semibold tabular-nums whitespace-nowrap text-right ${
                        ch.commFee > 0 ? "text-[#E11D48]" : "text-green-600"
                      }`}
                    >
                      {ch.commFee > 0
                        ? `-₱${ch.commFee.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} (${ch.commRate.toFixed(1)}%)`
                        : "₱0.00 (Direct)"}
                    </span>
                  </div>

                  {ch.commFee > 0 && ch.feeBreakdown && expandedFeeChannels[ch.channel] && (
                    <div className="my-1.5 p-2.5 rounded-xl bg-[#FFF2FA]/90 border border-[#FFD9EC] space-y-1.5 text-[10px] text-[#223047] shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="font-bold text-[#D42A7D] text-[10px] uppercase tracking-wider mb-1 flex items-center justify-between border-b border-[#FFD9EC]/60 pb-1">
                        <span>Per-Order Fee Breakdown</span>
                        <span className="text-[9px] text-[#223047]/60 font-normal">Official schedule</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="opacity-75">↳ Commission Fee:</span>
                        <span className="font-semibold text-[#E11D48] tabular-nums">
                          -₱{ch.feeBreakdown.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({ch.channel.includes("Shopee") ? "~10.1%" : "~8.8%"})
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="opacity-75">↳ Service Fee (FSP / Program):</span>
                        <span className="font-semibold text-[#E11D48] tabular-nums">
                          -₱{ch.feeBreakdown.serviceFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({ch.channel.includes("Shopee") ? "~7.2%" : "~6.5%"})
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="opacity-75">↳ Transaction Fee:</span>
                        <span className="font-semibold text-[#E11D48] tabular-nums">
                          -₱{ch.feeBreakdown.transactionFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (2.24%)
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="opacity-75">↳ Withholding Tax (WHT):</span>
                        <span className="font-semibold text-[#E11D48] tabular-nums">
                          -₱{ch.feeBreakdown.wht.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({ch.channel.includes("Shopee") ? "0.40%" : "0.45%"})
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-[#223047] opacity-70 whitespace-nowrap">Wholesale Puhunan (COGS):</span>
                    <span className="font-medium text-[#E11D48]/80 tabular-nums whitespace-nowrap text-right">
                      -₱{ch.costOfGoods.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({ch.cogsPct}%)
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-[#223047] opacity-70 whitespace-nowrap">Vouchers & Shipping:</span>
                    <span className="font-semibold text-emerald-600 whitespace-nowrap text-right">
                      ₱0.00 (Platform-Covered)
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <div className="p-2.5 rounded-xl bg-white border border-[#FFD9EC] flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-[#223047] opacity-60 font-medium">Net Take-Home Profit</div>
                    <div className="text-sm font-bold text-[#16A34A]">₱{ch.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#223047] opacity-60 font-medium">Net Profit Margin</div>
                    <div className="text-sm font-extrabold text-[#D42A7D]">{ch.netMargin}%</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* VISUAL RELIEF DIVIDER - AI INSIGHT WITH MASCOT */}
        <div
          className="woof-insight-band rounded-2xl flex items-center justify-between px-4 md:px-8 py-4 relative overflow-hidden"
          style={{ background: "linear-gradient(to right, #FFF7FB, #FFF2FA)" }}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                WOOF Insight
              </Badge>
            </div>
            <WoofInsight inline feature="descriptive_explanation"
              prompt="Explain Retail omnichannel profitability in a concise WOOF Insight. Describe channel tradeoffs using only the verified context; do not invent margins or causal claims."
              context={{ channelSummary: omnichannelInsightText, channelEconomics, channelBreakdown: dashboardData?.channelBreakdown }}
            />
          </div>
          <img
            src={retailMascot.src}
            alt="Retail Mascot"
            className="woof-mascot-motion w-24 h-24 md:w-32 md:h-32 object-contain flex-shrink-0 ml-6"
          />
        </div>
      </div>

      {/* 2-COLUMN SECTION: CHANNEL REVENUE MIX (DONUT) & CATEGORY REVENUE CONTRIBUTION (HORIZONTAL BAR) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* LEFT COLUMN: CHANNEL REVENUE MIX DONUT CHART (5 Cols) */}
        <div className="lg:col-span-5 bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-7 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-bold text-[#223047]">
                  Channel Revenue Mix
                </h2>
                <InfoTooltip label="Omnichannel Analytics (Ch 1L): Percentage revenue share per sales channel. Physical POS is compared like-for-like over the matched 1-year active period of marketplace channels (TikTok Shop and Shopee)." />
              </div>
              <Badge className="bg-[#D42A7D] text-white text-[10px] px-2 py-0.5">
                4 Channels
              </Badge>
            </div>
            <p className="text-xs text-[#223047] opacity-60" style={{ lineHeight: "1.6" }}>
              Revenue distribution across physical POS and online channels over matched active period
            </p>
          </div>

          <div className="relative py-2">
            <ResponsiveContainer width="100%" height={220}>
              <RePieChart>
                <Pie
                  data={channelMixData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {channelMixData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any, item: any) => [
                    `₱${Number(value).toLocaleString()} (${item.payload.share}%)`,
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #FFD9EC",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
              </RePieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#FFD9EC]">
            {channelMixData.map((c) => (
              <div key={c.name} className="flex items-center justify-between p-2.5 bg-[#FFF7FB] rounded-xl border border-[#FFD9EC]/70 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="font-semibold text-[#223047] truncate">{c.name}</span>
                </div>
                <span className="font-bold text-[#D42A7D] ml-1">{c.share}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: CATEGORY REVENUE CONTRIBUTION (7 Cols) */}
        <div className="lg:col-span-7 bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-7 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-bold text-[#223047]">
                  Category Revenue Contribution
                </h2>
                <InfoTooltip label="Total retail sales ranked by product category. Category Management from Ch 1L ranks retail categories by sales volume to identify primary merchandising drivers." />
              </div>
            </div>
            <Badge className="bg-[#06B6D4] text-white hover:bg-[#06B6D4] px-2.5 py-0.5 text-[11px]">
              {categoryRevenueData.length} Categories
            </Badge>
          </div>

          {categoryRevenueData.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No category data available. Upload retail transaction data to populate category ranking.
            </div>
          ) : (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={330}>
                <BarChart
                  data={categoryRevenueData.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#223047"
                    style={{ fontSize: "10px" }}
                    tickFormatter={(val) => `₱${Number(val).toLocaleString()}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke="#223047"
                    width={155}
                    style={{ fontSize: "10px", fontWeight: 600 }}
                  />
                  <Tooltip
                    formatter={(value: any, name: any, item: any) => [
                      `₱${Number(value).toLocaleString()} (${item.payload.share}%)`,
                      "Revenue",
                    ]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #FFD9EC",
                      borderRadius: "12px",
                      padding: "10px",
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    name="Category Revenue"
                    fill="#F53799"
                    radius={[0, 6, 6, 0]}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <RetailInventoryMonitor />

    </div>
  );
}
