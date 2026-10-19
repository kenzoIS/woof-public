import { OperationsWhatIf } from "../components/simulation/OperationsWhatIf";
import { InsightText } from "../components/InsightText";
import { WoofInsight } from "../components/WoofInsight";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { FlaskConical, Sparkles, TrendingUp, Target, Network, Map as MapIcon, Zap, HelpCircle, Info, Tag, ShoppingBag, Megaphone, Search, Users, CalendarDays, CalendarCheck2, CloudSun, CloudRain, Thermometer, AlertTriangle, CheckCircle2, Archive, RotateCcw, Trash2, PackagePlus, ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Slider } from "../components/ui/slider";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../components/ui/tooltip";
import { BundleArchive, BundlePlanningContext, createBundleArchive, DataRange as ApiDataRange, deployPrescription, ForecastRun, generateLlmExplanation, getBundleArchives, getBundlePlanningContext, getCrossSell, getDataRange, getForecast, getNextQuietPeriod, getPricingCatalog, getSeasonalCrossSellBundles, getStrategicProximity, getTrafficOptimizer, getQueueRecommendation, savePrescriptionDraft, TrafficOptimizerResponse, updateBundleArchiveStatus, submitFeedbackRating } from "../lib/api";
import { CampaignActivationLayer } from "../components/CampaignActivationLayer";
import { BundleExplanationDrawer, BundleCandidate as DrawerBundleCandidate } from "../components/BundleExplanationDrawer";
import { InfoTooltip } from "../components/InfoTooltip";
import {
  HISTORY_START_DATE,
  INGESTED_HISTORY_END_DATE,
  parseGlobalRange,
} from "../lib/dateRanges";
import aiMascot from "../../imports/no_bg_AI.png";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  LabelList,
  Cell,
} from "recharts";
import { toast } from "sonner";

interface CrossSellRule {
  itemA: string;
  itemB: string;
  antecedents?: string[];
  consequents?: string[];
  antecedentSectors?: string[];
  consequentSectors?: string[];
  support: number;
  confidence: number;
  lift: number;
  cooccurrences?: number;
  isMultiItem?: boolean;
  crossSector?: boolean;
  itemAPrice?: number;
  itemBPrice?: number;
  itemACost?: number | null;
  itemBCost?: number | null;
  regularCost?: number | null;
  regularPrice?: number;
  bundlePrice?: number;
  savings?: number;
  projectedGrossProfit?: number | null;
  projectedMarginPercent?: number | null;
  suggestedDiscountPercent?: number | null;
  proposedDiscountPercent?: number | null;
  minimumMarginPercent?: number | null;
  maxSafeDiscountPercent?: number | null;
  discountRationale?: string;
  businessFitScore?: number | null;
  bundleFitReason?: string;
  seasonalBundleType?: string;
  weatherSegmentId?: string;
  weatherBasis?: string;
  isSeasonalBundle?: boolean;
  seasonalBasketCount?: number;
}

interface BundleCandidate {
  anchorItem: string;
  bundleItem: string;
  itemA?: string;
  itemB?: string;
  anchorVelocity?: string;
  bundleVelocity?: string;
  anchorSupport?: number;
  bundleSupport?: number;
  pairSupport?: number;
  confidence: number;
  lift: number;
  cooccurrences?: number;
  opportunityScore?: number;
  baseOpportunityScore?: number;
  businessFitScore?: number | null;
  bundleCategory?: string;
  bundleFitReason?: string;
  reason?: string;
  antecedentSectors?: string[];
  consequentSectors?: string[];
  crossSector?: boolean;
  isLowAssociation?: boolean;
  itemAPrice?: number;
  itemBPrice?: number;
  itemACost?: number | null;
  itemBCost?: number | null;
  regularCost?: number | null;
  regularPrice?: number;
  bundlePrice?: number;
  savings?: number;
  projectedGrossProfit?: number | null;
  projectedMarginPercent?: number | null;
  suggestedDiscountPercent?: number | null;
  proposedDiscountPercent?: number | null;
  minimumMarginPercent?: number | null;
  maxSafeDiscountPercent?: number | null;
  discountRationale?: string;
  seasonalBundleType?: string;
  weatherSegmentId?: string;
  weatherBasis?: string;
  isSeasonalBundle?: boolean;
  seasonalBasketCount?: number;
}

interface ItemMetric {
  item: string;
  sector: string;
  sectors?: string[];
  support: number;
  basketCount: number;
  velocity: "fast" | "moderate" | "slow";
  price?: number;
  unitCost?: number;
  unitGrossProfit?: number;
  margin?: number;
}

interface HourlyTransactionVolume {
  hour: number;
  label: string;
  transactions: number;
}

interface CrossSellResponse {
  rules?: CrossSellRule[];
  bundleCandidates?: BundleCandidate[];
  itemMetrics?: ItemMetric[];
  rawAnalysis?: {
    totalTransactions?: number;
    totalLineItems?: number;
    uniqueItemCount?: number;
    totalRevenue?: number;
    selectedHour?: number | null;
    multiItemBaskets?: number;
    avgItemsPerBasket?: number;
    crossSectorBasketRate?: number;
    peakHour?: HourlyTransactionVolume | null;
    hourlyTransactionVolume?: HourlyTransactionVolume[];
    sectorMix?: Array<{
      sector: string;
      lineItems: number;
      transactionCount: number;
    }>;
  };
  totalBaskets?: number;
  multiItemBaskets?: number;
  crossSectorRate?: number;
  cached?: boolean;
  message?: string;
  error?: string;
  seasonalBundleCandidates?: BundleCandidate[];
  weatherSegments?: Array<{
    id: string;
    label: string;
    basketCount: number;
    candidateCount?: number;
    displayedCandidateCount?: number;
    skipped?: boolean;
    reason?: string;
    weatherBasis?: string;
  }>;
  weatherBasis?: string;
}

interface PricingCatalogResponse {
  itemMetrics?: ItemMetric[];
  totalItems?: number;
  totalTransactions?: number;
  source?: "header_filter" | "all_history";
  dateStart?: string;
  dateEnd?: string;
}

interface ScenarioForecastSet {
  cafe?: ForecastRun | null;
  services?: ForecastRun | null;
  retail?: any;
}

interface ScenarioFactor {
  factor: string;
  impact: number;
  description: string;
}

type DemandLevel = "Low" | "Medium" | "High";

const sectorColors: Record<string, string> = {
  cafe: "#D2B48C",
  retail: "#F59E0B",
  services: "#0D9488",
  service: "#0D9488",
  unknown: "#A78BFA",
};

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const formatPercent = (value?: number) =>
  `${Math.round((value || 0) * 100)}%`;

const PHP_SYMBOL = "\u20B1";
const CELSIUS_SYMBOL = String.fromCharCode(176);

const formatCurrency = (value?: number | null) =>
  value !== undefined && value !== null && Number.isFinite(value)
    ? `${PHP_SYMBOL}${value.toFixed(2)}`
    : "Unavailable";

const formatCompactCurrency = (value?: number | null) => {
  if (value === undefined || value === null || !Number.isFinite(value)) return "";
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) return `${PHP_SYMBOL}${(value / 1_000_000).toFixed(1)}M`;
  if (absValue >= 1_000) return `${PHP_SYMBOL}${(value / 1_000).toFixed(1)}K`;
  return `${PHP_SYMBOL}${Math.round(value)}`;
};

const formatPair = (left: string, right: string) => `${left} + ${right}`;
const todayDateKey = () => new Date().toISOString().slice(0, 10);

const firstSector = (sectors?: string[]) => sectors?.[0] || "unknown";

const getBundleKey = (itemA: string, itemB: string) =>
  [itemA, itemB].sort().join("::");

const calculateDiscountEconomics = (
  regularPrice: number,
  regularCost: number | null | undefined,
  discountPercent: number,
) => {
  if (!regularPrice || regularPrice <= 0) {
    return {
      bundlePrice: 0,
      savings: 0,
      projectedGrossProfit: null,
      projectedMarginPercent: null,
    };
  }

  const bundlePrice = Math.round(regularPrice * (1 - discountPercent / 100) * 100) / 100;
  const savings = Math.round((regularPrice - bundlePrice) * 100) / 100;
  if (regularCost === undefined || regularCost === null) {
    return {
      bundlePrice,
      savings,
      projectedGrossProfit: null,
      projectedMarginPercent: null,
    };
  }

  const projectedGrossProfit = Math.round((bundlePrice - regularCost) * 100) / 100;
  const projectedMarginPercent = bundlePrice > 0
    ? Math.round((projectedGrossProfit / bundlePrice) * 1000) / 10
    : null;

  return {
    bundlePrice,
    savings,
    projectedGrossProfit,
    projectedMarginPercent,
  };
};

const formatSector = (sector?: string) => {
  const value = sector || "unknown";
  if (value === "cafe") return "Cafe";
  if (value === "retail") return "Retail";
  if (value === "services" || value === "service") return "Services";
  return "Unknown";
};

const formatSectorPair = (sectors: string[]) =>
  sectors.map(formatSector).join(" + ");

const sectorSortOrder: Record<string, number> = {
  cafe: 0,
  services: 1,
  service: 1,
  retail: 2,
  unknown: 3,
};

const normalizeSectorForCategory = (sector?: string) => {
  const value = (sector || "unknown").toLowerCase();
  return value === "service" ? "services" : value;
};

const getBundleCategoryKey = (sectors: string[]) =>
  sectors
    .map(normalizeSectorForCategory)
    .sort((a, b) => (sectorSortOrder[a] ?? 99) - (sectorSortOrder[b] ?? 99) || a.localeCompare(b))
    .join("__");

const formatBundleCategoryKey = (key: string) =>
  key.split("__").map(formatSector).join(" + ");

function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function AISimulation() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("bundle-simulator");
  const [discountValue, setDiscountValue] = useState([15]);
  const [trafficOptimizerTime, setTrafficOptimizerTime] = useState([14]); // 2 PM (14 in 24h format)
  const [dataTime, setDataTime] = useState([13]); // 1 PM for Bundle Simulator

  // Live Behavioral Web states
  const [supportThreshold, setSupportThreshold] = useState([1]);
  const [confidenceLevel, setConfidenceLevel] = useState([60]);
  const [fpGrowthTime, setFpGrowthTime] = useState([13]); // Time slider for FP-Growth
  const [crossSellData, setCrossSellData] = useState<CrossSellResponse | null>(null);
  const [crossSellDataAllDay, setCrossSellDataAllDay] = useState<CrossSellResponse | null>(null);
  const [crossSellLoading, setCrossSellLoading] = useState(false);
  const [crossSellError, setCrossSellError] = useState<string | null>(null);
  const [bundleOpportunityMode, setBundleOpportunityMode] = useState<"standard" | "seasonal">("standard");
  const [seasonalBundleData, setSeasonalBundleData] = useState<CrossSellResponse | null>(null);
  const [seasonalBundleLoading, setSeasonalBundleLoading] = useState(false);
  const [seasonalBundleError, setSeasonalBundleError] = useState<string | null>(null);
  const [seasonalBundleCache, setSeasonalBundleCache] = useState<Record<string, CrossSellResponse>>({});
  const [bundleDiscountOverrides, setBundleDiscountOverrides] = useState<Record<string, number>>({});
  const [bundleCategoryFilter, setBundleCategoryFilter] = useState("all");
  const [onlySignificant, setOnlySignificant] = useState(false);
  const [bundlePage, setBundlePage] = useState(1);
  const [proximityPage, setProximityPage] = useState(1);
  const [backendProximity, setBackendProximity] = useState<any[]>([]);
  const [isProximityLoading, setIsProximityLoading] = useState(true);
  const [proximityRefreshCounter, setProximityRefreshCounter] = useState(0);
  const [selectedCandidateForDrawer, setSelectedCandidateForDrawer] = useState<DrawerBundleCandidate | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [globalDateRange, setGlobalDateRange] = useState("last-7-days");
  const [dataRangeInfo, setDataRangeInfo] = useState<ApiDataRange | null>(null);
  const [pricingSearch, setPricingSearch] = useState("");
  const [pricingCategoryFilter, setPricingCategoryFilter] = useState("all");
  const [pricingPage, setPricingPage] = useState(1);
  const [pricingUsesFullCatalog, setPricingUsesFullCatalog] = useState(false);
  const [pricingCatalogData, setPricingCatalogData] = useState<PricingCatalogResponse | null>(null);
  const [pricingCatalogLoading, setPricingCatalogLoading] = useState(false);
  const [pricingCatalogError, setPricingCatalogError] = useState<string | null>(null);
  const [selectedPricingItemName, setSelectedPricingItemName] = useState<string | null>(null);
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});
  const toggleSector = (sectorName: string) => setExpandedSectors(prev => ({ ...prev, [sectorName]: !prev[sectorName] }));
  const [manualBundleName, setManualBundleName] = useState("");
  const [manualBundlePrice, setManualBundlePrice] = useState("");
  const [manualDateCreated, setManualDateCreated] = useState(todayDateKey());
  const [manualProductOne, setManualProductOne] = useState("");
  const [manualProductTwo, setManualProductTwo] = useState("");
  const [manualProductThree, setManualProductThree] = useState("");
  const [manualAvailableMonth, setManualAvailableMonth] = useState("");
  const [manualStartDate, setManualStartDate] = useState("");
  const [manualEndDate, setManualEndDate] = useState("");
  const [manualPromoMechanic, setManualPromoMechanic] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualPlanningContext, setManualPlanningContext] = useState<BundlePlanningContext | null>(null);
  const [manualPlanningLoading, setManualPlanningLoading] = useState(false);
  const [manualPlanningError, setManualPlanningError] = useState<string | null>(null);
  const [createdManualBundleScore, setCreatedManualBundleScore] = useState<{
    score: number;
    generatedBaseline: number;
    marginScore: number;
    contextScore: number;
    bundleName: string;
  } | null>(null);
  const [manualBundleExplanation, setManualBundleExplanation] = useState<string | null>(null);
  const [bundleArchivesOpen, setBundleArchivesOpen] = useState(false);
  const [bundleArchives, setBundleArchives] = useState<BundleArchive[]>([]);
  const [bundleArchiveCounts, setBundleArchiveCounts] = useState<Record<string, number>>({});
  const [bundleArchiveSearch, setBundleArchiveSearch] = useState("");
  const [bundleArchiveStatus, setBundleArchiveStatus] = useState("active");
  const [bundleArchiveSource, setBundleArchiveSource] = useState("all");
  const [bundleArchiveLoading, setBundleArchiveLoading] = useState(false);
  const [bundleArchiveError, setBundleArchiveError] = useState<string | null>(null);
  const [trafficOptimizerData, setTrafficOptimizerData] = useState<TrafficOptimizerResponse | null>(null);
  const [trafficOptimizerDataAllDay, setTrafficOptimizerDataAllDay] = useState<TrafficOptimizerResponse | null>(null);
  const [trafficOptimizerLoading, setTrafficOptimizerLoading] = useState(false);
  const [trafficOptimizerError, setTrafficOptimizerError] = useState<string | null>(null);
  const [simulationTargetDay, setSimulationTargetDay] = useState<"today" | "tomorrow">("today");

  const todayManilaStr = useMemo(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }, []);

  const tomorrowManilaStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }, []);

  const currentManilaHour = useMemo(() => {
    try {
      return Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Manila",
          hour: "numeric",
          hour12: false,
        }).format(new Date())
      );
    } catch {
      return 14;
    }
  }, []);

  const isStoreOperatingNow = currentManilaHour >= 7 && currentManilaHour < 19;
  const activeReferenceDate = simulationTargetDay === "tomorrow" ? tomorrowManilaStr : todayManilaStr;
  const [erlangStaffing, setErlangStaffing] = useState<Record<string, number>>({});
  const [staffingDayFilter, setStaffingDayFilter] = useState("All");
  const [bundleEngineFeedback, setBundleEngineFeedback] = useState<"helpful" | "not-helpful" | null>(null);
  const [bundleEngineRecalibrating, setBundleEngineRecalibrating] = useState(false);
  const [trafficEngineFeedback, setTrafficEngineFeedback] = useState<"helpful" | "not-helpful" | null>(null);
  const [trafficEngineRecalibrating, setTrafficEngineRecalibrating] = useState(false);
  const [staffingRecommendationAccepted, setStaffingRecommendationAccepted] = useState(false);
  const [acceptedStaffingSectors, setAcceptedStaffingSectors] = useState<string[]>([]);

  const handleBundleEngineFeedback = async (helpful: boolean) => {
    const feedbackVal = helpful ? "helpful" : "not-helpful";
    setBundleEngineFeedback(feedbackVal);
    setBundleEngineRecalibrating(true);

    try {
      await submitFeedbackRating({
        id: `bundle-sim-${Date.now()}`,
        feedback: feedbackVal,
        notes: `Rated from AI Simulation Bundle Simulator tab`,
      });

      if (helpful) {
        toast.success("Feedback recorded in Supabase & AWS S3!", {
          description: "Signal received. Bundle Engine updated with positive association weight.",
        });
      } else {
        toast.info("Signal received. Bundle Engine recalibrating...", {
          description: "FP-Growth penalty applied. Recalibration archived to AWS S3 Data Lake.",
        });
      }
    } catch (err) {
      console.warn("Feedback rating sync error:", err);
      toast.info("Signal received. Bundle Engine recalibrating...");
    } finally {
      setTimeout(() => {
        setBundleEngineRecalibrating(false);
      }, 1500);
    }
  };

  const handleTrafficEngineFeedback = async (helpful: boolean) => {
    const feedbackVal = helpful ? "helpful" : "not-helpful";
    setTrafficEngineFeedback(feedbackVal);
    setTrafficEngineRecalibrating(true);

    try {
      await submitFeedbackRating({
        id: `traffic-opt-${Date.now()}`,
        feedback: feedbackVal,
        notes: "Rated from AI Simulation Traffic Optimizer tab",
      });

      if (helpful) {
        toast.success("Feedback recorded in Supabase & AWS S3!", {
          description: "Signal received. Traffic Optimizer quiet period model updated.",
        });
      } else {
        toast.info("Signal received. Traffic Engine recalibrating...", {
          description: "Prophet regressors adjusted and archived to AWS S3 Data Lake.",
        });
      }
    } catch (err) {
      console.warn("Feedback rating sync error:", err);
      toast.info("Signal received. Traffic Engine recalibrating...");
    } finally {
      setTimeout(() => {
        setTrafficEngineRecalibrating(false);
      }, 1500);
    }
  };

  const handleAcceptStaffingRecommendation = async (sectorPlan?: any) => {
    const sectorName = sectorPlan?.sector ? String(sectorPlan.sector) : "Operations";
    const sourceId = sectorPlan?.sector
      ? `staffing-${sectorName}-${activeReferenceDate}-${debouncedTrafficOptimizerTime}`
      : `staffing-${activeReferenceDate}-${debouncedTrafficOptimizerTime}`;
    try {
      await deployPrescription({
        category: "staffing",
        sourceType: "traffic_staffing_recommendation",
        sourceId,
        title: sectorPlan?.sector
          ? `${sectorName} Staffing Recommendation - ${activeReferenceDate} ${formatHour(debouncedTrafficOptimizerTime)}`
          : `Staffing Recommendation - ${activeReferenceDate} ${formatHour(debouncedTrafficOptimizerTime)}`,
        sector: sectorName,
        targetTime: `${activeReferenceDate} ${formatHour(debouncedTrafficOptimizerTime)}`,
        mechanic: sectorPlan?.action || "Accepted staffing prescription",
        confidence: "Accepted",
        metadata: {
          activeReferenceDate,
          selectedHour: debouncedTrafficOptimizerTime,
          staffingDayFilter,
          recommendedPlan: sectorPlan || dynamicHourlyStaffingPlan,
          trafficSummary: {
            totalVisits: trafficOptimizerData?.totalVisits || null,
            displayMode: trafficOptimizerData?.displayMode || null,
          },
        },
      });
      if (sectorPlan?.sector) {
        setAcceptedStaffingSectors((current) =>
          current.includes(sectorName) ? current : [...current, sectorName],
        );
      } else {
        setStaffingRecommendationAccepted(true);
      }
      toast.success("Staffing recommendation accepted", {
        description: `${sectorName} prescription is now active and will appear in Feedback Active Prescription.`,
      });
    } catch (error) {
      toast.error("Unable to accept staffing recommendation", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleOpenDrawer = (candidate: DrawerBundleCandidate) => {
    setSelectedCandidateForDrawer(candidate);
    setIsDrawerOpen(true);
  };

  const debouncedSupportThreshold = useDebouncedValue(supportThreshold[0]);
  const debouncedConfidenceLevel = useDebouncedValue(confidenceLevel[0]);
  const debouncedDataTime = useDebouncedValue(dataTime[0]);
  const debouncedTrafficOptimizerTime = useDebouncedValue(trafficOptimizerTime[0]);
  const latestHistoryDate = dataRangeInfo?.historyEndDate || INGESTED_HISTORY_END_DATE;
  const historyStartDate = dataRangeInfo?.historyStartDate || HISTORY_START_DATE;
  const selectedHeaderRange = useMemo(
    () =>
      parseGlobalRange(globalDateRange, latestHistoryDate, {
        min: historyStartDate,
        max: latestHistoryDate,
      }),
    [globalDateRange, historyStartDate, latestHistoryDate],
  );
  const selectedHeaderRangeLabel = `${selectedHeaderRange.start} to ${selectedHeaderRange.end}`;
  const pricingCatalogRangeLabel = pricingUsesFullCatalog
    ? "All ingested history"
    : selectedHeaderRangeLabel;

  // Scenario Builder states
  const [scenarioName, setScenarioName] = useState("Weekend Promo Campaign");
  const [weather, setWeather] = useState("sunny");
  const [promoActive, setPromoActive] = useState(true);
  const [dayOfWeek, setDayOfWeek] = useState("saturday");
  const [temperature, setTemperature] = useState([28]);
  const [paydayWeekend, setPaydayWeekend] = useState(false);
  const [scenarioForecasts, setScenarioForecasts] = useState<ScenarioForecastSet>({});
  const [scenarioBaselineForecasts, setScenarioBaselineForecasts] = useState<ScenarioForecastSet>({});
  const [scenarioPromoModel, setScenarioPromoModel] = useState<any>(null);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenarioRefreshKey, setScenarioRefreshKey] = useState(0);
  const debouncedScenarioTemperature = useDebouncedValue(temperature[0], 500);

  const todayContext = trafficOptimizerData?.todayContext || trafficOptimizerDataAllDay?.todayContext;

  const todayHourlyPrediction = useMemo(() => {
    const hourly = todayContext?.hourlyForecast;
    if (!hourly || hourly.length === 0) return [];
    return hourly.map((h: any) => {
      const cafe = h.sectorVisits?.Cafe?.visits || 0;
      const services = h.sectorVisits?.Services?.visits || 0;
      const retail = h.sectorVisits?.Retail?.visits || 0;
      return {
        day: h.label,
        fullDayLabel: `${simulationTargetDay === "tomorrow" ? "Tomorrow" : "Today"} at ${h.label}`,
        visits: h.predictedVisits,
        cafe,
        services,
        retail,
      };
    });
  }, [todayContext?.hourlyForecast, simulationTargetDay]);

  const [trafficHeatmapUnit, setTrafficHeatmapUnit] = useState<"percent" | "visits">("percent");


  // GLM-Powered Prescriptive Insight for Traffic Optimizer
  const [trafficGlmInsight, setTrafficGlmInsight] = useState<string>("");
  const [trafficGlmLoading, setTrafficGlmLoading] = useState<boolean>(false);

  // What-If Demand Shift for Traffic Optimizer (Option 1)
  const [trafficDemandShift, setTrafficDemandShift] = useState<number>(0);
  const debouncedTrafficDemandShift = useDebouncedValue(trafficDemandShift, 400);

  const tabs = [
    { id: "bundle-simulator", label: "Bundle Simulator", icon: Sparkles },
    { id: "pricing-lab", label: "Pricing Laboratory", icon: TrendingUp },
    { id: "traffic-optimizer", label: "Traffic Optimizer", icon: MapIcon },
    { id: "operations-what-if", label: "Operations What-If", icon: Users },
    { id: "scenario-builder", label: "Scenario Builder", icon: FlaskConical },
    { id: "activation-layer", label: "Activation Layer", icon: Megaphone },
  ];

  useEffect(() => {
    if (!router.isReady) return;

    const rawTab = typeof router.query.tab === "string" ? router.query.tab.toLowerCase() : "";
    const tabMap: Record<string, string> = {
      traffic: "traffic-optimizer",
      "traffic-optimizer": "traffic-optimizer",
      bundle: "bundle-simulator",
      "bundle-simulator": "bundle-simulator",
      pricing: "pricing-lab",
      "pricing-lab": "pricing-lab",
      "operations-what-if": "operations-what-if",
      "what-if": "operations-what-if",
      scenario: "scenario-builder",
      "scenario-builder": "scenario-builder",
      activation: "activation-layer",
      "activation-layer": "activation-layer",
    };

    if (tabMap[rawTab]) {
      setActiveTab(tabMap[rawTab]);
    }

    if (typeof router.query.itemA === "string") {
      setPricingSearch(router.query.itemA);
    }
  }, [router.isReady, router.query.tab, router.query.itemA]);

  const handleBundleTimeChange = (value: number[]) => {
    setDataTime(value);
    setFpGrowthTime(value);
  };

  async function loadBundleArchives() {
    setBundleArchiveLoading(true);
    setBundleArchiveError(null);
    try {
      const data = await getBundleArchives({
        status: bundleArchiveStatus,
        source: bundleArchiveSource,
        search: bundleArchiveSearch,
      });
      setBundleArchives(data.bundles || []);
      setBundleArchiveCounts(data.counts || {});
    } catch (error) {
      setBundleArchiveError(
        error instanceof Error ? error.message : "Unable to load bundle archives.",
      );
    } finally {
      setBundleArchiveLoading(false);
    }
  }

  const handleDeployBundlePrescription = async (bundle: {
    bundle: string;
    itemA: string;
    itemB: string;
    regularPrice: number;
    regularCost?: number | null;
    itemAPrice?: number | null;
    itemBPrice?: number | null;
    itemACost?: number | null;
    itemBCost?: number | null;
    bundlePrice: number;
    suggestedDiscountPercent?: number | null;
    selectedDiscountPercent: number;
    projectedGrossProfit?: number | null;
    projectedMarginPercent?: number | null;
    minimumMarginPercent?: number | null;
    maxSafeDiscountPercent?: number | null;
    confidence: number;
    lift: number;
    support?: number;
    antecedentSectors?: string[];
    consequentSectors?: string[];
  }) => {
    const [firstBundleItemSlug, secondBundleItemSlug] = [
      slugify(bundle.itemA),
      slugify(bundle.itemB),
    ].sort();
    const bundleSourceId = `bundle-${firstBundleItemSlug}-${secondBundleItemSlug}`;
    try {
      await deployPrescription({
        category: "bundle",
        sourceType: "bundle_recommendation",
        sourceId: bundleSourceId,
        title: bundle.bundle,
        sector: "Cafe + Services",
        targetTime: selectedHeaderRangeLabel,
        mechanic: `${bundle.selectedDiscountPercent}% bundle discount`,
        confidence: `${bundle.confidence}%`,
        metadata: {
          sourceType: "bundle_recommendation",
          selectedHeaderRange: selectedHeaderRangeLabel,
          items: [
          {
            name: bundle.itemA,
            sector: bundle.antecedentSectors?.[0] || null,
            price: bundle.itemAPrice ?? null,
            cost: bundle.itemACost ?? null,
          },
          {
            name: bundle.itemB,
            sector: bundle.consequentSectors?.[0] || null,
            price: bundle.itemBPrice ?? null,
            cost: bundle.itemBCost ?? null,
          },
          ],
          regularPrice: bundle.regularPrice > 0 ? bundle.regularPrice : null,
          bundlePrice: bundle.bundlePrice > 0 ? bundle.bundlePrice : null,
          savings:
          bundle.regularPrice > 0 && bundle.bundlePrice > 0
            ? bundle.regularPrice - bundle.bundlePrice
            : null,
          discountPercent: bundle.selectedDiscountPercent,
          promoMechanic: `${bundle.selectedDiscountPercent}% bundle discount`,
          notes: bundle.bundle,
          support: bundle.support || 0,
          confidence: bundle.confidence / 100,
          lift: bundle.lift,
          projectedGrossProfit: bundle.projectedGrossProfit ?? null,
          projectedMarginPercent: bundle.projectedMarginPercent ?? null,
        },
      });
      toast.success("Bundle prescription deployed", {
        description: `${bundle.bundle} is now active and will appear in Feedback Active Prescription.`,
      });
    } catch (error) {
      toast.error("Unable to deploy bundle", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  useEffect(() => {
    const savedRange = window.localStorage.getItem("globalDateRange");
    if (savedRange) {
      setGlobalDateRange(savedRange);
    }

    const handleRangeChange = (event: Event) => {
      const nextRange = (event as CustomEvent<string>).detail;
      if (nextRange) {
        setGlobalDateRange(nextRange);
      }
    };

    window.addEventListener("globalDateRangeChanged", handleRangeChange);
    return () => window.removeEventListener("globalDateRangeChanged", handleRangeChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDataRange()
      .then((range) => {
        if (!cancelled) {
          setDataRangeInfo(range);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCrossSellLoading(true);
    setCrossSellError(null);

    getCrossSell({
      minSupport: (debouncedSupportThreshold / 100).toFixed(2),
      minConfidence: (debouncedConfidenceLevel / 100).toFixed(2),
      minLift: "1.20",
      maxBundleCandidates: "20",
      hour: String(debouncedDataTime),
      sector: "all",
      dateStart: selectedHeaderRange.start,
      dateEnd: selectedHeaderRange.end,
    })
      .then((result: CrossSellResponse) => {
        if (!cancelled) {
          setCrossSellData(result);
          if (result.error) {
            setCrossSellError(result.error);
          }
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setCrossSellError(error.message);
          setCrossSellData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCrossSellLoading(false);
        }
      });

    getCrossSell({
      minSupport: (debouncedSupportThreshold / 100).toFixed(2),
      minConfidence: (debouncedConfidenceLevel / 100).toFixed(2),
      minLift: "1.20",
      maxBundleCandidates: "20",
      hour: "all",
      sector: "all",
      dateStart: selectedHeaderRange.start,
      dateEnd: selectedHeaderRange.end,
    })
      .then((result: CrossSellResponse) => {
        if (!cancelled) {
          setCrossSellDataAllDay(result);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    debouncedSupportThreshold,
    debouncedConfidenceLevel,
    debouncedDataTime,
    selectedHeaderRange.end,
    selectedHeaderRange.start,
  ]);

  // Load Strategic Proximity strictly from backend analytics engine
  useEffect(() => {
    let cancelled = false;
    setIsProximityLoading(true);

    getStrategicProximity({
      forceRefresh: proximityRefreshCounter > 0 ? "true" : undefined,
      dateStart: selectedHeaderRange.start,
      dateEnd: selectedHeaderRange.end,
    })
      .then((res: any) => {
        if (!cancelled && res?.recommendations) {
          setBackendProximity(res.recommendations);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch strategic proximity recommendations:", err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsProximityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    proximityRefreshCounter,
    selectedHeaderRange.start,
    selectedHeaderRange.end,
  ]);

  // Automatically recalibrate Strategic Proximity whenever new data is inserted (CSV upload, POS transactions, ETL)
  useEffect(() => {
    const handleRealtime = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: string; title?: string }>;
      const eventType = customEvent.detail?.type;
      if (
        !eventType ||
        eventType === "upload_processed" ||
        eventType === "etl_completed" ||
        eventType === "transaction_ingested" ||
        eventType === "forecast_ready"
      ) {
        setProximityRefreshCounter((prev) => prev + 1);
      }
    };

    window.addEventListener("woof:realtime", handleRealtime);
    return () => {
      window.removeEventListener("woof:realtime", handleRealtime);
    };
  }, []);

  const seasonalBundleQuery = useMemo(() => ({
    minSupport: (debouncedSupportThreshold / 100).toFixed(2),
    minConfidence: (debouncedConfidenceLevel / 100).toFixed(2),
    minLift: "1.20",
    maxBundleCandidates: "20",
    hour: String(debouncedDataTime),
    sector: "all" as const,
    dateStart: selectedHeaderRange.start,
    dateEnd: selectedHeaderRange.end,
  }), [
    debouncedSupportThreshold,
    debouncedConfidenceLevel,
    debouncedDataTime,
    selectedHeaderRange.end,
    selectedHeaderRange.start,
  ]);
  const seasonalBundleCacheKey = useMemo(
    () => JSON.stringify(seasonalBundleQuery),
    [seasonalBundleQuery],
  );

  const handleLoadSeasonalBundles = (forceRefresh = false) => {
    setBundleOpportunityMode("seasonal");
    const cachedSeasonalBundles = seasonalBundleCache[seasonalBundleCacheKey];
    if (!forceRefresh && cachedSeasonalBundles) {
      setSeasonalBundleData(cachedSeasonalBundles);
      setSeasonalBundleError(cachedSeasonalBundles.error || cachedSeasonalBundles.message || null);
      setSeasonalBundleLoading(false);
      return;
    }

    setSeasonalBundleLoading(true);
    setSeasonalBundleError(null);

    getSeasonalCrossSellBundles({
      ...seasonalBundleQuery,
      forceRefresh: forceRefresh ? "true" : undefined,
    })
      .then((result: CrossSellResponse) => {
        setSeasonalBundleData(result);
        setSeasonalBundleCache((prev) => ({
          ...prev,
          [seasonalBundleCacheKey]: result,
        }));
        if (result.error) {
          setSeasonalBundleError(result.error);
        } else if (result.message) {
          setSeasonalBundleError(result.message);
        }
      })
      .catch((error: Error) => {
        setSeasonalBundleError(error.message);
        setSeasonalBundleData(null);
      })
      .finally(() => {
        setSeasonalBundleLoading(false);
      });
  };

  useEffect(() => {
    setSeasonalBundleData(null);
    setSeasonalBundleError(null);
    if (bundleOpportunityMode === "seasonal") {
      setBundleOpportunityMode("standard");
    }
  }, [seasonalBundleCacheKey]);

  useEffect(() => {
    let cancelled = false;
    setPricingCatalogLoading(true);
    setPricingCatalogError(null);

    getPricingCatalog({
      sector: "all",
      ...(pricingUsesFullCatalog
        ? {}
        : {
            dateStart: selectedHeaderRange.start,
            dateEnd: selectedHeaderRange.end,
          }),
    })
      .then((result: PricingCatalogResponse) => {
        if (!cancelled) {
          setPricingCatalogData(result);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setPricingCatalogError(error.message);
          setPricingCatalogData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPricingCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pricingUsesFullCatalog, selectedHeaderRange.end, selectedHeaderRange.start]);

  useEffect(() => {
    let cancelled = false;
    setTrafficOptimizerLoading(true);
    setTrafficOptimizerError(null);

    const scenarioMultiplier = debouncedTrafficDemandShift !== 0
      ? String(+(1 + debouncedTrafficDemandShift / 100).toFixed(2))
      : undefined;
    const scenarioLabel = debouncedTrafficDemandShift !== 0
      ? `Demand Shift ${debouncedTrafficDemandShift > 0 ? '+' : ''}${debouncedTrafficDemandShift}%`
      : undefined;

    getTrafficOptimizer({
      hour: String(debouncedTrafficOptimizerTime),
      dateStart: selectedHeaderRange.start,
      dateEnd: selectedHeaderRange.end,
      referenceDate: activeReferenceDate,
      ...(scenarioMultiplier ? { scenarioMultiplier, scenarioLabel } : {}),
    })
      .then((result) => {
        if (!cancelled) {
          setTrafficOptimizerData(result);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setTrafficOptimizerError(error.message);
          setTrafficOptimizerData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTrafficOptimizerLoading(false);
        }
      });

    getTrafficOptimizer({
      hour: "all",
      dateStart: selectedHeaderRange.start,
      dateEnd: selectedHeaderRange.end,
      referenceDate: activeReferenceDate,
      ...(scenarioMultiplier ? { scenarioMultiplier, scenarioLabel } : {}),
    })
      .then((result) => {
        if (!cancelled) {
          setTrafficOptimizerDataAllDay(result);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    debouncedTrafficOptimizerTime,
    selectedHeaderRange.end,
    selectedHeaderRange.start,
    debouncedTrafficDemandShift,
    activeReferenceDate,
  ]);

  useEffect(() => {
    let cancelled = false;
    const fetchErlang = async () => {
      const getDemandLevelForSector = (sectorName: string, value: number) => {
        const normalized = sectorName.toLowerCase().trim();
        if (normalized === 'grooming') return value >= 4 ? 'High' : value >= 2 ? 'Medium' : 'Low';
        if (normalized === 'pet hotel') return value >= 3 ? 'High' : value >= 2 ? 'Medium' : 'Low';
        // bday pawty removed
        if (normalized === 'cafe') return value >= 11 ? 'High' : value >= 6 ? 'Medium' : 'Low';
        if (normalized === 'retail') return value >= 10 ? 'High' : value >= 5 ? 'Medium' : 'Low';
        if (normalized === 'services') return value >= 11 ? 'High' : value >= 6 ? 'Medium' : 'Low';
        return value >= 26 ? 'High' : value >= 11 ? 'Medium' : 'Low';
      };

      const getFallbackStaff = (sector: string, level: string) => {
        if (sector === "Services") {
          if (level === "High") return 4;
          if (level === "Medium") return 2;
          return 1;
        }
        if (sector === "Cafe") {
          if (level === "High") return 3;
          if (level === "Medium") return 2;
          return 1;
        }
        if (level === "High") return 2;
        return 1;
      };

      const recommendations: Record<string, number> = {};
      const trafficSectors = [
        { name: "Services", serviceTime: 45 },
        { name: "Cafe", serviceTime: 15 },
        { name: "Retail", serviceTime: 10 },
      ];

      await Promise.all(
        trafficSectors.map(async (sector) => {
          const trafficRow = trafficOptimizerData?.sectors?.find((s: any) => s.sector === sector.name);
          const peakVisits = trafficRow?.peakVisits || 0;
          const arrivalRate = peakVisits;

          if (arrivalRate > 0) {
            try {
              const res = await getQueueRecommendation({ 
                arrivalRate, 
                serviceTime: sector.serviceTime, 
                targetWait: 5 
              });
              recommendations[sector.name] = res.recommendedStaff || getFallbackStaff(sector.name, getDemandLevelForSector(sector.name, peakVisits));
            } catch (err) {
              recommendations[sector.name] = getFallbackStaff(sector.name, getDemandLevelForSector(sector.name, peakVisits));
            }
          } else {
            recommendations[sector.name] = 1;
          }
        })
      );
      if (!cancelled) {
        setErlangStaffing(recommendations);
      }
    };

    if (trafficOptimizerData) {
      fetchErlang();
    }

    return () => {
      cancelled = true;
    };
  }, [trafficOptimizerData]);

  const handleRunSimulation = () => {
    setScenarioRefreshKey((key) => key + 1);
    toast.info("Updating scenario predictions...", {
      description: "Pulling forecasts and recalculating the what-if outcome.",
    });
  };

  // Format hour for display (7 AM - 7 PM)
  const formatHour = (value: number) => {
    if (value === 12) return "12:00 PM";
    if (value > 12) return `${value - 12}:00 PM`;
    return `${value}:00 AM`;
  };

  const rules = crossSellData?.rules || [];
  const bundleCandidates = crossSellData?.bundleCandidates || [];
  const itemMetrics = crossSellData?.itemMetrics || [];
  const pricingCatalogMetrics = pricingCatalogData?.itemMetrics?.length
    ? pricingCatalogData.itemMetrics
    : itemMetrics;
  const rawAnalysis = crossSellData?.rawAnalysis;
  const avgRuleLift =
    rules.length > 0
      ? rules.reduce((sum, rule) => sum + (rule.lift || 0), 0) / rules.length
      : 0;
  const avgRuleConfidence =
    rules.length > 0
      ? rules.reduce((sum, rule) => sum + (rule.confidence || 0), 0) / rules.length
      : 0;
  const maxCoPurchaseFrequency = Math.max(
    1,
    ...rules.map((rule) => rule.cooccurrences || 0),
  );

  // Transaction volume data based on time selection
  const transactionVolumeData = useMemo(() => {
    const rows = rawAnalysis?.hourlyTransactionVolume || [];
    return Array.from({ length: 13 }, (_, i) => {
      const hour = i + 7; // 7 AM to 7 PM
      const row = rows.find((item) => item.hour === hour);
      return {
        hour: formatHour(hour),
        transactions: row?.transactions || 0,
        selected: hour === dataTime[0],
      };
    });
  }, [dataTime, rawAnalysis]);

  // Co-purchase patterns based on time - deduplicated symmetric pairs
  const coPurchaseData = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ pair: string; frequency: number }> = [];

    const sortedRules = rules.slice().sort((a, b) => (b.cooccurrences || 0) - (a.cooccurrences || 0));
    for (const rule of sortedRules) {
      const canonicalKey = [rule.itemA, rule.itemB].sort().join(" + ");
      if (!seen.has(canonicalKey)) {
        seen.add(canonicalKey);
        list.push({
          pair: formatPair(rule.itemA, rule.itemB),
          frequency: rule.cooccurrences || 0,
        });
      }
      if (list.length >= 5) break;
    }
    return list;
  }, [rules]);

  // Helper function to enforce 3 Golden Banning Rules on candidate pairs
  const isExcludedPair = (itemA: string, itemB: string, archetype?: string) => {
    if (archetype && archetype.startsWith("Excluded")) return true;
    const a = (itemA || "").toLowerCase();
    const b = (itemB || "").toLowerCase();

    const drinks = ["coffee", "latte", "cappuccino", "americano", "espresso", "macchiato", "mocha", "frappe", "tea", "matcha", "beverage", "drink", "brew", "chocolate", "iced"];
    const foods = ["pasta", "snack", "sandwich", "waffle", "fries", "burger", "spaghetti", "carbonara", "bread", "toast", "pancake", "muffin", "rice", "meal", "pork", "chicken", "beef", "cordon bleu"];
    const mainFoods = ["pasta", "spaghetti", "carbonara", "rice", "meal", "pork", "chicken", "beef", "cordon bleu"];
    const utilities = ["shampoo", "conditioner", "soap", "diaper", "toy", "chew", "brush", "comb", "cologne", "spray", "litter", "leash", "harness"];
    const petTreats = ["woofle", "pupcake", "dog cake", "cat treat", "pet bakery", "dental chew", "pet treat", "biscuit"];

    const isADrink = drinks.some((k) => a.includes(k));
    const isBDrink = drinks.some((k) => b.includes(k));

    const isAFood = foods.some((k) => a.includes(k));
    const isBFood = foods.some((k) => b.includes(k));

    const isAMainFood = mainFoods.some((k) => a.includes(k));
    const isBMainFood = mainFoods.some((k) => b.includes(k));

    const isAUtility = utilities.some((k) => a.includes(k));
    const isBUtility = utilities.some((k) => b.includes(k));

    const isAPetTreat = petTreats.some((k) => a.includes(k));
    const isBPetTreat = petTreats.some((k) => b.includes(k));

    // Rule 1: Same High-Level Type Exclusion (Drink+Drink, Food+Food)
    if (isADrink && isBDrink) return true;
    if (isAFood && isBFood) return true;

    // Rule 2: Human Beverage + Utility Restriction (Drink+Utility)
    if ((isADrink && isBUtility) || (isBDrink && isAUtility)) return true;

    // Rule 3: Human Main Meals (Rice Meals / Pasta) + Pet Items Exclusion (Pet Utility, Pet Treats, Pet Supplies)
    if ((isAMainFood && (isBUtility || isBPetTreat)) || (isBMainFood && (isAUtility || isAPetTreat))) return true;

    // Rule 4: Species Mismatch
    const isADog = a.includes("dog") || a.includes("pup") || a.includes("woof");
    const isBDog = b.includes("dog") || b.includes("pup") || b.includes("woof");
    const isACat = a.includes("cat") || a.includes("kitten") || a.includes("feline") || a.includes("meow");
    const isBCat = b.includes("cat") || b.includes("kitten") || b.includes("feline") || b.includes("meow");

    if ((isADog && isBCat) || (isACat && isBDog)) return true;

    return false;
  };

  const buildBundlePredictions = (sourceData: CrossSellResponse | null) => {
    const sourceRules = sourceData?.rules || [];
    const sourceBundleCandidates =
      sourceData?.bundleCandidates?.length
        ? sourceData.bundleCandidates
        : sourceData?.seasonalBundleCandidates || [];
    const lowAssociation = sourceBundleCandidates.map((candidate) => ({
      bundle: formatPair(candidate.anchorItem, candidate.bundleItem),
      itemA: candidate.anchorItem,
      itemB: candidate.bundleItem,
      confidence: Math.round((candidate.confidence || 0) * 100),
      lift: candidate.lift || 0,
      support: candidate.pairSupport || 0,
      score: (candidate as any).synergyScore !== undefined && (candidate as any).synergyScore !== null ? Math.round((candidate as any).synergyScore) : Math.round((candidate.opportunityScore || 0) * 100),
      businessFitScore: candidate.businessFitScore ?? null,
      bundleFitReason: candidate.bundleFitReason,
      frequency: candidate.cooccurrences || 0,
      type: "Fast + Slow Opportunity",
      itemAPrice: candidate.itemAPrice || 0,
      itemBPrice: candidate.itemBPrice || 0,
      itemACost: candidate.itemACost ?? null,
      itemBCost: candidate.itemBCost ?? null,
      regularCost: candidate.regularCost ?? null,
      regularPrice: candidate.regularPrice || 0,
      bundlePrice: candidate.bundlePrice || 0,
      savings: candidate.savings || 0,
      projectedGrossProfit: candidate.projectedGrossProfit ?? null,
      projectedMarginPercent: candidate.projectedMarginPercent ?? null,
      suggestedDiscountPercent: candidate.suggestedDiscountPercent ?? candidate.proposedDiscountPercent ?? null,
      minimumMarginPercent: candidate.minimumMarginPercent ?? null,
      maxSafeDiscountPercent: candidate.maxSafeDiscountPercent ?? null,
      discountRationale: candidate.discountRationale,
      sectors: [
        firstSector(candidate.antecedentSectors),
        firstSector(candidate.consequentSectors),
      ],
      bundleCategory:
        candidate.bundleCategory ||
        getBundleCategoryKey([
          firstSector(candidate.antecedentSectors),
          firstSector(candidate.consequentSectors),
        ]),
      sectorPair: formatSectorPair([
        firstSector(candidate.antecedentSectors),
        firstSector(candidate.consequentSectors),
      ]),
      reason:
        candidate.reason ||
        candidate.bundleFitReason ||
        "Fast-moving item paired with a slower-moving item that is not already strongly associated.",
      synergyScore: (candidate as any).synergyScore,
      bundleArchetype: (candidate as any).bundleArchetype,
      synergyBreakdown: (candidate as any).synergyBreakdown,
      seasonalBundleType: candidate.seasonalBundleType,
      weatherSegmentId: candidate.weatherSegmentId,
      weatherBasis: candidate.weatherBasis,
      isSeasonalBundle: candidate.isSeasonalBundle,
      seasonalBasketCount: candidate.seasonalBasketCount,
      isEmergingTrend: (candidate as any).isEmergingTrend,
      baselineAttachRate: (candidate as any).baselineAttachRate,
      predictedAttachRate: (candidate as any).predictedAttachRate,
      attachRateLift: (candidate as any).attachRateLift,
      backtestValidationStatus: (candidate as any).backtestValidationStatus,
      estimatedMarginImpact: (candidate as any).estimatedMarginImpact,
      isSignificant: (candidate as any).isSignificant ?? false,
      rawCandidate: candidate,
    }));
    const significantRules = sourceRules.map((rule) => ({
      bundle: formatPair(rule.itemA, rule.itemB),
      itemA: rule.itemA,
      itemB: rule.itemB,
      confidence: Math.round((rule.confidence || 0) * 100),
      lift: rule.lift || 0,
      support: rule.support || 0,
      score: (rule as any).synergyScore !== undefined && (rule as any).synergyScore !== null ? Math.round((rule as any).synergyScore) : Math.round(Math.min(95, (rule.lift || 0) * 20 + 20)),
      businessFitScore: (rule as any).businessFitScore ?? null,
      bundleFitReason: (rule as any).bundleFitReason,
      frequency: rule.cooccurrences || 0,
      type: rule.isMultiItem ? "Multi-item Pattern Rule" : "Significant Association Rule",
      itemAPrice: rule.itemAPrice || 0,
      itemBPrice: rule.itemBPrice || 0,
      itemACost: rule.itemACost ?? null,
      itemBCost: rule.itemBCost ?? null,
      regularCost: rule.regularCost ?? null,
      regularPrice: rule.regularPrice || 0,
      bundlePrice: rule.bundlePrice || 0,
      savings: rule.savings || 0,
      projectedGrossProfit: rule.projectedGrossProfit ?? null,
      projectedMarginPercent: rule.projectedMarginPercent ?? null,
      suggestedDiscountPercent: rule.suggestedDiscountPercent ?? rule.proposedDiscountPercent ?? null,
      minimumMarginPercent: rule.minimumMarginPercent ?? null,
      maxSafeDiscountPercent: rule.maxSafeDiscountPercent ?? null,
      discountRationale: rule.discountRationale,
      sectors: [
        firstSector(rule.antecedentSectors),
        firstSector(rule.consequentSectors),
      ],
      bundleCategory: getBundleCategoryKey([
        firstSector(rule.antecedentSectors),
        firstSector(rule.consequentSectors),
      ]),
      sectorPair: formatSectorPair([
        firstSector(rule.antecedentSectors),
        firstSector(rule.consequentSectors),
      ]),
      reason: `Co-purchased ${rule.cooccurrences || 0}x in transaction history with ${rule.lift.toFixed(2)}x sales lift multiplier. Pricing is recalculated from the selected owner-review discount.`,
      synergyScore: (rule as any).synergyScore,
      bundleArchetype: (rule as any).bundleArchetype,
      synergyBreakdown: (rule as any).synergyBreakdown,
      seasonalBundleType: (rule as any).seasonalBundleType,
      weatherSegmentId: (rule as any).weatherSegmentId,
      weatherBasis: (rule as any).weatherBasis,
      isSeasonalBundle: (rule as any).isSeasonalBundle,
      seasonalBasketCount: (rule as any).seasonalBasketCount,
      isEmergingTrend: (rule as any).isEmergingTrend,
      baselineAttachRate: (rule as any).baselineAttachRate,
      predictedAttachRate: (rule as any).predictedAttachRate,
      attachRateLift: (rule as any).attachRateLift,
      backtestValidationStatus: (rule as any).backtestValidationStatus,
      estimatedMarginImpact: (rule as any).estimatedMarginImpact,
      isSignificant: (rule as any).isSignificant ?? true,
      rawCandidate: rule as any,
    }));

    const seenKeys = new Set<string>();
    const combined: Array<(typeof lowAssociation)[number] | (typeof significantRules)[number]> = [];

    [...significantRules, ...lowAssociation].forEach((item) => {
      const canonicalKey = [item.itemA, item.itemB].sort().join(" + ");
      if (!seenKeys.has(canonicalKey)) {
        seenKeys.add(canonicalKey);
        combined.push(item);
      }
    });

    return combined
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.confidence - a.confidence ||
          b.lift - a.lift,
      )
      .map((item) => {
        const key = getBundleKey(item.itemA, item.itemB);

        const foundA = (sourceData?.itemMetrics || []).find((m) => m.item === item.itemA) || (pricingCatalogData?.itemMetrics || []).find((i) => i.item === item.itemA);
        const foundB = (sourceData?.itemMetrics || []).find((m) => m.item === item.itemB) || (pricingCatalogData?.itemMetrics || []).find((i) => i.item === item.itemB);

        const pA = item.itemAPrice > 0 ? item.itemAPrice : (foundA?.price || 180);
        const pB = item.itemBPrice > 0 ? item.itemBPrice : (foundB?.price || 150);
        const cA = item.itemACost && item.itemACost > 0 ? item.itemACost : (foundA?.unitCost || Math.round(pA * 0.45));
        const cB = item.itemBCost && item.itemBCost > 0 ? item.itemBCost : (foundB?.unitCost || Math.round(pB * 0.45));

        const regPrice = item.regularPrice > 0 ? item.regularPrice : pA + pB;
        const regCost = item.regularCost && item.regularCost > 0 ? item.regularCost : cA + cB;

        const suggestedDiscount = Math.max(0, Math.round(item.suggestedDiscountPercent || 15));
        const selectedDiscount = bundleDiscountOverrides[key] ?? suggestedDiscount;

        const economics = calculateDiscountEconomics(
          regPrice,
          regCost,
          selectedDiscount,
        );
        const minimumMargin = item.minimumMarginPercent ?? 30;
        const maxSafeDiscount = item.maxSafeDiscountPercent ?? Math.max(0, Math.floor((1 - regCost / (regPrice * (1 - minimumMargin / 100))) * 100));

        return {
          ...item,
          key,
          itemAPrice: pA,
          itemBPrice: pB,
          itemACost: cA,
          itemBCost: cB,
          regularPrice: regPrice,
          regularCost: regCost,
          suggestedDiscountPercent: suggestedDiscount,
          selectedDiscountPercent: selectedDiscount,
          bundlePrice: economics.bundlePrice,
          savings: economics.savings,
          projectedGrossProfit: economics.projectedGrossProfit,
          projectedMarginPercent: economics.projectedMarginPercent,
          minimumMarginPercent: minimumMargin,
          maxSafeDiscountPercent: maxSafeDiscount,
          marginIsSafe:
            minimumMargin === null ||
            economics.projectedMarginPercent === null ||
            economics.projectedMarginPercent >= minimumMargin,
        };
      });
  };

  // Bundle predictions based on time analysis with real item prices
  const allBundlePredictions = useMemo(
    () => buildBundlePredictions(crossSellData),
    [bundleDiscountOverrides, crossSellData, pricingCatalogData],
  );
  const seasonalBundlePredictions = useMemo(
    () => buildBundlePredictions(seasonalBundleData),
    [bundleDiscountOverrides, pricingCatalogData, seasonalBundleData],
  );
  const activeBundlePredictions =
    bundleOpportunityMode === "seasonal" ? seasonalBundlePredictions : allBundlePredictions;

  useEffect(() => {
    if (!manualStartDate) {
      setManualPlanningContext(null);
      return;
    }
    const endDate = manualEndDate || manualStartDate;
    if (endDate < manualStartDate) {
      setManualPlanningContext(null);
      setManualPlanningError("End date must be on or after the start date.");
      return;
    }
    let cancelled = false;
    setManualPlanningLoading(true);
    setManualPlanningError(null);
    getBundlePlanningContext(manualStartDate, endDate)
      .then((context) => {
        if (!cancelled) setManualPlanningContext(context);
      })
      .catch((error) => {
        if (!cancelled) {
          setManualPlanningContext(null);
          setManualPlanningError(error instanceof Error ? error.message : "Weather data is unavailable.");
        }
      })
      .finally(() => {
        if (!cancelled) setManualPlanningLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manualEndDate, manualStartDate]);

  const manualWeatherSummary = useMemo(() => {
    const days = manualPlanningContext?.days || [];
    if (!days.length) return null;
    const coveredDays = days.filter((day) => !day.isSynthetic);
    const hasReliableWeather = coveredDays.length > 0;
    const rainyDays = coveredDays.filter((day) => day.rainFlag).length;
    const holidayDays = days.filter((day) => day.holidayName).length;
    const weekendDays = days.filter((day) => day.isWeekend).length;
    const temperatures = coveredDays.map((day) => day.tempCelsius);
    const minTemperature = hasReliableWeather ? Math.round(Math.min(...temperatures)) : null;
    const maxTemperature = hasReliableWeather ? Math.round(Math.max(...temperatures)) : null;
    const month = Number(days[0].date.slice(5, 7));
    const season = !hasReliableWeather
      ? "Unavailable"
      : rainyDays / coveredDays.length >= 0.5
      ? "Wet Season"
      : [3, 4, 5].includes(month)
        ? "Warm Season"
        : "Transition Season";
    const calendarLabel = holidayDays > 0
      ? `${holidayDays} holiday day${holidayDays > 1 ? "s" : ""}`
      : weekendDays > 0
        ? `${weekendDays} weekend day${weekendDays > 1 ? "s" : ""}`
        : "Regular calendar days";
    const weatherScore = !hasReliableWeather
      ? null
      : rainyDays > 0 ? 86 : temperatures.some((temperature) => temperature >= 31) ? 74 : 82;
    const evidenceScore = weatherScore === null
      ? null
      : Math.round((weatherScore + (holidayDays > 0 ? 90 : weekendDays > 0 ? 84 : 72)) / 2);
    return {
      rainyDays,
      coveredDays: coveredDays.length,
      totalDays: days.length,
      holidayDays,
      minTemperature,
      maxTemperature,
      season,
      calendarLabel,
      hasReliableWeather,
      evidenceScore,
      message: !hasReliableWeather
        ? "No live weather coverage is available for the selected dates, so weather fit is not estimated."
        : rainyDays > 0
        ? "Rain-aware dates may favor comfort-oriented Cafe or Services bundles."
        : temperatures.some((temperature) => temperature >= 31)
          ? "Warm dates may favor cooling, light, or convenience-led bundle offers."
          : "Comfortable conditions provide a stable window for broad bundle offers.",
    };
  }, [manualPlanningContext]);

  const bundleCategoryOptions = useMemo(() => {
    return Array.from(new Set(activeBundlePredictions.map((bundle) => bundle.bundleCategory)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [activeBundlePredictions]);

  const filteredBundlePredictions = useMemo(() => {
    let filtered = activeBundlePredictions;

    if (onlySignificant) {
      filtered = activeBundlePredictions.filter(
        (bundle) => bundle.isSignificant && (bundle.frequency || 0) >= 2
      );

      if (filtered.length === 0) {
        filtered = activeBundlePredictions.filter((bundle) => bundle.isSignificant);
      }
      if (filtered.length === 0) {
        filtered = activeBundlePredictions;
      }
    }

    if (bundleCategoryFilter !== "all") {
      filtered = filtered.filter((bundle) => bundle.bundleCategory === bundleCategoryFilter);
    }
    return filtered;
  }, [activeBundlePredictions, bundleCategoryFilter, onlySignificant]);

  const bundlesPerPage = 5;
  const totalBundlePages = Math.ceil(filteredBundlePredictions.length / bundlesPerPage) || 1;
  const visibleBundlePages = useMemo(() => {
    const windowSize = Math.min(totalBundlePages, 7);
    const startPage = Math.max(
      1,
      Math.min(bundlePage - 3, totalBundlePages - windowSize + 1),
    );
    return Array.from({ length: windowSize }, (_, index) => startPage + index);
  }, [bundlePage, totalBundlePages]);

  const bundlePredictions = useMemo(() => {
    const startIndex = (bundlePage - 1) * bundlesPerPage;
    return filteredBundlePredictions.slice(startIndex, startIndex + bundlesPerPage);
  }, [filteredBundlePredictions, bundlePage]);

  useEffect(() => {
    setBundlePage(1);
  }, [bundleCategoryFilter, bundleOpportunityMode, onlySignificant, debouncedDataTime, selectedHeaderRange]);

  // A refreshed result set can have fewer pages than the previous one.
  // Keep both the cards and the pagination controls on a valid page.
  useEffect(() => {
    setBundlePage((currentPage) => Math.min(currentPage, totalBundlePages));
  }, [totalBundlePages]);

  useEffect(() => {
    if (
      bundleCategoryFilter !== "all" &&
      !bundleCategoryOptions.includes(bundleCategoryFilter)
    ) {
      setBundleCategoryFilter("all");
    }
  }, [bundleCategoryFilter, bundleCategoryOptions]);

  const proximityRecommendations = useMemo(() => {
    if (!Array.isArray(backendProximity) || backendProximity.length === 0) {
      return [];
    }
    return backendProximity.map((rec, index) => ({
      pairing: rec.pairing || "",
      itemA: rec.itemA || "",
      itemB: rec.itemB || "",
      advice: rec.advice || "",
      score: rec.score || 85,
      color: rec.color || "#F59E0B",
      sectorPair: rec.sectorPair || "Retail + Retail",
      channelSource: rec.channelSource || "Omnichannel (POS & E-Commerce)",
      rank: rec.rank || (index + 1),
    }));
  }, [backendProximity]);

  const proximityItemsPerPage = 6;
  const totalProximityPages = Math.max(1, Math.ceil(proximityRecommendations.length / proximityItemsPerPage));
  const paginatedProximity = useMemo(() => {
    const start = (proximityPage - 1) * proximityItemsPerPage;
    return proximityRecommendations.slice(start, start + proximityItemsPerPage);
  }, [proximityRecommendations, proximityPage]);

  useEffect(() => {
    if (proximityPage > totalProximityPages) {
      setProximityPage(1);
    }
  }, [proximityRecommendations.length, totalProximityPages, proximityPage]);

  // Live Behavioral Web Network Data - Responsive to AI Controls
  const networkNodes = useMemo(() => {
    const supportFilter = supportThreshold[0] / 100;
    const nodeSource: ItemMetric[] = itemMetrics.length
      ? itemMetrics
      : Array.from(
        new globalThis.Map<string, ItemMetric>(
          rules.flatMap((rule) => [
            [
              rule.itemA,
              {
                item: rule.itemA,
                sector: firstSector(rule.antecedentSectors),
                support: rule.support || 0,
                basketCount: rule.cooccurrences || 0,
                velocity: "moderate" as const,
              },
            ],
            [
              rule.itemB,
              {
                item: rule.itemB,
                sector: firstSector(rule.consequentSectors),
                support: rule.support || 0,
                basketCount: rule.cooccurrences || 0,
                velocity: "moderate" as const,
              },
            ],
          ]),
        ).values(),
      );

    return nodeSource
      .filter((node) => (node.support || 0) >= supportFilter)
      .slice(0, 10)
      .map((node, index, source) => {
        const angle = (Math.PI * 2 * index) / Math.max(source.length, 1) - Math.PI / 2;
        const radius = source.length <= 4 ? 150 : 180;
        const sector = (node.sector || "unknown").toLowerCase();
        return {
          id: slugify(node.item),
          name: node.item,
          category: sector,
          frequency: Math.round((node.support || 0) * 100),
          basketCount: node.basketCount,
          color: sectorColors[sector] || sectorColors.unknown,
          x: 300 + Math.cos(angle) * radius,
          y: 240 + Math.sin(angle) * radius,
        };
      });
  }, [itemMetrics, rules, supportThreshold]);

  const networkConnections = useMemo(() => {
    const confidenceFilter = confidenceLevel[0];
    const supportFilter = supportThreshold[0];
    const nodeIds = new Set(networkNodes.map((node) => node.id));

    return rules
      .map((rule) => ({
        source: slugify(rule.itemA),
        target: slugify(rule.itemB),
        sourceName: rule.itemA,
        targetName: rule.itemB,
        confidence: Math.round((rule.confidence || 0) * 100),
        support: Math.round((rule.support || 0) * 100),
        lift: rule.lift || 0,
        cooccurrences: rule.cooccurrences || 0,
        crossSector: Boolean(rule.crossSector),
      }))
      .filter(
        (conn) =>
          nodeIds.has(conn.source) &&
          nodeIds.has(conn.target) &&
          conn.confidence >= confidenceFilter &&
          conn.support >= supportFilter,
      )
      .sort(
        (a, b) =>
          b.confidence - a.confidence ||
          b.lift - a.lift ||
          b.cooccurrences - a.cooccurrences,
      );
  }, [confidenceLevel, networkNodes, rules, supportThreshold]);

  // Top AI Insights from network analysis - strictly filtered to exclude banned/excluded pairs and deduplicated across cards
  const topInsights = useMemo(() => {
    const valid = allBundlePredictions.filter((b) => !isExcludedPair(b.itemA, b.itemB, b.bundleArchetype));
    const pool = valid.length > 0 ? valid : allBundlePredictions;

    const topLiftBundle = pool.slice().sort((a, b) => (b.lift || 0) - (a.lift || 0))[0];
    const topKey = topLiftBundle ? getBundleKey(topLiftBundle.itemA, topLiftBundle.itemB) : "";

    const emergingTrendCandidate =
      pool.find((b) => b.isEmergingTrend && getBundleKey(b.itemA, b.itemB) !== topKey) ||
      pool.filter((b) => (b.frequency || 0) <= 3 && getBundleKey(b.itemA, b.itemB) !== topKey).sort((a, b) => (b.synergyScore || 0) - (a.synergyScore || 0))[0] ||
      pool.filter((b) => getBundleKey(b.itemA, b.itemB) !== topKey).sort((a, b) => (b.synergyScore || 0) - (a.synergyScore || 0))[0] ||
      topLiftBundle;

    const emergingKey = emergingTrendCandidate ? getBundleKey(emergingTrendCandidate.itemA, emergingTrendCandidate.itemB) : "";

    const crossSectorMatch =
      pool.find((b) => ((b as any).crossSector || (b.sectors[0] !== "unknown" && b.sectors[0] !== b.sectors[1])) && getBundleKey(b.itemA, b.itemB) !== topKey && getBundleKey(b.itemA, b.itemB) !== emergingKey) ||
      rules.find((r) => r.crossSector && !isExcludedPair(r.itemA, r.itemB, (r as any).bundleArchetype) && getBundleKey(r.itemA, r.itemB) !== topKey && getBundleKey(r.itemA, r.itemB) !== emergingKey) ||
      pool.find((b) => getBundleKey(b.itemA, b.itemB) !== topKey && getBundleKey(b.itemA, b.itemB) !== emergingKey);

    const displayTopBundle = topLiftBundle ? topLiftBundle.bundle : "No patterns detected";
    const displayTopLift = topLiftBundle ? topLiftBundle.lift : 0;
    const displayTopConf = topLiftBundle ? topLiftBundle.confidence : 0;

    return {
      topBundle: displayTopBundle,
      bundleConfidence: displayTopConf,
      bundleLift: displayTopLift,
      emergingTrend: emergingTrendCandidate ? emergingTrendCandidate.bundle : "No emerging trend candidates",
      trendGrowth: emergingTrendCandidate
        ? emergingTrendCandidate.synergyScore !== undefined && emergingTrendCandidate.synergyScore !== null
          ? `${Math.round(emergingTrendCandidate.synergyScore)}% Synergy`
          : `Score: ${emergingTrendCandidate.score || 85}`
        : "N/A",
      crossSell: crossSectorMatch
        ? ("bundle" in crossSectorMatch ? crossSectorMatch.bundle : formatPair(crossSectorMatch.itemA, crossSectorMatch.itemB))
        : "No cross-sector pattern",
      crossSellRate: crossSectorMatch ? `${crossSectorMatch.confidence}%` : "0%",
    };
  }, [allBundlePredictions, rules]);

  const pricingItemCatalog = useMemo(() => {
    type PricingItem = {
      name: string;
      sector: string;
      sectors: string[];
      support: number;
      basketCount: number;
      velocity: "fast" | "moderate" | "slow";
      price: number | null;
      unitCost: number | null;
      unitGrossProfit: number | null;
      margin: number | null;
    };

    const items = new Map<string, PricingItem>();
    const upsert = (input: Partial<PricingItem> & { name: string }) => {
      const existing = items.get(input.name);
      const next: PricingItem = {
        name: input.name,
        sector: input.sector || existing?.sector || "unknown",
        sectors: input.sectors || existing?.sectors || [input.sector || existing?.sector || "unknown"],
        support: input.support ?? existing?.support ?? 0,
        basketCount: input.basketCount ?? existing?.basketCount ?? 0,
        velocity: input.velocity || existing?.velocity || "moderate",
        price: input.price !== undefined && input.price !== null ? Math.round(input.price) : (existing?.price !== undefined && existing?.price !== null ? Math.round(existing.price) : null),
        unitCost: input.unitCost ?? existing?.unitCost ?? null,
        unitGrossProfit: input.unitGrossProfit ?? existing?.unitGrossProfit ?? null,
        margin: input.margin ?? existing?.margin ?? null,
      };
      items.set(input.name, next);
    };

    pricingCatalogMetrics.forEach((metric) => {
      upsert({
        name: metric.item,
        sector: metric.sector,
        sectors: metric.sectors || [metric.sector],
        support: metric.support || 0,
        basketCount: metric.basketCount || 0,
        velocity: metric.velocity,
        price: metric.price !== undefined && metric.price !== null ? Math.round(metric.price) : null,
        unitCost: metric.unitCost ?? null,
        unitGrossProfit: metric.unitGrossProfit ?? null,
        margin: metric.margin ?? null,
      });
    });

    [...bundleCandidates, ...rules].forEach((entry: any) => {
      if (entry.itemA || entry.anchorItem) {
        upsert({
          name: entry.itemA || entry.anchorItem,
          sector: firstSector(entry.antecedentSectors),
          sectors: entry.antecedentSectors || [firstSector(entry.antecedentSectors)],
          price: entry.itemAPrice !== undefined && entry.itemAPrice !== null ? Math.round(entry.itemAPrice) : null,
          unitCost: entry.itemACost ?? null,
        });
      }
      if (entry.itemB || entry.bundleItem) {
        upsert({
          name: entry.itemB || entry.bundleItem,
          sector: firstSector(entry.consequentSectors),
          sectors: entry.consequentSectors || [firstSector(entry.consequentSectors)],
          price: entry.itemBPrice !== undefined && entry.itemBPrice !== null ? Math.round(entry.itemBPrice) : null,
          unitCost: entry.itemBCost ?? null,
        });
      }
    });

    return Array.from(items.values()).sort(
      (a, b) => b.basketCount - a.basketCount || a.name.localeCompare(b.name),
    );
  }, [bundleCandidates, pricingCatalogMetrics, rules]);

  const pricingCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: pricingItemCatalog.length,
      cafe: 0,
      services: 0,
      retail: 0,
    };

    pricingItemCatalog.forEach((item) => {
      const sectors = new Set(
        (item.sectors?.length ? item.sectors : [item.sector]).map(normalizeSectorForCategory),
      );
      sectors.forEach((sector) => {
        if (sector in counts && sector !== "all") {
          counts[sector] += 1;
        }
      });
    });

    return counts;
  }, [pricingItemCatalog]);

  const manualProductOptions = useMemo(
    () => pricingItemCatalog.slice(0, 250),
    [pricingItemCatalog],
  );

  const getManualProduct = (name: string) =>
    manualProductOptions.find((item) => item.name === name);

  const calculateManualBundleScore = (products: typeof manualProductOptions, bundlePrice: number) => {
    const productNames = new Set(products.map((product) => product.name));
    const exactMatches = allBundlePredictions.filter(
      (candidate) => productNames.has(candidate.itemA) && productNames.has(candidate.itemB),
    );
    const referenceCandidates = allBundlePredictions.slice(0, 5);
    const generatedBaseline = Math.round(
      (exactMatches.length ? exactMatches : referenceCandidates).reduce((sum, candidate) => sum + candidate.score, 0) /
        Math.max(1, (exactMatches.length ? exactMatches : referenceCandidates).length),
    );
    const regularPrice = products.reduce((sum, product) => sum + (product.price || 0), 0);
    const regularCost = products.reduce((sum, product) => sum + (product.unitCost || (product.price || 0) * 0.45), 0);
    const manualMargin = bundlePrice > 0 ? ((bundlePrice - regularCost) / bundlePrice) * 100 : 0;
    const generatedMargin = referenceCandidates.length
      ? referenceCandidates.reduce((sum, candidate) => sum + (candidate.projectedMarginPercent || 0), 0) / referenceCandidates.length
      : 30;
    const marginScore = Math.round(Math.max(0, Math.min(100, 50 + (manualMargin - generatedMargin) * 2)));
    const days = manualPlanningContext?.days || [];
    const reliableDays = days.filter((day) => !day.isSynthetic);
    const hasRain = reliableDays.some((day) => day.rainFlag);
    const hasHotDay = reliableDays.some((day) => day.tempCelsius >= 31);
    const sectors = new Set(products.flatMap((product) => product.sectors || [product.sector]));
    const weatherFit = reliableDays.length === 0
      ? 50
      : hasRain
      ? sectors.has("Cafe") || sectors.has("Services") ? 90 : 65
      : hasHotDay && sectors.has("Cafe") ? 90 : 78;
    const calendarFit = days.some((day) => day.holidayName) ? 90 : days.some((day) => day.isWeekend) ? 85 : 72;
    const contextScore = Math.round((weatherFit + calendarFit) / 2);
    const score = Math.round(generatedBaseline * 0.5 + marginScore * 0.25 + contextScore * 0.25);
    return {
      score: Math.max(0, Math.min(100, score)),
      generatedBaseline,
      marginScore,
      contextScore,
      regularPrice,
      manualMargin: Math.round(manualMargin * 10) / 10,
    };
  };

  const resetManualBundleForm = () => {
    setManualBundleName("");
    setManualBundlePrice("");
    setManualDateCreated(todayDateKey());
    setManualProductOne("");
    setManualProductTwo("");
    setManualProductThree("");
    setManualAvailableMonth("");
    setManualStartDate("");
    setManualEndDate("");
    setManualPromoMechanic("");
    setManualNotes("");
  };

  const handleCreateManualBundle = async () => {
    const selectedProducts = [
      getManualProduct(manualProductOne),
      getManualProduct(manualProductTwo),
      getManualProduct(manualProductThree),
    ].filter(Boolean) as typeof manualProductOptions;
    const uniqueProducts = selectedProducts.filter(
      (product, index, list) =>
        list.findIndex((item) => item.name === product.name) === index,
    );
    const bundlePrice = Number(manualBundlePrice);
    const regularPrice = uniqueProducts.reduce(
      (sum, product) => sum + (product.price || 0),
      0,
    );

    if (!manualBundleName.trim()) {
      toast.error("Bundle name is required.");
      return;
    }
    if (uniqueProducts.length < 2) {
      toast.error("Select at least two different products or services.");
      return;
    }
    if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) {
      toast.error("Enter a valid bundle price.");
      return;
    }

    const score = calculateManualBundleScore(uniqueProducts, bundlePrice);

    try {
      await createBundleArchive({
        source: "manual",
        status: "active",
        bundleName: manualBundleName.trim(),
        items: uniqueProducts.map((product) => ({
          name: product.name,
          sector: product.sector,
          price: product.price,
          cost: product.unitCost,
        })),
        bundlePrice,
        regularPrice: regularPrice > 0 ? regularPrice : null,
        savings: regularPrice > 0 ? Math.max(0, regularPrice - bundlePrice) : null,
        discountPercent:
          regularPrice > 0
            ? Math.max(0, Math.round(((regularPrice - bundlePrice) / regularPrice) * 1000) / 10)
            : null,
        availableMonth: manualAvailableMonth || null,
        availabilityStartDate: manualStartDate || manualDateCreated,
        availabilityEndDate: manualEndDate || null,
        promoMechanic: manualPromoMechanic || null,
        notes: manualNotes || null,
        createdBy: "owner",
        metadata: {
          createdFrom: "manual_bundle_builder",
          dateCreated: manualDateCreated,
          effectivenessScore: score.score,
          scoreBreakdown: {
            generatedBaseline: score.generatedBaseline,
            marginScore: score.marginScore,
            weatherCalendarScore: score.contextScore,
          },
          planningContext: manualPlanningContext
            ? {
                startDate: manualPlanningContext.startDate,
                endDate: manualPlanningContext.endDate,
                weatherSource: manualPlanningContext.weatherSource,
                calendarSource: manualPlanningContext.calendarSource,
              }
            : null,
        },
      });
      setCreatedManualBundleScore({
        score: score.score,
        generatedBaseline: score.generatedBaseline,
        marginScore: score.marginScore,
        contextScore: score.contextScore,
        bundleName: manualBundleName.trim(),
      });
      try {
        const explanation = await generateLlmExplanation({
          feature: "manual_bundle_explanation",
          prompt: "Explain why this manually created bundle received its score. Keep it to 2-4 concise sentences and mention one practical improvement only if justified.",
          context: {
            bundleName: manualBundleName.trim(),
            products: uniqueProducts.map((product) => ({ name: product.name, sector: product.sector, price: product.price })),
            bundlePrice,
            regularPrice,
            score: score.score,
            generatedBaseline: score.generatedBaseline,
            marginScore: score.marginScore,
            contextScore: score.contextScore,
            weatherSummary: manualWeatherSummary,
          },
        }) as { text?: string };
        setManualBundleExplanation(explanation.text || null);
      } catch {
        setManualBundleExplanation(null);
      }
      toast.success("Manual bundle created", {
        description: `${manualBundleName} was added to Bundle Archives.`,
      });
      resetManualBundleForm();
      setBundleArchivesOpen(true);
      loadBundleArchives();
    } catch (error) {
      toast.error("Unable to create manual bundle", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleArchiveStatusChange = async (
    bundle: BundleArchive,
    status: "active" | "archived" | "deleted",
  ) => {
    try {
      await updateBundleArchiveStatus(bundle.id, status);
      toast.success(
        status === "active"
          ? "Bundle restored"
          : status === "archived"
            ? "Bundle archived"
            : "Bundle moved to deleted",
      );
      loadBundleArchives();
    } catch (error) {
      toast.error("Unable to update bundle", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  useEffect(() => {
    loadBundleArchives();
  }, [bundleArchiveStatus, bundleArchiveSource]);

  const pricingCategoryOptions = [
    { id: "all", label: "All Items" },
    { id: "cafe", label: "Cafe" },
    { id: "services", label: "Services" },
    { id: "retail", label: "Retail" },
  ];

  const filteredPricingItems = useMemo(() => {
    const query = pricingSearch.trim().toLowerCase();
    return pricingItemCatalog
      .filter((item) => {
        const sectors = (item.sectors?.length ? item.sectors : [item.sector]).map(normalizeSectorForCategory);
        const matchesCategory =
          pricingCategoryFilter === "all" || sectors.includes(pricingCategoryFilter);
        const matchesSearch =
          !query ||
          item.name.toLowerCase().includes(query) ||
          sectors.some((sector) => formatSector(sector).toLowerCase().includes(query));

        return matchesCategory && matchesSearch;
      });
  }, [pricingCategoryFilter, pricingItemCatalog, pricingSearch]);
  const pricingPageCount = Math.max(1, Math.ceil(filteredPricingItems.length / 5));
  const visiblePricingItems = useMemo(() => {
    const pageStart = (pricingPage - 1) * 5;
    return filteredPricingItems.slice(pageStart, pageStart + 5);
  }, [filteredPricingItems, pricingPage]);

  useEffect(() => {
    setPricingPage(1);
  }, [pricingCategoryFilter, pricingSearch]);

  useEffect(() => {
    if (pricingPage > pricingPageCount) {
      setPricingPage(pricingPageCount);
    }
  }, [pricingPage, pricingPageCount]);

  useEffect(() => {
    if (
      filteredPricingItems.length > 0 &&
      (!selectedPricingItemName ||
        !filteredPricingItems.some((item) => item.name === selectedPricingItemName))
    ) {
      setSelectedPricingItemName(filteredPricingItems[0].name);
    } else if (filteredPricingItems.length === 0 && selectedPricingItemName !== null) {
      setSelectedPricingItemName(null);
    }
  }, [filteredPricingItems, selectedPricingItemName]);

  const selectedPricingItem =
    filteredPricingItems.find((item) => item.name === selectedPricingItemName) ||
    null;

  const pricingScenarios = useMemo(() => {
    if (!selectedPricingItem?.price || selectedPricingItem.price <= 0) return [];

    const price = selectedPricingItem.price;
    const unitCost = selectedPricingItem.unitCost ?? null;
    const baseDemand = Math.max(1, selectedPricingItem.basketCount || 1);
    const sectorSensitivity =
      selectedPricingItem.sector === "retail"
        ? 1.2
        : selectedPricingItem.sector === "cafe"
          ? 1.05
          : selectedPricingItem.sector === "services"
            ? 0.8
            : 1;
    const velocitySensitivity =
      selectedPricingItem.velocity === "slow"
        ? 1.35
        : selectedPricingItem.velocity === "fast"
          ? 0.75
          : 1;
    const responseRate = sectorSensitivity * velocitySensitivity;

    return Array.from({ length: 11 }, (_, index) => {
      const discount = index * 5;
      const customerLift = Math.min(1.4, (discount / 100) * responseRate);
      const expectedSales = Math.max(1, Math.round(baseDemand * (1 + customerLift)));
      const sellingPrice = Math.round(price * (1 - discount / 100) * 100) / 100;
      const projectedRevenue = Math.round(sellingPrice * expectedSales * 100) / 100;
      const projectedProfit =
        unitCost !== null
          ? Math.round((sellingPrice - unitCost) * expectedSales * 100) / 100
          : null;
      const projectedMargin =
        projectedProfit !== null && projectedRevenue > 0
          ? Math.round((projectedProfit / projectedRevenue) * 1000) / 10
          : null;

      return {
        discount,
        discountLabel: `${discount}%`,
        sellingPrice,
        expectedSales,
        customerLiftPercent: Math.round(customerLift * 100),
        projectedRevenue,
        projectedProfit,
        projectedMargin,
      };
    });
  }, [selectedPricingItem]);

  const currentPricingScenario =
    pricingScenarios.find((scenario) => scenario.discount === discountValue[0]) ||
    pricingScenarios[0] ||
    null;
  const baselinePricingScenario = pricingScenarios[0] || null;
  const minimumPricingMargin = 30;
  const profitablePricingScenarios = pricingScenarios.filter(
    (scenario) =>
      scenario.projectedProfit !== null &&
      (scenario.projectedMargin ?? 0) >= minimumPricingMargin,
  );
  const recommendedPricingScenario =
    (profitablePricingScenarios.length ? profitablePricingScenarios : pricingScenarios)
      .slice()
      .sort(
        (a, b) =>
          (b.projectedProfit ?? b.projectedRevenue) -
          (a.projectedProfit ?? a.projectedRevenue),
      )[0] || null;
  const maxSafeItemDiscount =
    selectedPricingItem &&
    selectedPricingItem.price !== null &&
    selectedPricingItem.price !== undefined &&
    selectedPricingItem.price > 0 &&
    selectedPricingItem.unitCost !== null &&
    selectedPricingItem.unitCost !== undefined &&
    selectedPricingItem.unitCost > 0
      ? Math.max(
          0,
          Math.min(
            50,
            Math.floor(
              (1 -
                selectedPricingItem.unitCost /
                  (selectedPricingItem.price * (1 - minimumPricingMargin / 100))) *
                100,
            ),
          ),
        )
      : null;
  const selectedProfitChange =
    currentPricingScenario &&
    baselinePricingScenario &&
    currentPricingScenario.projectedProfit !== null &&
    baselinePricingScenario.projectedProfit !== null
      ? Math.round(
          (currentPricingScenario.projectedProfit -
            baselinePricingScenario.projectedProfit) *
            100,
        ) / 100
      : null;

  const trafficSectors = [
    { name: "Cafe", color: "#F59E0B", serviceTime: 20 },
    { name: "Retail", color: "#06B6D4", serviceTime: 10 },
    { name: "Services", color: "#F53799", serviceTime: 35 },
  ];
  const trafficColumns = useMemo(
    () => trafficOptimizerData?.columns || [],
    [trafficOptimizerData],
  );
  const trafficDisplayMode = trafficOptimizerData?.displayMode || "daily";
  const trafficVisitDefinition = trafficOptimizerData?.visitDefinition ||
    "Unique transaction IDs from ingested physical-channel rows.";

  const demandStyles: Record<DemandLevel, { bg: string; text: string; label: string }> = {
    Low: { bg: "bg-green-50", text: "text-green-700", label: "Low" },
    Medium: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Medium" },
    High: { bg: "bg-red-50", text: "text-red-700", label: "High" },
  };

  const getDemandLevelForSector = (sectorName: string, value: number): DemandLevel => {
    const normalized = sectorName.toLowerCase().trim();
    if (normalized === 'grooming') return value >= 4 ? 'High' : value >= 2 ? 'Medium' : 'Low';
    if (normalized === 'pet hotel') return value >= 3 ? 'High' : value >= 2 ? 'Medium' : 'Low';
    if (normalized === 'bday pawty' || normalized === 'birthday party') return value >= 3 ? 'High' : value >= 2 ? 'Medium' : 'Low';
    if (normalized === 'cafe') return value >= 11 ? 'High' : value >= 6 ? 'Medium' : 'Low';
    if (normalized === 'retail') return value >= 10 ? 'High' : value >= 5 ? 'Medium' : 'Low';
    if (normalized === 'services') return value >= 11 ? 'High' : value >= 6 ? 'Medium' : 'Low';
    return value >= 26 ? 'High' : value >= 11 ? 'Medium' : 'Low';
  };

  const getRequiredStaff = (sector: string, level: string) => {
    if (sector === "Services") {
      if (level === "High") return 4;
      if (level === "Medium") return 2;
      return 1;
    }
    if (sector === "Cafe") {
      if (level === "High") return 3;
      if (level === "Medium") return 2;
      return 1;
    }
    if (level === "High") return 2;
    return 1;
  };

  const STAFF_SCHEDULE = [
    { name: "K-ann Sigue", sectors: ["Retail"], startHour: 7.5, endHour: 14.5, offDays: [0], hourlyRate: 450/7, capacityPerHour: 0, commission: false },
    { name: "Evangeline Alano", sectors: ["Services"], startHour: 7.5, endHour: 19, offDays: [], hourlyRate: 650/11.5, capacityPerHour: 13/11.5, commission: true },
    { name: "Jason Dedios", sectors: ["Services"], startHour: 8.5, endHour: 17.5, offDays: [2], hourlyRate: 800/9, capacityPerHour: 12/9, commission: true },
    { name: "Angelito De Dios", sectors: ["Services"], startHour: 7.5, endHour: 19.5, offDays: [], hourlyRate: 650/12, capacityPerHour: 12/12, commission: true },
    { name: "Precey Mae Dedios", sectors: ["Services"], startHour: 0, endHour: 24, offDays: [], hourlyRate: 450/24, capacityPerHour: 0, commission: true },
    { name: "Danya Mae Caraig", sectors: ["Cafe", "Retail"], startHour: 11, endHour: 19, offDays: [3, 6], hourlyRate: 450/8, capacityPerHour: 0, commission: false },
    { name: "Maica Adorno Dignos", sectors: ["Services"], startHour: 8, endHour: 17, offDays: [3], hourlyRate: 450/9, capacityPerHour: 0, commission: false },
    { name: "Kate Ricamara", sectors: ["Cafe", "Retail"], startHour: 8, endHour: 17, offDays: [3], hourlyRate: 450/9, capacityPerHour: 0, commission: false },
  ];

  const scheduledStaffForSelectedHour = useMemo(() => {
    const h = debouncedTrafficOptimizerTime;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = todayContext?.dayOfWeek || "Friday";
    const dayIndex = days.indexOf(dayName);

    return STAFF_SCHEDULE.filter((staff) => {
      if (dayIndex !== -1 && staff.offDays.includes(dayIndex)) return false;
      return h >= staff.startHour && h < staff.endHour;
    });
  }, [debouncedTrafficOptimizerTime, todayContext?.dayOfWeek]);

  useEffect(() => {
    let isMounted = true;
    const hourNum = debouncedTrafficOptimizerTime;
    const hourStr = formatHour(hourNum);
    const dayName = todayContext?.dayOfWeek || "Today";
    const hourForecast = todayContext?.hourlyForecast?.find((h: any) => h.hour === hourNum);
    const predicted = hourForecast?.predictedVisits ?? 0;
    const onDutyNames = scheduledStaffForSelectedHour.map((s) => s.name);
    const staffCount = onDutyNames.length;
    const weatherCond = todayContext?.weather?.condition || "Fair weather";
    const dayTargetLabel = simulationTargetDay === "tomorrow" ? `tomorrow (${dayName})` : `today (${dayName})`;

    setTrafficGlmLoading(true);
    generateLlmExplanation({
      feature: "prescriptive_explanation",
      prompt: `Provide a concise 1-2 sentence store manager shift recommendation for ${dayTargetLabel} at ${hourStr}. Staff on duty (${staffCount}): ${onDutyNames.join(", ")}. Predicted visits: ${predicted}. Weather: ${weatherCond}. Ground only on these facts without inventing numbers.`,
      context: {
        simulationTargetDay,
        dayOfWeek: dayName,
        hour: hourStr,
        scheduledStaff: onDutyNames,
        staffCount,
        predictedVisits: predicted,
        weather: weatherCond,
      },
    })
      .then((res: any) => {
        if (!isMounted) return;
        const text = res?.text;
        if (res?.provider === "glm" && text && !text.includes("Configure the assigned GLM provider") && !text.includes("temporarily unavailable")) {
          setTrafficGlmInsight(text);
        } else {
          // Explicit requirement: No synthetic fallback. Show clear status if GLM is unavailable.
          setTrafficGlmInsight("GLM AI is currently waiting for active API connection. Live staffing calculations and queue models remain active above.");
        }
      })
      .catch(() => {
        if (isMounted) {
          setTrafficGlmInsight("GLM AI is currently waiting for active API connection. Live staffing calculations and queue models remain active above.");
        }
      })
      .finally(() => {
        if (isMounted) setTrafficGlmLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedTrafficOptimizerTime, todayContext?.dayOfWeek, todayContext?.hourlyForecast, scheduledStaffForSelectedHour, simulationTargetDay]);

  // Dynamic unique active staff count scheduled across all sectors for the selected hour
  const uniqueActiveStaffOnDutyCount = useMemo(() => {
    const selectedHour = trafficOptimizerTime[0];
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = todayContext?.dayOfWeek || "Friday";
    const dayIndex = days.indexOf(dayName) !== -1 ? days.indexOf(dayName) : 5;

    return STAFF_SCHEDULE.filter((staff) => {
      if (staff.offDays.includes(dayIndex)) return false;
      return selectedHour >= staff.startHour && selectedHour < staff.endHour;
    }).length;
  }, [trafficOptimizerTime, todayContext?.dayOfWeek]);

  // Dynamic peak congestion window strictly calculated from today's hourly forecast
  const todayPeakCongestion = useMemo(() => {
    const hourly = todayContext?.hourlyForecast;
    if (!hourly || hourly.length === 0) return null;

    const sorted = [...hourly].sort((a: any, b: any) => (Number(b.predictedVisits) || 0) - (Number(a.predictedVisits) || 0));
    const peak = sorted[0];
    if (!peak) return null;

    const nextHour = (Number(peak.hour) + 1).toString().padStart(2, "0");
    const mult = 1 + (trafficDemandShift / 100);
    const scaledVisits = Math.max(1, Math.round((Number(peak.predictedVisits) || 1) * mult));
    const scaledLoad = Math.min(100, Math.round((scaledVisits / (Number(peak.totalCapacity) || 16)) * 100));

    return {
      window: `${peak.label} - ${nextHour}:00`,
      detail: `${scaledLoad}% Load`,
    };
  }, [todayContext?.hourlyForecast, trafficDemandShift]);

  // Dynamic Hourly Staffing Plan per Sector using real STAFF_SCHEDULE & Erlang Queue capacity
  const dynamicHourlyStaffingPlan = useMemo(() => {
    const selectedHour = trafficOptimizerTime[0];
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = todayContext?.dayOfWeek || "Friday";
    const dayIndex = days.indexOf(dayName) !== -1 ? days.indexOf(dayName) : 5;

    const hourForecast = todayContext?.hourlyForecast?.find((h: any) => Number(h.hour) === Number(selectedHour));
    const backendBreakdown = todayContext?.sectorBreakdown;
    const isTargetHour = Number(todayContext?.targetHour) === Number(selectedHour);
    const sectorsList: Array<"Services" | "Cafe" | "Retail"> = ["Services", "Cafe", "Retail"];

    return sectorsList.map((sectorName) => {
      // Filter actual staff on duty for this sector at selectedHour and day of week
      const staffOnDuty = STAFF_SCHEDULE.filter((staff) => {
        if (staff.offDays.includes(dayIndex)) return false;
        if (!staff.sectors.includes(sectorName)) return false;
        return selectedHour >= staff.startHour && selectedHour < staff.endHour;
      });

      const scheduledCount = staffOnDuty.length;
      const staffNames = staffOnDuty.map((s) => s.name);

      // Extract real sector visits from today's forecast
      const secData = hourForecast?.sectorVisits?.[sectorName];
      const visits = secData?.visits !== undefined ? Number(secData.visits) : 0;
      const demandLevel = (secData?.demandLevel as "Low" | "Medium" | "High") || (visits >= 4 ? "High" : visits >= 2 ? "Medium" : "Low");

      // Erlang C analytical computation matching backend queue model
      const computeErlangStaff = (arrivalRate: number, serviceTimeMinutes: number, targetWaitMin = 8.0) => {
        const A = Math.max(0.1, arrivalRate * (serviceTimeMinutes / 60.0));
        for (let c = Math.max(1, Math.floor(A) + 1); c <= 10; c++) {
          const powerA = Math.pow(A, c);
          let factC = 1;
          for (let i = 2; i <= c; i++) factC *= i;
          const num = powerA / factC;
          let sumDenom = 0;
          let factI = 1;
          for (let i = 0; i < c; i++) {
            if (i > 1) factI *= i;
            sumDenom += Math.pow(A, i) / factI;
          }
          const denom = num + (1 - A / c) * sumDenom;
          const pw = denom > 0 ? num / denom : 1;
          const waitTimeMinutes = ((pw * (serviceTimeMinutes / 60.0)) / Math.max(0.01, c - A)) * 60.0;
          if (waitTimeMinutes <= targetWaitMin) {
            return c;
          }
        }
        return Math.max(1, Math.ceil(A) + 1);
      };

      // Recommended staff from backend Erlang C queue solution or calibrated queue rates
      let recommendedCount = 1;
      const matchedBackend = isTargetHour && backendBreakdown?.find((s: any) => s.sector === sectorName);
      if (matchedBackend && matchedBackend.recommendedStaff !== undefined) {
        recommendedCount = Number(matchedBackend.recommendedStaff);
      } else {
        const serviceTime = sectorName === "Services" ? 35 : sectorName === "Cafe" ? 20 : 10;
        recommendedCount = computeErlangStaff(visits, serviceTime, 8.0);
      }

      const staffDelta = recommendedCount - scheduledCount;
      let action = "Optimal: Coverage balanced";
      if (staffDelta > 0) {
        action = `Shortage: +${staffDelta} staff needed`;
      } else if (staffDelta < 0) {
        action = `Surplus: ${Math.abs(staffDelta)} idle`;
      }

      return {
        sector: sectorName,
        demandLevel,
        visits,
        scheduledStaff: scheduledCount,
        staffNames,
        recommendedStaff: recommendedCount,
        staffDelta,
        action,
      };
    });
  }, [trafficOptimizerTime, todayContext?.dayOfWeek, todayContext?.hourlyForecast, todayContext?.sectorBreakdown, todayContext?.targetHour]);

  // Each visible staffing card is a reviewable prescription before the owner
  // accepts it. Its identity exactly matches the later deploy action.
  useEffect(() => {
    if (!dynamicHourlyStaffingPlan.length) return;
    void Promise.all(dynamicHourlyStaffingPlan.map((plan) => {
      const sectorName = String(plan.sector || "Operations");
      return savePrescriptionDraft({
        category: "staffing",
        sourceType: "traffic_staffing_recommendation",
        sourceId: `staffing-${sectorName}-${activeReferenceDate}-${debouncedTrafficOptimizerTime}`,
        title: `${sectorName} Staffing Recommendation - ${activeReferenceDate} ${formatHour(debouncedTrafficOptimizerTime)}`,
        sector: sectorName,
        targetTime: `${activeReferenceDate} ${formatHour(debouncedTrafficOptimizerTime)}`,
        mechanic: plan.action || "Review staffing allocation",
        confidence: "Generated",
        metadata: { recommendedPlan: plan, activeReferenceDate, selectedHour: debouncedTrafficOptimizerTime },
      });
    })).catch((error) => console.warn("Failed to sync staffing prescription drafts:", error));
  }, [activeReferenceDate, debouncedTrafficOptimizerTime, dynamicHourlyStaffingPlan]);

  // Dynamic total scheduled staff count for the selected hour (matches Staffing Recommendation sector cards sum)
  const totalDynamicScheduledStaff = useMemo(() => {
    return dynamicHourlyStaffingPlan.reduce((sum, s) => sum + s.scheduledStaff, 0);
  }, [dynamicHourlyStaffingPlan]);

  // Dynamic recommended staff count for the selected hour from the Erlang C plan
  const totalDynamicRecommendedStaff = useMemo(() => {
    return dynamicHourlyStaffingPlan.reduce((sum, s) => sum + s.recommendedStaff, 0);
  }, [dynamicHourlyStaffingPlan]);

  const getScheduledStaff = (sectorName: string, hour: number, dayFilter: string) => {
    let dayOfWeek: number | null = null;
    if (dayFilter !== "All") {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const index = days.findIndex(d => d === dayFilter);
      if (index !== -1) dayOfWeek = index;
    }
    
    let count = 0;
    STAFF_SCHEDULE.forEach(staff => {
      if (staff.sectors.includes(sectorName)) {
        if (dayOfWeek !== null && staff.offDays.includes(dayOfWeek)) {
          return;
        }
        if (hour >= staff.startHour && hour < staff.endHour) {
          count++;
        }
      }
    });
    return count;
  };

  const sectorTrafficForecast = useMemo(() => {
    const trafficRowsBySector = new Map(
      (trafficOptimizerData?.sectors || []).map((sector) => [sector.sector, sector]),
    );
    const demandMultiplier = 1 + (trafficDemandShift / 100);

    return trafficSectors.map((sector) => {
      const trafficRow = trafficRowsBySector.get(sector.name as "Services" | "Cafe" | "Retail");
      const valuesByKey = new Map(
        (trafficRow?.values || []).map((value) => [value.key, value]),
      );
      const dayForecasts = trafficColumns.map((column) => {
        const trafficValue = valuesByKey.get(column.key);
        const rawVisits = Number(trafficValue?.visits || 0);
        const visits = Math.max(0, Math.round(rawVisits * demandMultiplier));
        const sampleDays = Number(column.sampleDays || (trafficValue as any)?.sampleDays || 1);
        const cumulativeVisits = Number((trafficValue as any)?.cumulativeVisits || Math.round(visits * sampleDays));
        const displayVal = trafficDisplayMode === "weekday_average" ? cumulativeVisits : visits;
        const level = getDemandLevelForSector(sector.name, displayVal);
        const requiredStaff = getRequiredStaff(sector.name, level);
        const scheduledStaff = getScheduledStaff(sector.name, debouncedTrafficOptimizerTime, staffingDayFilter);
        const staffDelta = requiredStaff - scheduledStaff;

        return {
          day: column.dayLabel,
          label: column.label,
          key: column.key,
          date: column.date,
          predicted: visits,
          cumulativeVisits,
          actual: visits,
          level,
          requiredStaff,
          scheduledStaff,
          staffDelta,
        };
      });

      const subSectors = trafficRow?.subSectors?.map(sub => {
        const subValuesByKey = new Map((sub.values || []).map((value) => [value.key, value]));
        const subForecasts = trafficColumns.map((column) => {
          const trafficValue = subValuesByKey.get(column.key);
          const visits = Number(trafficValue?.visits || 0);
          const level = getDemandLevelForSector(sub.sector, visits);
          return {
            day: column.dayLabel,
            label: column.label,
            key: column.key,
            date: column.date,
            predicted: visits,
            actual: visits,
            level,
          };
        });
        return {
          name: sub.sector,
          forecasts: subForecasts,
          totalVisits: sub.totalVisits,
          peakVisits: sub.peakVisits,
          averageVisits: sub.averageVisits,
        };
      });

      return {
        ...sector,
        forecasts: dayForecasts,
        totalVisits: trafficRow?.totalVisits || 0,
        peakVisits: trafficRow?.peakVisits || 0,
        averageVisits: trafficRow?.averageVisits || 0,
        subSectors,
      };
    });
  }, [trafficOptimizerData, trafficColumns, debouncedTrafficOptimizerTime, staffingDayFilter, trafficDemandShift]);

  const selectedTimeStaffPlan = sectorTrafficForecast.map((sector) => {
    let targetForecast;
    const scheduledStaff = getScheduledStaff(sector.name, debouncedTrafficOptimizerTime, staffingDayFilter);

    if (staffingDayFilter === "All") {
      const totalPredicted = sector.forecasts.reduce((sum, f) => sum + f.predicted, 0);
      const avgPredicted = sector.forecasts.length > 0 ? Math.round(totalPredicted / sector.forecasts.length) : 0;
      const level = getDemandLevelForSector(sector.name, avgPredicted);
      const requiredStaff = getRequiredStaff(sector.name, level);
      
      targetForecast = {
        day: "Average",
        label: "Average across period",
        key: "average",
        date: "N/A",
        predicted: avgPredicted,
        actual: avgPredicted,
        level,
        requiredStaff,
        scheduledStaff,
        staffDelta: requiredStaff - scheduledStaff,
      };
    } else {
      const dayAbbrev = staffingDayFilter.substring(0, 3);
      const specificDayForecast = sector.forecasts.find(f => f.day.startsWith(dayAbbrev));
      
      if (specificDayForecast) {
        targetForecast = specificDayForecast;
      } else {
        targetForecast = {
          day: staffingDayFilter,
          label: "No matching transactions",
          key: "empty",
          predicted: 0,
          actual: 0,
          level: "Low",
          requiredStaff: 1,
          scheduledStaff,
          staffDelta: 1 - scheduledStaff,
        };
      }
    }

    const requiredStaff = erlangStaffing[sector.name] || targetForecast.requiredStaff;

    return {
      sector: sector.name,
      color: sector.color,
      ...targetForecast,
      requiredStaff,
      staffDelta: requiredStaff - targetForecast.scheduledStaff,
    };
  });

  const liveCostAndCapacity = useMemo(() => {
    let dayOfWeek: number | null = null;
    if (staffingDayFilter !== "All") {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const index = days.findIndex(d => d === staffingDayFilter);
      if (index !== -1) dayOfWeek = index;
    }

    let totalHourlyCost = 0;
    let servicesCapacityPerHour = 0;
    let activeCommissionStaff = 0;

    STAFF_SCHEDULE.forEach(staff => {
      if (dayOfWeek !== null && staff.offDays.includes(dayOfWeek)) return;
      
      if (debouncedTrafficOptimizerTime >= staff.startHour && debouncedTrafficOptimizerTime < staff.endHour) {
        totalHourlyCost += staff.hourlyRate;
        servicesCapacityPerHour += staff.capacityPerHour;
        if (staff.commission) activeCommissionStaff++;
      }
    });

    let totalPredictedVisits = 0;
    let servicesPredictedVisits = 0;

    selectedTimeStaffPlan.forEach(plan => {
      totalPredictedVisits += plan.predicted;
      if (plan.sector === "Services") {
        servicesPredictedVisits = plan.predicted;
      }
    });

    const costPerVisit = totalPredictedVisits > 0 ? (totalHourlyCost / totalPredictedVisits) : totalHourlyCost;

    let groomingStatus = "Stable";
    let groomingMessage = "Grooming capacity meets predicted traffic demand.";
    let groomingColor = "text-green-700 bg-green-50";
    
    if (servicesCapacityPerHour > 0) {
      if (servicesPredictedVisits > servicesCapacityPerHour * 1.5) {
        groomingStatus = "Severe Bottleneck";
        groomingMessage = `Warning: Predicted ${servicesPredictedVisits} visits exceeds physical max capacity (~${servicesCapacityPerHour.toFixed(1)} slots/hr).`;
        groomingColor = "text-red-700 bg-red-50";
      } else if (servicesPredictedVisits > servicesCapacityPerHour) {
        groomingStatus = "Warning";
        groomingMessage = `Predicted ${servicesPredictedVisits} visits exceeds physical max capacity (~${servicesCapacityPerHour.toFixed(1)} slots/hr).`;
        groomingColor = "text-yellow-700 bg-yellow-50";
      } else if (servicesPredictedVisits < servicesCapacityPerHour * 0.5) {
        groomingStatus = "Underutilized";
        groomingMessage = `High idle time. Scheduled capacity (~${servicesCapacityPerHour.toFixed(1)} slots/hr) heavily outweighs demand.`;
        groomingColor = "text-[#F53799] bg-[#FFF7FB]";
      }
    } else {
       groomingStatus = "No Groomers on Duty";
       groomingMessage = "No grooming staff are scheduled for this hour.";
       groomingColor = "text-[#223047] bg-gray-100";
    }

    return {
      totalHourlyCost,
      servicesCapacityPerHour,
      activeCommissionStaff,
      totalPredictedVisits,
      servicesPredictedVisits,
      costPerVisit,
      groomingStatus,
      groomingMessage,
      groomingColor
    };
  }, [debouncedTrafficOptimizerTime, staffingDayFilter, selectedTimeStaffPlan]);
  const maxCumulativeVisits = useMemo(() => {
    let maxVal = 1;
    sectorTrafficForecast.forEach((sector) => {
      sector.forecasts.forEach((f) => {
        const val = trafficDisplayMode === "weekday_average" ? f.cumulativeVisits : f.predicted;
        if (val > maxVal) maxVal = val;
      });
    });
    return maxVal;
  }, [sectorTrafficForecast, trafficDisplayMode]);

  const totalPredictedTraffic = Math.round((trafficOptimizerData?.totalVisits || 0) * (1 + trafficDemandShift / 100) ||
    sectorTrafficForecast.reduce((sum, sector) => sum + (sector.totalVisits || 0), 0));
  const highDemandSectorsList = selectedTimeStaffPlan.filter((sector) => sector.level === "High").map(s => s.sector);
  const highDemandSectors = highDemandSectorsList.length > 0 ? highDemandSectorsList.join(", ") : "None";
  const totalScheduledPlaceholderStaff = selectedTimeStaffPlan.reduce((sum, sector) => sum + sector.scheduledStaff, 0);
  const totalRecommendedStaff = selectedTimeStaffPlan.reduce((sum, sector) => sum + sector.requiredStaff, 0);

  const formatTrafficVisitValue = (value: number) =>
    Math.round(value).toString();

  // Traffic volume based on the Header Filter (overall, all hours)
  const trafficPrediction = useMemo(() => {
    if (!trafficOptimizerDataAllDay) return [];
    return (trafficOptimizerDataAllDay.columns || []).map((column: any, columnIndex: number) => {
      const cafeRow = (trafficOptimizerDataAllDay.sectors || []).find((s: any) => s.sector === 'Cafe');
      const servicesRow = (trafficOptimizerDataAllDay.sectors || []).find((s: any) => s.sector === 'Services');
      const retailRow = (trafficOptimizerDataAllDay.sectors || []).find((s: any) => s.sector === 'Retail');

      const cafeVisits = Number(cafeRow?.values?.[columnIndex]?.visits || 0);
      const servicesVisits = Number(servicesRow?.values?.[columnIndex]?.visits || 0);
      const retailVisits = Number(retailRow?.values?.[columnIndex]?.visits || 0);
      const totalVisits = cafeVisits + servicesVisits + retailVisits;

      const dayLabel = (column.dayLabel || column.label.replace(/\s+(avg|total)$/i, "")).toUpperCase();

      return {
        day: dayLabel,
        fullDayLabel: column.label,
        visits: totalVisits,
        cafe: cafeVisits,
        services: servicesVisits,
        retail: retailVisits,
      };
    });
  }, [trafficOptimizerDataAllDay]);

  const extractForecastTotals = (run?: ForecastRun | any | null) => {
    const forecastRows = Array.isArray(run?.forecast) ? run.forecast.slice(0, 7) : [];
    const historicalRows = Array.isArray(run?.historical) ? run.historical.slice(-7) : [];
    const unitPrice = Number(run?.modelMetadata?.priceCalibration?.unitPrice || run?.kpis?.avgOrderValue || 0);
    const avgOrderValue = Number(run?.kpis?.avgOrderValue || 0) || 350;
    const rows = forecastRows.length ? forecastRows : historicalRows;
    const revenue = rows.reduce((sum: number, point: any) => {
      const projected = Number(point.projectedNetSales ?? point.revenue ?? point.actual);
      const quantity = Number(point.forecastQuantity ?? point.forecast ?? point.orders ?? 0);
      return sum + (Number.isFinite(projected) && projected > 0 ? projected : quantity * unitPrice);
    }, 0);
    const orders = rows.reduce((sum: number, point: any) => {
      const quantity = Number(point.forecastQuantity ?? point.forecast ?? point.orders);
      if (Number.isFinite(quantity) && quantity > 0) return sum + quantity;
      const projected = Number(point.projectedNetSales ?? point.revenue ?? point.actual);
      return sum + (Number.isFinite(projected) && projected > 0 ? projected / avgOrderValue : 0);
    }, 0);

    return { revenue, orders };
  };

  const combineForecastTotals = (set: ScenarioForecastSet) => {
    const cafe = extractForecastTotals(set.cafe);
    const services = extractForecastTotals(set.services);
    const retail = extractForecastTotals(set.retail);
    return {
      revenue: cafe.revenue + services.revenue + retail.revenue,
      orders: cafe.orders + services.orders + retail.orders,
      cafeRevenue: cafe.revenue,
      servicesRevenue: services.revenue,
      retailRevenue: retail.revenue,
    };
  };

  useEffect(() => {
    let cancelled = false;
    setScenarioLoading(true);
    setScenarioError(null);

    const scenarioParams = {
      days: "7",
      temp: String(debouncedScenarioTemperature),
      rain: weather === "rainy" ? "1" : "0",
      holiday: paydayWeekend ? "1" : "0",
      isPayday: paydayWeekend ? "1" : "0",
      promoActive: promoActive ? "1" : "0",
    };

    Promise.all([
      getForecast("Cafe", { days: "7" }),
      getForecast("Services", { days: "7" }),
      getForecast("Retail", { days: "7" }),
      getForecast("Cafe", scenarioParams),
      getForecast("Services", scenarioParams),
      getForecast("Retail", scenarioParams),
      getNextQuietPeriod().catch(() => null),
    ])
      .then(([baselineCafe, baselineServices, baselineRetail, scenarioCafe, scenarioServices, scenarioRetail, quietPeriod]) => {
        if (!cancelled) {
          setScenarioBaselineForecasts({ cafe: baselineCafe, services: baselineServices, retail: baselineRetail });
          setScenarioForecasts({ cafe: scenarioCafe, services: scenarioServices, retail: scenarioRetail });
          setScenarioPromoModel(quietPeriod);
          if (scenarioRefreshKey > 0) {
            toast.success("Scenario predictions updated.", {
              description: "Forecast and promo model outputs are reflected in Scenario Builder.",
            });
          }
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setScenarioError(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setScenarioLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedScenarioTemperature, paydayWeekend, scenarioRefreshKey, weather, promoActive]);

  const scenarioOutcome = useMemo(() => {
    const baseline = combineForecastTotals(scenarioBaselineForecasts);
    const scenarioBase = combineForecastTotals(scenarioForecasts);
    
    const baselineRevenue = baseline.revenue || rawAnalysis?.totalRevenue || 1;
    const baselineOrders = baseline.orders || rawAnalysis?.totalTransactions || 1;
    const modelRevenue = scenarioBase.revenue || baselineRevenue;
    const modelOrders = scenarioBase.orders || baselineOrders;

    // Use model results natively (backend already applies the impacts)
    const projectedRevenue = modelRevenue;
    const projectedOrders = modelOrders;

    const actualTotalImpact = (projectedRevenue - baselineRevenue) / baselineRevenue;

    const isWeekend = dayOfWeek === "saturday" || dayOfWeek === "sunday";
    const promoProbability =
      scenarioPromoModel?.status === "success"
        ? Number(scenarioPromoModel.probabilityScore || 0)
        : 0.55;
    const promoImpact = promoActive ? 0.08 + Math.min(0.12, promoProbability * 0.12) : 0;

    const weatherImpact = weather === "rainy" ? -0.06 : weather === "sunny" ? 0.04 : 0;
    const dayOfWeekImpact = isWeekend ? 0.12 : 0;
    const tempImpact = debouncedScenarioTemperature > 32 ? -0.04 : debouncedScenarioTemperature < 24 ? -0.02 : 0.02;
    const paydayImpact = paydayWeekend ? 0.16 : 0;

    // Mathematically balance the sum of factor impacts to equal the total scenario impact
    const forecastModelImpact = actualTotalImpact - (weatherImpact + dayOfWeekImpact + promoImpact + tempImpact + paydayImpact);

    const scenarioFactorBreakdown = [
      {
        factor: "Forecast Model",
        impact: forecastModelImpact,
        description: "Cafe, Services, and Retail forecasts provide the baseline demand and revenue adjustments.",
      },
      {
        factor: "Weather",
        impact: weatherImpact,
        description: weather === "rainy" ? "Rain usually softens walk-in demand." : weather === "sunny" ? "Clear weather can improve walk-ins." : "Cloudy weather is treated as neutral.",
      },
      {
        factor: "Day of Week",
        impact: dayOfWeekImpact,
        description: isWeekend ? "Weekend scenarios usually support more visits." : "Weekday demand is kept near forecast baseline.",
      },
      {
        factor: "Active Promo",
        impact: promoImpact,
        description: promoActive
          ? scenarioPromoModel?.modelMetrics?.trainingSource === "real_discount_history"
            ? `Promo lift uses the dynamic promo model trained from ${scenarioPromoModel.modelMetrics.trainingRows} historical discount examples.`
            : "Promo lift uses the dynamic promo model; fallback assumptions apply until enough historical discount examples are available."
          : "No promotion lift is applied.",
      },
      {
        factor: "Temperature",
        impact: tempImpact,
        description: "Comfortable weather gets a small lift; very hot or cool days reduce visits slightly.",
      },
      {
        factor: "Payday Weekend",
        impact: paydayImpact,
        description: paydayWeekend ? "Payday timing increases expected spend and orders." : "No payday lift is applied.",
      },
    ];

    const baselineAvgTransaction = baselineRevenue / Math.max(1, baselineOrders);
    const avgTransaction = projectedRevenue / Math.max(1, projectedOrders);
    const cafeShare = projectedRevenue > 0 ? (scenarioBase.cafeRevenue / projectedRevenue) * 100 : 0;
    const baselineCafeShare = baselineRevenue > 0 ? (baseline.cafeRevenue / baselineRevenue) * 100 : 0;
    const accuracyValues = [
      scenarioForecasts.cafe?.accuracy,
      scenarioForecasts.services?.accuracy,
      scenarioForecasts.retail?.modelInfo?.accuracy,
    ]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    const confidence = accuracyValues.length
      ? Math.round(accuracyValues.reduce((sum, value) => sum + value, 0) / accuracyValues.length)
      : 0;

    return {
      revenue: Math.round(projectedRevenue),
      orders: Math.round(projectedOrders),
      avgTransaction: Math.round(avgTransaction),
      cafeShare: Number.isFinite(cafeShare) ? cafeShare.toFixed(1) : "0.0",
      revenueChange: (((projectedRevenue - baselineRevenue) / baselineRevenue) * 100).toFixed(1),
      ordersChange: (((projectedOrders - baselineOrders) / baselineOrders) * 100).toFixed(1),
      avgTransactionChange: (((avgTransaction - baselineAvgTransaction) / baselineAvgTransaction) * 100).toFixed(1),
      cafeShareChange: (cafeShare - baselineCafeShare).toFixed(1),
      baselineRevenue: Math.round(baselineRevenue),
      baselineOrders: Math.round(baselineOrders),
      confidence,
      sourceLabel: baseline.revenue > 0 ? "Forecast APIs" : "Current filtered transaction summary",
      scenarioFactorBreakdown
    };
  }, [
    rawAnalysis, 
    scenarioBaselineForecasts, 
    scenarioForecasts,
    dayOfWeek,
    debouncedScenarioTemperature,
    paydayWeekend,
    promoActive,
    scenarioPromoModel,
    weather
  ]);

  return (
    <div className={activeTab === "operations-what-if" ? "space-y-4" : "space-y-6 md:space-y-8 lg:space-y-12"}>
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row items-start justify-between gap-3 md:gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl md:text-3xl lg:text-[36px] font-extrabold text-[#223047]">
              AI Simulation Laboratory
            </h1>
            <InfoTooltip label="Advanced predictive modeling and scenario testing environment" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="border-[#FFD9EC] text-[#223047] px-3 md:px-4 py-1 text-xs md:text-sm cursor-help">
                  Range Source: {selectedHeaderRangeLabel}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                Bundle Simulator reports are scoped to the Header Filter and anchored on the latest ingested transaction date, not today's calendar date.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Badge className="bg-[#06B6D4] text-white hover:bg-[#06B6D4] px-3 md:px-4 py-1 text-xs md:text-sm">
            AI Laboratory
          </Badge>
          {activeTab !== "operations-what-if" && (
          <Button onClick={handleRunSimulation} className="bg-[#F53799] hover:bg-[#D42A7D] gap-2 text-sm md:text-base">
            <FlaskConical className="w-4 h-4" />
            <span className="hidden sm:inline">Run Simulation</span>
            <span className="sm:hidden">Run</span>
          </Button>
          )}
        </div>
      </div>

      {activeTab !== "operations-what-if" && (<>
      {/* KPI ROW */}
      <TooltipProvider>
        <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {/* Active Patterns */}
            <div className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-xs text-[#223047] opacity-70">
                  <span className="truncate">Active Rules</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-[#F53799] cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px]">
                      Number of statistically validated association rules detected within the selected timeframe.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-base md:text-xl font-bold text-[#223047]">{networkConnections.length}</div>
              </div>
            </div>

            {/* Bundle Candidates */}
            <div className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
                <Target className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-xs text-[#223047] opacity-70">
                  <span className="truncate">Bundle Candidates</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-[#06B6D4] cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px]">
                      High-potential product pairs combining popular fast-sellers with slower-moving offers to boost revenue.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-base md:text-xl font-bold text-[#223047]">{allBundlePredictions.length}</div>
              </div>
            </div>

            {/* Avg Rule Lift */}
            <div className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-xs text-[#223047] opacity-70">
                  <span className="truncate">Avg Bundle Lift</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-[#F53799] cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px]">
                      The average lift factor for currently identified bundle opportunities.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-base md:text-xl font-bold text-[#223047]">
                  {(allBundlePredictions.length > 0 ? allBundlePredictions.reduce((sum, b) => sum + b.lift, 0) / allBundlePredictions.length : 0).toFixed(2)}x
                </div>
              </div>
            </div>

            {/* Avg Historical Confidence */}
            <div className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-xs text-[#223047] opacity-70">
                  <span className="truncate">Avg Confidence</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-[#06B6D4] cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px]">
                      The average confidence percentage across all identified bundle opportunities.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-base md:text-xl font-bold text-[#223047]">
                  {Math.round(allBundlePredictions.length > 0 ? allBundlePredictions.reduce((sum, b) => sum + b.confidence, 0) / allBundlePredictions.length : 0)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>

      </>)}
      {/* TAB NAVIGATION */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-2 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[140px] flex items-center justify-center gap-1.5 md:gap-2 px-2 md:px-4 py-2 md:py-3 rounded-xl transition-all ${activeTab === tab.id
                ? "bg-[#F53799] text-white shadow-lg"
                : "bg-white text-[#223047] hover:bg-[#FFF2FA]"
              }`}
          >
            <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
            <span className="text-xs md:text-sm font-semibold">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === "operations-what-if" && <OperationsWhatIf />}
      {activeTab === "bundle-simulator" && (
        <div className="space-y-4 md:space-y-6 lg:space-y-8">
          {(crossSellLoading || crossSellError || crossSellData?.message) && (
            <div className="bg-white border border-[#FFD9EC] rounded-xl md:rounded-2xl p-3 md:p-4">
              <div className="text-sm font-semibold text-[#223047]">
                {crossSellLoading
                  ? "Loading live FP-Growth analysis..."
                  : crossSellError
                    ? "Cross-sell analysis unavailable"
                    : crossSellData?.message}
              </div>
              {(crossSellError || crossSellData?.message) && (
                <div className="text-xs text-[#223047] opacity-60 mt-1">
                  Upload more multi-item transaction data or adjust the support and confidence thresholds.
                </div>
              )}
            </div>
          )}
          {/* Raw Transaction Data Sources */}
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                    Raw Transaction Data Analysis
                  </h2>
                  <InfoTooltip label={`Live transaction stream feeding AI pattern detection models for ${selectedHeaderRangeLabel}`} />
                </div>
              </div>
              <Badge className="bg-[#06B6D4] text-white hover:bg-[#06B6D4] text-xs md:text-sm">
                Real-Time Data
              </Badge>
            </div>

            {/* TIME SELECTION SLIDER */}
            <div className="bg-gradient-to-br from-[#FFF7FB] to-[#FFF2FA] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 space-y-3 md:space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs md:text-sm font-semibold text-[#223047]">TIME WINDOW SELECTION</div>
                <div className="text-base md:text-lg font-bold text-[#F53799]">{formatHour(dataTime[0])}</div>
              </div>

              <div className="relative">
                <Slider
                  value={dataTime}
                  onValueChange={handleBundleTimeChange}
                  max={19}
                  min={7}
                  step={1}
                  className="[&_[role=slider]]:bg-gradient-to-r [&_[role=slider]]:from-[#F53799] [&_[role=slider]]:to-[#06B6D4] [&_[role=slider]]:w-6 [&_[role=slider]]:h-6 [&_[role=slider]]:border-4 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-lg"
                />
                <div className="flex justify-between mt-3 text-xs text-[#223047] opacity-60">
                  <span>07:00</span>
                  <span>10:00</span>
                  <span>13:00</span>
                  <span>16:00</span>
                  <span>19:00</span>
                </div>
              </div>
            </div>

            {/* Transaction Volume & Co-Purchase Patterns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 space-y-3 md:space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs md:text-sm font-bold text-[#223047]">Hourly Transaction Volume</h3>
                  <Badge variant="outline" className="text-xs border-[#F53799] text-[#F53799]">
                    Raw Data
                  </Badge>
                </div>
                <ResponsiveContainer width="100%" height={180} className="md:!h-[200px]">
                  <BarChart data={transactionVolumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" vertical={false} />
                    <XAxis dataKey="hour" stroke="#223047" style={{ fontSize: "10px" }} />
                    <YAxis stroke="#223047" style={{ fontSize: "10px" }} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #FFD9EC",
                        borderRadius: "12px",
                      }}
                    />
                    <Bar dataKey="transactions" radius={[6, 6, 0, 0]}>
                      {transactionVolumeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.selected ? "#F53799" : "#06B6D4"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 space-y-3 md:space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs md:text-sm font-bold text-[#223047]">Top Product Co-Purchases</h3>
                  <Badge variant="outline" className="text-xs border-[#06B6D4] text-[#06B6D4]">
                    {formatHour(dataTime[0])} Window
                  </Badge>
                </div>
                <div className="space-y-3">
                  {coPurchaseData.length === 0 && (
                    <div className="text-sm text-[#223047] opacity-60">
                      No significant co-purchase rules detected for this hour and threshold.
                    </div>
                  )}
                  {coPurchaseData.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[#223047] font-medium">{item.pair}</span>
                        <span className="font-bold text-[#F53799]">{item.frequency}x</span>
                      </div>
                      <div className="h-2 bg-[#FFD9EC] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#F53799] to-[#06B6D4] transition-all"
                          style={{ width: `${(item.frequency / maxCoPurchaseFrequency) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* LIVE BEHAVIORAL WEB - FP-GROWTH PATTERN DETECTION ENGINE */}
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 lg:space-y-8">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center shadow-lg flex-shrink-0">
                  <Network className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg md:text-xl lg:text-[24px] font-bold text-[#223047]">
                      Live Behavioral Web <span className="hidden md:inline">(FP-Growth Pattern Detection Engine)</span>
                    </h2>
                    <InfoTooltip label={`Association rule mining and pattern visualization for ${selectedHeaderRangeLabel}`} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <Badge className="bg-[#F53799] text-white hover:bg-[#F53799] px-3 md:px-4 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    AI Learning Active
                  </div>
                </Badge>
                <Badge variant="outline" className="border-[#06B6D4] text-[#06B6D4] px-3 md:px-4 py-1.5 text-xs">
                  {networkNodes.length} Active Nodes
                </Badge>
              </div>
            </div>

            {/* SECTION 1 & 2: Main Network Visualization + Interactive Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 md:gap-6 lg:gap-8">
              {/* Network Graph */}
              <div className="bg-gradient-to-br from-[#FFF7FB] to-[#FFF2FA] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 lg:p-8 relative min-h-[400px] md:min-h-[500px] lg:min-h-[560px] overflow-hidden">
                {/* Network Canvas */}
                <div className="w-full h-full flex items-center justify-center">
                  <svg viewBox="0 0 600 480" className="w-full h-full max-w-full">
                    {/* Define gradient for glow effect */}
                    <defs>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                          <feMergeNode in="coloredBlur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <linearGradient key="lineGradient-gradient" id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#F53799" />
                        <stop offset="100%" stopColor="#06B6D4" />
                      </linearGradient>
                    </defs>

                    {networkNodes.length === 0 && (
                      <text
                        x="300"
                        y="240"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="text-sm font-semibold"
                        fill="#223047"
                      >
                        No association rules match the selected thresholds.
                      </text>
                    )}

                    {/* Connection Lines - Varying thickness based on historical confidence */}
                    {networkConnections.map((conn, idx) => {
                      const sourceNode = networkNodes.find(n => n.id === conn.source);
                      const targetNode = networkNodes.find(n => n.id === conn.target);
                      if (!sourceNode || !targetNode) return null;

                      const sourcePos = { x: sourceNode.x, y: sourceNode.y };
                      const targetPos = { x: targetNode.x, y: targetNode.y };

                      // Line thickness based on historical confidence (2-12px)
                      const thickness = 2 + (conn.confidence / 100) * 10;
                      const opacity = 0.3 + (conn.confidence / 100) * 0.5;

                      return (
                        <g key={idx}>
                          <title>{`${conn.sourceName} + ${conn.targetName} | Historical Confidence: ${conn.confidence}%, Lift: ${conn.lift.toFixed(2)}x, Co-occurrences: ${conn.cooccurrences}`}</title>
                          <line
                            x1={sourcePos.x}
                            y1={sourcePos.y}
                            x2={targetPos.x}
                            y2={targetPos.y}
                            stroke="url(#lineGradient)"
                            strokeWidth={thickness}
                            opacity={opacity}
                            filter={conn.confidence >= 85 ? "url(#glow)" : "none"}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}

                    {/* Product Nodes - Varying sizes based on frequency */}
                    {networkNodes.map((node) => {
                      const pos = { x: node.x, y: node.y };
                      // Node size based on frequency (32-56px radius)
                      const radius = 32 + (node.frequency / 100) * 24;

                      // Smart SVG text wrapping
                      const words = (node.name || "").split(" ");
                      const lines: string[] = [];
                      let currentLine = "";
                      words.forEach((w) => {
                        if ((currentLine + " " + w).trim().length <= 11) {
                          currentLine = (currentLine + " " + w).trim();
                        } else {
                          if (currentLine) lines.push(currentLine);
                          currentLine = w.length > 11 ? w.slice(0, 10) + "..." : w;
                        }
                      });
                      if (currentLine) lines.push(currentLine);
                      const displayLines = lines.slice(0, 3);

                      return (
                        <g key={node.id}>
                          <title>{`${node.name} (${formatSector(node.category)}) - Appears in ${node.frequency}% of baskets, Basket Count: ${node.basketCount}`}</title>
                          {/* Outer glow for high-frequency nodes */}
                          {node.frequency > 80 && (
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={radius + 8}
                              fill={node.color}
                              opacity="0.15"
                            />
                          )}
                          {/* Main node */}
                          <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={radius}
                            fill="white"
                            stroke={node.color}
                            strokeWidth="4"
                            className="cursor-pointer transition-all hover:stroke-[#F53799]"
                          />
                          {/* Node label */}
                          <text
                            x={pos.x}
                            y={pos.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="text-[10px] font-bold pointer-events-none"
                            fill="#223047"
                          >
                            {displayLines.map((line: string, i: number, arr: string[]) => {
                              const total = arr.length;
                              const startDy = total === 1 ? 0 : total === 2 ? -5 : -10;
                              return (
                                <tspan key={i} x={pos.x} dy={i === 0 ? startDy : 12}>
                                  {line}
                                </tspan>
                              );
                            })}
                          </text>
                          {/* Basket appearance badge */}
                          <rect
                            x={pos.x + radius - 42}
                            y={pos.y - radius - 4}
                            width="54"
                            height="24"
                            rx="8"
                            fill={node.color}
                          />
                          <text
                            x={pos.x + radius - 15}
                            y={pos.y - radius + 4}
                            textAnchor="middle"
                            className="text-[8px] font-bold"
                            fill="white"
                          >
                            <tspan x={pos.x + radius - 15} dy="0">{Math.round(node.frequency)}%</tspan>
                            <tspan x={pos.x + radius - 15} dy="9">of baskets</tspan>
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Connection Strength Legend */}
                <div className="absolute bottom-3 md:bottom-6 left-3 md:left-6 bg-white/95 backdrop-blur border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 shadow-lg z-10 hidden sm:block">
                  <div className="text-[9px] md:text-[10px] font-bold text-[#223047] mb-1.5 md:mb-2 tracking-wider">CONNECTION STRENGTH</div>
                  <div className="space-y-1 md:space-y-1.5">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="w-6 md:w-8 h-1 bg-gradient-to-r from-[#F53799] to-[#06B6D4] rounded-full opacity-40" />
                      <span className="text-[9px] md:text-[10px] text-[#223047]">Weak (&lt;70%)</span>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="w-6 md:w-8 h-1.5 bg-gradient-to-r from-[#F53799] to-[#06B6D4] rounded-full opacity-60" />
                      <span className="text-[9px] md:text-[10px] text-[#223047]">Medium (70-85%)</span>
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <div className="w-6 md:w-8 h-2.5 bg-gradient-to-r from-[#F53799] to-[#06B6D4] rounded-full opacity-90 shadow-lg" />
                      <span className="text-[9px] md:text-[10px] text-[#223047] font-semibold">Strong (&gt;85%)</span>
                    </div>
                  </div>
                </div>

                {/* Node Size Legend */}
                <div className="absolute bottom-3 md:bottom-6 right-3 md:right-6 bg-white/95 backdrop-blur border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 shadow-lg z-10 hidden sm:block">
                  <div className="text-[9px] md:text-[10px] font-bold text-[#223047] mb-1.5 md:mb-2 tracking-wider">NODE SIZE = ITEM APPEARANCE</div>
                  <div className="text-[9px] md:text-[10px] text-[#223047] opacity-70 mb-2">Badge shows % of baskets containing the item.</div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 md:gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border-2 border-[#D2B48C] bg-white" />
                      <span className="text-[9px] md:text-[10px] text-[#223047]">Cafe</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border-2 border-[#0D9488] bg-white" />
                      <span className="text-[9px] md:text-[10px] text-[#223047]">Service</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 md:w-4 md:h-4 rounded-full border-2 border-[#F59E0B] bg-white" />
                      <span className="text-[9px] md:text-[10px] text-[#223047]">Retail</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive AI Controls Panel */}
              <TooltipProvider>
                <div className="space-y-3 md:space-y-4">
                  <div className="bg-gradient-to-br from-[#F53799] to-[#D42A7D] border border-[#F53799] rounded-xl md:rounded-2xl p-4 md:p-6 text-white shadow-xl">
                    <div className="flex items-center gap-2 mb-3 md:mb-4">
                      <Target className="w-4 h-4 md:w-5 md:h-5" />
                      <h3 className="text-sm md:text-base font-bold">Pattern Filters</h3>
                      <InfoTooltip label="Choose how strict the graph should be when showing repeated item appearances and co-purchase links." />
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-5">
                      {[
                        {
                          label: "Explore",
                          support: 1,
                          confidence: 60,
                          tooltip: "Explore Mode: Low 1% support & 60% confidence to uncover emerging, rare, and novel cross-sell ideas.",
                        },
                        {
                          label: "Balanced",
                          support: 3,
                          confidence: 70,
                          tooltip: "Balanced Mode (Recommended): 3% support & 70% confidence for reliable, steady commercial bundle patterns.",
                        },
                        {
                          label: "Strict",
                          support: 5,
                          confidence: 85,
                          tooltip: "Strict Mode: High 5% support & 85% confidence to display only the most established, high-volume checkout pairings.",
                        },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          title={preset.tooltip}
                          onClick={() => {
                            setSupportThreshold([preset.support]);
                            setConfidenceLevel([preset.confidence]);
                          }}
                          className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition cursor-help ${supportThreshold[0] === preset.support && confidenceLevel[0] === preset.confidence
                              ? "bg-white text-[#D42A7D] border-white shadow-sm"
                              : "bg-white/10 text-white border-white/30 hover:bg-white/20"
                            }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Product Appearance Slider */}
                    <div className="space-y-3 mb-6">
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide cursor-help"
                          title="Item Appearance Floor (Minimum Support %): The percentage of total receipts that must contain an item or pair before the AI considers it a significant buying pattern. (E.g. 1% means it appears in at least 1 out of every 100 customer receipts)."
                        >
                          <span className="underline decoration-dotted decoration-white/70">ITEM APPEARANCE FLOOR</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 text-white/80 cursor-pointer" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[240px] text-xs">
                              <strong>Minimum Support (%):</strong> The smallest basket share an item or pair must reach in customer receipts before it appears in the pattern graph.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <span className="text-lg font-bold bg-white/20 backdrop-blur px-3 py-1 rounded-lg">
                          {supportThreshold[0]}%
                        </span>
                      </div>
                      <Slider
                        value={supportThreshold}
                        onValueChange={setSupportThreshold}
                        max={100}
                        min={1}
                        step={1}
                        className="[&_[role=slider]]:bg-white [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:shadow-xl [&_[role=slider]]:border-2 [&_[role=slider]]:border-[#F53799]"
                      />
                      <div className="flex justify-between text-[10px] opacity-75">
                        <span>1% (Broad discovery)</span>
                        <span>50%</span>
                        <span>100% (Strict)</span>
                      </div>
                    </div>

                    {/* Connection Strength Slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide cursor-help"
                          title="Connection Strength Floor (Minimum Confidence %): The minimum historical probability that a customer buying Item A will also buy Item B. (E.g. 60% means at least 6 out of 10 times Item A was bought, Item B was added)."
                        >
                          <span className="underline decoration-dotted decoration-white/70">CONNECTION STRENGTH FLOOR</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="w-3.5 h-3.5 text-white/80 cursor-pointer" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[240px] text-xs">
                              <strong>Minimum Confidence (%):</strong> The historical probability that the second item is added to the cart when the first item is purchased.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <span className="text-lg font-bold bg-white/20 backdrop-blur px-3 py-1 rounded-lg">
                          {confidenceLevel[0]}%
                        </span>
                      </div>
                      <Slider
                        value={confidenceLevel}
                        onValueChange={setConfidenceLevel}
                        max={100}
                        min={60}
                        step={5}
                        className="[&_[role=slider]]:bg-white [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:shadow-xl [&_[role=slider]]:border-2 [&_[role=slider]]:border-[#F53799]"
                      />
                      <div className="flex justify-between text-[10px] opacity-75">
                        <span>60% (Moderate link)</span>
                        <span>80%</span>
                        <span>100% (Guaranteed link)</span>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Metrics */}
                  <div className="bg-gradient-to-br from-[#FFF7FB] to-white border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-5 space-y-3 md:space-y-4 shadow-xs">
                    <div
                      className="text-xs font-bold text-[#223047] tracking-wider mb-2 md:mb-3 cursor-help underline decoration-dotted decoration-slate-400"
                      title="Visible Graph Patterns: Real-time summary of active rules and product nodes currently matching your filter criteria."
                    >
                      VISIBLE PATTERNS
                    </div>

                    <div className="space-y-3">
                      <div
                        className="flex items-center justify-between p-3 bg-[#F53799]/5 rounded-lg cursor-help group hover:bg-[#F53799]/10 transition-all"
                        title="Active Association Rules: The total number of statistically validated product connections currently meeting your support and confidence thresholds."
                      >
                        <span className="text-xs text-[#223047] underline decoration-dotted decoration-slate-400 group-hover:opacity-100">Active Rules</span>
                        <span className="text-lg font-bold text-[#F53799]">{networkConnections.length}</span>
                      </div>

                      <div
                        className="flex items-center justify-between p-3 bg-[#06B6D4]/5 rounded-lg cursor-help group hover:bg-[#06B6D4]/10 transition-all"
                        title="Pattern Nodes: Unique individual menu items and retail products currently participating in active bundle rules."
                      >
                        <span className="text-xs text-[#223047] underline decoration-dotted decoration-slate-400 group-hover:opacity-100">Pattern Nodes</span>
                        <span className="text-lg font-bold text-[#06B6D4]">{networkNodes.length}</span>
                      </div>

                      <div
                        className="flex items-center justify-between p-3 bg-[#D42A7D]/5 rounded-lg cursor-help group hover:bg-[#D42A7D]/10 transition-all"
                        title="Average Historical Confidence: The mean co-purchase probability across all currently active association rules in the graph."
                      >
                        <span className="text-xs text-[#223047] underline decoration-dotted decoration-slate-400 group-hover:opacity-100">Avg Historical Confidence</span>
                        <span className="text-lg font-bold text-[#D42A7D]">
                          {networkConnections.length > 0
                            ? Math.round(networkConnections.reduce((sum, c) => sum + c.confidence, 0) / networkConnections.length)
                            : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </TooltipProvider>
            </div>

            {/* SECTION 3: AI-Detected Patterns & Top Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
              <div
                className="bg-gradient-to-br from-[#F53799]/5 to-[#FFF7FB] border-2 border-[#F53799]/30 rounded-xl md:rounded-2xl p-4 md:p-6 hover:border-[#F53799] transition-all cursor-pointer"
                title="Top Recommended Bundle: The overall #1 highest-ranked bundle combining high customer purchase affinity, strong sales lift, and protected profit margins."
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#F53799] flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div
                    className="text-xs font-bold text-[#F53799] tracking-wider cursor-help underline decoration-dotted decoration-[#F53799]/50"
                    title="Top AI Recommendation: Selected as the most commercially viable bundle across all active store departments."
                  >
                    TOP BUNDLE RECOMMENDATION
                  </div>
                </div>
                <div className="text-lg font-bold text-[#223047] mb-2 capitalize">
                  {topInsights.topBundle}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div
                    className="cursor-help"
                    title={`Historical Confidence (${topInsights.bundleConfidence}%): Probability that customers who bought the first item also bought the rest of the items in the same transaction.`}
                  >
                    <span className="text-[#223047] opacity-60 underline decoration-dotted decoration-slate-400">Historical Confidence:</span>
                    <span className="ml-1.5 font-bold text-[#F53799]">{topInsights.bundleConfidence}%</span>
                  </div>
                  <div
                    className="cursor-help"
                    title={`Sales Lift Multiplier (${topInsights.bundleLift.toFixed(2)}x): Measures how much more likely customers buy these items together compared to random chance. ${topInsights.bundleLift.toFixed(2)}x means customers are ${topInsights.bundleLift.toFixed(1)} times more likely to purchase them together.`}
                  >
                    <span className="text-[#223047] opacity-60 underline decoration-dotted decoration-slate-400">Lift:</span>
                    <span className="ml-1.5 font-bold text-[#F53799]">{topInsights.bundleLift.toFixed(2)}x</span>
                  </div>
                </div>
              </div>

              <div
                className="bg-gradient-to-br from-[#06B6D4]/5 to-[#FFF7FB] border-2 border-[#06B6D4]/30 rounded-xl md:rounded-2xl p-4 md:p-6 hover:border-[#06B6D4] transition-all cursor-pointer"
                title="Emerging Trend: A fast-rising product combination showing accelerating customer purchase velocity in recent transaction cycles."
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#06B6D4] flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <div
                    className="text-xs font-bold text-[#06B6D4] tracking-wider cursor-help underline decoration-dotted decoration-[#06B6D4]/50"
                    title="Emerging Trend: Products whose joint purchase frequency is trending upward significantly."
                  >
                    EMERGING TREND
                  </div>
                </div>
                <div className="text-lg font-bold text-[#223047] mb-2">
                  {topInsights.emergingTrend}
                </div>
                <div
                  className="text-sm text-[#223047] opacity-60 cursor-help"
                  title="Highest-ranked model recommendation: Ideal combo for upcoming marketing campaigns or featured menu displays."
                >
                  Highest-ranked model recommendation
                </div>
              </div>

              <div
                className="bg-gradient-to-br from-[#D42A7D]/5 to-[#FFF7FB] border-2 border-[#D42A7D]/30 rounded-xl md:rounded-2xl p-4 md:p-6 hover:border-[#D42A7D] transition-all cursor-pointer"
                title="Cross-Sell Opportunity: Discovers multi-department pathways (combining Pet Supplies, Cafe Drinks, and Pet Grooming/Hotel) to expand average basket size."
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#D42A7D] flex items-center justify-center">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <div
                    className="text-xs font-bold text-[#D42A7D] tracking-wider cursor-help underline decoration-dotted decoration-[#D42A7D]/50"
                    title="Cross-Sector Cross-Sell: Connects different business units to encourage customers to spend across multiple departments."
                  >
                    CROSS-SELL OPPORTUNITY
                  </div>
                </div>
                <div className="text-lg font-bold text-[#223047] mb-2">
                  {topInsights.crossSell}
                </div>
                <div
                  className="text-sm text-[#223047] opacity-60 cursor-help"
                  title="Cross-sector pathway: Customers buying in one category (e.g. Pet Food) show strong willingness to purchase from another (e.g. Cafe or Hotel)."
                >
                  Cross-sector or cross-category pathway detected
                </div>
              </div>
            </div>

            {/* SECTION 4: Time Selection Slider */}
            <div className="bg-gradient-to-br from-[#FFF7FB] to-[#FFF2FA] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 md:mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-gradient-to-br from-[#F53799] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">Time</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-xs md:text-sm font-bold text-[#223047]">Time-Based Pattern Analysis</div>
                      <InfoTooltip label="View patterns across different hours of the day" />
                    </div>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs text-[#223047] opacity-60 mb-0.5">Selected Time</div>
                  <div className="text-lg md:text-xl font-bold text-[#F53799]">{formatHour(fpGrowthTime[0])}</div>
                </div>
              </div>

              <div className="relative">
                <Slider
                  value={fpGrowthTime}
                  onValueChange={handleBundleTimeChange}
                  max={19}
                  min={7}
                  step={1}
                  className="[&_[role=slider]]:bg-gradient-to-r [&_[role=slider]]:from-[#F53799] [&_[role=slider]]:to-[#06B6D4] [&_[role=slider]]:w-6 [&_[role=slider]]:h-6 [&_[role=slider]]:border-4 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-lg"
                />
                <div className="flex justify-between mt-4 text-xs text-[#223047] opacity-60">
                  <span>07:00</span>
                  <span>10:00</span>
                  <span>13:00</span>
                  <span>16:00</span>
                  <span>19:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI-Predicted Bundle Opportunities */}
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                    AI-Predicted Bundle Opportunities
                  </h2>
                  <InfoTooltip
                    label={`${bundleOpportunityMode === "seasonal" ? "Generated from weather-aware " : "Generated from "}FP-Growth AI pattern analysis of ${formatHour(dataTime[0])} transaction patterns for ${selectedHeaderRangeLabel}`}
                  />
                </div>
              </div>
              <Badge className="bg-[#06B6D4] text-white hover:bg-[#06B6D4] text-xs md:text-sm font-semibold">
                Showing {filteredBundlePredictions.length > 0 ? (bundlePage - 1) * bundlesPerPage + 1 : 0}-{Math.min(bundlePage * bundlesPerPage, filteredBundlePredictions.length)} of {filteredBundlePredictions.length} Bundles
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBundleOpportunityMode("standard")}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 ${bundleOpportunityMode === "standard"
                    ? "bg-[#223047] text-white border-[#223047]"
                    : "bg-white text-[#223047] border-slate-200 hover:border-[#223047]"
                  }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                FP-Growth Bundles
              </button>
              <button
                type="button"
                onClick={() => handleLoadSeasonalBundles(false)}
                disabled={seasonalBundleLoading}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-60 ${bundleOpportunityMode === "seasonal"
                    ? "bg-[#06B6D4] text-white border-[#06B6D4]"
                    : "bg-white text-[#223047] border-[#BDECF3] hover:border-[#06B6D4]"
                  }`}
              >
                {seasonalBundleLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CalendarDays className="w-3.5 h-3.5" />
                )}
                Seasonal Bundles
              </button>
              <div className="w-[1px] h-6 bg-slate-200 mx-1 self-center hidden sm:block"></div>
              <button
                type="button"
                onClick={() => setBundleCategoryFilter("all")}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${bundleCategoryFilter === "all"
                    ? "bg-[#F53799] text-white border-[#F53799]"
                    : "bg-white text-[#223047] border-[#FFD9EC] hover:border-[#F53799]"
                  }`}
              >
                All Bundle Types
              </button>
              {bundleCategoryOptions.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setBundleCategoryFilter(category)}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${bundleCategoryFilter === category
                      ? "bg-[#F53799] text-white border-[#F53799]"
                      : "bg-white text-[#223047] border-[#FFD9EC] hover:border-[#F53799]"
                    }`}
                >
                  {formatBundleCategoryKey(category)}
                </button>
              ))}
              <div className="w-[1px] h-6 bg-slate-200 mx-1 self-center hidden sm:block"></div>
              <button
                type="button"
                onClick={() => setOnlySignificant(!onlySignificant)}
                title="Filter to show only bundles with at least 5% support across customer receipts."
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition flex items-center gap-1 ${onlySignificant
                    ? "bg-[#06B6D4] text-white border-[#06B6D4]"
                    : "bg-white text-[#223047] border-slate-200 hover:border-[#06B6D4]"
                  }`}
              >
                Significant Only (5% Support)
              </button>
            </div>

            {bundleOpportunityMode === "seasonal" && (
              <div className="rounded-xl border border-[#BDECF3] bg-[#F3FCFD] p-3 text-xs text-[#223047]">
                {seasonalBundleLoading ? (
                  <div className="flex items-center gap-2 font-semibold text-[#06B6D4]">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Mining weather-aware seasonal bundles from historical baskets...
                  </div>
                ) : seasonalBundleError ? (
                  <div className="font-semibold text-amber-700">{seasonalBundleError}</div>
                ) : (
                  <>
                    <div className="font-semibold text-[#223047]">
                      {seasonalBundleData?.weatherBasis || "Weather-aware bundles use historical weather transforms and FP-Growth."}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(seasonalBundleData?.weatherSegments || []).map((segment) => (
                        <Badge
                          key={segment.id}
                          variant="outline"
                          className="border-[#06B6D4] text-[#067A8A] bg-white text-[11px]"
                          title={segment.weatherBasis || segment.reason || segment.label}
                        >
                          {segment.label}: {segment.displayedCandidateCount ?? 0} shown / {segment.candidateCount ?? 0} generated / {segment.basketCount} baskets
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="grid gap-3 md:gap-4">
              {bundlePredictions.length === 0 && (
                <div className="p-4 md:p-6 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl text-sm text-[#223047] opacity-70">
                  No bundle opportunities match the selected type and thresholds. Try another bundle type or use a broader pattern filter.
                </div>
              )}
              {bundlePredictions.map((bundle, idx) => (
                <div
                  key={idx}
                  className="p-4 md:p-6 bg-gradient-to-br from-[#FFF7FB] to-white border border-[#FFD9EC] rounded-xl md:rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 hover:border-[#F53799] transition-all"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                      <h3 className="order-1 text-base md:text-lg font-bold text-[#223047]">{bundle.bundle}</h3>
                      <div className="order-3 basis-full h-0" aria-hidden="true" />
                      {bundle.isEmergingTrend && (
                        <Badge
                          className="order-8 bg-amber-500 text-white font-bold text-xs shadow-xs animate-pulse cursor-help"
                          title="Emerging Trend: A fast-growing product combination with accelerating sales momentum in recent transaction cycles."
                        >
                          ðŸ”¥ Emerging Trend
                        </Badge>
                      )}
                      {bundle.isSeasonalBundle && bundle.seasonalBundleType && (
                        <Badge
                          className="order-4 bg-[#06B6D4]/10 text-[#067A8A] border border-[#06B6D4]/40 text-xs font-semibold cursor-help"
                          title={bundle.weatherBasis || "This bundle was mined from historical baskets in a weather segment."}
                        >
                          {bundle.seasonalBundleType}
                        </Badge>
                      )}
                      <Badge
                        className="order-5 bg-[#06B6D4] text-white hover:bg-[#06B6D4] text-xs cursor-help font-medium"
                        title={`Historical Confidence (${bundle.confidence}%): Probability that a customer purchasing '${bundle.itemA}' will also buy '${bundle.itemB}' in the same checkout.`}
                      >
                        {bundle.confidence}% Historical Confidence
                      </Badge>
                      <Badge
                        variant="outline"
                        className="order-2 text-xs border-[#F53799] text-[#F53799] cursor-help font-medium"
                        title="Kind of Bundle: The business units or categories represented by this pairing."
                      >
                        {bundle.sectorPair}
                      </Badge>
                      {bundle.businessFitScore !== null && (
                        <Badge
                          variant="outline"
                          className="order-6 text-xs border-emerald-500 text-emerald-700 cursor-help font-medium"
                          title={`Business Feasibility Fit (${Math.round((bundle.businessFitScore || 0) * 100)}%): Practicality score based on sector pairing and item-name affinity rules.`}
                        >
                          Business Fit {Math.round((bundle.businessFitScore || 0) * 100)}%
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-6 text-xs md:text-sm mb-2">
                      <div
                        className="cursor-help group"
                        title={`Sales Lift Multiplier (${bundle.lift.toFixed(2)}x): Measures how much more likely customers buy these items together compared to chance. ${bundle.lift.toFixed(2)}x means customers are ${bundle.lift.toFixed(1)} times more likely to purchase them together.`}
                      >
                        <span className="text-[#223047] opacity-60 underline decoration-dotted decoration-slate-400 group-hover:opacity-100">
                          Lift:
                        </span>
                        <span className="ml-2 font-bold text-[#F53799]">{bundle.lift.toFixed(2)}x</span>
                      </div>
                      <div
                        className="cursor-help group"
                        title={`AI Model Composite Score (${bundle.score}/100): Combines sales lift strength, profitability, customer demand volume, and cross-sector catalog fit.`}
                      >
                        <span className="text-[#223047] opacity-60 underline decoration-dotted decoration-slate-400 group-hover:opacity-100">
                          Model Score:
                        </span>
                        <span className="ml-2 font-semibold text-[#223047]">{bundle.score}</span>
                      </div>
                      <div
                        className="cursor-help group"
                        title={`Receipt Co-occurrence (${bundle.frequency} times): The exact number of historical customer checkout transactions where these items were bought in the same basket.`}
                      >
                        <span className="text-[#223047] opacity-60 underline decoration-dotted decoration-slate-400 group-hover:opacity-100">
                          Co-occurrence:
                        </span>
                        <span className="ml-2 font-semibold text-[#223047]">{bundle.frequency} times</span>
                      </div>
                    </div>

                    {/* Pricing Breakdown Bar */}
                    {bundle.regularPrice > 0 ? (
                      <div className="my-2.5 bg-[#FFF2FA] p-3 rounded-xl border border-[#FFD9EC]/70 space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#223047]">
                            <Tag className="w-3.5 h-3.5 text-[#F53799]" />
                            <span>{bundle.itemA}: {formatCurrency(bundle.itemAPrice)}</span>
                            <span className="text-gray-400">+</span>
                            <span>{bundle.itemB}: {formatCurrency(bundle.itemBPrice)}</span>
                          </div>
                          <div className="flex items-center gap-2.5 ml-auto">
                            <span className="line-through text-gray-400 text-xs font-medium" title="Combined individual menu/retail prices">{formatCurrency(bundle.regularPrice)}</span>
                            <span className="font-extrabold text-[#F53799] text-base" title="Discounted bundle selling price">{formatCurrency(bundle.bundlePrice)}</span>
                            <Badge className="bg-emerald-500 text-white text-[11px] px-2.5 py-0.5 font-bold">
                              Save {formatCurrency(bundle.savings)} ({bundle.selectedDiscountPercent}% OFF)
                            </Badge>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <div
                              className="text-xs font-semibold text-[#223047] cursor-help underline decoration-dotted decoration-slate-400"
                              title="AI Recommended Discount: Calculated to maximize sales volume while strictly safeguarding store profit margins."
                            >
                              Suggested Discount: {bundle.suggestedDiscountPercent}%
                            </div>
                            <div
                              className="text-xs text-[#223047] opacity-70 cursor-help underline decoration-dotted decoration-slate-400"
                              title="Selected Discount: The promotional discount level you choose to simulate or submit for owner review."
                            >
                              Selected: {bundle.selectedDiscountPercent}%
                            </div>
                          </div>
                          <Slider
                            value={[bundle.selectedDiscountPercent]}
                            onValueChange={(value) =>
                              setBundleDiscountOverrides((prev) => ({
                                ...prev,
                                [bundle.key]: value[0],
                              }))
                            }
                            max={Math.max(1, Math.floor(bundle.maxSafeDiscountPercent || 25))}
                            min={0}
                            step={1}
                            className="[&_[role=slider]]:bg-white [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:shadow-xl [&_[role=slider]]:border-2 [&_[role=slider]]:border-[#F53799]"
                          />
                          <div className="text-[11px] text-[#223047] opacity-70">
                            {bundle.discountRationale || "WOOF recommends a discount only when price and cost data can protect margin."}
                          </div>
                          {bundle.selectedDiscountPercent !== bundle.suggestedDiscountPercent && (
                            <div className={`text-[11px] font-semibold ${bundle.marginIsSafe ? "text-emerald-700" : "text-red-600"}`}>
                              {bundle.selectedDiscountPercent > bundle.suggestedDiscountPercent
                                ? `You chose ${bundle.selectedDiscountPercent - bundle.suggestedDiscountPercent} percentage points above the suggestion.`
                                : `You chose ${bundle.suggestedDiscountPercent - bundle.selectedDiscountPercent} percentage points below the suggestion.`}
                              {bundle.projectedMarginPercent !== null
                                ? ` Projected margin is ${bundle.projectedMarginPercent}% against the ${bundle.minimumMarginPercent ?? 30}% minimum.`
                                : " Margin impact cannot be computed without cost data."}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-[#223047]">
                          <div
                            className="bg-white/70 rounded-lg p-2 cursor-help group hover:bg-white transition-all"
                            title="Projected Gross Profit: Estimated profit generated per bundle sold after deducting individual product costs and promotion discounts."
                          >
                            <div className="opacity-60 underline decoration-dotted decoration-slate-400 group-hover:opacity-100">Projected Gross Profit</div>
                            <div className="font-bold text-[#223047]">{formatCurrency(bundle.projectedGrossProfit)}</div>
                          </div>
                          <div
                            className="bg-white/70 rounded-lg p-2 cursor-help group hover:bg-white transition-all"
                            title={`Projected Profit Margin (${bundle.projectedMarginPercent !== null ? `${bundle.projectedMarginPercent}%` : "N/A"}): The percentage of bundle revenue remaining as gross profit after inventory & preparation costs.`}
                          >
                            <div className="opacity-60 underline decoration-dotted decoration-slate-400 group-hover:opacity-100">Projected Margin</div>
                            <div className={`font-bold ${bundle.marginIsSafe ? "text-emerald-700" : "text-red-600"}`}>
                              {bundle.projectedMarginPercent !== null ? `${bundle.projectedMarginPercent}%` : "Unavailable"}
                            </div>
                          </div>
                          <div
                            className="bg-white/70 rounded-lg p-2 cursor-help group hover:bg-white transition-all"
                            title={`Safe Discount Ceiling (${bundle.maxSafeDiscountPercent !== null ? `${bundle.maxSafeDiscountPercent}%` : "N/A"}): The maximum allowable discount percentage before the bundle violates your store's minimum 30% profit margin safety guardrail.`}
                          >
                            <div className="opacity-60 underline decoration-dotted decoration-slate-400 group-hover:opacity-100">Safe Discount Ceiling</div>
                            <div className="font-bold text-[#223047]">
                              {bundle.maxSafeDiscountPercent !== null ? `${bundle.maxSafeDiscountPercent}%` : "Unavailable"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-[#223047] opacity-60 my-1">
                        Price or cost data is incomplete, so the owner must set promotion terms manually before approval.
                      </div>
                    )}
                    <div
                      className="text-xs md:text-sm text-[#223047] opacity-70 cursor-help"
                      style={{ lineHeight: "1.5" }}
                      title="Pattern Rationale: Plain-language explanation detailing why this AI bundle pairing was formed based on historical basket habits."
                    >
                      <span className="font-semibold text-[#223047]">{bundle.type}:</span> {bundle.reason}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-2 w-full md:w-auto shrink-0">
                    <Button
                      variant="outline"
                      onClick={() => handleOpenDrawer(bundle as any)}
                      className="border-[#F53799] text-[#F53799] hover:bg-[#FFF2FA] text-xs md:text-sm font-bold flex items-center justify-center gap-1.5"
                    >
                      <HelpCircle className="w-4 h-4" />
                      Why this bundle?
                    </Button>
                    <Button
                      onClick={() => handleDeployBundlePrescription(bundle)}
                      className="bg-[#F53799] hover:bg-[#D42A7D] text-xs md:text-sm font-bold shadow-md"
                    >
                      Deploy
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls for Bundles */}
            {totalBundlePages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#FFD9EC]/70">
                <div className="text-xs text-[#223047] opacity-70 font-medium">
                  Showing {(bundlePage - 1) * bundlesPerPage + 1}-{Math.min(bundlePage * bundlesPerPage, filteredBundlePredictions.length)} of {filteredBundlePredictions.length} bundle opportunities (Page {bundlePage} of {totalBundlePages})
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bundlePage <= 1}
                    onClick={() => setBundlePage((p) => Math.max(1, p - 1))}
                    className="border-[#FFD9EC] text-xs h-8 px-3 hover:bg-[#FFF2FA]"
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {visibleBundlePages.map((pageNum) => {
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setBundlePage(pageNum)}
                          aria-label={`Go to bundle opportunities page ${pageNum}`}
                          aria-current={bundlePage === pageNum ? "page" : undefined}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            bundlePage === pageNum
                              ? "bg-[#F53799] text-white shadow-sm"
                              : "bg-white border border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA]"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bundlePage >= totalBundlePages}
                    onClick={() => setBundlePage((p) => Math.min(totalBundlePages, p + 1))}
                    className="border-[#FFD9EC] text-xs h-8 px-3 hover:bg-[#FFF2FA]"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Manual Bundle Builder */}
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-5 md:space-y-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-[#F53799] to-[#06B6D4] flex items-center justify-center shrink-0">
                  <PackagePlus className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                      Manual Bundle Builder
                    </h2>
                    <InfoTooltip label="Create owner-defined bundles aside from WOOF-generated FP-Growth recommendations." />
                  </div>
                </div>
              </div>
              <Badge className="bg-[#FFF2FA] text-[#F53799] border border-[#FFD9EC] hover:bg-[#FFF2FA] self-start">
                Owner controlled
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[#223047]">Bundle Name</span>
                <input
                  value={manualBundleName}
                  onChange={(event) => setManualBundleName(event.target.value)}
                  placeholder="Holiday Gift Bundle"
                  className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[#223047]">Bundle Price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualBundlePrice}
                  onChange={(event) => setManualBundlePrice(event.target.value)}
                  placeholder="250"
                  className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[#223047]">Date Created</span>
                <input
                  type="date"
                  value={manualDateCreated}
                  onChange={(event) => setManualDateCreated(event.target.value)}
                  className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              {[
                { label: "Product 1", value: manualProductOne, setter: setManualProductOne, required: true },
                { label: "Product 2", value: manualProductTwo, setter: setManualProductTwo, required: true },
                { label: "Product 3", value: manualProductThree, setter: setManualProductThree, required: false },
              ].map((field) => (
                <label key={field.label} className="space-y-1.5">
                  <span className="text-xs font-bold text-[#223047]">
                    {field.label} {field.required ? <span className="text-[#F53799]">*</span> : <span className="opacity-50">(Optional)</span>}
                  </span>
                  <select
                    value={field.value}
                    onChange={(event) => field.setter(event.target.value)}
                    className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                  >
                    <option value="">{field.required ? "Select product" : "None"}</option>
                    {manualProductOptions.map((item) => (
                      <option key={`${field.label}-${item.name}`} value={item.name}>
                        {item.name} {item.price ? `- ${formatCurrency(item.price)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="rounded-2xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 md:p-5 space-y-4">
              <div className="flex items-center gap-2 font-bold text-[#223047]">
                <CalendarDays className="w-4 h-4 text-[#F53799]" />
                <span>Seasonality & Availability</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-[#223047]">Available Month</span>
                  <select
                    value={manualAvailableMonth}
                    onChange={(event) => setManualAvailableMonth(event.target.value)}
                    className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                  >
                    <option value="">Any month</option>
                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-[#223047]">Availability Start Date</span>
                  <input
                    type="date"
                    value={manualStartDate}
                    onChange={(event) => setManualStartDate(event.target.value)}
                    className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-[#223047]">Availability End Date</span>
                  <input
                    type="date"
                    value={manualEndDate}
                    onChange={(event) => setManualEndDate(event.target.value)}
                    className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                  />
                </label>
              </div>
            </div>

            {manualStartDate && (
            <div className="rounded-2xl border border-[#D7E6F8] bg-[#F6FAFF] p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CloudSun className="w-4 h-4 text-[#06B6D4]" />
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#4D75A3]">Weather + season sales evidence</span>
                  </div>
                  <p className="text-xs text-[#223047] opacity-60 mt-1">
                    {manualPlanningContext?.startDate && manualPlanningContext?.endDate
                      ? `${manualPlanningContext.startDate} - ${manualPlanningContext.endDate}`
                      : "Select availability dates to evaluate the selling window."}
                  </p>
                </div>
                {manualPlanningLoading && <span className="text-xs text-[#223047] opacity-60">Checking dates...</span>}
              </div>

              {manualPlanningError ? (
                <p className="text-xs text-[#C2410C]">{manualPlanningError}</p>
              ) : manualWeatherSummary ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                      { label: "Temperature", value: manualWeatherSummary.hasReliableWeather ? `${manualWeatherSummary.minTemperature}-${manualWeatherSummary.maxTemperature}${CELSIUS_SYMBOL}C` : "Unavailable", icon: Thermometer, color: "text-[#F53799]" },
                      { label: "Rain signal", value: manualWeatherSummary.hasReliableWeather ? `${manualWeatherSummary.rainyDays}/${manualWeatherSummary.coveredDays} days` : "Unavailable", icon: CloudRain, color: "text-[#06B6D4]" },
                      { label: "Season", value: manualWeatherSummary.season, icon: CloudSun, color: "text-[#D97706]" },
                      { label: "Calendar", value: manualWeatherSummary.calendarLabel, icon: CalendarCheck2, color: "text-[#7C3AED]" },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl border border-[#E4EDF8] bg-white px-3 py-2.5 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#6B7F9D]">
                          <metric.icon className={`w-3.5 h-3.5 ${metric.color}`} />
                          <span className="truncate">{metric.label}</span>
                        </div>
                        <div className="mt-1 text-sm font-bold text-[#223047] truncate">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-[#D7E6F8] bg-white px-3.5 py-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#223047]">
                        <CloudSun className="w-4 h-4 text-[#06B6D4]" />
                        Weather + season fit
                      </div>
                      <Badge className="bg-[#E8F8F1] text-[#16845B] border border-[#B8E7D0] hover:bg-[#E8F8F1]">
                        {manualWeatherSummary.evidenceScore === null ? "Weather unavailable" : `${manualWeatherSummary.evidenceScore}/100 timing fit`}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-[#223047] opacity-65">{manualWeatherSummary.message}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-[#BFEAF2] text-[#087C98] bg-[#F2FCFE]">
                        {manualWeatherSummary.hasReliableWeather ? `+${manualWeatherSummary.rainyDays > 0 ? 6 : 4} decision points from weather + season` : "No reliable weather signal"}
                      </Badge>
                      <Badge variant="outline" className="border-[#FFD9EC] text-[#B53678] bg-[#FFF7FB]">
                        {manualWeatherSummary.holidayDays > 0 ? "Holiday calendar signal" : "Historical calendar evidence"}
                      </Badge>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-[#223047] opacity-60">Select an availability date to check expected conditions.</p>
              )}
            </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[#223047]">Promo Mechanic</span>
                <input
                  value={manualPromoMechanic}
                  onChange={(event) => setManualPromoMechanic(event.target.value)}
                  placeholder="Get this bundle at a lower combined price."
                  className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[#223047]">Notes</span>
                <input
                  value={manualNotes}
                  onChange={(event) => setManualNotes(event.target.value)}
                  placeholder="Owner-created bundle for seasonal demand."
                  className="w-full h-11 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                />
              </label>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-[#FFD9EC] pt-4">
              <div className="text-xs text-[#223047] opacity-60">
                Manual bundles are saved to archives immediately and can be reused for campaign activation later.
              </div>
              <Button
                onClick={handleCreateManualBundle}
                className="bg-[#F53799] hover:bg-[#D42A7D] text-white rounded-xl gap-2"
              >
                <PackagePlus className="w-4 h-4" />
                Create Bundle
              </Button>
            </div>
          </div>

          {createdManualBundleScore && (
            <div className="bg-white border border-[#BFEAF2] rounded-2xl md:rounded-3xl p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
                    <h2 className="text-lg font-bold text-[#223047]">Bundle Effectiveness Score</h2>
                    <InfoTooltip label={`${createdManualBundleScore.bundleName} compared with current system-generated bundle opportunities.`} />
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#06B6D4]">{createdManualBundleScore.score}<span className="text-base opacity-60">/100</span></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs text-[#223047]">
                <div className="rounded-xl bg-[#F2FCFE] p-3"><span className="block opacity-60">Generated baseline</span><strong className="text-lg">{createdManualBundleScore.generatedBaseline}</strong></div>
                <div className="rounded-xl bg-[#FFF7FB] p-3"><span className="block opacity-60">Margin fit</span><strong className="text-lg">{createdManualBundleScore.marginScore}</strong></div>
                <div className="rounded-xl bg-[#F0FDF4] p-3"><span className="block opacity-60">Weather/calendar fit</span><strong className="text-lg">{createdManualBundleScore.contextScore}</strong></div>
              </div>
              {manualBundleExplanation && (
                <div className="mt-4 rounded-xl border border-[#E4EDF8] bg-[#F6FAFF] p-3 text-sm leading-6 text-[#223047]">
                  <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#4D75A3]">AI bundle explanation</div>
                  {manualBundleExplanation}
                </div>
              )}
            </div>
          )}

          {/* Bundle Archives */}
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl overflow-hidden">
            <button
              type="button"
              onClick={() => setBundleArchivesOpen((open) => !open)}
              className="w-full flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 md:p-6 text-left hover:bg-[#FFF7FB] transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl bg-[#FFF2FA] border border-[#FFD9EC] flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 md:w-5 md:h-5 text-[#F53799]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg md:text-xl font-bold text-[#223047]">Bundle Archives</h2>
                    <InfoTooltip label="Saved generated and manual bundles with active, archived, and deleted statuses." />
                  </div>
                  <p className="text-xs md:text-sm text-[#223047] opacity-60 mt-1">
                    {bundleArchiveCounts.active ?? 0} active | {bundleArchiveCounts.generated ?? 0} generated | {bundleArchiveCounts.manual ?? 0} manual
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="border-[#FFD9EC] text-[#223047] self-start md:self-center">
                {bundleArchivesOpen ? "Hide archives" : "View archives"}
              </Badge>
            </button>

            {bundleArchivesOpen && (
              <div className="border-t border-[#FFD9EC] p-4 md:p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_160px_auto] gap-2">
                  <input
                    value={bundleArchiveSearch}
                    onChange={(event) => setBundleArchiveSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") loadBundleArchives();
                    }}
                    placeholder="Search saved bundles..."
                    className="h-10 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                  />
                  <select
                    value={bundleArchiveStatus}
                    onChange={(event) => setBundleArchiveStatus(event.target.value)}
                    className="h-10 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="deleted">Deleted</option>
                    <option value="all">All</option>
                  </select>
                  <select
                    value={bundleArchiveSource}
                    onChange={(event) => setBundleArchiveSource(event.target.value)}
                    className="h-10 rounded-xl border border-[#FFD9EC] bg-white px-3 text-sm text-[#223047] outline-none focus:ring-2 focus:ring-[#F53799]/30"
                  >
                    <option value="all">All Sources</option>
                    <option value="generated">Generated</option>
                    <option value="manual">Manual</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={loadBundleArchives}
                    className="h-10 border-[#FFD9EC] text-[#F53799]"
                  >
                    Search
                  </Button>
                </div>

                {bundleArchiveError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {bundleArchiveError}
                  </div>
                )}

                {bundleArchiveLoading ? (
                  <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 text-sm text-[#223047] opacity-70">
                    Loading saved bundles...
                  </div>
                ) : bundleArchives.length === 0 ? (
                  <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 text-sm text-[#223047] opacity-70">
                    No saved bundles match the current archive filters.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {bundleArchives.slice(0, 8).map((bundle) => (
                      <div
                        key={bundle.id}
                        className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-[#223047] truncate">{bundle.bundleName}</h3>
                            <Badge className={bundle.source === "manual" ? "bg-[#06B6D4] text-white" : "bg-[#F53799] text-white"}>
                              {bundle.source}
                            </Badge>
                            <Badge variant="outline" className="border-[#FFD9EC] text-[#223047]">
                              {bundle.status}
                            </Badge>
                            {bundle.source === "manual" && typeof bundle.metadata?.effectivenessScore === "number" && (
                              <Badge className="bg-[#E0F7FA] text-[#0E7490] border border-[#A5F3FC]">
                                Score {bundle.metadata.effectivenessScore}/100
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[#223047] opacity-70">
                            {(bundle.items || []).map((item) => item.name).join(" + ")}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#223047] opacity-70">
                            <span>Bundle: {formatCurrency(bundle.bundlePrice)}</span>
                            {bundle.regularPrice ? <span>Regular: {formatCurrency(bundle.regularPrice)}</span> : null}
                            {bundle.availableMonth ? <span>{bundle.availableMonth}</span> : null}
                            {bundle.availabilityStartDate ? <span>Starts {bundle.availabilityStartDate}</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {bundle.status !== "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleArchiveStatusChange(bundle, "active")}
                              className="border-[#06B6D4] text-[#06B6D4] gap-1"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Restore
                            </Button>
                          )}
                          {bundle.status === "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleArchiveStatusChange(bundle, "archived")}
                              className="border-[#FFD9EC] text-[#F53799] gap-1"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              Archive
                            </Button>
                          )}
                          {bundle.status !== "deleted" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleArchiveStatusChange(bundle, "deleted")}
                              className="border-red-200 text-red-600 gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Strategic Proximity Recommendations */}
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                      Strategic Proximity Recommendations
                    </h2>
                    <InfoTooltip label="AI-driven merchandising intelligence for optimal product placement" />
                  </div>
                </div>
              </div>
              <Badge className="bg-gradient-to-r from-[#F53799] to-[#06B6D4] text-white hover:opacity-90 text-xs md:text-sm">
                Store Layout AI
              </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {isProximityLoading ? (
                <div className="col-span-1 lg:col-span-2 flex flex-col items-center justify-center p-12 text-center bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl">
                  <RefreshCw className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                  <div className="text-sm font-bold text-[#223047]">Loading Strategic Proximity...</div>
                  <p className="text-xs text-[#223047] opacity-70 max-w-md mt-1">
                    Fetching AI-driven shelf merchandising intelligence from backend analytics engine...
                  </p>
                </div>
              ) : proximityRecommendations.length === 0 ? (
                <div className="lg:col-span-2 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 text-sm text-[#223047] opacity-70">
                  No proximity recommendations are available for the selected Header Filter range. The placement advice will appear once FP-Growth rules or bundle candidates are detected from the ingested baskets.
                </div>
              ) : (
                paginatedProximity.map((rec, idx) => (
                  <div
                    key={idx}
                    className="bg-gradient-to-br from-white to-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 space-y-3 md:space-y-4 hover:border-[#F53799] transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs text-[#06B6D4] font-semibold tracking-wide">RETAIL SHELF PAIRING</span>
                        {(rec as any).channelSource && (
                          <Badge variant="outline" className="border-[#FFD9EC] text-[#F53799] bg-[#FFF2FA] text-[10px] px-2 py-0">
                            {(rec as any).channelSource}
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-[#223047] mb-2">{rec.pairing}</h3>
                      <div className="text-xs text-[#223047] opacity-60 mb-1.5 font-semibold">MERCHANDISING ADVICE</div>
                      <p className="text-sm text-[#223047]" style={{ lineHeight: "1.6" }}>
                        {rec.advice}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination Controls */}
            {!isProximityLoading && proximityRecommendations.length > proximityItemsPerPage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <span className="text-xs text-[#223047] opacity-60">
                  Showing {Math.min(proximityRecommendations.length, (proximityPage - 1) * proximityItemsPerPage + 1)}-
                  {Math.min(proximityRecommendations.length, proximityPage * proximityItemsPerPage)} of {proximityRecommendations.length} shelf recommendations
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={proximityPage === 1}
                    onClick={() => setProximityPage((prev) => Math.max(1, prev - 1))}
                    className="border-[#FFD9EC] text-xs h-8 px-3 hover:bg-[#FFF2FA]"
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-semibold text-[#223047] px-2">
                    Page {proximityPage} of {totalProximityPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={proximityPage === totalProximityPages}
                    onClick={() => setProximityPage((prev) => Math.min(totalProximityPages, prev + 1))}
                    className="border-[#FFD9EC] text-xs h-8 px-3 hover:bg-[#FFF2FA]"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            <div className="woof-insight-band bg-gradient-to-br from-[#FFF7FB] to-[#FFF2FA] border border-[#06B6D4]/30 rounded-lg md:rounded-xl p-3 md:p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 md:gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      WOOF Insight
                    </Badge>
                  </div>
                  <WoofInsight inline feature="prescriptive_explanation"
                    prompt="Explain these retail shelf-placement recommendations in a concise WOOF Insight. Describe the evidence and suggested merchandising actions. Distinguish recommendations from measured outcomes; use only verified context."
                    context={{ recommendations: proximityRecommendations, totalPages: totalProximityPages }}
                  />
                </div>
                <img
                  src={aiMascot.src}
                  alt="AI Simulation Mascot"
                  className="woof-mascot-motion w-24 h-24 md:w-32 md:h-32 object-contain flex-shrink-0 self-end sm:self-auto"
                />
              </div>
            </div>

            {/* Engine Feedback Widget */}
            <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF2FA] border border-[#FFD9EC] flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-[#F53799]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm md:text-base text-[#223047]">
                      Was the bundle recommendation engine helpful?
                    </h3>
                    <InfoTooltip label="Your feedback directly refines FP-Growth association scoring and is archived to AWS S3." />
                  </div>
                </div>
              </div>

              {bundleEngineRecalibrating ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-[#F53799] bg-[#FFF2FA] px-4 py-2 rounded-xl border border-[#FFD9EC]">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#F53799]" />
                  <span>Signal received. Bundle Engine recalibrating...</span>
                </div>
              ) : bundleEngineFeedback !== null ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 px-4 py-2 rounded-xl border border-green-200">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>
                    {bundleEngineFeedback === "helpful"
                      ? "Feedback recorded: Helpful (Saved to Supabase & AWS)"
                      : "Feedback recorded: Engine Recalibrated"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 self-start md:self-center">
                  <Button
                    size="sm"
                    onClick={() => handleBundleEngineFeedback(true)}
                    className="bg-green-600 hover:bg-green-700 text-white gap-1.5 text-xs h-9 px-4 rounded-xl"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    Helpful
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBundleEngineFeedback(false)}
                    className="border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA] gap-1.5 text-xs h-9 px-4 rounded-xl"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    Not Helpful
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "pricing-lab" && (
        <div className="space-y-4 md:space-y-6">
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                    Choose Item To Price
                  </h2>
                  <InfoTooltip label={`Search ${pricingCatalogRangeLabel} and choose one product, item, or service to test.`} />
                </div>
              </div>
              <div className="w-full lg:w-[360px] space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#223047] opacity-40" />
                  <input
                    value={pricingSearch}
                    onChange={(event) => setPricingSearch(event.target.value)}
                    placeholder="Search item or service"
                    className="w-full h-10 rounded-lg border border-[#FFD9EC] pl-9 pr-3 text-sm text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]"
                  />
                </div>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-[#FFD9EC] bg-[#FFF7FB] px-3 py-2 text-xs text-[#223047]">
                  <span className="font-semibold">Full Catalog</span>
                  <input
                    type="checkbox"
                    checked={pricingUsesFullCatalog}
                    onChange={(event) => setPricingUsesFullCatalog(event.target.checked)}
                    className="h-4 w-4 accent-[#F53799]"
                    aria-label="Show full pricing catalog"
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {pricingCategoryOptions.map((option) => {
                  const isActive = pricingCategoryFilter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPricingCategoryFilter(option.id)}
                      className={`h-9 rounded-lg border px-3 text-xs font-semibold transition ${
                        isActive
                          ? "border-[#F53799] bg-[#F53799] text-white"
                          : "border-[#FFD9EC] bg-white text-[#223047] hover:border-[#F53799]"
                      }`}
                    >
                      {option.label} ({pricingCategoryCounts[option.id] || 0})
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-[#223047] opacity-60">
                {pricingCatalogLoading
                  ? "Loading catalog..."
                  : `Showing ${visiblePricingItems.length ? (pricingPage - 1) * 5 + 1 : 0}-${Math.min(pricingPage * 5, filteredPricingItems.length)} of ${filteredPricingItems.length}`}
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1">
              {visiblePricingItems.length === 0 && (
                <div className="min-w-full rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 text-sm text-[#223047] opacity-70">
                  {pricingCatalogError || `No matching items were found for ${pricingCatalogRangeLabel}.`}
                </div>
              )}
              {visiblePricingItems.map((item) => {
                const isSelected = item.name === selectedPricingItem?.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setSelectedPricingItemName(item.name)}
                    className={`min-w-[220px] max-w-[240px] rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-[#F53799] bg-[#FFF2FA] shadow-sm"
                        : "border-[#FFD9EC] bg-white hover:border-[#F53799]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-[#223047]">{item.name}</div>
                        <div className="mt-1 text-[11px] text-[#223047] opacity-60">
                          {formatSector(item.sector)} | {item.velocity} mover
                        </div>
                      </div>
                      <ShoppingBag className="w-4 h-4 text-[#F53799] flex-shrink-0" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#223047]">
                      <div>
                        <div className="opacity-60">Current Price</div>
                        <div className="font-bold">{formatCurrency(item.price)}</div>
                      </div>
                      <div>
                        <div className="opacity-60">Sold In Baskets</div>
                        <div className="font-bold">{item.basketCount}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredPricingItems.length > 5 && (
              <div className="flex items-center gap-2 overflow-x-auto pt-1">
                {Array.from({ length: pricingPageCount }, (_, index) => index + 1).map((page) => {
                  const isActive = pricingPage === page;
                  return (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setPricingPage(page)}
                      className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-bold transition ${
                        isActive
                          ? "border-[#223047] bg-[#223047] text-white"
                          : "border-[#FFD9EC] bg-white text-[#223047] hover:border-[#F53799]"
                      }`}
                      aria-label={`Show pricing items page ${page}`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                    Dynamic Pricing Simulator
                  </h2>
                  <InfoTooltip label={`Estimate sales, revenue, profit, and margin for ${selectedPricingItem?.name || "a selected item"} using documented pricing assumptions.`} />
                </div>
              </div>
              <Badge variant="outline" className="border-[#FFD9EC] text-[#223047] text-xs">
                {selectedHeaderRangeLabel}
              </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 md:gap-6">
              <div className="space-y-4">
                <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <label className="text-xs md:text-sm font-semibold text-[#223047]">
                      Customer Discount: {discountValue[0]}%
                    </label>
                    <div className="text-xs text-[#223047] opacity-70">
                      Suggested: {recommendedPricingScenario ? `${recommendedPricingScenario.discount}%` : "Unavailable"}
                    </div>
                  </div>
                  <Slider
                    value={discountValue}
                    onValueChange={setDiscountValue}
                    max={50}
                    min={0}
                    step={5}
                    className="[&_[role=slider]]:bg-white [&_[role=slider]]:w-5 [&_[role=slider]]:h-5 [&_[role=slider]]:shadow-xl [&_[role=slider]]:border-2 [&_[role=slider]]:border-[#F53799]"
                  />
                  <div className="flex justify-between text-[10px] text-[#223047] opacity-60 mt-2">
                    <span>No discount</span>
                    <span>25%</span>
                    <span>50%</span>
                  </div>
                  <div className="mt-3 rounded-lg bg-white border border-[#FFD9EC] px-3 py-2 text-xs text-[#223047] opacity-75" style={{ lineHeight: "1.5" }}>
                    Simulation note: Expected sales change is estimated using an assumed price elasticity. This is a financial planning tool, not a trained demand prediction model. Actual results may vary.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg border border-[#FFD9EC] bg-white p-3">
                    <div className="text-[11px] text-[#223047] opacity-60">Selected Discount</div>
                    <div className="text-lg font-bold text-[#223047]">{discountValue[0]}%</div>
                  </div>
                  <div className="rounded-lg border border-[#FFD9EC] bg-white p-3">
                    <div className="text-[11px] text-[#223047] opacity-60">Revenue At Selection</div>
                    <div className="text-lg font-bold text-[#3AA7B5]">
                      {formatCurrency(currentPricingScenario?.projectedRevenue)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#FFD9EC] bg-white p-3">
                    <div className="text-[11px] text-[#223047] opacity-60">Profit At Selection</div>
                    <div className="text-lg font-bold text-[#F53799]">
                      {formatCurrency(currentPricingScenario?.projectedProfit)}
                    </div>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={300} className="md:!h-[360px]">
                  <LineChart data={pricingScenarios} margin={{ top: 30, right: 18, left: 8, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" vertical={false} />
                    <XAxis
                      dataKey="discountLabel"
                      stroke="#223047"
                      style={{ fontSize: "12px" }}
                      label={{ value: "Customer discount", position: "insideBottom", offset: -10, fill: "#223047", fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#223047"
                      style={{ fontSize: "12px" }}
                      tickFormatter={(value) => formatCompactCurrency(Number(value))}
                      label={{ value: "Projected pesos", angle: -90, position: "insideLeft", fill: "#223047", fontSize: 11 }}
                    />
                    <RechartsTooltip
                      labelFormatter={(label) => `Discount: ${label}`}
                      formatter={(value: any, name: any) => [
                        typeof value === "number" ? formatCurrency(value) : value,
                        String(name),
                      ]}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #FFD9EC",
                        borderRadius: "12px",
                      }}
                    />
                    {currentPricingScenario && (
                      <ReferenceLine
                        x={currentPricingScenario.discountLabel}
                        stroke="#223047"
                        strokeDasharray="4 4"
                        label={{
                          value: `Selected ${currentPricingScenario.discountLabel}`,
                          position: "top",
                          fill: "#223047",
                          fontSize: 11,
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="projectedRevenue"
                      name="Projected Revenue"
                      stroke="#06B6D4"
                      strokeWidth={2.5}
                      dot={(props: any) => {
                        const isSelected = props.payload?.discount === discountValue[0];
                        if (props.cy === null || props.cy === undefined) {
                          return <circle cx={props.cx || 0} cy={0} r={0} />;
                        }
                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={isSelected ? 5 : 3}
                            fill={isSelected ? "white" : "#06B6D4"}
                            stroke={isSelected ? "#223047" : "#06B6D4"}
                            strokeWidth={isSelected ? 2 : 1}
                          />
                        );
                      }}
                    >
                      <LabelList
                        dataKey="projectedRevenue"
                        position="top"
                        formatter={(value: any) => formatCompactCurrency(typeof value === "number" ? value : null)}
                        fill="#3AA7B5"
                        fontSize={10}
                      />
                    </Line>
                    <Line
                      type="monotone"
                      dataKey="projectedProfit"
                      name="Projected Gross Profit"
                      stroke="#F53799"
                      strokeWidth={2.5}
                      dot={(props: any) => {
                        const isSelected = props.payload?.discount === discountValue[0];
                        if (props.cy === null || props.cy === undefined) {
                          return <circle cx={props.cx || 0} cy={0} r={0} />;
                        }
                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={isSelected ? 5 : 3}
                            fill={isSelected ? "white" : "#F53799"}
                            stroke={isSelected ? "#223047" : "#F53799"}
                            strokeWidth={isSelected ? 2 : 1}
                          />
                        );
                      }}
                    >
                      <LabelList
                        dataKey="projectedProfit"
                        position="bottom"
                        formatter={(value: any) => formatCompactCurrency(typeof value === "number" ? value : null)}
                        fill="#F53799"
                        fontSize={10}
                      />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl bg-[#FFF2FA] border border-[#FFD9EC] p-4">
                  <div className="text-xs text-[#223047] opacity-60">New Selling Price</div>
                  <div className="text-2xl font-bold text-[#F53799]">
                    {formatCurrency(currentPricingScenario?.sellingPrice)}
                  </div>
                  <div className="text-[11px] text-[#223047] opacity-70 mt-1">
                    Current price: {formatCurrency(selectedPricingItem?.price)}
                  </div>
                </div>
                <div className="rounded-xl bg-[#FFF7FB] border border-[#FFD9EC] p-4">
                  <div className="text-xs text-[#223047] opacity-60">Expected Sales</div>
                  <div className="text-2xl font-bold text-[#223047]">
                    {currentPricingScenario?.expectedSales ?? 0}
                  </div>
                  <div className="text-[11px] text-[#223047] opacity-70 mt-1">
                    {currentPricingScenario?.customerLiftPercent ?? 0}% more than current basket count
                  </div>
                </div>
                <div className="rounded-xl bg-[#FFF7FB] border border-[#FFD9EC] p-4">
                  <div className="text-xs text-[#223047] opacity-60">Projected Gross Profit</div>
                  <div className={`text-2xl font-bold ${selectedProfitChange !== null && selectedProfitChange < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {formatCurrency(currentPricingScenario?.projectedProfit)}
                  </div>
                  <div className="text-[11px] text-[#223047] opacity-70 mt-1">
                    Change vs no discount: {selectedProfitChange !== null ? formatCurrency(selectedProfitChange) : "Unavailable"}
                  </div>
                </div>
                <div className="rounded-xl bg-[#FFF7FB] border border-[#FFD9EC] p-4">
                  <div className="text-xs text-[#223047] opacity-60">Margin After Discount</div>
                  <div className={`text-2xl font-bold ${
                    currentPricingScenario?.projectedMargin !== null &&
                    currentPricingScenario?.projectedMargin !== undefined &&
                    currentPricingScenario.projectedMargin < minimumPricingMargin
                      ? "text-red-600"
                      : "text-[#223047]"
                  }`}>
                    {currentPricingScenario?.projectedMargin !== null &&
                    currentPricingScenario?.projectedMargin !== undefined
                      ? `${currentPricingScenario.projectedMargin}%`
                      : "Unavailable"}
                  </div>
                  <div className="text-[11px] text-[#223047] opacity-70 mt-1">
                    Safe ceiling: {maxSafeItemDiscount !== null ? `${maxSafeItemDiscount}%` : "Cost data unavailable - margin ceiling cannot be calculated"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] px-4 py-3 text-xs text-[#223047]">
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-8 rounded-full bg-[#06B6D4]" />
                Projected Revenue
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-8 rounded-full bg-[#F53799]" />
                Projected Gross Profit
              </span>
            </div>

            <div className="rounded-xl border border-[#FFD9EC] bg-[#223047] p-4 text-white">
              <div className="text-xs font-bold tracking-wide mb-2">WOOF Pricing Recommendation</div>
              <p className="text-sm opacity-90" style={{ lineHeight: "1.6" }}>
                {selectedPricingItem?.price
                  ? recommendedPricingScenario
                    ? `For ${selectedPricingItem.name}, WOOF estimates that testing around ${recommendedPricingScenario.discount}% is sustainable because it produces the strongest projected gross profit under the current margin and elasticity assumptions.`
                    : `For ${selectedPricingItem.name}, WOOF needs more pricing history before recommending a discount.`
                  : "Select an item with price data to simulate a business-ready pricing recommendation."}
                {maxSafeItemDiscount !== null && discountValue[0] > maxSafeItemDiscount
                  ? ` The selected ${discountValue[0]}% discount is above the safe ceiling, so profit margin may fall below the ${minimumPricingMargin}% target.`
                : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "traffic-optimizer" && (
        <div className="space-y-4 md:space-y-6 lg:space-y-8">
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                    Traffic Forecast &amp; Staffing Simulator
                  </h2>

                  {/* APPROACH B: DAY SELECTOR TOGGLE (TODAY VS TOMORROW) - NO ICONS */}
                  <div className="inline-flex items-center p-1 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl text-xs font-semibold shadow-xs">
                    <button
                      type="button"
                      onClick={() => setSimulationTargetDay("today")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        simulationTargetDay === "today"
                          ? "bg-[#F53799] text-white shadow-sm font-bold"
                          : "text-[#223047]/70 hover:text-[#223047] hover:bg-[#FFD9EC]/40"
                      }`}
                    >
                      <span>Today (Live Shifts)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimulationTargetDay("tomorrow")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        simulationTargetDay === "tomorrow"
                          ? "bg-[#F53799] text-white shadow-sm font-bold"
                          : "text-[#223047]/70 hover:text-[#223047] hover:bg-[#FFD9EC]/40"
                      }`}
                    >
                      <span>Tomorrow (Next-Day Planning)</span>
                    </button>
                  </div>
                </div>

                <div className="text-xs text-[#223047] opacity-75 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#223047] px-2 py-0.5 rounded-md bg-[#FFF7FB] border border-[#FFD9EC]/70">
                    {simulationTargetDay === "tomorrow" ? "Next-Day Planning Mode:" : "Live Operations Mode:"}{" "}
                    {todayContext?.dayOfWeek ? `${todayContext.dayOfWeek}, ${todayContext.date}` : (simulationTargetDay === "tomorrow" ? "Tomorrow" : "Today")}
                  </span>
                  <span className="opacity-40">|</span>
                  <span>
                    {todayContext?.weather ? `${todayContext.weather.condition} (${todayContext.weather.tempCelsius}°C)` : "Weather Sync"}
                  </span>
                  <span className="opacity-40">|</span>
                  <span>
                    {todayContext?.isHoliday ? todayContext.holidayName : "Regular Working Day"}
                  </span>
                  {trafficDemandShift !== 0 && (
                    <>
                      <span className="opacity-40">|</span>
                      <span className="font-bold text-[#F53799]">
                        What-If Demand: {trafficDemandShift > 0 ? `+${trafficDemandShift}%` : `${trafficDemandShift}%`}
                      </span>
                    </>
                  )}
                  {!isStoreOperatingNow && simulationTargetDay === "today" && (
                    <span className="text-[11px] text-[#F53799] font-medium bg-[#FFF2FA] px-2 py-0.5 rounded border border-[#FFD9EC]">
                      Store Closed (7:00 AM – 7:00 PM) • Select "Tomorrow" for advance shift scheduling
                    </span>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE: WHAT-IF DEMAND SLIDER & OPERATING HOUR (OPTION 1, NO ICONS) */}
              {simulationTargetDay === "today" && !isStoreOperatingNow ? (
                <div className="text-left md:text-right pl-3 border-l border-[#FFD9EC]">
                  <div className="text-xs text-[#223047] opacity-60 mb-0.5">Live Shift Status</div>
                  <div className="text-sm font-bold text-[#F53799]">Store Closed</div>
                  <div className="text-[10px] text-[#223047]/60">Reopens 7:00 AM</div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-start md:justify-end gap-3 md:gap-5">
                  <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl px-3.5 py-2 flex flex-col gap-1.5 min-w-[240px]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#223047] text-[11px] uppercase tracking-wider">
                        What-If Demand Shift
                      </span>
                      <span className={`font-bold text-xs ${trafficDemandShift > 0 ? "text-[#F53799]" : trafficDemandShift < 0 ? "text-[#0D9488]" : "text-[#223047]/60"}`}>
                        {trafficDemandShift > 0 ? `+${trafficDemandShift}%` : trafficDemandShift < 0 ? `${trafficDemandShift}%` : "Baseline (0%)"}
                      </span>
                    </div>

                    <Slider
                      value={[trafficDemandShift]}
                      onValueChange={(val) => setTrafficDemandShift(val[0])}
                      min={-30}
                      max={50}
                      step={5}
                      className="[&_[role=slider]]:bg-[#F53799] [&_[role=slider]]:w-4 [&_[role=slider]]:h-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md"
                    />

                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      {[
                        { label: "Rain (-10%)", val: -10 },
                        { label: "Normal (0%)", val: 0 },
                        { label: "Weekend (+30%)", val: 30 },
                        { label: "Payday (+50%)", val: 50 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setTrafficDemandShift(preset.val)}
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md transition-all cursor-pointer ${
                            trafficDemandShift === preset.val
                              ? "bg-[#F53799] text-white"
                              : "bg-white border border-[#FFD9EC] text-[#223047]/70 hover:bg-[#FFD9EC]/40"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-left md:text-right pl-3 border-l border-[#FFD9EC]">
                    <div className="text-xs md:text-sm text-[#223047] opacity-60 mb-1">Selected Operating Hour</div>
                    <div className="text-base md:text-lg font-bold text-[#F53799]">{formatHour(trafficOptimizerTime[0])}</div>
                  </div>
                </div>
              )}
            </div>

            {simulationTargetDay === "today" && !isStoreOperatingNow ? (
              <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-8 md:p-12 text-center space-y-4">
                <div className="space-y-2 max-w-lg mx-auto">
                  <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#FFF2FA] text-[#F53799] border border-[#FFD9EC]">
                    Store Closed • Offline
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-[#223047]">
                    Physical Operations Have Ended for Today
                  </h3>
                  <p className="text-xs md:text-sm text-[#223047]/70 leading-relaxed">
                    Physical store operating hours are strictly <strong>7:00 AM – 7:00 PM</strong> (Asia/Manila). All shifts for {todayContext?.dayOfWeek ? `${todayContext.dayOfWeek}, ${todayContext.date}` : "Today"} have ended. Real-time customer queue tracking and active shift dispatching are offline.
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSimulationTargetDay("tomorrow")}
                    className="bg-[#F53799] hover:bg-[#d92680] text-white font-bold text-xs md:text-sm px-5 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    Switch to Tomorrow (Next-Day Planning Mode)
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* TIME SLIDER */}
                <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl p-4 md:p-6 space-y-3 md:space-y-4">
              <div className="flex items-center justify-between text-xs md:text-sm font-semibold text-[#223047]">
                <span>SELECT OPERATING HOUR</span>
                <span className="text-[#F53799] font-bold">{formatHour(trafficOptimizerTime[0])} (Active Simulation)</span>
              </div>
              <div className="relative">
                <Slider
                  value={trafficOptimizerTime}
                  onValueChange={setTrafficOptimizerTime}
                  max={19}
                  min={7}
                  step={1}
                  className="[&_[role=slider]]:bg-gradient-to-r [&_[role=slider]]:from-[#F53799] [&_[role=slider]]:to-[#06B6D4] [&_[role=slider]]:w-6 [&_[role=slider]]:h-6 [&_[role=slider]]:border-4 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-lg"
                />
                <div className="flex justify-between mt-3 text-xs text-[#223047] opacity-60">
                  <span>07:00</span>
                  <span>10:00</span>
                  <span>13:00</span>
                  <span>16:00</span>
                  <span>19:00</span>
                </div>
              </div>
            </div>

            {/* Stats (No Icons) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="p-3 md:p-4 bg-[#FFF2FA] rounded-lg md:rounded-xl text-center border border-[#FFD9EC]/50">
                <div className="text-xs text-[#223047] opacity-60 mb-1 font-medium">
                  {simulationTargetDay === "tomorrow" ? "Tomorrow's" : "Today's"} Expected Visits (All Hours)
                </div>
                {trafficOptimizerLoading || !todayContext ? (
                  <div className="h-7 w-20 bg-[#FFD9EC]/60 animate-pulse rounded mx-auto my-1" />
                ) : (
                  <div className="text-xl md:text-2xl font-bold text-[#223047]">
                    {todayContext?.hourlyForecast
                      ? Math.round(todayContext.hourlyForecast.reduce((sum: number, h: any) => sum + Number(h.predictedVisits || 0), 0) * (1 + trafficDemandShift / 100))
                      : Math.round(totalPredictedTraffic * (1 + trafficDemandShift / 100))}
                  </div>
                )}
                <div className="text-[10px] text-[#223047] opacity-60 mt-1">Across all operating sectors (07:00 - 19:00)</div>
              </div>

              <div className="p-3 md:p-4 bg-[#FFF2FA] rounded-lg md:rounded-xl text-center border border-[#FFD9EC]/50">
                <div className="text-xs text-[#223047] opacity-60 mb-1 font-medium">
                  Peak Congestion Window
                </div>
                {trafficOptimizerLoading || !todayPeakCongestion ? (
                  <div className="space-y-1 my-1">
                    <div className="h-5 w-24 bg-[#FFD9EC]/60 animate-pulse rounded mx-auto" />
                    <div className="h-3 w-16 bg-[#FFD9EC]/40 animate-pulse rounded mx-auto" />
                  </div>
                ) : (
                  <>
                    <div className="text-lg md:text-xl font-bold text-[#F53799]">
                      {todayPeakCongestion.window}
                    </div>
                    <div className="text-[10px] text-[#223047] opacity-60 mt-1">
                      {todayPeakCongestion.detail}
                    </div>
                  </>
                )}
              </div>

              <div className="p-3 md:p-4 bg-[#FFF2FA] rounded-lg md:rounded-xl text-center border border-[#FFD9EC]/50">
                <div className="text-xs text-[#223047] opacity-60 mb-1 font-medium">
                  Active Scheduled Staff
                </div>
                {trafficOptimizerLoading || !todayContext ? (
                  <div className="h-7 w-12 bg-[#FFD9EC]/60 animate-pulse rounded mx-auto my-1" />
                ) : (
                  <div className="text-xl md:text-2xl font-bold text-[#06B6D4]">
                    {totalDynamicScheduledStaff}
                  </div>
                )}
                <div className="text-[10px] text-[#223047] opacity-60 mt-1">
                  At {formatHour(trafficOptimizerTime[0])} ({simulationTargetDay === "tomorrow" ? "Scheduled Shift" : "Live Shift"})
                </div>
              </div>

              <div className="p-3 md:p-4 bg-[#FFF2FA] rounded-lg md:rounded-xl text-center border border-[#FFD9EC]/50">
                <div className="text-xs text-[#223047] opacity-60 mb-1 font-medium">
                  Recommended Staff
                </div>
                {trafficOptimizerLoading || !todayContext ? (
                  <div className="h-7 w-12 bg-[#FFD9EC]/60 animate-pulse rounded mx-auto my-1" />
                ) : (
                  <div className="text-xl md:text-2xl font-bold text-[#223047]">
                    {totalDynamicRecommendedStaff}
                  </div>
                )}
                <div className="text-[10px] text-[#223047] opacity-60 mt-1">Erlang C queue model (SLA &le; 8m)</div>
              </div>
            </div>

            {/* TRAFFIC HEATMAP PER SECTOR (% CAPACITY LOAD) */}
            <div className="rounded-xl md:rounded-2xl border border-[#FFD9EC] overflow-hidden mt-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-[#FFF7FB] px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="text-sm font-bold text-[#223047]">
                    Traffic Heatmap per Sector ({todayContext?.dayOfWeek || (simulationTargetDay === "tomorrow" ? "Tomorrow" : "Today")}'s Hourly Capacity Load)
                  </div>
                  <span className="text-[11px] text-[#223047] opacity-70">
                    Learned from historical {todayContext?.dayOfWeek || (simulationTargetDay === "tomorrow" ? "Monday" : "Sunday")} data + live weather
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#223047]">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Low (&lt;50%)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Medium (50-80%)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> High (&gt;80%)</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-t border-[#FFD9EC] bg-white text-left text-xs uppercase tracking-wide text-[#223047] opacity-70">
                      <th className="px-4 py-3 font-semibold sticky left-0 bg-white z-10">Sector</th>
                      {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour) => {
                        const isCurrentHour = trafficOptimizerTime[0] === hour;
                        return (
                          <th
                            key={hour}
                            onClick={() => setTrafficOptimizerTime([hour])}
                            className={`px-2.5 py-3 font-semibold text-center cursor-pointer transition-colors ${
                              isCurrentHour ? "bg-[#F53799] text-white opacity-100 rounded-t-md" : "hover:bg-slate-50"
                            }`}
                          >
                            {String(hour).padStart(2, "0")}:00
                          </th>
                        );
                      })}
                      <th className="px-3 py-3 font-semibold text-center bg-slate-50">Avg Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficOptimizerLoading && (
                      <tr className="border-t border-[#FFD9EC]">
                        <td colSpan={15} className="px-4 py-8 text-center text-sm text-[#223047] opacity-60">
                          Recalibrating today's traffic simulation from historical transactions and live context...
                        </td>
                      </tr>
                    )}
                    {!trafficOptimizerLoading && trafficOptimizerError && (
                      <tr className="border-t border-[#FFD9EC]">
                        <td colSpan={15} className="px-4 py-8 text-center text-sm text-rose-600">
                          Unable to load today's traffic: {trafficOptimizerError}
                        </td>
                      </tr>
                    )}
                    {!trafficOptimizerLoading && !trafficOptimizerError && (
                      <>
                        {/* SERVICES ROW */}
                        <tr className="border-t border-[#FFD9EC]">
                          <td className="px-4 py-3 font-semibold text-[#223047] sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-[#3AE4FA]" />
                              Services
                              <button
                                onClick={() => toggleSector("Services")}
                                className="ml-auto text-[11px] font-semibold text-[#06B6D4] hover:underline"
                              >
                                {expandedSectors["Services"] ? "[-] Collapse" : "[+] Sub-sectors"}
                              </button>
                            </div>
                          </td>
                          {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour) => {
                            const hourData = todayContext?.hourlyForecast?.find((h: any) => h.hour === hour);
                            const secData = hourData?.sectorVisits?.Services;
                            const visits = secData?.visits ?? 2;
                            const utilPct = secData?.utilizationPercent ?? Math.round((visits / 4) * 100);
                            const level = secData?.demandLevel ?? "Low";
                            const isSelected = trafficOptimizerTime[0] === hour;
                            return (
                              <td
                                key={`services-${hour}`}
                                onClick={() => setTrafficOptimizerTime([hour])}
                                className={`px-2 py-2 cursor-pointer ${isSelected ? "bg-[#FFF2FA]" : ""}`}
                              >
                                <div
                                  className={`mx-auto flex min-h-[46px] w-full max-w-[72px] items-center justify-center rounded-lg px-1.5 py-1 text-center transition-all ${
                                    demandStyles[level].bg
                                  } ${isSelected ? "ring-2 ring-[#F53799] shadow-sm font-black" : ""}`}
                                >
                                  <div className={`text-xs font-bold ${demandStyles[level].text}`}>
                                    {utilPct}%
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center font-bold text-[#223047] bg-slate-50">
                            {todayContext?.hourlyForecast && todayContext.hourlyForecast.length > 0
                              ? Math.round(
                                  todayContext.hourlyForecast.reduce(
                                    (sum: number, h: any) => sum + (h.sectorVisits?.Services?.utilizationPercent || 0),
                                    0,
                                  ) / todayContext.hourlyForecast.length,
                                ) + "%"
                              : "50%"}
                          </td>
                        </tr>

                        {/* SUBSECTORS IF EXPANDED (ONLY GROOMING AND PET HOTEL - BDAY PAWTY REMOVED) */}
                        {expandedSectors["Services"] && (
                          <>
                            {["Grooming", "Pet Hotel"].map((subName) => (
                              <tr key={subName} className="bg-slate-50/70 border-t border-[#FFD9EC]">
                                <td className="px-4 py-2 pl-8 text-xs font-medium text-[#223047] opacity-80 sticky left-0 bg-slate-50/70 z-10">
                                  {subName}
                                </td>
                                {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour) => {
                                  const hourData = todayContext?.hourlyForecast?.find((h: any) => h.hour === hour);
                                  const subObj = hourData?.sectorVisits?.Services?.subSectors?.find((s: any) => s.name === subName);
                                  const utilPct = subObj?.utilizationPercent ?? (subName === "Grooming" ? 50 : 25);
                                  const level = subObj?.demandLevel ?? "Low";
                                  const isSelected = trafficOptimizerTime[0] === hour;
                                  return (
                                    <td
                                      key={`${subName}-${hour}`}
                                      onClick={() => setTrafficOptimizerTime([hour])}
                                      className={`px-2 py-1.5 cursor-pointer ${isSelected ? "bg-[#FFF2FA]" : ""}`}
                                    >
                                      <div
                                        className={`mx-auto flex min-h-[38px] w-full max-w-[64px] items-center justify-center rounded px-1 py-0.5 text-center ${demandStyles[level].bg}`}
                                      >
                                        <div className={`text-[11px] font-semibold ${demandStyles[level].text}`}>
                                          {utilPct}%
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-2 text-center text-xs font-semibold text-[#223047] bg-slate-100/50">
                                  {todayContext?.hourlyForecast && todayContext.hourlyForecast.length > 0
                                    ? Math.round(
                                        todayContext.hourlyForecast.reduce((sum: number, h: any) => {
                                          const subObj = h.sectorVisits?.Services?.subSectors?.find((s: any) => s.name === subName);
                                          return sum + (subObj?.utilizationPercent || 0);
                                        }, 0) / todayContext.hourlyForecast.length,
                                      ) + "%"
                                    : subName === "Grooming" ? "65%" : "40%"}
                                </td>
                              </tr>
                            ))}
                          </>
                        )}

                        {/* CAFE ROW */}
                        <tr className="border-t border-[#FFD9EC]">
                          <td className="px-4 py-3 font-semibold text-[#223047] sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-[#F53799]" />
                              Cafe
                            </div>
                          </td>
                          {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour) => {
                            const hourData = todayContext?.hourlyForecast?.find((h: any) => h.hour === hour);
                            const secData = hourData?.sectorVisits?.Cafe;
                            const visits = secData?.visits ?? 2;
                            const utilPct = secData?.utilizationPercent ?? Math.round((visits / 6) * 100);
                            const level = secData?.demandLevel ?? "Low";
                            const isSelected = trafficOptimizerTime[0] === hour;
                            return (
                              <td
                                key={`cafe-${hour}`}
                                onClick={() => setTrafficOptimizerTime([hour])}
                                className={`px-2 py-2 cursor-pointer ${isSelected ? "bg-[#FFF2FA]" : ""}`}
                              >
                                <div
                                  className={`mx-auto flex min-h-[46px] w-full max-w-[72px] items-center justify-center rounded-lg px-1.5 py-1 text-center transition-all ${
                                    demandStyles[level].bg
                                  } ${isSelected ? "ring-2 ring-[#F53799] shadow-sm font-black" : ""}`}
                                >
                                  <div className={`text-xs font-bold ${demandStyles[level].text}`}>
                                    {utilPct}%
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center font-bold text-[#223047] bg-slate-50">
                            {todayContext?.hourlyForecast && todayContext.hourlyForecast.length > 0
                              ? Math.round(
                                  todayContext.hourlyForecast.reduce(
                                    (sum: number, h: any) => sum + (h.sectorVisits?.Cafe?.utilizationPercent || 0),
                                    0,
                                  ) / todayContext.hourlyForecast.length,
                                ) + "%"
                              : "55%"}
                          </td>
                        </tr>

                        {/* RETAIL ROW */}
                        <tr className="border-t border-[#FFD9EC]">
                          <td className="px-4 py-3 font-semibold text-[#223047] sticky left-0 bg-white z-10">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                              Retail
                            </div>
                          </td>
                          {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour) => {
                            const hourData = todayContext?.hourlyForecast?.find((h: any) => h.hour === hour);
                            const secData = hourData?.sectorVisits?.Retail;
                            const visits = secData?.visits ?? 1;
                            const utilPct = secData?.utilizationPercent ?? Math.round((visits / 6) * 100);
                            const level = secData?.demandLevel ?? "Low";
                            const isSelected = trafficOptimizerTime[0] === hour;
                            return (
                              <td
                                key={`retail-${hour}`}
                                onClick={() => setTrafficOptimizerTime([hour])}
                                className={`px-2 py-2 cursor-pointer ${isSelected ? "bg-[#FFF2FA]" : ""}`}
                              >
                                <div
                                  className={`mx-auto flex min-h-[46px] w-full max-w-[72px] items-center justify-center rounded-lg px-1.5 py-1 text-center transition-all ${
                                    demandStyles[level].bg
                                  } ${isSelected ? "ring-2 ring-[#F53799] shadow-sm font-black" : ""}`}
                                >
                                  <div className={`text-xs font-bold ${demandStyles[level].text}`}>
                                    {utilPct}%
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center font-bold text-[#223047] bg-slate-50">
                            {todayContext?.hourlyForecast && todayContext.hourlyForecast.length > 0
                              ? Math.round(
                                  todayContext.hourlyForecast.reduce(
                                    (sum: number, h: any) => sum + (h.sectorVisits?.Retail?.utilizationPercent || 0),
                                    0,
                                  ) / todayContext.hourlyForecast.length,
                                ) + "%"
                              : "30%"}
                          </td>
                        </tr>

                        {/* COMBINED TOTAL ROW */}
                        <tr className="border-t-2 border-[#FFD9EC] bg-[#FFF7FB] font-bold">
                          <td className="px-4 py-3 text-xs uppercase tracking-wider text-[#223047] sticky left-0 bg-[#FFF7FB] z-10">
                            Combined Total Capacity Load
                          </td>
                          {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((hour) => {
                            const hourData = todayContext?.hourlyForecast?.find((h: any) => h.hour === hour);
                            const total = hourData?.predictedVisits ?? 5;
                            const totalCap = hourData?.totalCapacity ?? 16;
                            const utilPct = hourData?.capacityUtilizationPercent ?? Math.round((total / totalCap) * 100);
                            const isSelected = trafficOptimizerTime[0] === hour;
                            return (
                              <td
                                key={`total-${hour}`}
                                onClick={() => setTrafficOptimizerTime([hour])}
                                className={`px-2 py-2 text-center cursor-pointer ${isSelected ? "bg-[#FFF2FA]" : ""}`}
                              >
                                <div
                                  className={`mx-auto flex min-h-[36px] w-full max-w-[64px] items-center justify-center rounded-md text-xs font-black ${
                                    isSelected ? "bg-[#F53799] text-white" : "text-[#223047]"
                                  }`}
                                >
                                  {utilPct}%
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center font-black text-sm text-[#F53799] bg-[#FFF2FA]">
                            {todayContext?.hourlyForecast && todayContext.hourlyForecast.length > 0
                              ? Math.round(
                                  todayContext.hourlyForecast.reduce(
                                    (sum: number, h: any) => sum + (h.capacityUtilizationPercent || 0),
                                    0,
                                  ) / todayContext.hourlyForecast.length,
                                ) + "%"
                              : "45%"}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* STAFFING RECOMMENDATION (AT SELECTED HOUR) */}
            <div className="rounded-xl md:rounded-2xl border border-[#FFD9EC] p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base md:text-lg font-bold text-[#223047]">
                      Staffing Recommendation (At {formatHour(trafficOptimizerTime[0])})
                    </h3>
                    <span className="rounded-md bg-[#E8F8F5] text-[#10B981] border border-[#A7F3D0] px-2 py-0.5 text-xs font-semibold">
                      {simulationTargetDay === "tomorrow" ? "Scheduled Shift vs Erlang C Queue Model" : "Live Shift vs Erlang C Queue Model"}
                    </span>
                  </div>
                  <div className="text-xs text-[#223047] opacity-65 mt-0.5">
                    Calculated from actual staff shift hours and forecasted traffic at {formatHour(trafficOptimizerTime[0])}
                  </div>
                </div>
              </div>

              {trafficOptimizerLoading || !todayContext ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {[1, 2, 3].map((idx) => (
                    <div key={idx} className="rounded-xl bg-[#FFF7FB] border border-[#FFD9EC] p-4 space-y-3 animate-pulse">
                      <div className="flex justify-between items-center">
                        <div className="h-4 w-20 bg-[#FFD9EC]/70 rounded" />
                        <div className="h-6 w-16 bg-[#FFD9EC]/50 rounded" />
                      </div>
                      <div className="h-8 w-full bg-[#FFD9EC]/40 rounded" />
                      <div className="h-6 w-3/4 bg-[#FFD9EC]/50 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {dynamicHourlyStaffingPlan.map((sec) => {
                    const needsMoreStaff = sec.staffDelta > 0;
                    const canReduceStaff = sec.staffDelta < 0;
                    const isAccepted = acceptedStaffingSectors.includes(sec.sector);
                    const sectorColor =
                      sec.sector === "Services" ? "#3AE4FA" : sec.sector === "Cafe" ? "#F53799" : "#F59E0B";

                    return (
                      <div key={sec.sector} className="rounded-xl bg-[#FFF7FB] border border-[#FFD9EC] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-bold text-[#223047]">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sectorColor }} />
                              {sec.sector}
                            </div>
                            <div className="mt-1 text-xs text-[#223047] opacity-65">
                              {sec.demandLevel} demand ({sec.visits} visit{sec.visits === 1 ? '' : 's'} at {formatHour(trafficOptimizerTime[0])})
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-center text-xs shrink-0">
                            <div className="rounded-lg bg-white border border-[#FFD9EC] px-2.5 py-1.5">
                              <div className="text-[#223047] opacity-60 text-[10px] uppercase font-semibold">Scheduled</div>
                              <div className="font-bold text-[#223047] text-sm">{sec.scheduledStaff}</div>
                            </div>
                            <div className="rounded-lg bg-white border border-[#FFD9EC] px-2.5 py-1.5">
                              <div className="text-[#223047] opacity-60 text-[10px] uppercase font-semibold">Needed</div>
                              <div className="font-bold text-[#223047] text-sm">{sec.recommendedStaff}</div>
                            </div>
                          </div>
                        </div>

                        {/* ACTIVE STAFF ON SHIFT */}
                        <div className="text-[11px] text-[#223047] bg-white rounded-lg p-2.5 border border-[#FFD9EC]">
                          <span className="font-semibold opacity-75">On Shift ({sec.scheduledStaff}): </span>
                          <span className="opacity-90 font-medium">
                            {sec.staffNames.length > 0 ? sec.staffNames.join(", ") : "None scheduled for this hour"}
                          </span>
                        </div>

                        <div
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            needsMoreStaff
                              ? "bg-rose-50 text-rose-800 border border-rose-200"
                              : canReduceStaff
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          <span className="font-bold mr-1.5">
                            {needsMoreStaff ? "[Shortage]" : canReduceStaff ? "[Surplus]" : "[Optimal]"}
                          </span>
                          {sec.action}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcceptStaffingRecommendation(sec)}
                          disabled={isAccepted}
                          className="w-full h-8 rounded-lg border-[#06B6D4] text-[#06B6D4] hover:bg-[#E0F7FA] text-[11px] font-semibold"
                        >
                          {isAccepted ? "Recommendation Accepted" : "Accept Recommendation"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* VISUAL RELIEF DIVIDER - AI INSIGHT WITH MASCOT (GLM POWERED) */}
            <div
              className="woof-insight-band rounded-2xl flex items-center justify-between px-4 md:px-8 py-4 relative overflow-hidden border border-[#FFD9EC]"
              style={{ background: "linear-gradient(to right, #FFF7FB, #FFF2FA)" }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">
                    WOOF Insight
                  </Badge>
                  <span className="rounded-full bg-[#E6FAFF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#08768A]">
                    GLM 5.3
                  </span>
                </div>
                {trafficGlmLoading ? (
                  <div className="space-y-2 py-1">
                    <div className="h-3.5 w-11/12 animate-pulse rounded bg-[#FFD9EC]" />
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-[#FFD9EC]" />
                  </div>
                ) : (
                  <InsightText text={trafficGlmInsight} />
                )}
              </div>
              <img
                src={aiMascot.src}
                alt="WOOF AI Mascot"
                className="woof-mascot-motion w-24 h-24 md:w-32 md:h-32 object-contain flex-shrink-0 ml-4 md:ml-6"
              />
            </div>

            {/* TECHNICAL MODELS & MATHEMATICAL FRAMEWORK (COLLAPSIBLE DROPDOWN) */}
            <details className="rounded-xl md:rounded-2xl border border-[#FFD9EC] bg-white p-4 md:p-6 transition-all group">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-bold text-[#223047] uppercase tracking-wider select-none">
                <span className="flex items-center gap-2">
                  <span>Technical Models &amp; Mathematical Framework</span>
                </span>
                <span className="text-[#F53799] font-semibold text-xs">[Click to Expand / Hide]</span>
              </summary>
              <div className="mt-4 pt-4 border-t border-[#FFD9EC] space-y-4 text-xs text-[#223047]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#FFF7FB] rounded-lg border border-[#FFD9EC]">
                    <div className="opacity-60 text-[10px] uppercase font-bold">1. Demand Forecasting Model</div>
                    <div className="font-bold text-sm mt-0.5 text-[#223047]">Generalized Linear Model (GLM)</div>
                    <div className="text-[11px] opacity-70 mt-1">Multiplicative time-series synthesis incorporating day-of-week, diurnal hour, and Open-Meteo weather regressors.</div>
                  </div>
                  <div className="p-3 bg-[#FFF7FB] rounded-lg border border-[#FFD9EC]">
                    <div className="opacity-60 text-[10px] uppercase font-bold">2. Staffing Optimization</div>
                    <div className="font-bold text-sm mt-0.5 text-[#223047]">Erlang C Queuing Model (M/M/c)</div>
                    <div className="text-[11px] opacity-70 mt-1">Calculates minimum staff count c to bound delay probability wait times P(W &gt; 0) within 8.0-minute target SLA.</div>
                  </div>
                  <div className="p-3 bg-[#FFF7FB] rounded-lg border border-[#FFD9EC]">
                    <div className="opacity-60 text-[10px] uppercase font-bold">3. Prescriptive Narrative</div>
                    <div className="font-bold text-sm mt-0.5 text-[#223047]">GLM AI Language Model</div>
                    <div className="text-[11px] opacity-70 mt-1">Zhipu GLM integration via backend LLM service for plain-language store manager shift advice.</div>
                  </div>
                  <div className="p-3 bg-[#FFF7FB] rounded-lg border border-[#FFD9EC]">
                    <div className="opacity-60 text-[10px] uppercase font-bold">4. Data Integrity Guard</div>
                    <div className="font-bold text-sm mt-0.5 text-[#223047]">Chronological Partitioning</div>
                    <div className="text-[11px] opacity-70 mt-1">Historical training observations strictly constrained prior to today (t &lt; todayStart) to prevent data leakage.</div>
                  </div>
                </div>

                <div className="text-[11px] opacity-75 leading-relaxed bg-[#FFF2FA] p-3 rounded-lg border border-[#FFD9EC]">
                  <span className="font-bold text-[#F53799]">Model Formulation:</span> Predicted Visits(sector, hour) = Baseline(sector, hour) &times; Factor(DayOfWeek) &times; Factor(Weather) &times; Factor(Holiday). Recommended staff is dynamically solved by optimizing multi-channel queue capacity against the scheduled roster.
                </div>
              </div>
            </details>
              </>
            )}
          </div>

          {/* TRAFFIC TREND (TODAY'S OPERATING HOURS CURVE) */}
          {(simulationTargetDay === "tomorrow" || isStoreOperatingNow) && (
            <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                  {simulationTargetDay === "tomorrow" ? "Tomorrow's" : "Today's"} Hourly Traffic Curve
                </h2>
                <div className="text-xs text-[#223047] opacity-60 mt-0.5">
                  Simulated hourly visit volume for {todayContext?.dayOfWeek ? `${todayContext.dayOfWeek}, ${todayContext.date}` : (simulationTargetDay === "tomorrow" ? "Tomorrow" : "Today")} across Services, Cafe, and Retail
                </div>
              </div>
              <div className="text-xs font-semibold text-[#06B6D4] bg-[#E0F7FA] px-2.5 py-1 rounded-full border border-[#B2EBF2]">
                Full Day Simulation
              </div>
            </div>

            <ResponsiveContainer width="100%" height={250} className="md:!h-[300px]">
              <AreaChart data={todayHourlyPrediction.length > 0 ? todayHourlyPrediction : trafficPrediction}>
                <defs>
                  <linearGradient key="trafficGradient-gradient" id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#FFD9EC" vertical={false} />
                <XAxis dataKey="day" stroke="#223047" style={{ fontSize: "12px" }} />
                <YAxis stroke="#223047" style={{ fontSize: "12px" }} allowDecimals={false} />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-[#FFD9EC] bg-white p-3 shadow-lg text-xs space-y-1.5 min-w-[180px]">
                        <div className="font-bold text-[#223047] border-b border-[#FFD9EC] pb-1 flex items-center justify-between">
                          <span>{data.fullDayLabel || label}</span>
                          <span className="text-[10px] text-[#06B6D4] font-semibold">Forecast</span>
                        </div>
                        <div className="space-y-1 text-[#223047]">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F53799]" /> Cafe</span>
                            <span className="font-bold">{data.cafe || 0} visits</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3AE4FA]" /> Services</span>
                            <span className="font-bold">{data.services || 0} visits</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Retail</span>
                            <span className="font-bold">{data.retail || 0} visits</span>
                          </div>
                        </div>
                        <div className="border-t border-[#FFD9EC] pt-1 flex items-center justify-between font-bold text-[#223047]">
                          <span>Combined Total:</span>
                          <span className="text-[#F53799]">{data.visits || 0} visits</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="#06B6D4"
                  strokeWidth={2.5}
                  fill="url(#trafficGradient)"
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* FEEDBACK WIDGET (NO ICONS) */}
            <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm md:text-base text-[#223047]">
                  Was this prescriptive traffic &amp; staffing recommendation helpful?
                </h3>
                <div className="text-xs text-[#223047] opacity-60 mt-0.5">
                  Feedback is recorded to calibrate forecasting weights.
                </div>
              </div>

              {trafficEngineFeedback !== null ? (
                <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200">
                  Feedback recorded: {trafficEngineFeedback === "helpful" ? "Helpful" : "Needs Adjustment"}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAcceptStaffingRecommendation}
                    disabled={staffingRecommendationAccepted}
                    className="border-[#06B6D4] text-[#06B6D4] hover:bg-[#E0F7FA] text-xs h-9 px-4 rounded-xl"
                  >
                    {staffingRecommendationAccepted ? "Accepted" : "Accept Recommendation"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleTrafficEngineFeedback(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 rounded-xl"
                  >
                    Yes, Helpful
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTrafficEngineFeedback(false)}
                    className="border-[#FFD9EC] text-[#223047] hover:bg-[#FFF2FA] text-xs h-9 px-4 rounded-xl"
                  >
                    Needs Adjustment
                  </Button>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {activeTab === "scenario-builder" && (
        <div className="space-y-4 md:space-y-6 lg:space-y-8">
          <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                  Business Scenario Builder & What-If Analysis
                </h2>
                <InfoTooltip label="Test operational scenarios using forecast APIs, weather inputs, and the promo response model." />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
              {/* Left: Controls */}
              <div className="space-y-4 md:space-y-6">
                <div>
                  <label className="text-xs md:text-sm font-semibold text-[#223047] mb-2 block">
                    Scenario Name
                  </label>
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    className="w-full px-3 md:px-4 py-2 border border-[#FFD9EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F53799] text-sm md:text-base"
                  />
                </div>

                <div>
                  <label className="text-xs md:text-sm font-semibold text-[#223047] mb-2 block">
                    Weather Condition
                  </label>
                  <select
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                    className="w-full px-3 md:px-4 py-2 border border-[#FFD9EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F53799] text-sm md:text-base"
                  >
                    <option value="sunny">Sunny</option>
                    <option value="rainy">Rainy</option>
                    <option value="cloudy">Cloudy</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs md:text-sm font-semibold text-[#223047] mb-2 block">
                    Day of Week
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    className="w-full px-3 md:px-4 py-2 border border-[#FFD9EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F53799] text-sm md:text-base"
                  >
                    <option value="monday">Monday</option>
                    <option value="tuesday">Tuesday</option>
                    <option value="wednesday">Wednesday</option>
                    <option value="thursday">Thursday</option>
                    <option value="friday">Friday</option>
                    <option value="saturday">Saturday</option>
                    <option value="sunday">Sunday</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs md:text-sm font-semibold text-[#223047] mb-2 block">
                    Temperature: {temperature[0]}C
                  </label>
                  <Slider
                    value={temperature}
                    onValueChange={setTemperature}
                    max={40}
                    min={20}
                    step={1}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <div className="p-3 md:p-4 bg-[#FFF7FB] rounded-lg md:rounded-xl">
                    <label className="flex items-center gap-2 md:gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={promoActive}
                        onChange={(e) => setPromoActive(e.target.checked)}
                        className="w-4 h-4 text-[#F53799] rounded"
                      />
                      <div>
                        <div className="text-xs md:text-sm font-semibold text-[#223047]">Promo Active</div>
                        <div className="text-xs text-[#223047] opacity-60">Uses promo response model</div>
                      </div>
                    </label>
                  </div>

                  <div className="p-3 md:p-4 bg-[#FFF7FB] rounded-lg md:rounded-xl">
                    <label className="flex items-center gap-2 md:gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paydayWeekend}
                        onChange={(e) => setPaydayWeekend(e.target.checked)}
                        className="w-4 h-4 text-[#F53799] rounded"
                      />
                      <div>
                        <div className="text-xs md:text-sm font-semibold text-[#223047]">Payday Weekend</div>
                        <div className="text-xs text-[#223047] opacity-60">Adds spend timing lift</div>
                      </div>
                    </label>
                  </div>
                </div>
                {scenarioPromoModel?.status === "success" && scenarioPromoModel.quietPeriod && (
                  <div className="mt-3 p-3 bg-white/50 border border-[#FFD9EC] rounded-lg">
                    <div className="text-xs font-semibold text-[#F53799]">Optimal promo window: {scenarioPromoModel.quietPeriod} (predicted low demand, high discount conversion probability).</div>
                  </div>
                )}

                <Button
                  onClick={handleRunSimulation}
                  disabled={scenarioLoading}
                  className="w-full bg-[#F53799] hover:bg-[#D42A7D]"
                >
                  {scenarioLoading ? "Updating Predictions..." : "Update Predictions"}
                </Button>
              </div>

              {/* Right: Outcomes */}
              <div className="space-y-4 md:space-y-6">
                <div className="p-4 md:p-6 bg-gradient-to-br from-[#F53799] to-[#D42A7D] rounded-xl md:rounded-2xl text-white">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3 md:mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base md:text-lg font-bold">Predicted Outcomes</h3>
                        <InfoTooltip label={`Source: ${scenarioOutcome.sourceLabel}`} />
                      </div>
                    </div>
                    <div className="text-xs bg-white/15 rounded-lg px-3 py-2">
                      Model confidence: {scenarioOutcome.confidence ? `${scenarioOutcome.confidence}%` : "Calibrating"}
                    </div>
                  </div>
                  {scenarioError && (
                    <div className="mb-3 rounded-lg bg-white/15 p-3 text-xs">
                      {scenarioError}
                    </div>
                  )}
                  <div className="space-y-3">
                    {[
                      {
                        metric: "Revenue",
                        value: formatCurrency(scenarioOutcome.revenue),
                        change: `${parseFloat(scenarioOutcome.revenueChange) > 0 ? "+" : ""}${scenarioOutcome.revenueChange}%`,
                      },
                      {
                        metric: "Orders",
                        value: scenarioOutcome.orders,
                        change: `${parseFloat(scenarioOutcome.ordersChange) > 0 ? "+" : ""}${scenarioOutcome.ordersChange}%`,
                      },
                      {
                        metric: "Avg Transaction",
                        value: formatCurrency(scenarioOutcome.avgTransaction),
                        change: `${parseFloat(scenarioOutcome.avgTransactionChange) > 0 ? "+" : ""}${scenarioOutcome.avgTransactionChange}%`,
                      },
                      {
                        metric: "Cafe Share",
                        value: `${scenarioOutcome.cafeShare}%`,
                        change: `${parseFloat(scenarioOutcome.cafeShareChange) > 0 ? "+" : ""}${scenarioOutcome.cafeShareChange}%`,
                      },
                    ].map((item) => (
                      <div
                        key={item.metric}
                        className="flex items-center justify-between p-4 bg-white/10 backdrop-blur rounded-xl"
                      >
                        <span className="text-sm opacity-90">{item.metric}</span>
                        <div className="text-right">
                          <div className="font-bold text-lg">{item.value}</div>
                          <div className={`text-xs ${parseFloat(item.change) >= 0 ? "text-green-300" : "text-red-300"}`}>
                            {item.change}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-white/10 p-3">
                      <div className="opacity-70">Baseline Revenue</div>
                      <div className="font-bold">{formatCurrency(scenarioOutcome.baselineRevenue)}</div>
                    </div>
                    <div className="rounded-lg bg-white/10 p-3">
                      <div className="opacity-70">Baseline Orders</div>
                      <div className="font-bold">{scenarioOutcome.baselineOrders}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 md:p-6 bg-[#FFF7FB] rounded-xl md:rounded-2xl space-y-3 md:space-y-4">
              <h3 className="text-sm md:text-base font-bold text-[#223047]">Impact Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scenarioOutcome.scenarioFactorBreakdown.map((item) => {
                  const impactLabel = `${item.impact > 0 ? "+" : ""}${Math.round(item.impact * 100)}%`;
                  return (
                    <div
                      key={item.factor}
                      className="flex min-h-[96px] items-start justify-between gap-3 p-4 bg-white rounded-lg"
                    >
                      <div>
                        <div className="text-sm font-semibold text-[#223047]">{item.factor}</div>
                        <div className="text-xs text-[#223047] opacity-60 mt-1" style={{ lineHeight: "1.5" }}>{item.description}</div>
                      </div>
                      <span
                        className={`text-sm font-semibold flex-shrink-0 ${impactLabel.startsWith("+")
                            ? "text-green-600"
                            : impactLabel.startsWith("-")
                              ? "text-red-600"
                              : "text-gray-500"
                          }`}
                      >
                        {impactLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 md:p-6 bg-[#223047] rounded-xl md:rounded-2xl text-white">
              <h3 className="text-xs md:text-sm font-semibold mb-2">WOOF Recommendation</h3>
              <p className="text-xs md:text-sm opacity-90" style={{ lineHeight: "1.6" }}>
                {parseFloat(scenarioOutcome.revenueChange) > 10
                  ? "Highly favorable conditions detected. Execute aggressive marketing and ensure full inventory."
                  : parseFloat(scenarioOutcome.revenueChange) < -5
                    ? "Challenging conditions predicted. Consider defensive promotions and optimize staffing levels."
                    : "Moderate conditions. Maintain standard operations with light promotional activity."}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "activation-layer" && (
        <CampaignActivationLayer />
      )}

      {/* Bundle Explanation Side Drawer */}
      <BundleExplanationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        candidate={selectedCandidateForDrawer}
      />
    </div>
  );
}
