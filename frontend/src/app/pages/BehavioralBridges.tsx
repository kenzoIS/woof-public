import { Network, Sliders } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { getCrossSell } from "../lib/api";

interface CrossSellRule {
  itemA: string;
  itemB: string;
  support: number;
  confidence: number;
  lift: number;
  crossSector?: boolean;
  antecedentSectors?: string[];
  consequentSectors?: string[];
}

const SLOT_POSITIONS = [
  { x: 200, y: 110 },
  { x: 400, y: 110 },
  { x: 600, y: 110 },
  { x: 300, y: 210 },
  { x: 500, y: 210 },
];

const SECTOR_COLORS: Record<string, string> = {
  cafe: "#06b6d4",
  services: "#a855f7",
  retail: "#ec4899",
  unknown: "#3b82f6",
};

function getSectorColor(sectors?: string[]): string {
  const s = (sectors?.[0] || "").toLowerCase();
  if (s.includes("cafe") || s.includes("coffee")) return SECTOR_COLORS.cafe;
  if (s.includes("service") || s.includes("groom")) return SECTOR_COLORS.services;
  if (s.includes("retail") || s.includes("supply")) return SECTOR_COLORS.retail;
  return SECTOR_COLORS.unknown;
}

function truncateLabel(label: string, maxLen = 13): string {
  return label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;
}

export function BehavioralBridges() {
  const [supportThreshold, setSupportThreshold] = useState(0.03);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3);
  const [timeValue, setTimeValue] = useState(15);
  const [allRules, setAllRules] = useState<CrossSellRule[]>([]);
  const [loading, setLoading] = useState(true);

  const formatTime = (hour: number) => {
    if (hour === 0) return "Tomorrow, 12:00 AM";
    if (hour < 12) return `Tomorrow, ${hour}:00 AM`;
    if (hour === 12) return "Tomorrow, 12:00 PM";
    return `Tomorrow, ${hour - 12}:00 PM`;
  };

  useEffect(() => {
    setLoading(true);
    getCrossSell({ hour: String(timeValue) })
      .then((data: any) => {
        const rules: CrossSellRule[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.rules)
            ? data.rules
            : Array.isArray(data?.crossSellRules)
              ? data.crossSellRules
              : [];
        setAllRules(rules);
      })
      .catch(() => setAllRules([]))
      .finally(() => setLoading(false));
  }, [timeValue]);

  const filteredRules = useMemo(
    () =>
      allRules
        .filter(
          (r) =>
            r.support >= supportThreshold && r.confidence >= confidenceThreshold,
        )
        .sort((a, b) => b.lift - a.lift)
        .slice(0, 20),
    [allRules, supportThreshold, confidenceThreshold],
  );

  const { nodes, connections, insights } = useMemo(() => {
    const topRules = filteredRules.slice(0, 10);
    if (topRules.length === 0) {
      return { nodes: [], connections: [], insights: null };
    }

    // Count how many rules each item appears in (degree)
    const itemMeta: Record<
      string,
      { count: number; sectors: string[] }
    > = {};
    topRules.forEach((r) => {
      if (!itemMeta[r.itemA])
        itemMeta[r.itemA] = { count: 0, sectors: r.antecedentSectors || [] };
      if (!itemMeta[r.itemB])
        itemMeta[r.itemB] = {
          count: 0,
          sectors: r.consequentSectors || r.antecedentSectors || [],
        };
      itemMeta[r.itemA].count++;
      itemMeta[r.itemB].count++;
    });

    // Take top 5 items by degree, assign to slot positions
    const sortedItems = Object.entries(itemMeta)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, SLOT_POSITIONS.length);

    const itemIndex: Record<string, number> = {};
    sortedItems.forEach(([item], i) => {
      itemIndex[item] = i;
    });

    const maxLift = Math.max(...topRules.map((r) => r.lift), 1);

    const nodes = sortedItems.map(([item, info], i) => ({
      x: SLOT_POSITIONS[i].x,
      y: SLOT_POSITIONS[i].y,
      label: truncateLabel(item),
      color: getSectorColor(info.sectors),
      size:
        info.count >= 3 ? "large" : info.count >= 2 ? "medium" : "small",
    }));

    const connections = topRules
      .filter(
        (r) =>
          itemIndex[r.itemA] !== undefined &&
          itemIndex[r.itemB] !== undefined,
      )
      .map((r) => ({
        from: SLOT_POSITIONS[itemIndex[r.itemA]],
        to: SLOT_POSITIONS[itemIndex[r.itemB]],
        strength: r.lift / maxLift,
      }));

    const topRule = topRules[0];
    const highLiftRule = [...topRules].sort((a, b) => b.lift - a.lift)[0];
    const crossSectorRule =
      topRules.find((r) => r.crossSector) || topRules[1] || topRules[0];

    const insights = {
      topBundle: {
        product: topRule
          ? `${truncateLabel(topRule.itemA, 10)} + ${truncateLabel(topRule.itemB, 10)}`
          : "—",
        metric: topRule
          ? `${(topRule.confidence * 100).toFixed(0)}% co-purchase`
          : "—",
      },
      emerging: {
        product: highLiftRule
          ? `${truncateLabel(highLiftRule.itemA, 10)} → ${truncateLabel(highLiftRule.itemB, 10)}`
          : "—",
        metric: highLiftRule
          ? `${highLiftRule.lift.toFixed(1)}x lift`
          : "—",
      },
      crossSell: {
        product: crossSectorRule
          ? `${truncateLabel(crossSectorRule.itemA, 10)} → ${truncateLabel(crossSectorRule.itemB, 10)}`
          : "—",
        metric: crossSectorRule
          ? `${(crossSectorRule.confidence * 100).toFixed(0)}% conversion`
          : "—",
      },
    };

    return { nodes, connections, insights };
  }, [filteredRules]);

  const frequentItemsets = filteredRules.slice(0, 5).map((r) => ({
    pair: `${r.itemA} + ${r.itemB}`,
    support: r.support.toFixed(3),
    confidence: r.confidence.toFixed(2),
    lift: `${r.lift.toFixed(1)}x`,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Behavioral Bridges
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Customer behavior patterns and product affinity analysis
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main: Live Behavioral Web */}
        <div className="col-span-2">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-purple-500/30 rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-purple-500/20">
              <div className="flex items-center gap-3">
                <Network className="w-5 h-5 text-cyan-400" />
                <h2 className="text-xl font-semibold text-white tracking-tight">
                  Live Behavioral Web (FP-GROWTH AI)
                </h2>
                <div className="ml-auto flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      loading
                        ? "bg-yellow-400"
                        : "bg-cyan-400 animate-pulse"
                    }`}
                  />
                  <span className="text-xs text-cyan-400 uppercase tracking-wider">
                    {loading ? "Analyzing…" : "Learning Active"}
                  </span>
                </div>
              </div>
            </div>

            {/* Neural Network Graph */}
            <div className="p-8">
              <div className="relative bg-gradient-to-br from-slate-950 to-slate-900 rounded-xl border border-purple-500/30 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

                <svg
                  viewBox="0 0 800 300"
                  className="w-full h-auto relative z-10"
                  style={{ maxHeight: "300px" }}
                >
                  <defs>
                    <filter id="glow-node">
                      <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <pattern
                      id="grid-small"
                      width="30"
                      height="30"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 30 0 L 0 0 0 30"
                        fill="none"
                        stroke="rgba(139, 92, 246, 0.08)"
                        strokeWidth="0.5"
                      />
                    </pattern>
                    <linearGradient
                      id="lineGradient"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="50%" stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>

                  <rect width="800" height="300" fill="url(#grid-small)" />

                  {loading ? (
                    <text
                      x="400"
                      y="150"
                      textAnchor="middle"
                      fill="#6b7280"
                      style={{ fontSize: "14px" }}
                    >
                      Fetching behavioral patterns…
                    </text>
                  ) : nodes.length === 0 ? (
                    <text
                      x="400"
                      y="150"
                      textAnchor="middle"
                      fill="#6b7280"
                      style={{ fontSize: "13px" }}
                    >
                      No patterns found. Lower the thresholds or upload more
                      data.
                    </text>
                  ) : (
                    <>
                      {/* Connection lines */}
                      {connections.map((conn, idx) => (
                        <g key={`connection-${idx}`}>
                          <line
                            x1={conn.from.x}
                            y1={conn.from.y}
                            x2={conn.to.x}
                            y2={conn.to.y}
                            stroke="url(#lineGradient)"
                            strokeWidth={conn.strength * 3}
                            opacity={conn.strength * 0.4}
                            className="animate-pulse"
                            style={{
                              animationDelay: `${idx * 0.3}s`,
                              animationDuration: "3s",
                            }}
                          />
                          <line
                            x1={conn.from.x}
                            y1={conn.from.y}
                            x2={conn.to.x}
                            y2={conn.to.y}
                            stroke="#8b5cf6"
                            strokeWidth="1"
                            opacity={conn.strength * 0.2}
                          />
                        </g>
                      ))}

                      {/* Product nodes */}
                      {nodes.map((node, idx) => (
                        <g key={`node-${idx}`}>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={
                              node.size === "large"
                                ? 35
                                : node.size === "medium"
                                  ? 28
                                  : 22
                            }
                            fill="none"
                            stroke={node.color}
                            strokeWidth="1"
                            opacity="0.3"
                            className="animate-pulse"
                            style={{
                              animationDelay: `${idx * 0.2}s`,
                              animationDuration: "2s",
                            }}
                          />
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={
                              node.size === "large"
                                ? 25
                                : node.size === "medium"
                                  ? 18
                                  : 12
                            }
                            fill={node.color}
                            filter="url(#glow-node)"
                            opacity="0.8"
                          />
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={
                              node.size === "large"
                                ? 15
                                : node.size === "medium"
                                  ? 10
                                  : 6
                            }
                            fill="white"
                            opacity="0.2"
                          />
                          <rect
                            x={node.x - 55}
                            y={
                              node.y +
                              (node.size === "large"
                                ? 35
                                : node.size === "medium"
                                  ? 28
                                  : 22)
                            }
                            width="110"
                            height="24"
                            fill="#0f172a"
                            stroke={node.color}
                            strokeWidth="1"
                            rx="12"
                            opacity="0.9"
                          />
                          <text
                            x={node.x}
                            y={
                              node.y +
                              (node.size === "large"
                                ? 51
                                : node.size === "medium"
                                  ? 44
                                  : 38)
                            }
                            textAnchor="middle"
                            fill={node.color}
                            style={{ fontSize: "11px", fontWeight: "600" }}
                            filter="url(#glow-node)"
                          >
                            {node.label}
                          </text>
                        </g>
                      ))}
                    </>
                  )}
                </svg>

                <div className="absolute bottom-4 right-4 bg-slate-950/80 backdrop-blur-sm border border-purple-500/30 rounded-lg px-4 py-2">
                  <div className="text-xs text-slate-400 mb-2">
                    Connection Strength
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-12 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full" />
                    <span className="text-xs text-slate-300">
                      Weak → Strong
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Insights */}
              <div className="mt-4 bg-slate-900/50 border border-purple-500/30 rounded-lg p-4">
                <div className="text-xs text-cyan-400 uppercase tracking-wider mb-2">
                  AI-Detected Patterns
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-950/50 border border-cyan-500/30 rounded-lg p-3">
                    <div className="text-slate-400 mb-1">Top Bundle</div>
                    <div className="text-white font-medium">
                      {insights?.topBundle.product || "—"}
                    </div>
                    <div className="text-cyan-400 mt-1">
                      {insights?.topBundle.metric || "—"}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 border border-purple-500/30 rounded-lg p-3">
                    <div className="text-slate-400 mb-1">Highest Lift</div>
                    <div className="text-white font-medium">
                      {insights?.emerging.product || "—"}
                    </div>
                    <div className="text-purple-400 mt-1">
                      {insights?.emerging.metric || "—"}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 border border-pink-500/30 rounded-lg p-3">
                    <div className="text-slate-400 mb-1">Cross-Sell Opp.</div>
                    <div className="text-white font-medium">
                      {insights?.crossSell.product || "—"}
                    </div>
                    <div className="text-pink-400 mt-1">
                      {insights?.crossSell.metric || "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Time Slider Controls */}
            <div className="p-8 pt-0">
              <div className="bg-gradient-to-r from-slate-900/50 to-slate-800/50 border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-cyan-400 uppercase tracking-wider font-semibold">
                    Time Selection
                  </span>
                  <span className="text-base text-white font-medium px-4 py-1 bg-purple-500/20 border border-purple-500/40 rounded-lg">
                    {formatTime(timeValue)}
                  </span>
                </div>

                <div className="relative">
                  <div className="relative h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className="absolute h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]"
                      style={{ width: `${((timeValue - 7) / 12) * 100}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min="7"
                    max="19"
                    value={timeValue}
                    onChange={(e) => setTimeValue(parseInt(e.target.value))}
                    className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer z-10"
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-full border-2 border-white shadow-[0_0_16px_rgba(139,92,246,0.8)] pointer-events-none transition-all duration-200"
                    style={{
                      left: `calc(${((timeValue - 7) / 12) * 100}% - 12px)`,
                    }}
                  >
                    <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
                  </div>
                </div>

                <div className="flex justify-between text-xs text-slate-500 mt-3 px-1">
                  <span>07:00</span>
                  <span>10:00</span>
                  <span>13:00</span>
                  <span>16:00</span>
                  <span>19:00</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Threshold Controls */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-900">
                Threshold Controls
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-slate-700">Min Support</label>
                  <span className="text-sm font-medium text-blue-600">
                    {supportThreshold.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={supportThreshold}
                  onChange={(e) =>
                    setSupportThreshold(parseFloat(e.target.value))
                  }
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-slate-700">
                    Min Confidence
                  </label>
                  <span className="text-sm font-medium text-blue-600">
                    {confidenceThreshold.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={confidenceThreshold}
                  onChange={(e) =>
                    setConfidenceThreshold(parseFloat(e.target.value))
                  }
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 mt-4">
              Adjust thresholds to filter association rules
            </p>
          </div>

          {/* Frequent Itemsets */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-900">
                Frequent Itemsets
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                FP-Growth high-affinity pairs
              </p>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200 animate-pulse"
                  >
                    <div className="h-3 bg-slate-200 rounded w-3/4 mb-2" />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="h-3 bg-slate-200 rounded" />
                      <div className="h-3 bg-slate-200 rounded" />
                      <div className="h-3 bg-slate-200 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : frequentItemsets.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No itemsets at current thresholds. Try lowering the sliders.
              </p>
            ) : (
              <div className="space-y-3">
                {frequentItemsets.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div
                      className="font-medium text-sm text-slate-900 mb-2 truncate"
                      title={item.pair}
                    >
                      {item.pair}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-slate-500">Support</div>
                        <div className="font-medium text-slate-700">
                          {item.support}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Conf.</div>
                        <div className="font-medium text-slate-700">
                          {item.confidence}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Lift</div>
                        <div className="font-medium text-blue-600">
                          {item.lift}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
