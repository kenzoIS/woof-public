import { InsightText } from "../components/InsightText";
import { useState, useEffect } from "react";
import { MessageSquareHeart, TrendingUp, TrendingDown, ThumbsUp, ThumbsDown, RefreshCw, Sparkles, Box, ChevronRight, RotateCcw } from "lucide-react";
import { KpiDetailModal, KpiDetailData } from "../components/KpiDetailModal";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import feedbackMascot from "../../imports/no_bg_Insight.png";
import {
  FeedbackPromotion,
  FeedbackSummary,
  generateLlmExplanation,
  getFeedbackPromotions,
  getFeedbackSummary,
  submitFeedbackRating,
  triggerModelRecalibration,
} from "../lib/api";
import { InfoTooltip } from "../components/InfoTooltip";

export function Feedback() {
  const [promotions, setPromotions] = useState<FeedbackPromotion[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKpi, setSelectedKpi] = useState<KpiDetailData | null>(null);
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [endingPromptIds, setEndingPromptIds] = useState<string[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [insightText, setInsightText] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const PAGE_SIZE = 3;

  const loadData = async () => {
    try {
      setLoading(true);
      const [promosData, summaryData] = await Promise.all([
        getFeedbackPromotions(),
        getFeedbackSummary(),
      ]);
      setPromotions(promosData);
      setSummary(summaryData);
    } catch (err) {
      console.error("Failed to load feedback data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFeedback = async (id: string, helpful: boolean, endPromotion = false) => {
    const feedbackVal = helpful ? "helpful" : "not-helpful";
    setSubmittingId(id);

    // Optimistic UI update
    setPromotions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, feedback: feedbackVal, status: endPromotion ? "completed" : p.status } : p))
    );

    try {
      const res = await submitFeedbackRating({
        id,
        feedback: feedbackVal,
        endPromotion,
      });

      if (endPromotion && res.promotion?.status !== "completed") {
        throw new Error("The backend did not confirm completed promotion history storage.");
      }

      if (helpful) {
        toast.success("Feedback recorded in Supabase & AWS S3!", {
          description: "WOOF will weight this successful recommendation pattern higher.",
        });
      } else {
        toast.info("Feedback recorded: Auto-Recalibrating Models", {
          description: res.recalibrated
            ? "Analytical models and association weights are being recalibrated..."
            : "Recalibration signal sent to backend and archived to AWS S3.",
        });
      }

      if (endPromotion) {
        toast.success("Promotion ended and moved to Completed", {
          description: "Feedback was recorded and any linked PetHub campaign was processed by the backend.",
        });
      }

      await loadData();
      setEndingPromptIds((prev) => prev.filter((item) => item !== id));
    } catch (err) {
      console.error("Error submitting feedback:", err);
      await loadData();
      toast.error("Failed to sync feedback with server", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRecalibrate = async () => {
    setIsRecalibrating(true);
    const toastId = toast.loading("Starting system recalibration...", {
      description: "Recalibrating FP-Growth, Prophet regressors, and archiving run to AWS S3...",
    });

    try {
      const res = await triggerModelRecalibration({
        source: "user_feedback_center",
        reason: "Owner requested system recalibration from Feedback & Learning Center",
      });

      toast.dismiss(toastId);
      toast.success("System Recalibration Complete!", {
        description: `Retraining initiated at ${new Date(res?.timestamp).toLocaleTimeString()}. Run archived to AWS S3.`,
      });

      await loadData();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Recalibration failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRecalibrating(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "bundle":
        return "bg-[#F53799]";
      case "discount":
        return "bg-[#06B6D4]";
      case "happy-hour":
        return "bg-[#D42A7D]";
      case "flash-sale":
        return "bg-[#06B6D4]";
      default:
        return "bg-[#FFD9EC]";
    }
  };

  const getSectorColor = (sector: string) => {
    if (sector.includes("Cafe") && sector.includes("Services")) return "#F53799";
    if (sector.includes("Cafe")) return "#F53799";
    if (sector.includes("Services")) return "#06B6D4";
    if (sector.includes("Retail")) return "#D42A7D";
    return "#06B6D4";
  };

  const getPromotionSourceDescription = (promo: FeedbackPromotion) => {
    switch (promo.sourceType) {
      case "bundle_archive":
        return "Bundle Simulator promotion stored in bundle archives.";
      case "dynamic_promo":
        return "Dynamic Happy Hour or discount promo from the traffic and demand engine.";
      case "activation_campaign":
        return promo.pethubLinked
          ? "Published PetHub activation campaign currently linked for takedown."
          : "Activation campaign queued, approved, or published through the campaign layer.";
      case "active_prescription":
        return "Accepted prescription stored in the active prescription source of truth.";
      case "recommendation_feedback":
        return "Feedback history promotion manually stored for tracking.";
      default:
        return "Active promotion available for owner feedback and learning.";
    }
  };

  const completedPromotions = promotions.filter((p) => p.status === "completed");
  const activePromotions = promotions.filter((p) => p.status === "active");
  const activePageCount = Math.max(1, Math.ceil(activePromotions.length / PAGE_SIZE));
  const completedPageCount = Math.max(1, Math.ceil(completedPromotions.length / PAGE_SIZE));
  const pagedActivePromotions = activePromotions.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const pagedCompletedPromotions = completedPromotions.slice((completedPage - 1) * PAGE_SIZE, completedPage * PAGE_SIZE);
  const activeCount = summary?.activeCount ?? activePromotions.length;
  const completedCount = summary?.completedCount ?? completedPromotions.length;
  const helpfulCount = summary?.helpfulCount ?? promotions.filter((p) => p.feedback === "helpful").length;
  const notHelpfulCount = summary?.notHelpfulCount ?? promotions.filter((p) => p.feedback === "not-helpful").length;
  const pendingFeedback = summary?.pendingCount ?? promotions.filter((p) => p.feedback === null).length;
  const completedHelpfulCount = completedPromotions.filter((p) => p.feedback === "helpful").length;
  const completedNotHelpfulCount = completedPromotions.filter((p) => p.feedback === "not-helpful").length;
  const totalFeedbackSignals = helpfulCount + notHelpfulCount;
  const positiveRatio = summary?.positiveRatio ?? (totalFeedbackSignals > 0 ? Math.round((helpfulCount / totalFeedbackSignals) * 100) : 0);
  const avgAccuracy = summary?.avgAccuracy ?? positiveRatio;
  const feedbackAlignment = totalFeedbackSignals > 0 ? avgAccuracy : 0;
  const patternsLearned = totalFeedbackSignals;
  const nextDeploymentConfidence = totalFeedbackSignals > 0 ? Math.min(98, Math.round((avgAccuracy + positiveRatio) / 2)) : 0;
  const learningStatus = totalFeedbackSignals > 0 ? "Active Learning" : "Awaiting Signals";
  const fallbackInsight =
    summary?.aiInsight?.summary ||
    (completedPromotions.length > 0
      ? `${completedPromotions.length} completed campaigns analyzed. Feedback loop is tracking ${avgAccuracy.toFixed(1)}% helpful alignment across recorded feedback signals.`
      : "Your feedback helps WOOF learn and adapt to live business operations.");

  useEffect(() => {
    setActivePage((page) => Math.min(page, Math.max(1, Math.ceil(activePromotions.length / PAGE_SIZE))));
    setCompletedPage((page) => Math.min(page, Math.max(1, Math.ceil(completedPromotions.length / PAGE_SIZE))));
  }, [activePromotions.length, completedPromotions.length]);

  useEffect(() => {
    if (loading) return;

    let cancelled = false;
    setInsightLoading(true);
    generateLlmExplanation({
      feature: "recommendation_explanation",
      prompt:
        "Generate a concise WOOF Insight for the Feedback & Learning Center. Explain what the feedback signals mean for future recommendations. Use only the verified context.",
      context: {
        summary,
        activePromotions: activePromotions.slice(0, 5).map((promo) => ({
          title: promo.title,
          type: promo.type,
          sector: promo.sector,
          confidence: promo.confidence,
          sourceType: promo.sourceType,
          pethubLinked: promo.pethubLinked,
        })),
        completedPromotions: completedPromotions.slice(0, 5).map((promo) => ({
          title: promo.title,
          type: promo.type,
          sector: promo.sector,
          feedback: promo.feedback,
        })),
      },
    })
      .then((res) => {
        if (!cancelled) setInsightText(res?.text || fallbackInsight);
      })
      .catch(() => {
        if (!cancelled) setInsightText(fallbackInsight);
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, summary, promotions.length, helpfulCount, notHelpfulCount, pendingFeedback, avgAccuracy]);

  const renderPagination = (
    currentPage: number,
    pageCount: number,
    setPage: (page: number) => void,
    totalItems: number,
  ) => {
    if (totalItems <= PAGE_SIZE) return null;

    return (
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="feedback-pagination-button text-xs md:text-sm"
        >
          Previous
        </Button>
        <div className="feedback-page-indicator text-xs md:text-sm">
          Page {currentPage} of {pageCount}
        </div>
        <Button
          variant="outline"
          onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
          disabled={currentPage === pageCount}
          className="feedback-pagination-button text-xs md:text-sm"
        >
          Next
        </Button>
      </div>
    );
  };
  const renderFeedbackControls = (promo: FeedbackPromotion, options?: { endPromotion?: boolean }) => (
    <div className="pt-4 md:pt-6 border-t border-[#FFD9EC]">
      {promo.feedback === null ? (
        <div className="space-y-2 md:space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs md:text-sm font-semibold text-[#223047]">
              Was this recommendation helpful?
            </p>
            {options?.endPromotion && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEndingPromptIds((prev) => prev.filter((item) => item !== promo.id))}
                disabled={submittingId === promo.id}
                className="feedback-return-button w-fit gap-1.5 px-2.5 py-1 text-xs"
              >
                <RotateCcw className="w-3 h-3" />
                Return
              </Button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
            <Button
              onClick={() => handleFeedback(promo.id, true, Boolean(options?.endPromotion))}
              disabled={submittingId === promo.id}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2 text-xs md:text-sm"
            >
              <ThumbsUp className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Yes, Helpful</span>
              <span className="sm:hidden">Helpful</span>
            </Button>
            <Button
              onClick={() => handleFeedback(promo.id, false, Boolean(options?.endPromotion))}
              disabled={submittingId === promo.id}
              variant="outline"
              className="feedback-not-helpful-button flex-1 gap-2 text-xs md:text-sm"
            >
              <ThumbsDown className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">No, Not Helpful</span>
              <span className="sm:hidden">Not Helpful</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className={`p-3 md:p-4 rounded-lg md:rounded-xl ${
          promo.feedback === "helpful" ? "bg-green-100/90" : "bg-orange-100/90"
        }`}>
          <div className="flex items-center gap-2 md:gap-3">
            {promo.feedback === "helpful" ? (
              <>
                <ThumbsUp className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-xs md:text-sm font-semibold text-green-800">
                    Feedback Recorded: Helpful (Saved to Supabase & AWS S3)
                  </p>
                  <p className="text-xs text-green-700 hidden md:block">
                    WOOF is learning from this successful pattern.
                  </p>
                </div>
              </>
            ) : (
              <>
                <ThumbsDown className="w-4 h-4 md:w-5 md:h-5 text-orange-600 flex-shrink-0" />
                <div>
                  <p className="text-xs md:text-sm font-semibold text-orange-800">
                    Feedback Recorded: Not Helpful (Models Recalibrated & Archived)
                  </p>
                  <p className="text-xs text-orange-700 hidden md:block">
                    Association weights updated and stale forecast caches purged.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderActivePromotionAction = (promo: FeedbackPromotion) => {
    if (promo.feedback !== null || endingPromptIds.includes(promo.id)) {
      return renderFeedbackControls(promo, { endPromotion: true });
    }

    return (
      <div className="pt-4 md:pt-6 border-t border-[#FFD9EC]">
        <Button
          onClick={() => setEndingPromptIds((prev) => prev.includes(promo.id) ? prev : [...prev, promo.id])}
          disabled={submittingId === promo.id}
          className="feedback-end-promotion-button w-full gap-2 text-xs md:text-sm"
        >
          End Promotion
        </Button>
        {promo.pethubLinked && (
          <p className="feedback-page-indicator mt-2 text-xs">
            This promotion is linked to PetHub and will be processed for takedown when feedback is submitted.
          </p>
        )}
      </div>
    );
  };

  const renderCompletedFeedbackSummary = (promo: FeedbackPromotion) => {
    if (promo.feedback === "helpful") {
      return (
        <div className="pt-4 md:pt-6 border-t border-[#FFD9EC]">
          <div className="p-3 md:p-4 rounded-lg md:rounded-xl bg-green-100/90">
            <div className="flex items-center gap-2 md:gap-3">
              <ThumbsUp className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-xs md:text-sm font-semibold text-green-800">
                  Completed: Helpful
                </p>
                <p className="text-xs text-green-700 hidden md:block">
                  This promotion is stored as a positive feedback signal.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (promo.feedback === "not-helpful") {
      return (
        <div className="pt-4 md:pt-6 border-t border-[#FFD9EC]">
          <div className="p-3 md:p-4 rounded-lg md:rounded-xl bg-orange-100/90">
            <div className="flex items-center gap-2 md:gap-3">
              <ThumbsDown className="w-4 h-4 md:w-5 md:h-5 text-orange-600 flex-shrink-0" />
              <div>
                <p className="text-xs md:text-sm font-semibold text-orange-800">
                  Completed: Not Helpful
                </p>
                <p className="text-xs text-orange-700 hidden md:block">
                  This promotion is stored as a recalibration signal.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="pt-4 md:pt-6 border-t border-[#FFD9EC]">
        <div className="p-3 md:p-4 rounded-lg md:rounded-xl bg-[#FFF7FB] border border-[#FFD9EC]">
          <p className="text-xs md:text-sm font-semibold text-[#223047]">
            Completed: Feedback not recorded
          </p>
          <p className="text-xs text-[#223047] opacity-60 hidden md:block">
            Historical promotion is completed, but no Helpful/Not Helpful rating was stored for it yet.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 md:space-y-8 lg:space-y-12">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row items-start justify-between gap-4 md:gap-6">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl lg:text-[36px] font-extrabold text-[#223047]">
            Feedback & Learning Center
          </h1>
          <p className="text-sm md:text-base text-[#223047] opacity-60 mt-2" style={{ lineHeight: "1.6" }}>
            Review deployed promotions and provide feedback to improve WOOF's recommendations
          </p>
        </div>
        <Button
          onClick={handleRecalibrate}
          disabled={isRecalibrating}
          className="bg-[#F53799] hover:bg-[#D42A7D] gap-2 w-full md:w-auto text-white"
        >
          {isRecalibrating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Recalibrating...</span>
              <span className="sm:hidden">Recalibrating</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">Recalibrate System</span>
              <span className="sm:hidden">Recalibrate</span>
            </>
          )}
        </Button>
      </div>

      <KpiDetailModal kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />

      {/* SYSTEM PERFORMANCE OVERVIEW */}
      <div className="woof-kpi-row bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div
          className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
          onClick={() => setSelectedKpi({
            title: "Total Active Recommendations",
            current: activeCount,
            formatter: (v) => `${v} Active`,
            icon: <MessageSquareHeart className="w-5 h-5 text-[#F53799]" />,
            description: "Active prescriptions currently implemented and still awaiting end-of-cycle feedback.",
            extraStats: [
              { label: "Total Active", value: `${activeCount} active` },
              { label: "Completed Recommendations", value: `${completedCount} completed` },
            ],
          })}
        >
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
            <MessageSquareHeart className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
              <span>Total Active</span>
              <InfoTooltip label="Active prescriptions currently implemented and still awaiting end-of-cycle feedback." />
            </div>
            <div className="text-base md:text-xl font-bold text-[#223047]">{activeCount}</div>
            <div className="text-[11px] text-[#223047] opacity-60 hidden md:block">
              Awaiting end-of-cycle feedback
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
        </div>

        <div
          className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
          onClick={() => setSelectedKpi({
            title: "Total Completed Recommendations",
            current: completedCount,
            formatter: (v) => `${v} Completed`,
            icon: <ThumbsUp className="w-5 h-5 text-[#06B6D4]" />,
            description: "Completed promotions stored for historical tracking and feedback learning.",
            extraStats: [
              { label: "Helpful Completed", value: `${completedHelpfulCount} helpful` },
              { label: "Not Helpful Completed", value: `${completedNotHelpfulCount} not helpful` },
            ],
          })}
        >
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
            <ThumbsUp className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
              <span>Total Completed</span>
              <InfoTooltip label="Completed promotions stored for historical tracking and feedback learning." />
            </div>
            <div className="text-base md:text-xl font-bold text-[#223047]">{completedCount}</div>
            <div className="text-[11px] text-[#223047] opacity-60 hidden md:block">
              Stored historical promotions
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
        </div>

        <div
          className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
          onClick={() => setSelectedKpi({
            title: "Avg Feedback Accuracy",
            current: `${avgAccuracy.toFixed(1)}%`,
            formatter: (v) => String(v),
            icon: <TrendingUp className="w-5 h-5 text-[#F53799]" />,
            description: "Helpful alignment rate from completed promotion feedback signals.",
            extraStats: [
              { label: "Helpful Signals", value: `${helpfulCount} helpful` },
              { label: "Not Helpful Signals", value: `${notHelpfulCount} not helpful` },
              { label: "Completed Recommendations", value: `${completedCount} completed` },
            ],
          })}
        >
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#F53799] to-[#D42A7D] flex items-center justify-center flex-shrink-0">
            <ThumbsUp className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
              <span>Avg Accuracy</span>
              <InfoTooltip label="Helpful alignment rate from completed promotion feedback signals." />
            </div>
            <div className="text-base md:text-xl font-bold text-[#223047]">{avgAccuracy.toFixed(1)}%</div>
            <div className="text-[11px] text-[#223047] opacity-60 hidden md:block">
              Helpful feedback alignment
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
        </div>

        <div
          className="flex items-center gap-2 md:gap-3 bg-[#FFF2FA] border border-[#FFD9EC] rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-3 cursor-pointer hover:border-[#F53799] hover:shadow-sm transition-all group"
          onClick={() => setSelectedKpi({
            title: "Helpful Feedback",
            current: `${completedHelpfulCount}/${completedCount}`,
            formatter: (v) => String(v),
            icon: <RefreshCw className="w-5 h-5 text-[#06B6D4]" />,
            description: "Completed promotions marked Helpful compared with total completed promotions.",
            extraStats: [
              { label: "Helpful Completed", value: `${completedHelpfulCount} helpful` },
              { label: "Completed Recommendations", value: `${completedCount} completed` },
              { label: "Not Helpful Completed", value: `${completedNotHelpfulCount} not helpful` },
            ],
          })}
        >
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#06B6D4] flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-xs text-[#223047] opacity-80 truncate">
              <span>Helpful Feedback</span>
              <InfoTooltip label="Completed promotions marked Helpful compared with total completed promotions." />
            </div>
            <div className="text-base md:text-xl font-bold text-[#223047]">{completedHelpfulCount}/{completedCount}</div>
            <div className="text-[11px] text-[#223047] opacity-60 hidden md:block">
              Helpful out of completed
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[#223047]/20 group-hover:text-[#F53799] flex-shrink-0 transition-colors" />
        </div>
        </div>
      </div>

      {/* EMPTY STATE */}
      {!loading && promotions.length === 0 ? (
        <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-8 md:p-12 space-y-4 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-[#FFF7FB] rounded-full flex items-center justify-center border border-[#FFD9EC]">
              <Box className="w-8 h-8 text-[#F53799]" />
            </div>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-[#223047]">No active prescriptions deployed yet</h2>
          <p className="text-sm md:text-base text-[#223047] opacity-60 max-w-lg mx-auto" style={{ lineHeight: "1.6" }}>
            Deploy or accept a prescription to begin collecting Helpful and Not Helpful feedback signals for WOOF's recommendation loop.
          </p>
        </div>
      ) : (
        <>
          {/* ACTIVE PRESCRIPTIONS */}
      {activePromotions.length > 0 && (
        <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
                Active Recommendations
              </h2>
              <InfoTooltip label="Accepted or deployed prescriptions awaiting end-of-cycle feedback." />
            </div>
          </div>

          <div className="grid gap-3 md:gap-4">
            {pagedActivePromotions.map((promo) => (
              <div
                key={promo.id}
                className="p-4 md:p-6 bg-[#FFF7FB] border border-[#FFD9EC] rounded-xl md:rounded-2xl space-y-3 md:space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                      <Badge className={`${getTypeColor(promo.type)} text-white hover:${getTypeColor(promo.type)} text-xs`}>
                        {promo.type.replace("-", " ").toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="border-green-500 text-green-600 text-xs">
                        ● ACTIVE
                      </Badge>
                      {promo.pethubLinked && (
                        <Badge variant="outline" className="border-[#06B6D4] text-[#06B6D4] text-xs">
                          PetHub
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-[#223047] mb-2 md:mb-3">
                      {promo.title}
                    </h3>
                    <p className="mb-3 text-xs md:text-sm text-[#223047] opacity-70" style={{ lineHeight: "1.5" }}>
                      {getPromotionSourceDescription(promo)}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4 text-xs md:text-sm">
                      <div>
                        <span className="text-[#223047] opacity-60">Target Time:</span>
                        <span className="ml-2 font-semibold text-[#223047]">{promo.targetTime}</span>
                      </div>
                      <div>
                        <span className="text-[#223047] opacity-60">Discount:</span>
                        <span className="ml-2 font-semibold text-[#223047]">{promo.discount}</span>
                      </div>
                      <div>
                        <span className="text-[#223047] opacity-60">Confidence:</span>
                        <span className="ml-2 font-semibold text-[#223047]">{promo.confidence}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {renderActivePromotionAction(promo)}
              </div>
            ))}
          </div>
          {renderPagination(activePage, activePageCount, setActivePage, activePromotions.length)}
        </div>
      )}

      {/* COMPLETED PROMOTIONS - FEEDBACK SECTION */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg md:text-xl lg:text-[22px] font-bold text-[#223047]">
              Completed Recommendations
            </h2>
            <InfoTooltip label="Review performance and provide feedback to improve future recommendations." />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[#223047] opacity-70">
            Loading deployed promotions from database...
          </div>
        ) : (
          <div className="grid gap-4 md:gap-6">
            {completedPromotions.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#223047] opacity-70">
                No completed promotions yet.
              </div>
            ) : pagedCompletedPromotions.map((promo) => {
              const feedbackResult =
                promo.feedback === "helpful"
                  ? "Helpful"
                  : promo.feedback === "not-helpful"
                  ? "Not Helpful"
                  : "Not Rated";
              const completedOn = promo.deployedDate || "Date unavailable";
              const sourceLabel =
                promo.sourceType === "bundle_archive"
                  ? "Bundle"
                  : promo.sourceType === "dynamic_promo"
                  ? "Happy Hour"
                  : promo.sourceType === "activation_campaign"
                  ? "PetHub Campaign"
                  : promo.sourceType === "recommendation_feedback"
                  ? "Feedback Log"
                  : "Promotion";
              const learningAction =
                promo.feedback === "helpful"
                  ? "Reinforced"
                  : promo.feedback === "not-helpful"
                  ? "Recalibration Triggered"
                  : "Archived Only";
              const feedbackToneClass =
                promo.feedback === "helpful"
                  ? "text-green-700"
                  : promo.feedback === "not-helpful"
                  ? "text-orange-700"
                  : "text-[#223047]";

              return (
                <div
                  key={promo.id}
                  className={`p-4 md:p-6 lg:p-8 border-2 rounded-xl md:rounded-2xl space-y-4 md:space-y-6 transition-all ${
                    promo.feedback === "helpful"
                      ? "bg-green-50/70 border-green-300"
                      : promo.feedback === "not-helpful"
                      ? "bg-orange-50/70 border-orange-300"
                      : "bg-white border-[#FFD9EC]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2 md:mb-3">
                        <Badge className={`${getTypeColor(promo.type)} text-white hover:${getTypeColor(promo.type)} text-xs`}>
                          {promo.type.replace("-", " ").toUpperCase()}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: getSectorColor(promo.sector), color: getSectorColor(promo.sector) }}
                        >
                          {promo.sector}
                        </Badge>
                        <span className="text-xs text-[#223047] opacity-50">{promo.deployedDate}</span>
                        <Badge className="bg-orange-500 text-white border border-orange-400 hover:bg-orange-500 text-xs shadow-sm">
                          Completed
                        </Badge>
                      </div>

                      <h3 className="text-base md:text-lg lg:text-xl font-bold text-[#223047] mb-3 md:mb-4">
                        {promo.title}
                      </h3>
                      <p className="mb-4 text-xs md:text-sm text-[#223047] opacity-70" style={{ lineHeight: "1.5" }}>
                        {getPromotionSourceDescription(promo)}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6 mb-4 md:mb-6">
                        <div>
                          <div className="text-xs text-[#223047] opacity-60 mb-1">Target Time</div>
                          <div className="text-sm md:text-base font-semibold text-[#223047]">{promo.targetTime}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#223047] opacity-60 mb-1">Discount</div>
                          <div className="text-sm md:text-base font-semibold text-[#223047]">{promo.discount}</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#223047] opacity-60 mb-1">Confidence</div>
                          <div className="text-sm md:text-base font-semibold text-[#223047]">{promo.confidence}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 p-4 md:p-6 bg-[#FFF7FB] rounded-lg md:rounded-xl">
                        <div className="text-center">
                          <div className="text-xs text-[#223047] opacity-60 mb-1 md:mb-2">Feedback Result</div>
                          <div className={`text-base md:text-lg lg:text-xl font-bold ${feedbackToneClass}`}>{feedbackResult}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-[#223047] opacity-60 mb-1 md:mb-2">Completed On</div>
                          <div className="text-base md:text-lg lg:text-xl font-bold text-[#223047]">{completedOn}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-[#223047] opacity-60 mb-1 md:mb-2">Source</div>
                          <div className="text-base md:text-lg lg:text-xl font-bold text-[#F53799]">{sourceLabel}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-[#223047] opacity-60 mb-1 md:mb-2">Learning Action</div>
                          <div className={`text-base md:text-lg lg:text-xl font-bold ${feedbackToneClass}`}>{learningAction}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {renderCompletedFeedbackSummary(promo)}
                </div>
              );
            })}
          </div>
        )}
        {!loading && renderPagination(completedPage, completedPageCount, setCompletedPage, completedPromotions.length)}
      </div>

      {/* VISUAL RELIEF DIVIDER - GLM INSIGHT WITH MASCOT */}
      <div
        className="woof-insight-band rounded-2xl flex items-center justify-between px-4 md:px-6 lg:px-8 py-4 relative overflow-hidden"
        style={{ background: "linear-gradient(to right, #FFF7FB, #FFF2FA)" }}
      >
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-[#FFD9EC] text-[#F53799] bg-white">
              WOOF Insight
            </Badge>
            {insightLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F53799]" />}
          </div>
          <InsightText text={insightText || fallbackInsight} />
        </div>
        <img
          src={feedbackMascot.src}
          alt="Feedback Mascot"
          className="woof-mascot-motion w-24 h-24 md:w-32 md:h-32 object-contain flex-shrink-0 ml-4 md:ml-6"
        />
      </div>
      </>
      )}

      {/* LEARNING INSIGHTS */}
      <div className="feedback-learning-insights rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg md:text-xl lg:text-[22px] font-bold">Continuous Learning Insights</h2>
            <p className="text-xs md:text-sm opacity-80 mt-1" style={{ lineHeight: "1.6" }}>
              How owner feedback continuously refines WOOF algorithms
            </p>
          </div>
          <Sparkles className="w-6 h-6 md:w-8 md:h-8 opacity-80 flex-shrink-0" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
          <div className="feedback-learning-metric rounded-lg md:rounded-xl p-4 md:p-6">
            <div className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">{feedbackAlignment.toFixed(1)}%</div>
            <div className="text-xs md:text-sm opacity-90">Helpful alignment from feedback</div>
          </div>
          <div className="feedback-learning-metric rounded-lg md:rounded-xl p-4 md:p-6">
            <div className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">{patternsLearned}</div>
            <div className="text-xs md:text-sm opacity-90">Patterns learned this cycle</div>
          </div>
          <div className="feedback-learning-metric rounded-lg md:rounded-xl p-4 md:p-6">
            <div className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">{nextDeploymentConfidence}%</div>
            <div className="text-xs md:text-sm opacity-90">Confidence in next deployment</div>
          </div>
        </div>

        <p className="text-xs md:text-sm opacity-90" style={{ lineHeight: "1.7" }}>
          {summary?.aiInsight?.summary || `${totalFeedbackSignals} submitted feedback signal${totalFeedbackSignals === 1 ? "" : "s"} are currently informing WOOF's recommendation weighting, with ${notHelpfulCount} recalibration trigger${notHelpfulCount === 1 ? "" : "s"} recorded for future promotion suggestions.`}
        </p>
      </div>
    </div>
  );
}
