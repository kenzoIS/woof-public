import { useEffect, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import { InfoTooltip } from "../components/InfoTooltip";
import {
  generateSmartReport,
  getSmartReports,
  deleteSmartReport,
  submitSmartReportFeedback,
  SmartReport
} from "../lib/api";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export function SmartReports() {
  const router = useRouter();
  const [reports, setReports] = useState<SmartReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SmartReport | null>(null);
  const [title, setTitle] = useState("Executive Business Performance Report");
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedSectors, setSelectedSectors] = useState<string[]>(["Cafe", "Retail", "Services"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // UAT Feedback form state
  const [accuracyRating, setAccuracyRating] = useState<number>(5);
  const [usefulnessRating, setUsefulnessRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Modal States
  const [showPartialDataModal, setShowPartialDataModal] = useState(false);
  const [showNoDataModal, setShowNoDataModal] = useState(false);
  const [showInvalidDateModal, setShowInvalidDateModal] = useState(false);
  const [showDateRangeModal, setShowDateRangeModal] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<SmartReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingReportToShow, setPendingReportToShow] = useState<SmartReport | null>(null);

  const calculateDayDiff = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((utcEnd - utcStart) / (1000 * 60 * 60 * 24));
  };

  const checkDateRange = (start: string, end: string) => {
    if (start && end && start.length === 10 && end.length === 10) {
      if (start <= end) {
        const diff = calculateDayDiff(start, end);
        if (diff > 31) {
          setShowDateRangeModal(true);
        }
      }
    }
  };

  const formatRangeLabel = (startStr?: string, endStr?: string) => {
    if (!startStr || !endStr) return "Revenue Trend";
    try {
      const s = new Date(startStr);
      const e = new Date(endStr);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        return `${startStr} to ${endStr} Revenue Trend`;
      }
      if (s.getFullYear() === e.getFullYear()) {
        const sFmt = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const eFmt = e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return `${sFmt} – ${eFmt} Revenue Trend`;
      }
      const sFmt = s.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const eFmt = e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `${sFmt} – ${eFmt} Revenue Trend`;
    } catch {
      return `${startStr} to ${endStr} Revenue Trend`;
    }
  };

  const { data: initialReports, error: reportsError, mutate: mutateReports } = useSWR(
    "smartReports",
    () => getSmartReports()
  );

  useEffect(() => {
    if (initialReports) {
      setReports(initialReports);
      if (!selectedReport && initialReports.length > 0) {
        setSelectedReport(initialReports[0]);
      }
      setIsLoading(false);
    }
  }, [initialReports]);

  useEffect(() => {
    if (reportsError) {
      toast.error("Failed to load reports log", { description: reportsError.message });
      setIsLoading(false);
    }
  }, [reportsError]);

  const fetchReports = async (selectLatest = false) => {
    setIsLoading(true);
    await mutateReports();
  };

  useEffect(() => {
    if (selectedReport) {
      setAccuracyRating(selectedReport.uatFeedback?.accuracyRating || 5);
      setUsefulnessRating(selectedReport.uatFeedback?.usefulnessRating || 5);
      setFeedbackText(selectedReport.uatFeedback?.feedbackText || "");
    }
  }, [selectedReport]);

  const handleSectorChange = (sector: string) => {
    if (selectedSectors.includes(sector)) {
      setSelectedSectors(selectedSectors.filter((s) => s !== sector));
    } else {
      setSelectedSectors([...selectedSectors, sector]);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSectors.length === 0) {
      toast.error("Validation Error", { description: "Please select at least one business sector." });
      return;
    }

    // Modal 3: Invalid Date selection check
    if (new Date(startDate) > new Date(endDate)) {
      setShowInvalidDateModal(true);
      return;
    }

    // Modal 4: Date range exceeds 30-31 days
    if (calculateDayDiff(startDate, endDate) > 31) {
      setShowDateRangeModal(true);
      return;
    }

    setIsGenerating(true);
    try {
      const newReport = await generateSmartReport({
        title,
        startDate,
        endDate,
        sectors: selectedSectors,
      });

      // Use isPartialData flag from backend instead of guessing from channel names
      if (newReport.isPartialData) {
        setPendingReportToShow(newReport);
        setShowPartialDataModal(true);
      } else {
        setSelectedReport(newReport);
      }

      fetchReports();
      toast.success("Intelligence report generated successfully!");
    } catch (err: any) {
      // Modal 2 check: No transactions or empty range 404
      const errMsg = err.message || "";
      if (
        errMsg.includes("No transactions found") ||
        errMsg.includes("404") ||
        err.status === 404
      ) {
        setShowNoDataModal(true);
      } else {
        toast.error("Report generation failed", { description: errMsg });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteClick = (rep: SmartReport, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setReportToDelete(rep);
  };

  const handleConfirmDelete = async () => {
    if (!reportToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSmartReport(reportToDelete._id);
      toast.success("Report deleted successfully");
      // Optimistically remove from local list
      setReports((prev) => prev.filter((rep) => rep._id !== reportToDelete._id));
      if (selectedReport?._id === reportToDelete._id) {
        setSelectedReport(null);
      }
      setReportToDelete(null);
    } catch (err: any) {
      toast.error("Delete failed", { description: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!selectedReport) return;
    setIsSubmittingFeedback(true);
    try {
      const updated = await submitSmartReportFeedback(selectedReport._id, {
        accuracyRating,
        usefulnessRating,
        ownerApproved: true,
        feedbackText,
      });
      setSelectedReport(updated);
      fetchReports();
      toast.success("UAT Feedback submitted & report approved!");
    } catch (err: any) {
      toast.error("Failed to submit feedback", { description: err.message });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleExportCSV = () => {
    if (!selectedReport) return;
    
    // Construct CSV content
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    csvContent += `Report Title,${selectedReport.title}\n`;
    csvContent += `Date Range,${selectedReport.dateRange.start} to ${selectedReport.dateRange.end}\n`;
    csvContent += `Generated At,${selectedReport.generatedAt}\n\n`;
    
    csvContent += `METRIC,VALUE\n`;
    csvContent += `Total Revenue,PHP ${selectedReport.aggregatedData.totalRevenue}\n`;
    csvContent += `Gross Profit,PHP ${selectedReport.aggregatedData.totalGrossProfit}\n`;
    csvContent += `Profit Margin,${selectedReport.aggregatedData.averageMargin}%\n`;
    csvContent += `Data Completeness,${selectedReport.dataCompleteness ?? 100}%\n`;
    csvContent += `Trend Direction,${selectedReport.extrapolatedTrends.trendDirection}\n\n`;
    
    csvContent += `CHANNEL REVENUE\n`;
    Object.entries(selectedReport.aggregatedData.channelRevenue).forEach(([channel, rev]) => {
      csvContent += `${channel},PHP ${rev}\n`;
    });
    csvContent += `\n`;
    
    csvContent += `CATEGORY SALES\n`;
    Object.entries(selectedReport.aggregatedData.categorySales).forEach(([cat, qty]) => {
      csvContent += `${cat},${qty}\n`;
    });
    csvContent += `\n`;
    
    csvContent += `DAILY REVENUE TREND\n`;
    csvContent += `Date,Actual Revenue (PHP)\n`;
    if (selectedReport.aggregatedData.dailyHistory && selectedReport.aggregatedData.dailyHistory.length > 0) {
      selectedReport.aggregatedData.dailyHistory.forEach((h) => {
        csvContent += `${h.date},${Math.round(h.value)}\n`;
      });
    } else {
      selectedReport.extrapolatedTrends.dates.forEach((date, idx) => {
        csvContent += `${date},${Math.round(selectedReport.extrapolatedTrends.projectedRevenue[idx])}\n`;
      });
    }
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedReport.title.replace(/\s+/g, "_")}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV export downloaded successfully!");
  };

  const handleExportPDF = () => {
    window.print();
  };

  // Build chart dataset: historical actuals only
  const getChartData = () => {
    if (!selectedReport) return { data: [], hasHistory: false };
    const history = (selectedReport.aggregatedData.dailyHistory ?? []).filter(
      (h) => h.value > 0  // skip zero-value days
    );
    const hasHistory = history.length > 0;

    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    if (hasHistory) {
      return {
        data: history.map((h) => ({
          date: fmt(h.date),
          revenue: Math.round(h.value),
        })),
        hasHistory: true,
      };
    }

    // Graceful fallback for older reports
    const trends = selectedReport.extrapolatedTrends;
    return {
      data: (trends?.dates ?? []).map((date, idx) => ({
        date: fmt(date),
        revenue: Math.round(trends.projectedRevenue[idx] ?? 0),
      })),
      hasHistory: false,
    };
  };

  const { data: chartData } = getChartData();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFBFD] p-6 overflow-y-auto space-y-6">
      {/* Dynamic Printing Style Block */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-report-area, #printable-report-area * {
            visibility: visible;
          }
          #printable-report-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#FFD9EC] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-[#223047]">
              Smart Reports
            </h1>
            <InfoTooltip label="Generate full-stack ETL analytics, predictive trend projections, and automated NLG summaries." />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Form & History Log */}
        <div className="space-y-6 lg:col-span-1">
          {/* Generation Config Card */}
          <div className="bg-white border-2 border-[#FFD9EC] rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-extrabold text-[#223047]">
              Report Parameters
            </h2>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#223047] opacity-75">Report Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs rounded-xl border border-[#FFD9EC] p-2.5 transition-colors focus:border-[#F53799] focus:outline-none"
                  placeholder="e.g. Weekly Sales Audit"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#223047] opacity-75">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStartDate(val);
                      checkDateRange(val, endDate);
                    }}
                    className="w-full text-xs rounded-xl border border-[#FFD9EC] p-2.5 transition-colors focus:border-[#F53799] focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#223047] opacity-75">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEndDate(val);
                      checkDateRange(startDate, val);
                    }}
                    className="w-full text-xs rounded-xl border border-[#FFD9EC] p-2.5 transition-colors focus:border-[#F53799] focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Date Horizon Indicator */}
              <div className="flex items-center justify-between text-[11px] px-0.5 pt-0.5">
                <span className="text-[#223047] opacity-60">
                  Forecast Window: <strong className="font-semibold text-[#223047]">30–31 days max</strong>
                </span>
                {startDate && endDate && startDate <= endDate && (
                  <span
                    className={`font-bold ${
                      calculateDayDiff(startDate, endDate) > 31
                        ? "text-red-500 font-extrabold"
                        : "text-emerald-600"
                    }`}
                  >
                    {calculateDayDiff(startDate, endDate)} days selected
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#223047] opacity-75 block">Target Sectors</label>
                <div className="flex flex-wrap gap-2">
                  {["Cafe", "Retail", "Services"].map((sec) => {
                    const isChecked = selectedSectors.includes(sec);
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => handleSectorChange(sec)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all font-semibold ${
                          isChecked
                            ? "bg-[#FFF2FA] border-[#F53799] text-[#F53799]"
                            : "bg-white border-[#FFD9EC] text-[#223047] opacity-60 hover:opacity-100"
                        }`}
                      >
                        {sec}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                type="submit"
                disabled={isGenerating}
                className="w-full bg-[#F53799] hover:bg-[#D42A7D] text-white py-5 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Report"
                )}
              </Button>
            </form>
          </div>

          {/* Historical Log list */}
          <div className="bg-white border-2 border-[#FFD9EC] rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-extrabold text-[#223047]">
              Reports Log
            </h2>

            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-[#F53799]" />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-xs text-[#223047] opacity-50 text-center py-4">No reports generated yet.</p>
            ) : (
              <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1">
                {reports.map((rep) => {
                  const isSelected = selectedReport?._id === rep._id;
                  const dateFormatted = new Date(rep.generatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  return (
                    <div
                      key={rep._id}
                      onClick={() => setSelectedReport(rep)}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-[#FFF2FA] border-[#F53799] text-[#F53799]"
                          : "bg-white border-[#FFD9EC] hover:border-[#F53799]/40 text-[#223047]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-extrabold truncate">{rep.title}</h4>
                        <span className="text-[10px] opacity-60 block mt-0.5">{dateFormatted}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(rep, e)}
                          className="px-2 py-1 text-[11px] font-bold rounded-lg hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detailed View */}
        <div className="lg:col-span-2">
          {selectedReport ? (
            <div className="space-y-6">
              {/* Detailed View Card */}
              <div id="printable-report-area" className="bg-white border-2 border-[#FFD9EC] rounded-3xl p-6 shadow-sm space-y-6">
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#FFD9EC] pb-4">
                  <div>
                    <h2 className="text-lg font-black text-[#223047]">{selectedReport.title}</h2>
                    <span className="text-xs text-[#223047] opacity-60 block mt-1">
                      Data range: {selectedReport.dateRange.start} to {selectedReport.dateRange.end}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* Export Drodown Menu */}
                    <div className="relative group">
                      <Button className="bg-[#FFF2FA] border border-[#FFD9EC] text-[#F53799] hover:bg-[#F53799]/10 font-bold py-2 px-3 rounded-xl text-xs transition-colors">
                        Export Report
                      </Button>
                      <div className="absolute right-0 mt-1 w-32 bg-white border border-[#FFD9EC] rounded-xl shadow-lg hidden group-hover:block hover:block z-10 overflow-hidden">
                        <button
                          type="button"
                          onClick={handleExportCSV}
                          className="w-full text-left px-4 py-2.5 text-xs font-bold text-[#223047] hover:bg-[#FFF2FA] transition-colors border-b border-[#FFD9EC]/50"
                        >
                          CSV Format
                        </button>
                        <button
                          type="button"
                          onClick={handleExportPDF}
                          className="w-full text-left px-4 py-2.5 text-xs font-bold text-[#223047] hover:bg-[#FFF2FA] transition-colors"
                        >
                          PDF / Print
                        </button>
                      </div>
                    </div>

                    <div className="bg-[#FFF2FA] border border-[#FFD9EC] rounded-xl px-3 py-1.5 text-right shrink-0">
                      <span className="text-[10px] text-[#223047] opacity-50 block uppercase font-bold">Generated At</span>
                      <span className="text-xs font-extrabold text-[#F53799]">
                        {new Date(selectedReport.generatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Navigation to Live Analytical Dashboards */}
                <div className="flex flex-wrap items-center gap-2 p-3 bg-[#FFF7FB] border border-[#FFD9EC] rounded-2xl text-xs">
                  <span className="font-bold text-[#223047] opacity-60">Explore Live Dashboards:</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/cafe")}
                    className="border-[#FFD9EC] hover:bg-white text-xs h-7 text-[#F53799] font-semibold"
                  >
                    Cafe Dashboard
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/services")}
                    className="border-[#FFD9EC] hover:bg-white text-xs h-7 text-[#06B6D4] font-semibold"
                  >
                    Services Dashboard
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/retail")}
                    className="border-[#FFD9EC] hover:bg-white text-xs h-7 text-amber-600 font-semibold"
                  >
                    Retail Dashboard
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push("/ai-simulation")}
                    className="border-[#FFD9EC] hover:bg-white text-xs h-7 text-purple-600 font-semibold"
                  >
                    AI Simulation Hub
                  </Button>
                </div>

                {/* KPI metrics row */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block">Total Revenue</span>
                    <span className="text-base font-black text-[#223047] block mt-1">
                      ₱{new Intl.NumberFormat().format(selectedReport.aggregatedData.totalRevenue)}
                    </span>
                  </div>
                  <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block">Gross Profit</span>
                    <span className="text-base font-black text-[#F53799] block mt-1">
                      ₱{new Intl.NumberFormat().format(selectedReport.aggregatedData.totalGrossProfit)}
                    </span>
                  </div>
                  <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block">Profit Margin</span>
                    <span className="text-base font-black text-emerald-600 block mt-1">
                      {selectedReport.aggregatedData.averageMargin}%
                    </span>
                  </div>
                  <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block">Completeness</span>
                    <span className="text-base font-black text-[#06B6D4] block mt-1">
                      {selectedReport.dataCompleteness ?? 100}%
                    </span>
                  </div>
                  <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#223047] opacity-50 block">Trend Direction</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full inline-block font-extrabold mt-1.5 ${
                      selectedReport.extrapolatedTrends.trendDirection === "UPWARD"
                        ? "bg-green-100 text-green-700"
                        : selectedReport.extrapolatedTrends.trendDirection === "DOWNWARD"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {selectedReport.extrapolatedTrends.trendDirection}
                    </span>
                  </div>
                </div>

                {/* Date Trend Chart (Historical Actuals Only) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-black uppercase text-[#223047] opacity-60 tracking-wider">
                        {formatRangeLabel(selectedReport.dateRange?.start, selectedReport.dateRange?.end)}
                      </h3>
                      <InfoTooltip label="Daily recorded net revenue transactions across the selected reporting date range." />
                    </div>
                    <span className="text-[10px] bg-pink-50 border border-pink-200 text-[#F53799] px-2.5 py-0.5 rounded-full font-bold">
                      {selectedReport.dateRange?.start} to {selectedReport.dateRange?.end}
                    </span>
                  </div>
                  <div className="h-[240px] w-full bg-slate-50 border border-slate-100 rounded-xl p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F53799" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#F53799" stopOpacity={0.02}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="date" fontSize={9} tickLine={false} interval="preserveStartEnd" />
                        <YAxis fontSize={9} tickLine={false} width={52} />
                        <Tooltip
                          formatter={(value: any) => [
                            `₱${Number(value).toLocaleString()}`,
                            "Actual Revenue"
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10 }}
                          formatter={() => "Daily Actual Revenue (PHP)"}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#F53799"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorRevenue)"
                          dot={{ r: 2.5, fill: "#F53799" }}
                          activeDot={{ r: 5 }}
                          name="Daily Actual Revenue"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* NLG summary section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-[#223047] opacity-50 tracking-wider">
                    AI Business Intelligence Narrative (NLG)
                  </h3>
                  <div className="bg-[#FFF2FA]/30 border-2 border-[#FFD9EC] rounded-2xl p-5 space-y-4 text-xs leading-relaxed text-[#223047]">
                    {/* Use structured nlgSections if available, otherwise fall back to splitting nlgSummary */}
                    {(selectedReport.nlgSections ?? selectedReport.nlgSummary.split("\n\n").map((content, idx) => ({
                      title: ["Executive Performance Summary", "Trend Analysis & Forecasts", "Strategic Advisory & Recommendations"][idx] ?? `Section ${idx + 1}`,
                      content
                    }))).map((section: { title: string; content: string }, idx: number) => (
                      <div key={idx} className="space-y-1.5 p-3.5 bg-white border border-[#FFD9EC] rounded-xl shadow-sm">
                        <h4 className="font-extrabold text-xs text-[#223047]">
                          {section.title}
                        </h4>
                        <p className="opacity-80">{section.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Owner UAT Feedback & Approval Card */}
                <div className="border-t border-[#FFD9EC] pt-6 space-y-4">
                  <h3 className="text-xs font-black uppercase text-[#223047] opacity-50 tracking-wider">
                    Owner UAT Feedback & Approval
                  </h3>
                  
                  {selectedReport.uatFeedback?.ownerApproved ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                      <div className="space-y-1">
                        <h4 className="font-extrabold text-xs text-emerald-800 flex items-center gap-2">
                          Report Approved by Owner
                          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full uppercase font-bold">Verified</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-[10px] text-emerald-700 py-1 font-extrabold">
                          <div>Accuracy: {selectedReport.uatFeedback.accuracyRating}/5</div>
                          <div>Usefulness: {selectedReport.uatFeedback.usefulnessRating}/5</div>
                        </div>
                        {selectedReport.uatFeedback.feedbackText && (
                          <p className="text-xs text-emerald-950 italic opacity-85 mt-1">
                            &ldquo;{selectedReport.uatFeedback.feedbackText}&rdquo;
                          </p>
                        )}
                        <span className="text-[10px] text-emerald-600/70 block mt-1">
                          Reviewed on {new Date(selectedReport.uatFeedback.reviewedAt!).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-2xl p-5 space-y-4">
                      <p className="text-xs text-[#223047] opacity-80">
                        Please review the aggregated analytics and forecasts. As the business owner, submit your feedback to approve and lock this report.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[#223047] opacity-75">Report Accuracy (1-5)</label>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setAccuracyRating(val)}
                                className={`w-8 h-8 rounded-lg font-bold text-xs transition-all border ${
                                  accuracyRating === val
                                    ? "bg-[#F53799] border-[#F53799] text-white"
                                    : "bg-white border-[#FFD9EC] text-[#223047] hover:border-[#F53799]/50"
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[#223047] opacity-75">Strategic Usefulness (1-5)</label>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setUsefulnessRating(val)}
                                className={`w-8 h-8 rounded-lg font-bold text-xs transition-all border ${
                                  usefulnessRating === val
                                    ? "bg-[#06B6D4] border-[#06B6D4] text-white"
                                    : "bg-white border-[#FFD9EC] text-[#223047] hover:border-[#06B6D4]/50"
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[#223047] opacity-75">Owner Review Comments</label>
                        <textarea
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          className="w-full text-xs rounded-xl border border-[#FFD9EC] p-3 transition-colors focus:border-[#F53799] focus:outline-none min-h-[60px]"
                          placeholder="Provide any feedback on report accuracy or insights..."
                        />
                      </div>

                      <Button
                        onClick={handleSubmitFeedback}
                        disabled={isSubmittingFeedback}
                        className="bg-[#F53799] hover:bg-[#D42A7D] text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2"
                      >
                        {isSubmittingFeedback ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Approve & Submit UAT"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Blank state */
            <div className="bg-white border-2 border-dashed border-[#FFD9EC] rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-2 shadow-sm min-h-[500px]">
              <div className="space-y-1 max-w-sm">
                <div className="flex items-center justify-center gap-2">
                  <h3 className="text-base font-extrabold text-[#223047]">No Report Selected</h3>
                  <InfoTooltip label="Choose an existing report from the sidebar log, or input target parameters and generate a new intelligence report." />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal 1: Data Integration Warning (Partial Data) */}
      {showPartialDataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white border-2 border-[#FFD9EC] rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 space-y-4">
            <div>
              <h3 className="text-base font-black text-[#223047]">Data Integration Notice</h3>
            </div>
            <p className="text-xs text-[#223047] opacity-80 leading-relaxed">
              The generated report currently relies solely on POS data. Integration for PetHub, Shopee, and TikTok Shop channels is still pending. Projections and totals will reflect limited channel activity.
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => {
                  if (pendingReportToShow) {
                    setSelectedReport(pendingReportToShow);
                    setPendingReportToShow(null);
                  }
                  setShowPartialDataModal(false);
                }}
                className="flex-1 bg-[#F53799] hover:bg-[#D42A7D] text-white font-bold py-2 rounded-xl text-xs"
              >
                Proceed with Limited Data
              </Button>
              <Button
                onClick={() => {
                  setShowPartialDataModal(false);
                  toast.info("Manage Data Sources option selected. Please contact the administrator to connect API channels.");
                }}
                className="flex-1 bg-white border border-[#FFD9EC] hover:bg-slate-50 text-[#223047] font-bold py-2 rounded-xl text-xs"
              >
                Manage Data Sources
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: No Data Available (Empty State) */}
      {showNoDataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white border-2 border-[#FFD9EC] rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 space-y-4">
            <div>
              <h3 className="text-base font-black text-[#223047]">No Data Found</h3>
            </div>
            <p className="text-xs text-[#223047] opacity-80 leading-relaxed">
              No transaction or grooming logs match your selected criteria (Date Range / Target Sectors). Please adjust your parameters and try again.
            </p>
            <div className="pt-2">
              <Button
                onClick={() => setShowNoDataModal(false)}
                className="w-full bg-[#F53799] hover:bg-[#D42A7D] text-white font-bold py-2 rounded-xl text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Invalid Date Selection */}
      {showInvalidDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white border-2 border-[#FFD9EC] rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 space-y-4">
            <div>
              <h3 className="text-base font-black text-[#223047]">Invalid Date Selection</h3>
            </div>
            <p className="text-xs text-[#223047] opacity-80 leading-relaxed">
              The selected Start Date cannot be later than the End Date. Please verify your reporting period.
            </p>
            <div className="pt-2">
              <Button
                onClick={() => setShowInvalidDateModal(false)}
                className="w-full bg-[#F53799] hover:bg-[#D42A7D] text-white font-bold py-2 rounded-xl text-xs"
              >
                Fix Dates
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Date Range Exceeds 30-31 Days */}
      {showDateRangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white border-2 border-[#FFD9EC] rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-pink-100 text-[#F53799] px-2.5 py-1 rounded-full">
                Reporting Horizon Limit
              </span>
              <h3 className="text-base font-black text-[#223047] mt-2">
                Date Range Exceeds 30–31 Days
              </h3>
            </div>
            <p className="text-xs text-[#223047] opacity-80 leading-relaxed">
              The extrapolated trend forecast model is calibrated specifically for a 30–31 day window. Because calendar months vary (30 or 31 days), reports must be generated within this horizon to ensure statistical accuracy in trend regression.
            </p>
            <div className="bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-[#223047]">
                <span className="opacity-70">Current Selected Range:</span>
                <span className="font-bold text-[#F53799]">
                  {calculateDayDiff(startDate, endDate)} days ({startDate} to {endDate})
                </span>
              </div>
              <div className="flex justify-between text-[#223047]">
                <span className="opacity-70">Allowed Maximum:</span>
                <span className="font-bold text-emerald-600">30–31 days</span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => {
                  const d = new Date(endDate);
                  d.setDate(d.getDate() - 30);
                  const adjustedStart = d.toISOString().slice(0, 10);
                  setStartDate(adjustedStart);
                  setShowDateRangeModal(false);
                  toast.success(`Date range adjusted to 30 days (${adjustedStart} to ${endDate})`);
                }}
                className="flex-1 bg-[#F53799] hover:bg-[#D42A7D] text-white font-bold py-2 rounded-xl text-xs"
              >
                Auto-Adjust to 30 Days
              </Button>
              <Button
                onClick={() => setShowDateRangeModal(false)}
                className="flex-1 bg-white border border-[#FFD9EC] hover:bg-slate-50 text-[#223047] font-bold py-2 rounded-xl text-xs"
              >
                Adjust Manually
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Delete Confirmation Modal */}
      {reportToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white border-2 border-red-100 rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4 space-y-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
                Delete Confirmation
              </span>
              <h3 className="text-base font-black text-[#223047] mt-2">
                Delete Smart Report?
              </h3>
            </div>
            <p className="text-xs text-[#223047] opacity-80 leading-relaxed">
              Are you sure you want to delete <strong className="text-[#223047]">"{reportToDelete.title}"</strong>? This will permanently remove this generated report from your history log.
            </p>
            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-[#223047]">
                <span className="opacity-70">Date Range:</span>
                <span className="font-bold text-[#223047]">
                  {reportToDelete.dateRange.start} to {reportToDelete.dateRange.end}
                </span>
              </div>
              <div className="flex justify-between text-[#223047]">
                <span className="opacity-70">Generated:</span>
                <span className="font-semibold text-[#223047]">
                  {new Date(reportToDelete.generatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Yes, Delete Report"
                )}
              </Button>
              <Button
                type="button"
                onClick={() => setReportToDelete(null)}
                disabled={isDeleting}
                className="flex-1 bg-white border border-[#FFD9EC] hover:bg-slate-50 text-[#223047] font-bold py-2 rounded-xl text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <Toaster />
    </div>
  );
}
