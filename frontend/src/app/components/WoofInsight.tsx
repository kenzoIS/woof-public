import { useEffect, useMemo, useState } from "react";
import { InsightText } from "./InsightText";
import { Sparkles } from "lucide-react";
import { generateLlmExplanation } from "../lib/api";

type ExplanationFeature =
  | "descriptive_explanation"
  | "predictive_explanation"
  | "prescriptive_explanation";

interface WoofInsightProps {
  feature: ExplanationFeature;
  title?: string;
  inline?: boolean;
  prompt: string;
  context: Record<string, unknown>;
}

export function WoofInsight({
  feature,
  title = "WOOF Insight",
  inline = false,
  prompt,
  context,
}: WoofInsightProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const contextKey = useMemo(() => JSON.stringify(context), [context]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setText("");

    generateLlmExplanation({
      feature,
      prompt: `${prompt} Write for a store manager in plain English. Start with one short summary sentence, then use 2–4 bullet points when there are several metrics, products, or comparisons. Each bullet should cover one point with its label, value, and unit together. Do not repeat the WOOF Insight title. Avoid dense numerical sentences and jargon. Distinguish observed facts from suggested actions; include a separate Suggested action paragraph only when the supplied context supports a recommendation. Keep the insight under 160 words.`,
      context,
    })
      .then((response: any) => {
        if (cancelled) return;
        if (response?.configured === false || response?.provider === "fallback") {
          setError("AI insight is currently unavailable. Please try again later.");
          return;
        }
        setText(String(response?.text || ""));
      }).catch(() => {
        if (cancelled) return;
        setError("AI insight is temporarily unavailable. Please try again shortly.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contextKey, feature, prompt]);

  const displayText = text || "No generated explanation is available for the current data yet.";

  const content = loading ? (
    <p role="status" className="animate-pulse text-sm text-[#4A5568]">Generating WOOF insight…</p>
  ) : (
    error ? <p role="status" className="text-sm text-amber-700">{error}</p>
      : <InsightText text={displayText} />
  );
  if (inline) return <div aria-live="polite">{content}</div>;

  return (
    <section className="woof-insight-band rounded-2xl border border-[#FFD9EC] bg-[#FFF7FB] p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#F53799]" />
        <h2 className="font-semibold text-[#223047]">{title}</h2>
        <span className="rounded-full bg-[#E6FAFF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#08768A]">
          GLM 5.3
        </span>
      </div>
      <div aria-live="polite">{content}</div>
    </section>
  );
}
