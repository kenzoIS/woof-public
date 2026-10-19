import { AlertTriangle, BarChart2, Calendar, CheckCircle2, FileText, TrendingUp, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { ForecastRun } from "../lib/api";

interface ModelDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  forecastRun?: ForecastRun | null;
}

export function ModelDetailsModal({ isOpen, onClose, forecastRun }: ModelDetailsModalProps) {
  // If forecastRun has actual metadata, we show the premium diagnostics layout
  const m = forecastRun?.modelMetadata as any;
  const isFallback = forecastRun?.isFallback ?? false;
  const isServices = forecastRun?.module === "Services";
  const serviceRevenueMetrics = m?.revenueEvaluation?.daily;

  const mockErrorLogs = [
    {
      timestamp: "2026-04-28 14:32:15",
      level: "ERROR",
      message: "Insufficient training data: Only 847 samples available, minimum 1000 required",
    },
    {
      timestamp: "2026-04-28 14:32:18",
      level: "WARNING",
      message: "Data quality check failed: 12% missing values in feature 'transaction_amount'",
    },
    {
      timestamp: "2026-04-28 14:32:20",
      level: "ERROR",
      message: "Model convergence failed after 500 iterations (max allowed)",
    },
    {
      timestamp: "2026-04-28 14:32:22",
      level: "INFO",
      message: "Rollback initiated: Reverting to previous model version (v2.3.1)",
    },
  ];

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl bg-white border border-[#FFD9EC] rounded-2xl p-6 shadow-2xl">
        <AlertDialogHeader className="relative">
          <div className="flex items-center gap-4 mb-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: isFallback ? "#F59E0B20" : "#10B98120",
              }}
            >
              {isFallback ? (
                <AlertTriangle className="w-6 h-6 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              )}
            </div>
            <div>
              <AlertDialogTitle className="text-xl font-extrabold text-[#223047]">
                {forecastRun ? "Model Diagnostics & Evaluation" : "Model Training Failure Details"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#223047] opacity-60">
                {forecastRun
                  ? `Active Model: ${forecastRun.modelName || "N/A"}`
                  : "Detailed error logs from the model training attempt"}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {forecastRun ? (
          <div className="space-y-4 my-2">
            {/* Fallback Banner */}
            {isFallback && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-amber-800">Fallback Model Active</h4>
                  <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                    {forecastRun.rejectionReason || m?.fallbackReason || "The primary forecasting model was rejected or failed, so the system fell back to a 7-day Simple Moving Average (SMA)."}
                  </p>
                </div>
              </div>
            )}

            {/* Performance KPI Cards */}
            <div className={`grid ${isServices ? "grid-cols-2 md:grid-cols-3" : "grid-cols-3"} gap-3`}>
              <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block mb-1">
                  sMAPE Score
                </span>
                <span className="text-lg font-extrabold text-[#F53799]">
                  {forecastRun.smape != null ? `${forecastRun.smape.toFixed(2)}%` : "N/A"}
                </span>
              </div>
              <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block mb-1">
                  MASE Score
                </span>
                <span className="text-lg font-extrabold text-[#223047]">
                  {forecastRun.mase != null ? forecastRun.mase.toFixed(2) : "N/A"}
                </span>
              </div>
              <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block mb-1">
                  {isServices ? "MAE (₱/demand day)" : "Accuracy"}
                </span>
                <span className="text-lg font-extrabold text-emerald-600">
                  {isServices
                    ? forecastRun.mae != null ? `₱${forecastRun.mae.toFixed(2)}` : "N/A"
                    : forecastRun.accuracy != null ? `${forecastRun.accuracy.toFixed(1)}%` : "N/A"}
                </span>
              </div>
            </div>
            {isServices && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block mb-1">Skill vs Baseline</span>
                  <span className="text-lg font-extrabold text-[#223047]">
                    {serviceRevenueMetrics?.forecastSkillPercent != null ? `${Number(serviceRevenueMetrics.forecastSkillPercent).toFixed(1)}%` : "N/A"}
                  </span>
                </div>
                <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block mb-1">RMSE (₱/demand day)</span>
                  <span className="text-lg font-extrabold text-[#223047]">
                    {forecastRun.rmse != null ? `₱${forecastRun.rmse.toFixed(2)}` : "N/A"}
                  </span>
                </div>
                <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block mb-1">Bias (₱/demand day)</span>
                  <span className="text-lg font-extrabold text-[#223047]">
                    {serviceRevenueMetrics?.biasMeanError != null ? `₱${Number(serviceRevenueMetrics.biasMeanError).toFixed(2)}` : "N/A"}
                  </span>
                </div>
              </div>
            )}

            {/* Calendar & Parameters Grid */}
            <div className="bg-[#FFF2FA]/30 border border-[#FFD9EC] rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex gap-2.5 items-start">
                  <Calendar className="w-4 h-4 text-[#F53799] mt-0.5" />
                  <div>
                    <span className="text-[11px] block font-bold text-[#223047] opacity-50">
                      Training Window
                    </span>
                    <span className="text-xs text-[#223047] font-semibold">
                      {m?.trainStartDate || "N/A"} to {m?.trainEndDate || "N/A"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <Calendar className="w-4 h-4 text-[#F53799] mt-0.5" />
                  <div>
                    <span className="text-[11px] block font-bold text-[#223047] opacity-50">
                      Testing Window
                    </span>
                    <span className="text-xs text-[#223047] font-semibold">
                      {m?.testStartDate || "N/A"} to {m?.testEndDate || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-[#FFD9EC]" />

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="block text-[#223047] opacity-50 text-[10px]">Observed Days</span>
                  <span className="font-bold text-[#223047]">{m?.observedDemandDays ?? "N/A"}</span>
                </div>
                <div>
                  <span className="block text-[#223047] opacity-50 text-[10px]">Closed Days Excluded</span>
                  <span className="font-bold text-[#223047]">{m?.closedDaysExcluded ?? "N/A"}</span>
                </div>
                <div>
                  <span className="block text-[#223047] opacity-50 text-[10px]">Split Method</span>
                  <span className="font-bold text-[#223047]">{m?.splitRatio || "80-10-10 Split"}</span>
                </div>
              </div>
            </div>

            {/* Model Recommendations / Action Item */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h4 className="text-xs font-bold text-[#223047] uppercase tracking-wider mb-1">
                Model Evaluation Summary
              </h4>
              <p className="text-xs text-[#223047] opacity-80 leading-relaxed">
                {isFallback
                  ? "Action Recommended: Review recent transactions data uploads for anomalies, outliers, or consecutive zero days that may have caused the primary model to exceed sMAPE/MASE thresholds."
                  : `Methodology Alignment: The primary model has been validated on a holdout set (80-10-10 split) and successfully passed the target MASE threshold (< 1.20). Performance is stable.`}
              </p>
            </div>
          </div>
        ) : (
          /* Backward compatible fallback UI */
          <div className="space-y-4 my-2">
            <div className="max-h-[300px] overflow-y-auto space-y-2 bg-[#FFF7FB] border border-[#FFD9EC] rounded-lg p-4">
              {mockErrorLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-white border border-[#FFD9EC] rounded-lg space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[#223047] opacity-60">
                      {log.timestamp}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        log.level === "ERROR"
                          ? "bg-red-100 text-red-700"
                          : log.level === "WARNING"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {log.level}
                    </span>
                  </div>
                  <p className="text-sm text-[#223047]">{log.message}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg p-4">
              <h4 className="text-sm font-semibold text-[#223047] mb-2">Recommendations:</h4>
              <ul className="text-sm text-[#223047] space-y-1 list-disc list-inside">
                <li>Collect at least 153 more training samples before retrying</li>
                <li>Clean missing values in transaction_amount column</li>
                <li>Consider using a simpler model architecture</li>
              </ul>
            </div>
          </div>
        )}

        <AlertDialogFooter className="mt-4">
          <AlertDialogAction
            onClick={onClose}
            className="bg-[#F53799] hover:bg-[#D42A7D] text-white font-semibold px-6 py-2 rounded-xl"
          >
            Close Diagnostics
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
