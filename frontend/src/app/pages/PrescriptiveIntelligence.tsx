import { useState, useEffect } from "react";
import { Lightbulb, Lock, Check, X } from "lucide-react";
import { getHomeOverview } from "../lib/api";
import { WoofInsight } from "../components/WoofInsight";

interface Suggestion {
  id: number;
  title: string;
  trigger: string;
  discount: string;
  expectedLift: string;
  confidence: string;
  reason: string;
  detailedExplanation: string;
}

function getConfidenceValue(confidence: string): number {
  return parseFloat(String(confidence || "0").replace("%", "")) || 0;
}

export function PrescriptiveIntelligence() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHomeOverview()
      .then((data: any) => {
        setSuggestions(data?.suggestions || []);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, []);

  const activeSuggestions = suggestions.filter(
    (s) => getConfidenceValue(s.confidence) >= 75,
  );
  const suppressedSuggestions = suggestions.filter(
    (s) => getConfidenceValue(s.confidence) < 75,
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Autonomous Executive Choices
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          AI-generated business recommendations with approval workflow
        </p>
      </div>

      {suggestions.length > 0 && (
        <WoofInsight
          feature="prescriptive_explanation"
          title="WOOF Insight"
          prompt="Explain the active and suppressed WOOF recommendations. For each important recommendation, describe the evidence, confidence, expected lift, and operational action. Clearly distinguish recommendations from observed facts."
          context={{
            activeSuggestions,
            suppressedSuggestions,
          }}
        />
      )}

      {/* Active Trigger Suggestions */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-slate-900">
              Active Trigger Suggestions
            </h2>
          </div>
          <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
            {loading ? "Loading…" : `${activeSuggestions.length} Pending`}
          </span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-5 border border-slate-200 rounded-xl animate-pulse"
              >
                <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
                <div className="h-3 bg-slate-200 rounded w-1/3 mb-4" />
                <div className="flex gap-2">
                  <div className="h-8 bg-slate-200 rounded w-24" />
                  <div className="h-8 bg-slate-200 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : activeSuggestions.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            No active suggestions at this time. Check back after uploading
            fresh transaction data.
          </p>
        ) : (
          <div className="space-y-4">
            {activeSuggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="p-5 border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 mb-1">
                      {suggestion.title}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                      <span>🕐 {suggestion.trigger}</span>
                      <span>💰 {suggestion.discount}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-lg font-bold text-green-600">
                      {suggestion.expectedLift}
                    </div>
                    <div className="text-xs text-slate-500">
                      {suggestion.confidence} confidence
                    </div>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-4">{suggestion.reason}</p>
                {suggestion.detailedExplanation && (
                  <p className="text-xs text-slate-400 mb-4 italic">
                    {suggestion.detailedExplanation}
                  </p>
                )}
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                  <button className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                    <X className="w-4 h-4" />
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suppressed Suggestions */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">
              Suppressed Recommendations
            </h2>
          </div>
          <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
            {loading ? "Loading…" : `${suppressedSuggestions.length} Suppressed`}
          </span>
        </div>

        {!loading && suppressedSuggestions.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">
            No suppressed recommendations.
          </p>
        )}

        <div className="space-y-3">
          {suppressedSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="p-4 bg-slate-50 border border-slate-200 rounded-xl opacity-75"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="font-medium text-sm text-slate-700">
                      {suggestion.title}
                    </span>
                  </div>
                  <span className="inline-block px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full mb-2">
                    Low Confidence ({suggestion.confidence})
                  </span>
                  <p className="text-xs text-slate-500">{suggestion.reason}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
