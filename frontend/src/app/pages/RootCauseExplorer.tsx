import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Activity,
  Calendar,
  CloudRain,
  Layers,
  Package,
  Percent,
  RefreshCw,
  ShoppingBag,
  Store,
  Tag,
  TrendingDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getRootCauseAnalysis } from "../lib/api";
import { Button } from "../components/ui/button";
import { WoofInsight } from "../components/WoofInsight";
import mascotImg from "../../imports/no_bg_Insight.png";

type Period = "30d" | "90d" | "ytd" | "custom";
type Dimension =
  | "waterfall"
  | "channel"
  | "category"
  | "product"
  | "stockouts"
  | "weather"
  | "promotion"
  | "discount";
interface Comparison {
  name: string;
  current: number;
  previous: number;
  variance: number;
  pctChange: number | null;
  currentQuantity: number;
  previousQuantity: number;
  quantityVariance: number;
}
interface Totals {
  revenue: number;
  grossSales: number;
  discounts: number;
  quantity: number;
  orders: number;
  rows: number;
}
interface Analysis {
  revenueBridge?: {
    quantityEffect: number;
    unitRevenueEffect: number;
    newlyRecordedProducts: number;
    absentCurrentProducts: number;
    other: number;
  };
  window: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
    timezone: string;
  };
  totals: {
    current: Totals;
    previous: Totals;
    variance: number;
    pctChange: number | null;
  };
  channels: Comparison[];
  categories: Comparison[];
  products: Comparison[];
  daily: {
    period: "current" | "previous";
    date: string;
    dayOffset: number;
    revenue: number | null;
  }[];
  heatmap: { weekday: number; hour: number; revenue: number; orders: number }[];
  stockouts: { available: boolean; reason: string };
  promotions: { available: boolean; reason: string };
  weather: {
    available: boolean;
    source: string;
    rainyDays: number;
    dryDays: number;
    rainyAverageRevenue: number | null;
    dryAverageRevenue: number | null;
    rows: {
      date: string;
      rainfallMm: number;
      tempCelsius: number;
      revenue: number;
    }[];
    caveat: string;
  };
}
const money = (value?: number | null) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const count = (value: number) =>
  value.toLocaleString("en-PH", { maximumFractionDigits: 2 });
const chartMoney = (value: number, signed = false) =>
  `${value < 0 ? "−" : signed && value > 0 ? "+" : ""}₱${new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 2 }).format(Math.abs(value))}`;
const pct = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return "No prior baseline";
  const bounded = Math.max(-100, Math.min(100, value));
  return `${bounded > 0 ? "+" : ""}${bounded.toFixed(1)}%`;
};
const manilaDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const shiftDate = (date: string, days: number) => {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const tabs: { key: Dimension; label: string; icon: typeof Activity }[] = [
  {
    key: "waterfall",
    label: "Revenue Waterfall & Decomposition",
    icon: TrendingDown,
  },
  { key: "channel", label: "1. Channel", icon: Store },
  { key: "category", label: "2. Category", icon: Layers },
  { key: "product", label: "3. SKU", icon: ShoppingBag },
  { key: "stockouts", label: "4. Stock", icon: Package },
  { key: "weather", label: "5. Weather and Time", icon: CloudRain },
  { key: "promotion", label: "6. Promotion", icon: Tag },
  { key: "discount", label: "7. Discount", icon: Percent },
];
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#FFD9EC] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-[#223047] mb-3">{title}</h2>
      {children}
    </section>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-4 text-sm text-slate-600">
      {children}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[#FFD9EC] bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold text-[#223047] mt-1">{value}</div>
      <p className="text-xs text-slate-500 mt-2">{detail}</p>
    </div>
  );
}
function ComparisonTable({
  rows,
  label,
}: {
  rows: Comparison[];
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("impact");
  const filtered = useMemo(
    () =>
      rows
        .filter((row) => row.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) =>
          sort === "decline"
            ? a.variance - b.variance
            : sort === "growth"
              ? b.variance - a.variance
              : Math.abs(b.variance) - Math.abs(a.variance),
        ),
    [rows, query, sort],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pages - 1);
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          aria-label={`Search ${label}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder={`Search ${label.toLowerCase()}`}
          className="rounded-xl border border-[#FFD9EC] p-2 text-sm"
        />
        <select
          aria-label="Sort comparisons"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
          className="rounded-xl border border-[#FFD9EC] p-2 text-sm"
        >
          <option value="impact">Largest absolute change</option>
          <option value="decline">Largest decline</option>
          <option value="growth">Largest increase</option>
        </select>
      </div>
      {!filtered.length ? (
        <Notice>No matching transaction records for these periods.</Notice>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm text-left">
            <thead className="text-xs text-slate-500">
              <tr>
                {[
                  label,
                  "Previous revenue",
                  "Current revenue",
                  "Revenue change",
                  "Change %",
                  "Quantity change",
                ].map((heading) => (
                  <th key={heading} className="py-3 pr-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(safePage * 10, safePage * 10 + 10).map((row) => (
                <tr key={row.name} className="border-t border-pink-50">
                  <td className="py-3 pr-3 font-medium">{row.name}</td>
                  <td>{money(row.previous)}</td>
                  <td>{money(row.current)}</td>
                  <td
                    className={
                      row.variance < 0 ? "text-red-600" : "text-emerald-700"
                    }
                  >
                    {money(row.variance)}
                  </td>
                  <td>{pct(row.pctChange)}</td>
                  <td>{count(row.quantityVariance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
        <span>
          {filtered.length} results · Page {safePage + 1} of {pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">
        Revenue change = current net sales − previous net sales. This shows
        where the change occurred; it does not establish an operational cause.
      </p>
    </>
  );
}
export function RootCauseExplorer() {
  const [activeTab, setActiveTab] = useState<Dimension>("waterfall");
  const [sector, setSector] = useState("all");
  const [period, setPeriod] = useState<Period>("30d");
  const today = useMemo(manilaDate, []);
  const [start, setStart] = useState(shiftDate(today, -29));
  const [end, setEnd] = useState(today);
  const [range, setRange] = useState({
    start: shiftDate(today, -29),
    end: today,
  });
  const [refresh, setRefresh] = useState(0);
  const [rangeError, setRangeError] = useState("");
  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener("woof:realtime", update);
    return () => window.removeEventListener("woof:realtime", update);
  }, []);
  const {
    data,
    error: fetchError,
    isLoading: loading,
  } = useSWR<Analysis>(
    ["rootCause", period, sector, refresh, period === "custom" ? range : null],
    () =>
      getRootCauseAnalysis(
        period,
        sector,
        refresh > 0,
        period === "custom" ? range.start : undefined,
        period === "custom" ? range.end : undefined,
      ),
    { keepPreviousData: false },
  );
  const error =
    fetchError?.message ||
    (fetchError ? "Could not load diagnostic data." : "");
  const daily = useMemo(() => {
    const map = new Map<
      number,
      {
        day: number;
        current: number | null;
        previous: number | null;
        currentDate?: string;
        previousDate?: string;
      }
    >();
    for (const row of data?.daily || []) {
      const value = map.get(row.dayOffset) || {
        day: row.dayOffset + 1,
        current: null,
        previous: null,
      };
      value[row.period] = row.revenue;
      if (row.period === "current") value.currentDate = row.date;
      else value.previousDate = row.date;
      map.set(row.dayOffset, value);
    }
    return [...map.values()].sort((a, b) => a.day - b.day);
  }, [data]);
  const waterfall = useMemo(() => {
    if (!data) return [];
    let running = data.totals.previous.revenue;
    const rows = [
      {
        name: "Previous period",
        amount: [Math.min(0, running), Math.max(0, running)],
        change: running,
        total: true,
        label: chartMoney(running),
      },
    ];
    for (const row of data.channels) {
      const next = running + row.variance;
      rows.push({
        name: row.name,
        amount: [Math.min(running, next), Math.max(running, next)],
        change: row.variance,
        total: false,
        label: chartMoney(row.variance, true),
      });
      running = next;
    }
    rows.push({
      name: "Current period",
      amount: [
        Math.min(0, data.totals.current.revenue),
        Math.max(0, data.totals.current.revenue),
      ],
      change: data.totals.current.revenue,
      total: true,
      label: chartMoney(data.totals.current.revenue),
    });
    return rows;
  }, [data]);
  const worst = data?.channels
    .filter((row) => row.variance < 0)
    .sort((a, b) => a.variance - b.variance)[0];
  const best = data?.channels
    .filter((row) => row.variance > 0)
    .sort((a, b) => b.variance - a.variance)[0];
  const maxHeat = Math.max(
    0,
    ...(data?.heatmap || []).map((cell) => cell.revenue),
  );
  const heatCells = new Map(
    (data?.heatmap || []).map((cell) => [`${cell.weekday}:${cell.hour}`, cell]),
  );
  const heatHours = [
    ...new Set((data?.heatmap || []).map((cell) => cell.hour)),
  ].sort((a, b) => a - b);
  const hasRows =
    !!data && data.totals.current.rows + data.totals.previous.rows > 0;
  return (
    <div className="space-y-6 pb-12 text-[#223047]">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">Root Cause Explorer</h1>
          <p className="text-sm text-slate-500 mt-1">
            Diagnostic analysis of recorded revenue changes across business
            dimensions.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh data
        </Button>
      </div>
      <div className="rounded-2xl border border-[#FFD9EC] bg-white p-4 flex flex-wrap items-center gap-3">
        <Calendar className="w-4 h-4 text-[#F53799]" />
        <select
          aria-label="Analysis period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="border border-[#FFD9EC] rounded-xl p-2 text-sm"
        >
          <option value="30d">Last 30 days vs prior 30 days</option>
          <option value="90d">Last 90 days vs prior 90 days</option>
          <option value="ytd">Year to date vs prior year</option>
          <option value="custom">Custom date range</option>
        </select>
        <select
          aria-label="Business sector"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="border border-[#FFD9EC] rounded-xl p-2 text-sm"
        >
          <option value="all">All business sectors</option>
          <option value="cafe">Cafe</option>
          <option value="services">Services</option>
          <option value="retail">Retail</option>
        </select>
        {period === "custom" && (
          <>
            <input
              aria-label="Start date"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="border rounded-lg p-2 text-sm"
            />
            <input
              aria-label="End date"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="border rounded-lg p-2 text-sm"
            />
            <Button
              onClick={() => {
                if (!start || !end || start > end) {
                  setRangeError("Choose a valid start and end date.");
                  return;
                }
                setRangeError("");
                setRange({ start, end });
              }}
            >
              Apply dates
            </Button>
          </>
        )}
        {rangeError && (
          <p role="alert" className="text-sm text-red-600">
            {rangeError}
          </p>
        )}
      </div>
      {loading ? (
        <Notice>Loading recorded transactions and weather observations…</Notice>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </p>
      ) : (
        data && (
          <>
            <p className="text-xs text-slate-500">
              Current: {data.window.currentStart} – {data.window.currentEnd} ·
              Previous: {data.window.previousStart} – {data.window.previousEnd}{" "}
              · {data.window.timezone}. Source: ingested transaction records,
              net sales in PHP.
            </p>
            {(!data.totals.current.rows || !data.totals.previous.rows) && (
              <Notice>
                {!hasRows
                  ? "No transaction records were found in either period. Choose dates containing uploaded data."
                  : "One comparison period has no transaction records. Its recorded total is zero; this does not prove the business had zero sales. Check upload coverage before interpreting the change."}
              </Notice>
            )}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Metric
                label="Recorded revenue change"
                value={money(data.totals.variance)}
                detail={pct(data.totals.pctChange)}
              />
              <Metric
                label="Current net sales"
                value={money(data.totals.current.revenue)}
                detail={`${count(data.totals.current.rows)} transaction rows · ${count(data.totals.current.orders)} transaction IDs`}
              />
              <Metric
                label="Largest channel decline"
                value={worst ? money(worst.variance) : "None recorded"}
                detail={
                  worst?.name || "No channel has a negative revenue change."
                }
              />
              <Metric
                label="Largest channel increase"
                value={best ? money(best.variance) : "None recorded"}
                detail={
                  best?.name || "No channel has a positive revenue change."
                }
              />
            </div>
            <div
              role="tablist"
              aria-label="Diagnostic dimensions"
              className="rounded-2xl border border-[#FFD9EC] bg-white p-2 flex gap-1 overflow-x-auto"
            >
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  type="button"
                  key={key}
                  role="tab"
                  aria-selected={activeTab === key}
                  onClick={() => setActiveTab(key)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${activeTab === key ? "bg-[#F53799] text-white" : "hover:bg-[#FFF0F8] text-slate-600"}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="space-y-4">
              {activeTab === "waterfall" && (
                <>
                  <Card title="Revenue waterfall by channel">
                    <p className="text-xs text-slate-500 mb-4">
                      Previous revenue + each channel's observed change =
                      current revenue. Channel, category, and SKU are
                      alternative breakdowns of the same sales; their changes
                      must not be added together.
                    </p>
                    <div
                      className="flex flex-wrap gap-4 mb-3 text-xs text-slate-600"
                      aria-label="Waterfall legend"
                    >
                      <span>
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#F53799] mr-1.5" />
                        Total revenue
                      </span>
                      <span>
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#EF4444] mr-1.5" />
                        Revenue decrease
                      </span>
                      <span>
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#10B981] mr-1.5" />
                        Revenue increase
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      Read left to right. Floating bars show each channel's
                      change, not its total sales.
                    </p>
                    {hasRows ? (
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={waterfall}
                            margin={{ top: 28, bottom: 45, left: 8, right: 12 }}
                            barCategoryGap="22%"
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="name"
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                              tick={{ fontSize: 10 }}
                            />
                            <YAxis
                              tickFormatter={(value) =>
                                chartMoney(Number(value))
                              }
                              tick={{ fontSize: 10 }}
                              width={72}
                            />
                            <Tooltip
                              cursor={false}
                              content={({ active, payload }) =>
                                active && payload?.length ? (
                                  <div className="bg-white border border-pink-100 rounded-xl p-3 text-sm">
                                    <p className="font-semibold">
                                      {payload[0].payload.name}
                                    </p>
                                    <p>
                                      {payload[0].payload.total
                                        ? "Total revenue"
                                        : "Revenue change"}
                                      :{" "}
                                      {payload[0].payload.change < 0
                                        ? "−"
                                        : !payload[0].payload.total &&
                                            payload[0].payload.change > 0
                                          ? "+"
                                          : ""}
                                      {money(
                                        Math.abs(payload[0].payload.change),
                                      )}
                                    </p>
                                    {!payload[0].payload.total && (
                                      <p className="text-xs text-slate-500 mt-1">
                                        Revenue after change:{" "}
                                        {money(
                                          payload[0].payload.amount[
                                            payload[0].payload.change < 0
                                              ? 0
                                              : 1
                                          ],
                                        )}
                                      </p>
                                    )}
                                  </div>
                                ) : null
                              }
                            />
                            <Bar
                              dataKey="amount"
                              isAnimationActive={false}
                              activeBar={false}
                            >
                              <LabelList
                                dataKey="label"
                                position="top"
                                fontSize={11}
                                fill="#334155"
                              />
                              {waterfall.map((row, i) => (
                                <Cell
                                  key={i}
                                  fill={
                                    row.total
                                      ? "#F53799"
                                      : row.change < 0
                                        ? "#EF4444"
                                        : "#10B981"
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <Notice>
                        No data available for a revenue waterfall.
                      </Notice>
                    )}
                    <details className="mt-3 text-xs text-slate-500">
                      <summary className="cursor-pointer">
                        Verify the calculation
                      </summary>
                      <p className="mt-2">
                        {money(data.totals.previous.revenue)} + (
                        {money(
                          data.channels.reduce(
                            (sum, row) => sum + row.variance,
                            0,
                          ),
                        )}
                        ) = {money(data.totals.current.revenue)}. Net sales are
                        summed from selected transactions.
                      </p>
                    </details>
                  </Card>
                  {data.revenueBridge && hasRows && (
                    <Card title="What changed: quantity versus realized revenue per unit">
                      <p className="text-xs text-slate-500 mb-3">
                        For products recorded in both periods, revenue change is
                        split into quantity change at the previous unit revenue,
                        then the change in realized revenue per unit at current
                        quantity. This is an accounting decomposition, not proof
                        of why customers bought less or prices changed.
                      </p>
                      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        <Metric
                          label="Quantity effect"
                          value={money(data.revenueBridge.quantityEffect)}
                          detail="(Current quantity − previous quantity) × previous net sales per unit."
                        />
                        <Metric
                          label="Realized revenue per unit effect"
                          value={money(data.revenueBridge.unitRevenueEffect)}
                          detail="Change in net sales per unit × current quantity. Includes discount and sales-mix changes."
                        />
                        <Metric
                          label="Products recorded only in current period"
                          value={money(
                            data.revenueBridge.newlyRecordedProducts,
                          )}
                          detail="Sales with no previous-period record. This does not prove a product launch."
                        />
                        <Metric
                          label="Products recorded only in previous period"
                          value={money(
                            data.revenueBridge.absentCurrentProducts,
                          )}
                          detail="Previous sales absent from current records. This does not prove discontinuation or stockout."
                        />
                        <Metric
                          label="Other recorded changes"
                          value={money(data.revenueBridge.other)}
                          detail="Changes with zero or negative quantities that cannot support a per-unit comparison."
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-3">
                        Combined components:{" "}
                        {money(
                          Object.values(data.revenueBridge).reduce(
                            (sum, value) => sum + value,
                            0,
                          ),
                        )}{" "}
                        · Recorded total revenue change:{" "}
                        {money(data.totals.variance)}.
                      </p>
                    </Card>
                  )}
                  <Card title="Daily revenue comparison">
                    <p className="text-xs text-slate-500 mb-3">
                      Periods align by day offset. Gaps mean no recorded
                      transactions; they are not filled with invented sales.
                    </p>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={daily}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip
                            labelFormatter={(value) => {
                              const row = daily.find(
                                (item) => item.day === Number(value),
                              );
                              return `${row?.currentDate || "—"} / ${row?.previousDate || "—"}`;
                            }}
                          />
                          <Legend />
                          <Line
                            dataKey="current"
                            name="Current net sales (PHP)"
                            stroke="#F53799"
                            dot={false}
                            connectNulls={false}
                          />
                          <Line
                            dataKey="previous"
                            name="Previous net sales (PHP)"
                            stroke="#94A3B8"
                            dot={false}
                            connectNulls={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </>
              )}
              {activeTab === "channel" && (
                <Card title="Channel revenue contribution">
                  <ComparisonTable
                    key={`${period}-${sector}-${range.start}-${range.end}`}
                    rows={data.channels}
                    label="Channel"
                  />
                </Card>
              )}
              {activeTab === "category" && (
                <Card title="Category revenue contribution">
                  <ComparisonTable
                    key={`${period}-${sector}-${range.start}-${range.end}`}
                    rows={data.categories}
                    label="Category"
                  />
                </Card>
              )}
              {activeTab === "product" && (
                <Card title="SKU / product revenue contribution">
                  <ComparisonTable
                    key={`${period}-${sector}-${range.start}-${range.end}`}
                    rows={data.products}
                    label="SKU / product"
                  />
                </Card>
              )}
              {activeTab === "stockouts" && (
                <Card title="Stock availability diagnosis">
                  <Notice>{data.stockouts.reason}</Notice>
                  <p className="text-sm text-slate-600 mt-3">
                    A sales decline alone cannot establish a stockout. This
                    analysis needs dated inventory balances, stockout intervals,
                    and replenishment records. No stockout days, inventory
                    balances, or lost-sales estimates are fabricated.
                  </p>
                </Card>
              )}
              {activeTab === "weather" && (
                <>
                  <Card title="Observed weather and revenue">
                    <p className="text-xs text-slate-500 mb-3">
                      {data.weather.source}. Rainy means rainfall ≥ 1 mm. Only
                      dates with both observed weather and transaction records
                      are compared.
                    </p>
                    {data.weather.available ? (
                      <>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <Metric
                            label="Rainy-day average net sales"
                            value={money(data.weather.rainyAverageRevenue)}
                            detail={`${data.weather.rainyDays} matched days`}
                          />
                          <Metric
                            label="Dry-day average net sales"
                            value={money(data.weather.dryAverageRevenue)}
                            detail={`${data.weather.dryDays} matched days`}
                          />
                        </div>
                        <p className="text-xs text-slate-500 my-3">
                          {data.weather.caveat} Weekday, season, promotions, and
                          other factors are not controlled. This is not measured
                          footfall or weather-attributed lost revenue.
                        </p>
                        <div className="max-h-80 overflow-auto">
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr>
                                {[
                                  "Date",
                                  "Rainfall (mm)",
                                  "Temperature (°C)",
                                  "Net sales",
                                ].map((label) => (
                                  <th key={label} className="py-2">
                                    {label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {data.weather.rows.map((row) => (
                                <tr
                                  key={row.date}
                                  className="border-t border-pink-50"
                                >
                                  <td className="py-2">{row.date}</td>
                                  <td>{count(row.rainfallMm)}</td>
                                  <td>{count(row.tempCelsius)}</td>
                                  <td>{money(row.revenue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <Notice>
                        No observed weather records overlap transaction dates in
                        this period. Weather impact cannot be quantified.
                      </Notice>
                    )}
                  </Card>
                  <Card title="Recorded revenue by weekday and hour">
                    <p className="text-xs text-slate-500 mb-3">
                      Total net sales in Asia/Manila time. Darker cells mean
                      more recorded revenue, not capacity utilization. “—” means
                      no transaction rows.
                    </p>
                    {heatHours.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-separate border-spacing-1">
                          <thead>
                            <tr>
                              <th>Day</th>
                              {heatHours.map((hour) => (
                                <th
                                  key={hour}
                                >{`${hour.toString().padStart(2, "0")}:00`}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              "Sun",
                              "Mon",
                              "Tue",
                              "Wed",
                              "Thu",
                              "Fri",
                              "Sat",
                            ].map((day, index) => (
                              <tr key={day}>
                                <th className="pr-2">{day}</th>
                                {heatHours.map((hour) => {
                                  const cell = heatCells.get(
                                    `${index + 1}:${hour}`,
                                  );
                                  return (
                                    <td
                                      key={hour}
                                      className="p-2 rounded-lg text-center whitespace-nowrap"
                                      style={{
                                        background: cell
                                          ? `rgba(245,55,153,${0.08 + 0.65 * (maxHeat > 0 ? Math.max(0, cell.revenue) / maxHeat : 0)})`
                                          : "#F8FAFC",
                                      }}
                                      title={
                                        cell
                                          ? `${cell.orders} transaction IDs; ${money(cell.revenue)} net sales`
                                          : "No transaction records"
                                      }
                                    >
                                      {cell ? money(cell.revenue) : "—"}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Notice>
                        No current-period transactions available for a time
                        pattern.
                      </Notice>
                    )}
                  </Card>
                </>
              )}
              {activeTab === "promotion" && (
                <Card title="Promotion effectiveness diagnosis">
                  <Notice>{data.promotions.reason}</Notice>
                  <p className="text-sm text-slate-600 mt-3">
                    Campaign status or a discount entry does not prove promotion
                    lift. Attribution needs transaction-to-campaign links,
                    exposure dates, and a comparable control or baseline. No
                    expired campaigns or causal revenue losses are assumed.
                  </p>
                </Card>
              )}
              {activeTab === "discount" && (
                <Card title="Recorded discounts and sales">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr>
                          <th className="py-3">Metric</th>
                          <th>Previous period</th>
                          <th>Current period</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            {
                              label: "Recorded gross sales",
                              key: "grossSales",
                            },
                            {
                              label: "Recorded discounts",
                              key: "discounts",
                            },
                            {
                              label: "Recorded net sales",
                              key: "revenue",
                            },
                          ] as const
                        ).map(({ label, key }) => (
                          <tr key={key} className="border-t border-pink-50">
                            <td className="py-3">{label}</td>
                            <td>{money(data.totals.previous[key])}</td>
                            <td>{money(data.totals.current[key])}</td>
                            <td>
                              {money(
                                data.totals.current[key] -
                                  data.totals.previous[key],
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-pink-50">
                          <td className="py-3">Discount / gross sales</td>
                          <td>
                            {data.totals.previous.grossSales > 0
                              ? `${((100 * data.totals.previous.discounts) / data.totals.previous.grossSales).toFixed(1)}%`
                              : "—"}
                          </td>
                          <td>
                            {data.totals.current.grossSales > 0
                              ? `${((100 * data.totals.current.discounts) / data.totals.current.grossSales).toFixed(1)}%`
                              : "—"}
                          </td>
                          <td>—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <Notice>
                    Discounts are recorded deductions, not measured causal
                    revenue loss. Gross sales minus discounts may differ from
                    stored net sales because of refunds, fees, or source
                    accounting conventions; no reconciliation is assumed.
                  </Notice>
                </Card>
              )}
            </div>
            {hasRows && (
              <div className="rounded-2xl border border-[#FFD9EC] bg-[#FFF7FB] p-5 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <span className="inline-block bg-[#F53799] text-white rounded-full text-xs font-bold px-3 py-1 mb-3">
                    WOOF Insight
                  </span>
                  <WoofInsight
                    inline
                    feature="descriptive_explanation"
                    prompt="Explain the recorded current versus previous revenue change. Identify largest observed channel/category/product changes with actual figures. Treat these as alternative breakdowns, not additive causes. Do not claim stockouts, campaign lift, staffing problems, competitor changes, or weather causality. Flag missing period coverage. Suggest investigating the largest observed decline only when supported. Do not invent Shapley attribution, counterfactual recovery, or percentages."
                    context={{
                      sector,
                      window: data.window,
                      totals: data.totals,
                      revenueBridge: data.revenueBridge,
                      channels: data.channels.slice(0, 5),
                      categories: data.categories.slice(0, 5),
                      products: data.products.slice(0, 5),
                      stockouts: data.stockouts,
                      promotions: data.promotions,
                      weather: {
                        matchedDays: data.weather.rows.length,
                        rainyDays: data.weather.rainyDays,
                        dryDays: data.weather.dryDays,
                        caveat: data.weather.caveat,
                      },
                    }}
                  />
                </div>
                <img
                  src={mascotImg.src}
                  alt="Professor WOOF"
                  className="hidden sm:block w-24 object-contain"
                />
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
