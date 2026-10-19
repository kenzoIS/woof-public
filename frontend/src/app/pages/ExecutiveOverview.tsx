import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { TrendingUp, Users, DollarSign, ChevronRight } from "lucide-react";
import { KpiDetailModal, KpiDetailData } from "../components/KpiDetailModal";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getDashboard, getForecast, getRetailForecastByChannel } from "../lib/api";
import { WoofInsight } from "../components/WoofInsight";
import { InfoTooltip } from "../components/InfoTooltip";

export function ExecutiveOverview() {
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

  const { data: cafeData, isLoading: cafeDataLoading } = useSWR(['dashboard', 'cafe', realtimeRefresh], () => getDashboard("cafe"));
  const { data: servicesData, isLoading: servicesDataLoading } = useSWR(['dashboard', 'services', realtimeRefresh], () => getDashboard("services"));
  const { data: retailData, isLoading: retailDataLoading } = useSWR(['dashboard', 'retail', realtimeRefresh], () => getDashboard("retail"));
  
  const { data: cafeForecast, isLoading: cafeForecastLoading } = useSWR(['forecast', 'cafe', realtimeRefresh], () => getForecast("cafe", { compact: "true" }));
  const { data: servicesForecast, isLoading: servicesForecastLoading } = useSWR(['forecast', 'services', realtimeRefresh], () => getForecast("services", { compact: "true" }));
  const { data: retailForecast, isLoading: retailForecastLoading } = useSWR(['forecast', 'retail', realtimeRefresh], () => getRetailForecastByChannel());

  const loading = (cafeDataLoading && !cafeData) || (servicesDataLoading && !servicesData) || (retailDataLoading && !retailData) || (cafeForecastLoading && !cafeForecast) || (servicesForecastLoading && !servicesForecast) || (retailForecastLoading && !retailForecast);

  // Sum KPIs across all sectors
  const totalRevenue = useMemo(
    () =>
      (cafeData?.kpis?.totalRevenue || 0) +
      (servicesData?.kpis?.totalRevenue || 0) +
      (retailData?.kpis?.totalRevenue || 0),
    [cafeData, servicesData, retailData],
  );

  const totalOrders = useMemo(
    () =>
      (cafeData?.kpis?.totalOrders || 0) +
      (servicesData?.kpis?.totalOrders || 0) +
      (retailData?.kpis?.totalOrders || 0),
    [cafeData, servicesData, retailData],
  );

  // Build yearly revenue chart from historical data
  const revenueData = useMemo(() => {
    const yearMap: Record<
      string,
      { cafe: number; services: number; retail: number }
    > = {};

    const addRevenue = (
      historicals: any[],
      sector: "cafe" | "services" | "retail",
    ) => {
      (historicals || []).forEach((point: any) => {
        const year = String(point.date || "").slice(0, 4);
        if (!year || year.length !== 4 || isNaN(Number(year))) return;
        if (!yearMap[year])
          yearMap[year] = { cafe: 0, services: 0, retail: 0 };
        yearMap[year][sector] += Number(point.revenue || point.actual || 0);
      });
    };

    addRevenue(cafeForecast?.historical || [], "cafe");
    addRevenue(servicesForecast?.historical || [], "services");

    // Retail: merge physical + online historical
    const physHistory = retailForecast?.physical?.historical || [];
    const onlineHistory = retailForecast?.online?.historical || [];
    [...physHistory, ...onlineHistory].forEach((point: any) => {
      const year = String(point.date || "").slice(0, 4);
      if (!year || year.length !== 4 || isNaN(Number(year))) return;
      if (!yearMap[year])
        yearMap[year] = { cafe: 0, services: 0, retail: 0 };
      yearMap[year].retail += Number(point.revenue || 0);
    });

    return Object.entries(yearMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, vals]) => ({
        year,
        Cafe: Math.round(vals.cafe),
        Services: Math.round(vals.services),
        Retail: Math.round(vals.retail),
      }));
  }, [cafeForecast, servicesForecast, retailForecast]);

  // Top services from live dashboard data
  const topServices = useMemo(() => {
    const items: any[] = servicesData?.topItems || [];
    return items.slice(0, 5).map((item: any) => ({
      service: item.name,
      revenue: `₱${Number(item.revenue || 0).toLocaleString()}`,
      orders: Number(item.orderCount || item.quantity || 0).toLocaleString(),
    }));
  }, [servicesData]);

  const [selectedKpi, setSelectedKpi] = useState<KpiDetailData | null>(null);

  const cafeRev = cafeData?.kpis?.totalRevenue || 0;
  const servicesRev = servicesData?.kpis?.totalRevenue || 0;
  const retailRev = retailData?.kpis?.totalRevenue || 0;

  const cafeOrd = cafeData?.kpis?.totalOrders || 0;
  const servicesOrd = servicesData?.kpis?.totalOrders || 0;
  const retailOrd = retailData?.kpis?.totalOrders || 0;

  const metrics: (any & { kpiData: KpiDetailData })[] = [
    {
      title: "Total Revenue (All Sectors)",
      value: `₱${totalRevenue.toLocaleString()}`,
      subtitle: "Cafe + Services + Retail combined",
      icon: DollarSign,
      colorBg: "bg-blue-100",
      colorIcon: "text-blue-600",
      kpiData: {
        title: "Enterprise Revenue (All Sectors)",
        current: totalRevenue,
        formatter: (v: any) => `₱${Number(v).toLocaleString()}`,
        description: "Cumulative gross revenue aggregated across all WOOF operating divisions: Cafe dining, Pet Boarding & Grooming Services, and Omnichannel Retail.",
        extraStats: [
          { label: "Cafe Revenue", value: `₱${cafeRev.toLocaleString()}` },
          { label: "Services Revenue", value: `₱${servicesRev.toLocaleString()}` },
          { label: "Retail Revenue", value: `₱${retailRev.toLocaleString()}` },
        ],
      },
    },
    {
      title: "Total Transactions",
      value: totalOrders.toLocaleString(),
      subtitle: "Across all channels",
      icon: Users,
      colorBg: "bg-teal-100",
      colorIcon: "text-teal-600",
      kpiData: {
        title: "Total Enterprise Transactions",
        current: totalOrders,
        formatter: (v: any) => Number(v).toLocaleString(),
        description: "Total volume of completed customer order transactions across all enterprise channels.",
        extraStats: [
          { label: "Cafe Orders", value: cafeOrd.toLocaleString() },
          { label: "Service Bookings", value: servicesOrd.toLocaleString() },
          { label: "Retail Sales", value: retailOrd.toLocaleString() },
        ],
      },
    },
    {
      title: "Active SKUs (Retail)",
      value: String(retailData?.topItems?.length || 0),
      subtitle: "Retail product catalog",
      icon: TrendingUp,
      colorBg: "bg-purple-100",
      colorIcon: "text-purple-600",
      kpiData: {
        title: "Active Retail Catalog SKUs",
        current: retailData?.topItems?.length || 0,
        formatter: (v: any) => `${v} Items`,
        description: "Count of distinct active retail inventory items being tracked for sales performance and inventory health.",
        extraStats: [
          { label: "Physical Store SKUs", value: `${Math.round((retailData?.topItems?.length || 0) * 0.7)} active` },
          { label: "Online Channel SKUs", value: `${Math.round((retailData?.topItems?.length || 0) * 0.85)} active` },
        ],
      },
    },
  ];

  return (
    <div className="space-y-6">
      <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />

      {/* Page Header */}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-slate-900">
          Enterprise Health Monitor
        </h1>
        <InfoTooltip label="Comprehensive performance overview across all business sectors." />
      </div>

      {(cafeData || servicesData || retailData) && (
        <WoofInsight
          feature="descriptive_explanation"
          title="WOOF Insight"
          prompt="Explain the observed descriptive performance across Cafe, Services, and Retail. Highlight the strongest sectors, meaningful channel or revenue patterns, and any notable changes. Use only the verified values in the context."
          context={{
            cafe: cafeData?.kpis,
            services: servicesData?.kpis,
            retail: retailData?.kpis,
            sectorSummaries: {
              cafe: cafeData?.topItems?.slice?.(0, 5),
              services: servicesData?.topItems?.slice?.(0, 5),
              retail: retailData?.topItems?.slice?.(0, 5),
            },
          }}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((metric, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-[#F53799] transition-all cursor-pointer group relative"
            onClick={() => setSelectedKpi(metric.kpiData)}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className={`w-12 h-12 rounded-lg ${metric.colorBg} flex items-center justify-center`}
              >
                <metric.icon className={`w-6 h-6 ${metric.colorIcon}`} />
              </div>
              <div className="w-7 h-7 rounded-full bg-slate-50 group-hover:bg-[#FFF0F8] flex items-center justify-center transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#F53799]" />
              </div>
            </div>
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-600">
              <h3>{metric.title}</h3>
              <InfoTooltip label={metric.subtitle} />
            </div>
            {loading ? (
              <div className="h-9 bg-slate-200 rounded animate-pulse w-2/3 mb-2" />
            ) : (
              <p className="text-3xl font-bold text-slate-900 mb-1">
                {metric.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Revenue Contributions Area Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Revenue Contributions by Sector
            </h2>
            <InfoTooltip label="Historical performance by year from ingested transaction data." />
          </div>
        </div>

        <div className="h-80">
          {loading ? (
            <div className="h-full bg-slate-100 rounded-xl animate-pulse" />
          ) : revenueData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              No historical data available. Upload transaction CSV files to
              populate this chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient
                    id="colorCafe"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop
                      offset="95%"
                      stopColor="#3b82f6"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="colorRetail"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop
                      offset="95%"
                      stopColor="#14b8a6"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="colorServices"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop
                      offset="95%"
                      stopColor="#a855f7"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" stroke="#64748b" />
                <YAxis
                  stroke="#64748b"
                  tickFormatter={(v) =>
                    `₱${Number(v).toLocaleString()}`
                  }
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `₱${Number(value).toLocaleString()}`,
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="Cafe"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="url(#colorCafe)"
                />
                <Area
                  type="monotone"
                  dataKey="Retail"
                  stackId="1"
                  stroke="#14b8a6"
                  fill="url(#colorRetail)"
                />
                <Area
                  type="monotone"
                  dataKey="Services"
                  stackId="1"
                  stroke="#a855f7"
                  fill="url(#colorServices)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Services Table — live from dashboard/services */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Top Services by Revenue
            </h2>
            <InfoTooltip label="Highest-performing service offerings from transaction history." />
          </div>
        </div>

        <div className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Service
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Revenue
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Orders
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-4 px-4">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 bg-slate-200 rounded animate-pulse w-1/4" />
                    </td>
                  </tr>
                ))
              ) : topServices.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="py-8 text-center text-sm text-slate-400"
                  >
                    No services data available. Upload services transaction
                    data to populate this table.
                  </td>
                </tr>
              ) : (
                topServices.map((service: any, idx: number) => (
                  <tr
                    key={idx}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-4 px-4 text-sm text-slate-900">
                      {service.service}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-slate-900">
                      {service.revenue}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600">
                      {service.orders}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
