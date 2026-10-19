import { useState } from "react";
import { Sparkles, Play } from "lucide-react";

export function PredictiveSimulator() {
  const [timeValue, setTimeValue] = useState(15); // 3:00 PM

  // Format time based on slider value
  const formatTime = (hour: number) => {
    if (hour === 0) return "Tomorrow, 12:00 AM";
    if (hour < 12) return `Tomorrow, ${hour}:00 AM`;
    if (hour === 12) return "Tomorrow, 12:00 PM";
    return `Tomorrow, ${hour - 12}:00 PM`;
  };

  // Calculate time-based behavioral patterns
  const getTimeBasedData = (hour: number) => {
    const isEarlyMorning = hour >= 0 && hour < 8;
    const isMorning = hour >= 8 && hour < 12;
    const isAfternoon = hour >= 12 && hour < 17;
    const isEvening = hour >= 17 && hour < 24;

    // Connection strengths vary by time of day
    let connections;
    if (isEarlyMorning) {
      // Early morning: minimal activity, weak connections
      connections = [
        { from: { x: 200, y: 110 }, to: { x: 400, y: 110 }, strength: 0.3 },
        { from: { x: 200, y: 110 }, to: { x: 600, y: 110 }, strength: 0.2 },
        { from: { x: 400, y: 110 }, to: { x: 600, y: 110 }, strength: 0.4 },
        { from: { x: 200, y: 110 }, to: { x: 300, y: 210 }, strength: 0.3 },
        { from: { x: 400, y: 110 }, to: { x: 300, y: 210 }, strength: 0.2 },
        { from: { x: 600, y: 110 }, to: { x: 500, y: 210 }, strength: 0.3 },
        { from: { x: 300, y: 210 }, to: { x: 500, y: 210 }, strength: 0.2 },
      ];
    } else if (isMorning) {
      // Morning: Coffee strong, grooming moderate
      connections = [
        { from: { x: 200, y: 110 }, to: { x: 400, y: 110 }, strength: 0.6 },
        { from: { x: 200, y: 110 }, to: { x: 600, y: 110 }, strength: 0.4 },
        { from: { x: 400, y: 110 }, to: { x: 600, y: 110 }, strength: 0.5 },
        { from: { x: 200, y: 110 }, to: { x: 300, y: 210 }, strength: 0.7 },
        { from: { x: 400, y: 110 }, to: { x: 300, y: 210 }, strength: 0.5 },
        { from: { x: 600, y: 110 }, to: { x: 500, y: 210 }, strength: 0.4 },
        { from: { x: 300, y: 210 }, to: { x: 500, y: 210 }, strength: 0.6 },
      ];
    } else if (isAfternoon) {
      // Afternoon: Peak activity, strong connections
      connections = [
        { from: { x: 200, y: 110 }, to: { x: 400, y: 110 }, strength: 0.9 },
        { from: { x: 200, y: 110 }, to: { x: 600, y: 110 }, strength: 0.7 },
        { from: { x: 400, y: 110 }, to: { x: 600, y: 110 }, strength: 0.95 },
        { from: { x: 200, y: 110 }, to: { x: 300, y: 210 }, strength: 0.8 },
        { from: { x: 400, y: 110 }, to: { x: 300, y: 210 }, strength: 0.85 },
        { from: { x: 600, y: 110 }, to: { x: 500, y: 210 }, strength: 0.75 },
        { from: { x: 300, y: 210 }, to: { x: 500, y: 210 }, strength: 0.7 },
      ];
    } else {
      // Evening: Cafe strong, grooming winding down
      connections = [
        { from: { x: 200, y: 110 }, to: { x: 400, y: 110 }, strength: 0.5 },
        { from: { x: 200, y: 110 }, to: { x: 600, y: 110 }, strength: 0.8 },
        { from: { x: 400, y: 110 }, to: { x: 600, y: 110 }, strength: 0.6 },
        { from: { x: 200, y: 110 }, to: { x: 300, y: 210 }, strength: 0.4 },
        { from: { x: 400, y: 110 }, to: { x: 300, y: 210 }, strength: 0.5 },
        { from: { x: 600, y: 110 }, to: { x: 500, y: 210 }, strength: 0.7 },
        { from: { x: 300, y: 210 }, to: { x: 500, y: 210 }, strength: 0.8 },
      ];
    }

    // Node sizes vary by time of day
    let nodes;
    if (isEarlyMorning) {
      nodes = [
        { x: 200, y: 110, label: "Iced Latte", color: "#06b6d4", size: "small" },
        { x: 400, y: 110, label: "Full Grooming", color: "#a855f7", size: "small" },
        { x: 600, y: 110, label: "Pet Treats", color: "#ec4899", size: "small" },
        { x: 300, y: 210, label: "Premium Shampoo", color: "#3b82f6", size: "small" },
        { x: 500, y: 210, label: "Cappuccino", color: "#8b5cf6", size: "small" },
      ];
    } else if (isMorning) {
      nodes = [
        { x: 200, y: 110, label: "Iced Latte", color: "#06b6d4", size: "large" },
        { x: 400, y: 110, label: "Full Grooming", color: "#a855f7", size: "medium" },
        { x: 600, y: 110, label: "Pet Treats", color: "#ec4899", size: "medium" },
        { x: 300, y: 210, label: "Premium Shampoo", color: "#3b82f6", size: "medium" },
        { x: 500, y: 210, label: "Cappuccino", color: "#8b5cf6", size: "large" },
      ];
    } else if (isAfternoon) {
      nodes = [
        { x: 200, y: 110, label: "Iced Latte", color: "#06b6d4", size: "large" },
        { x: 400, y: 110, label: "Full Grooming", color: "#a855f7", size: "large" },
        { x: 600, y: 110, label: "Pet Treats", color: "#ec4899", size: "large" },
        { x: 300, y: 210, label: "Premium Shampoo", color: "#3b82f6", size: "large" },
        { x: 500, y: 210, label: "Cappuccino", color: "#8b5cf6", size: "large" },
      ];
    } else {
      nodes = [
        { x: 200, y: 110, label: "Iced Latte", color: "#06b6d4", size: "large" },
        { x: 400, y: 110, label: "Full Grooming", color: "#a855f7", size: "small" },
        { x: 600, y: 110, label: "Pet Treats", color: "#ec4899", size: "large" },
        { x: 300, y: 210, label: "Premium Shampoo", color: "#3b82f6", size: "small" },
        { x: 500, y: 210, label: "Cappuccino", color: "#8b5cf6", size: "large" },
      ];
    }

    // AI insights vary by time
    let insights;
    if (isEarlyMorning) {
      insights = {
        topBundle: { product: "Early Bird Coffee", metric: "34% co-purchase" },
        emerging: { product: "Quick Treats", metric: "+12% this week" },
        crossSell: { product: "Minimal Activity", metric: "23% conversion" },
      };
    } else if (isMorning) {
      insights = {
        topBundle: { product: "Latte + Treat", metric: "67% co-purchase" },
        emerging: { product: "Grooming Rush", metric: "+32% this week" },
        crossSell: { product: "Café → Grooming", metric: "58% conversion" },
      };
    } else if (isAfternoon) {
      insights = {
        topBundle: { product: "Latte + Grooming", metric: "89% co-purchase" },
        emerging: { product: "Treats + Shampoo", metric: "+47% this week" },
        crossSell: { product: "Café → Grooming", metric: "72% conversion" },
      };
    } else {
      insights = {
        topBundle: { product: "Coffee + Treats", metric: "81% co-purchase" },
        emerging: { product: "Evening Beverages", metric: "+54% this week" },
        crossSell: { product: "Treats → Coffee", metric: "68% conversion" },
      };
    }

    return { connections, nodes, insights };
  };

  const { connections, nodes, insights } = getTimeBasedData(timeValue);

  // Generate moderate balanced cluster of yellow dots for Grooming Area (left)
  const groomingDots = Array.from({ length: 18 }, (_, i) => ({
    x: 40 + (Math.random() * 300),
    y: 80 + (Math.random() * 240),
    delay: Math.random() * 2,
  }));

  // Generate moderate balanced cluster of yellow dots for Cafe Area (right)
  const cafeDots = Array.from({ length: 18 }, (_, i) => ({
    x: 440 + (Math.random() * 300),
    y: 80 + (Math.random() * 240),
    delay: Math.random() * 2,
  }));

  return (
    <div className="max-w-5xl mx-auto mt-8">
      {/* Large Vertical Dark Mode Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* ===== TOP SECTION: Predictive Floorplan Simulator ===== */}
        <div className="border-b border-purple-500/20">
          {/* Header */}
          <div className="p-6 border-b border-purple-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-white tracking-tight">
                  Predictive Floorplan Simulator
                </h2>
              </div>
            </div>
          </div>

          {/* Floorplan Content */}
          <div className="p-8">
            <div className="relative bg-gradient-to-br from-slate-950 to-slate-900 rounded-xl border border-purple-500/30 overflow-hidden">
              {/* Ambient glow effects */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>

              <svg
                viewBox="0 0 800 400"
                className="w-full h-auto relative z-10"
                style={{ maxHeight: "400px" }}
              >
                {/* Grid Background */}
                <defs>
                  <pattern
                    id="grid"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="rgba(139, 92, 246, 0.1)"
                      strokeWidth="0.5"
                    />
                  </pattern>

                  {/* Glow filters */}
                  <filter id="glow-yellow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="glow-purple">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="glow-node">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  {/* Gradients */}
                  <radialGradient id="yellowHeatmap" cx="50%" cy="50%">
                    <stop key="yellow-stop-0" offset="0%" stopColor="#fbbf24" stopOpacity="0.2" />
                    <stop key="yellow-stop-50" offset="50%" stopColor="#f59e0b" stopOpacity="0.1" />
                    <stop key="yellow-stop-100" offset="100%" stopColor="#d97706" stopOpacity="0.05" />
                  </radialGradient>

                  <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop key="area-stop-0" offset="0%" stopColor="#1e293b" stopOpacity="0.5" />
                    <stop key="area-stop-100" offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
                  </linearGradient>
                </defs>

                {/* Grid overlay */}
                <rect width="800" height="400" fill="url(#grid)" />

                {/* GROOMING AREA (Left) */}
                <g>
                  {/* Background */}
                  <rect
                    x="20"
                    y="20"
                    width="360"
                    height="360"
                    fill="url(#areaGradient)"
                    stroke="#8b5cf6"
                    strokeWidth="2"
                    rx="8"
                    opacity="0.6"
                  />

                  {/* Inner border glow */}
                  <rect
                    x="20"
                    y="20"
                    width="360"
                    height="360"
                    fill="none"
                    stroke="url(#glow-purple)"
                    strokeWidth="1"
                    rx="8"
                    filter="url(#glow-purple)"
                    opacity="0.5"
                  />

                  {/* Label */}
                  <text
                    x="200"
                    y="50"
                    textAnchor="middle"
                    className="fill-cyan-400"
                    style={{
                      fontSize: "16px",
                      fontWeight: "700",
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                    }}
                    filter="url(#glow-purple)"
                  >
                    GROOMING AREA
                  </text>

                  {/* Subtle yellow heatmap base */}
                  <circle
                    cx="200"
                    cy="200"
                    r="120"
                    fill="url(#yellowHeatmap)"
                    opacity="0.6"
                  />

                  {/* Moderate balanced cluster of yellow dots for Grooming */}
                  {groomingDots.map((dot, idx) => (
                    <g key={`grooming-${idx}`}>
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r="4"
                        fill="#fbbf24"
                        filter="url(#glow-yellow)"
                        opacity="0.5"
                        className="animate-pulse"
                        style={{
                          animationDelay: `${dot.delay}s`,
                          animationDuration: "2s",
                        }}
                      />
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r="7"
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="1"
                        opacity="0.2"
                      />
                    </g>
                  ))}

                  {/* Grooming station outlines */}
                  <rect x="60" y="100" width="70" height="55" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="150" y="100" width="70" height="55" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="240" y="100" width="70" height="55" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="60" y="180" width="70" height="55" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="150" y="180" width="70" height="55" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="240" y="180" width="70" height="55" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                </g>

                {/* Divider Line */}
                <line
                  x1="400"
                  y1="20"
                  x2="400"
                  y2="380"
                  stroke="#8b5cf6"
                  strokeWidth="2"
                  strokeDasharray="8,4"
                  opacity="0.5"
                />

                {/* CAFE AREA (Right) */}
                <g>
                  {/* Background */}
                  <rect
                    x="420"
                    y="20"
                    width="360"
                    height="360"
                    fill="url(#areaGradient)"
                    stroke="#8b5cf6"
                    strokeWidth="2"
                    rx="8"
                    opacity="0.6"
                  />

                  {/* Inner border glow */}
                  <rect
                    x="420"
                    y="20"
                    width="360"
                    height="360"
                    fill="none"
                    stroke="url(#glow-purple)"
                    strokeWidth="1"
                    rx="8"
                    filter="url(#glow-purple)"
                    opacity="0.5"
                  />

                  {/* Label */}
                  <text
                    x="600"
                    y="50"
                    textAnchor="middle"
                    className="fill-cyan-400"
                    style={{
                      fontSize: "16px",
                      fontWeight: "700",
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                    }}
                    filter="url(#glow-purple)"
                  >
                    CAFE AREA
                  </text>

                  {/* Subtle yellow heatmap base */}
                  <circle
                    cx="600"
                    cy="200"
                    r="120"
                    fill="url(#yellowHeatmap)"
                    opacity="0.6"
                  />

                  {/* Moderate balanced cluster of yellow dots for Cafe */}
                  {cafeDots.map((dot, idx) => (
                    <g key={`cafe-${idx}`}>
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r="4"
                        fill="#fbbf24"
                        filter="url(#glow-yellow)"
                        opacity="0.5"
                        className="animate-pulse"
                        style={{
                          animationDelay: `${dot.delay}s`,
                          animationDuration: "2s",
                        }}
                      />
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r="7"
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="1"
                        opacity="0.2"
                      />
                    </g>
                  ))}

                  {/* Table/Station outlines */}
                  <rect x="460" y="100" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="540" y="100" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="620" y="100" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="460" y="180" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="540" y="180" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="620" y="180" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="460" y="260" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="540" y="260" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                  <rect x="620" y="260" width="50" height="50" fill="none" stroke="#475569" strokeWidth="1.5" rx="4" opacity="0.4" />
                </g>
              </svg>

              {/* Legend */}
              <div className="absolute bottom-4 left-4 flex items-center gap-6 text-xs bg-slate-950/80 backdrop-blur-sm border border-purple-500/30 rounded-lg px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50 shadow-[0_0_8px_rgba(251,191,36,0.6)]"></div>
                  <span className="text-slate-300">Balanced Activity</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500/50 shadow-[0_0_6px_rgba(168,85,247,0.6)]"></div>
                  <span className="text-slate-300">Base State</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== BOTTOM SECTION: Live Behavioral Web (Apriori AI) ===== */}
        <div className="border-b border-purple-500/20">
          {/* Header */}
          <div className="p-6 border-b border-purple-500/20">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-semibold text-white tracking-tight">
                Live Behavioral Web (FP GROWTH AI)
              </h2>
              <div className="ml-auto flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                <span className="text-xs text-cyan-400 uppercase tracking-wider">
                  Learning Active
                </span>
              </div>
            </div>
          </div>

          {/* Neural Network Graph */}
          <div className="p-8">
            <div className="relative bg-gradient-to-br from-slate-950 to-slate-900 rounded-xl border border-purple-500/30 overflow-hidden">
              {/* Ambient glow effects */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>

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

                  <pattern id="grid-small" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(139, 92, 246, 0.08)" strokeWidth="0.5" />
                  </pattern>
                </defs>

                {/* Grid background */}
                <rect width="800" height="300" fill="url(#grid-small)" />

                {/* Connection lines (web) */}
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

                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop key="line-stop-0" offset="0%" stopColor="#06b6d4" />
                    <stop key="line-stop-50" offset="50%" stopColor="#a855f7" />
                    <stop key="line-stop-100" offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>

                {/* Product nodes */}
                {nodes.map((node, idx) => (
                  <g key={`node-${idx}`}>
                    {/* Outer glow ring */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size === "large" ? 35 : node.size === "medium" ? 28 : 22}
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
                    
                    {/* Main node circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size === "large" ? 25 : node.size === "medium" ? 18 : 12}
                      fill={node.color}
                      filter="url(#glow-node)"
                      opacity="0.8"
                    />
                    
                    {/* Inner highlight */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size === "large" ? 15 : node.size === "medium" ? 10 : 6}
                      fill="white"
                      opacity="0.2"
                    />

                    {/* Label background */}
                    <rect
                      x={node.x - 55}
                      y={node.y + (node.size === "large" ? 35 : node.size === "medium" ? 28 : 22)}
                      width="110"
                      height="24"
                      fill="#0f172a"
                      stroke={node.color}
                      strokeWidth="1"
                      rx="12"
                      opacity="0.9"
                    />

                    {/* Label text */}
                    <text
                      x={node.x}
                      y={node.y + (node.size === "large" ? 51 : node.size === "medium" ? 44 : 38)}
                      textAnchor="middle"
                      fill={node.color}
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                      filter="url(#glow-node)"
                    >
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>

              {/* Legend */}
              <div className="absolute bottom-4 right-4 bg-slate-950/80 backdrop-blur-sm border border-purple-500/30 rounded-lg px-4 py-2">
                <div className="text-xs text-slate-400 mb-2">Connection Strength</div>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-12 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-full"></div>
                  <span className="text-xs text-slate-300">Weak → Strong</span>
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
                  <div className="text-white font-medium">{insights.topBundle.product}</div>
                  <div className="text-cyan-400 mt-1">{insights.topBundle.metric}</div>
                </div>
                <div className="bg-slate-950/50 border border-purple-500/30 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Emerging Trend</div>
                  <div className="text-white font-medium">{insights.emerging.product}</div>
                  <div className="text-purple-400 mt-1">{insights.emerging.metric}</div>
                </div>
                <div className="bg-slate-950/50 border border-pink-500/30 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Cross-Sell Opp.</div>
                  <div className="text-white font-medium">{insights.crossSell.product}</div>
                  <div className="text-pink-400 mt-1">{insights.crossSell.metric}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== BOTTOM CONTROLS (Shared) ===== */}
        <div className="p-8">
          <div className="bg-gradient-to-r from-slate-900/50 to-slate-800/50 border border-purple-500/30 rounded-xl p-6 backdrop-blur-sm">
            {/* Time Slider */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-cyan-400 uppercase tracking-wider font-semibold">
                  Time Selection
                </span>
                <span className="text-base text-white font-medium px-4 py-1 bg-purple-500/20 border border-purple-500/40 rounded-lg">
                  {formatTime(timeValue)}
                </span>
              </div>

              {/* Custom Slider */}
              <div className="relative">
                <div className="relative h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  {/* Progress fill */}
                  <div
                    className="absolute h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]"
                    style={{ width: `${((timeValue - 7) / 12) * 100}%` }}
                  ></div>
                </div>

                {/* Slider input */}
                <input
                  type="range"
                  min="7"
                  max="19"
                  value={timeValue}
                  onChange={(e) => setTimeValue(parseInt(e.target.value))}
                  className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer z-10"
                />

                {/* Custom thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-full border-2 border-white shadow-[0_0_16px_rgba(139,92,246,0.8)] pointer-events-none transition-all duration-200"
                  style={{ left: `calc(${((timeValue - 7) / 12) * 100}% - 12px)` }}
                >
                  <div className="absolute inset-0 rounded-full bg-white/20 animate-ping"></div>
                </div>
              </div>

              {/* Time markers */}
              <div className="flex justify-between text-xs text-slate-500 mt-3 px-1">
                <span>07:00</span>
                <span>10:00</span>
                <span>13:00</span>
                <span>16:00</span>
                <span>19:00</span>
              </div>
            </div>

            {/* Play Button and Status */}
            <div className="flex items-center justify-end gap-4">
              {/* Metrics Display */}
              <div className="flex gap-3">
                <div className="bg-slate-900/50 border border-purple-500/30 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-cyan-400 uppercase tracking-wider mb-1">
                    Accuracy
                  </div>
                  <div className="text-xl text-white font-bold">94%</div>
                </div>
                <div className="bg-slate-900/50 border border-purple-500/30 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-cyan-400 uppercase tracking-wider mb-1">
                    Confidence
                  </div>
                  <div className="text-xl text-white font-bold">HIGH</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}