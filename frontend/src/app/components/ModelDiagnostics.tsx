import React from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { ForecastRun } from "../lib/api";

interface ModelDiagnosticsProps {
  forecastRun: ForecastRun | null;
}

export function ModelDiagnostics({ forecastRun }: ModelDiagnosticsProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  if (!forecastRun || !forecastRun.modelMetadata) return null;

  const m = forecastRun.modelMetadata as any;

  return (
    <div className="mt-4 border border-[#E2E8F0] rounded-xl overflow-hidden bg-[#F8FAFC]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Model Diagnostics & Evaluation Details</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-slate-600 border-t border-[#E2E8F0]">
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Forecast Mode</span>
            <span>{m.forecastMode || "Production"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Evaluation Metric</span>
            <span>{m.percentageErrorMetric || "sMAPE"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">sMAPE / MASE</span>
            <span>{forecastRun.smape?.toFixed(2)}% / {forecastRun.mase?.toFixed(2)}</span>
          </div>
          
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Training Calendar</span>
            <span>{m.trainStartDate || "-"} to {m.trainEndDate || "-"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Test Calendar</span>
            <span>{m.testStartDate || "-"} to {m.testEndDate || "-"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Observed Demand Days</span>
            <span>{m.observedDemandDays ?? "-"}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Closed Days Excluded</span>
            <span>{m.closedDaysExcluded ?? "-"}</span>
          </div>
          <div className="md:col-span-2">
            <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Status / Fallback Reason</span>
            <span>{forecastRun.isFallback ? (forecastRun.rejectionReason || m.fallbackReason || "Selected model could not run") : "Model fit successfully"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
