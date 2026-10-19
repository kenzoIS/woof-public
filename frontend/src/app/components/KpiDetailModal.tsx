import React from "react";
import { TrendingUp, TrendingDown, X } from "lucide-react";
import { Button } from "./ui/button";

export interface KpiDetailData {
  title: string;
  current: number | string;
  previous?: number | string;
  currentLabel?: string;
  previousLabel?: string;
  rangeStart?: string;
  rangeEnd?: string;
  prevRangeStart?: string;
  prevRangeEnd?: string;
  formatter?: (val: any) => string;
  growth?: { text: string; className?: string };
  description: string;
  icon?: React.ReactNode;
  extraStats?: { label: string; value: string }[];
}

interface KpiDetailModalProps {
  kpi: KpiDetailData | null;
  onClose: () => void;
}

export function KpiDetailModal({ kpi, onClose }: KpiDetailModalProps) {
  if (!kpi) return null;

  const defaultFormatter = (v: any) =>
    typeof v === "number" ? v.toLocaleString() : String(v ?? "");
  const format = kpi.formatter || defaultFormatter;

  const currentNum =
    typeof kpi.current === "number"
      ? kpi.current
      : parseFloat(String(kpi.current).replace(/[^0-9.-]+/g, "")) || 0;
  const previousNum =
    typeof kpi.previous === "number"
      ? kpi.previous
      : parseFloat(String(kpi.previous).replace(/[^0-9.-]+/g, "")) || 0;
  const hasPrev = previousNum > 0;

  const sanitizeGrowthText = (val: string): string => {
    const match = val.match(/^([+-]?)(\d+(?:\.\d+)?)(%.*)$/);
    if (match) {
      const sign = match[1];
      const num = parseFloat(match[2]);
      const rest = match[3];
      if (num > 100) {
        return `${sign}100.0${rest}`;
      }
    }
    return val;
  };

  const growthText = sanitizeGrowthText(kpi.growth?.text || "");
  const isUp = growthText.startsWith("+");
  const isDown = growthText.startsWith("-");

  const maxBar = Math.max(currentNum, previousNum, 1);
  const currentPct = Math.min(100, Math.round((currentNum / maxBar) * 100));
  const prevPct = Math.min(100, Math.round((previousNum / maxBar) * 100));
  const diff = currentNum - previousNum;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#FFD9EC] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between p-5 pb-4"
          style={{
            background: "linear-gradient(135deg, #FFF7FB 0%, #FFF0F8 100%)",
            borderBottom: "1px solid #FFD9EC",
          }}
        >
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              {kpi.icon && (
                <div className="w-5 h-5 rounded-md bg-[#F53799]/10 text-[#F53799] flex items-center justify-center">
                  {kpi.icon}
                </div>
              )}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#223047]/40">
                KPI Breakdown
              </p>
            </div>
            <h3 className="text-lg font-bold text-[#223047] leading-tight">
              {kpi.title}
            </h3>
            {hasPrev && Boolean(growthText) && (
              <span
                className={`inline-flex items-center gap-1 mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full border ${
                  isUp
                    ? "bg-green-50 border-green-200 text-green-700"
                    : isDown
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
              >
                {isUp ? (
                  <TrendingUp className="w-3 h-3" />
                ) : isDown ? (
                  <TrendingDown className="w-3 h-3" />
                ) : null}
                {growthText} vs prior period
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#FFD9EC]/60 text-[#223047]/40 hover:text-[#F53799] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Big value display */}
          <div className="text-4xl font-black text-[#223047] leading-none">
            {format(kpi.current)}
          </div>

          {/* Comparison bars */}
          {hasPrev && (
            <div className="space-y-3">
              {/* Current */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-[#223047]/70">
                    {kpi.currentLabel || "Current Period"}
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#F53799]">
                      {format(kpi.current)}
                    </span>
                    {kpi.rangeStart && (
                      <span className="text-[10px] text-[#223047]/40 ml-1.5">
                        {kpi.rangeStart} – {kpi.rangeEnd}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2.5 bg-[#FFD9EC] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F53799] rounded-full transition-all duration-500"
                    style={{ width: `${currentPct}%` }}
                  />
                </div>
              </div>

              {/* Previous */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-[#223047]/50">
                    {kpi.previousLabel || "Previous Period"}
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#223047]/60">
                      {format(kpi.previous)}
                    </span>
                    {kpi.prevRangeStart && (
                      <span className="text-[10px] text-[#223047]/30 ml-1.5">
                        {kpi.prevRangeStart} – {kpi.prevRangeEnd}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#223047]/30 rounded-full transition-all duration-500"
                    style={{ width: `${prevPct}%` }}
                  />
                </div>
              </div>

              {/* Net difference */}
              <div
                className={`flex items-center justify-between text-xs px-3 py-2 rounded-xl border ${
                  diff >= 0
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                <span className="font-medium">Net change vs. prior period</span>
                <span className="font-bold">
                  {diff >= 0 ? "+" : "-"}
                  {format(Math.abs(diff))}
                </span>
              </div>
            </div>
          )}

          {/* Extra stats if provided */}
          {kpi.extraStats && kpi.extraStats.length > 0 && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              {kpi.extraStats.map((stat, idx) => (
                <div
                  key={idx}
                  className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-2.5"
                >
                  <p className="text-[10px] text-[#223047]/60 font-medium">
                    {stat.label}
                  </p>
                  <p className="text-sm font-bold text-[#223047]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Description */}
          {kpi.description && (
            <p className="text-xs text-[#223047]/60 leading-relaxed border-t border-[#FFD9EC] pt-3">
              {kpi.description}
            </p>
          )}

          <Button
            onClick={onClose}
            className="w-full bg-[#F53799] hover:bg-[#D42A7D] text-white rounded-xl py-2 text-xs font-semibold transition-colors"
          >
            Understood
          </Button>
        </div>
      </div>
    </div>
  );
}
