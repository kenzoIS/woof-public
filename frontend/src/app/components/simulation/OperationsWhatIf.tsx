import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  RefreshCw,
  FlaskConical,
  Settings2,
  History,
  Plus,
  Columns2,
  BarChart3,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { LiveOperations } from "./LiveOperations";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";
import { frameAt } from "./floorState";
import { presets, presetConfig, eventTemplates, addEvent } from "./scenarios";
import {
  loadSimulationInputs,
  loadSimulationHistory,
  reopenSimulation,
  runSimulation,
  injectSimulationEvent,
} from "../../lib/simulationApi";
import type { SimulationHistory } from "../../lib/simulationApi";
import type {
  SimConfig,
  SimInputs,
  SimRun,
  SimLog,
  SimResult,
} from "../../lib/simulationTypes";

const money = (n: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);
const number = (n: number) =>
  new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 }).format(n);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const inputClass =
  "w-full rounded-lg border border-[#FFD9EC] bg-white px-3 py-2 text-sm text-[#223047] focus:outline-none focus:ring-2 focus:ring-[#F53799]/30";
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  if (/^[123]\./.test(title))
    return (
      <details
        open={title.startsWith("1.")}
        className="rounded-xl border border-[#FFD9EC] bg-white p-4"
      >
        <summary className="cursor-pointer text-sm font-bold text-[#223047]">
          {title.replace(/^[123]\. /, "")}
        </summary>
        <div className="mt-4 space-y-4">{children}</div>
      </details>
    );
  return (
    <section className="rounded-2xl border border-[#FFD9EC] bg-white p-4 md:p-6 space-y-4">
      <h3 className="text-lg font-bold text-[#223047]">{title}</h3>
      {children}
    </section>
  );
}
function Numeric({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block space-y-1 text-xs font-medium text-slate-600">
      <span>{label}</span>
      <input
        type="number"
        className={inputClass}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) =>
          onChange(e.target.value === "" ? 0 : Number(e.target.value))
        }
      />
    </label>
  );
}
export function OperationsWhatIf() {
  const [source, setSource] = useState("historical"),
    [date, setDate] = useState(today),
    [startDate, setStartDate] = useState(""),
    [endDate, setEndDate] = useState("");
  const [inputs, setInputs] = useState<SimInputs | null>(null),
    [baseline, setBaseline] = useState<SimConfig | null>(null),
    [scenario, setScenario] = useState<SimConfig | null>(null);
  const [edit, setEdit] = useState<"baseline" | "whatIf">("whatIf"),
    [preset, setPreset] = useState("Normal Day"),
    [eventChoice, setEventChoice] = useState(0);
  const [run, setRun] = useState<SimRun | null>(null),
    [history, setHistory] = useState<SimulationHistory[]>([]),
    [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [speed, setSpeed] = useState("5"),
    [playing, setPlaying] = useState(false),
    [minute, setMinute] = useState(0),
    [animate, setAnimate] = useState(true);
  const [view, setView] = useState<"baseline" | "whatIf">("whatIf"),
    [selectedLog, setSelectedLog] = useState<SimLog | null>(null),
    [compareRun, setCompareRun] = useState<SimRun | null>(null),
    [historyBusy, setHistoryBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [injectOpen, setInjectOpen] = useState(false),
    [showResults, setShowResults] = useState(false),
    [split, setSplit] = useState(false);
  const [injectChoice, setInjectChoice] = useState(0),
    [injectDuration, setInjectDuration] = useState(60),
    [injectValue, setInjectValue] = useState(-1),
    [injectAudience, setInjectAudience] = useState("all");
  const resumeAfterInjection = useRef(false);
  const started = useRef(false);

  const config = edit === "baseline" ? baseline : scenario;
  const result = run?.[view];
  const metrics = useMemo(
    () => (result ? frameAt(result, minute).metrics : undefined),
    [result, minute],
  );
  const clock = (min: number) => {
    const value = Math.round(
      (result?.config.openHour ?? baseline?.openHour ?? 8) * 60 + min,
    );
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  };
  async function refreshHistory() {
    try {
      setHistory(await loadSimulationHistory());
      setHistoryError("");
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "Could not load saved runs.",
      );
    }
  }
  async function load() {
    setBusy(true);
    setError("");
    setPlaying(false);
    try {
      const data = await loadSimulationInputs(
        source,
        date,
        startDate || undefined,
        endDate || undefined,
      );
      setInputs(data);
      setBaseline(data.config);
      setScenario({
        ...structuredClone(data.config),
        name: "What-If scenario",
      });
      setPreset("Normal Day");
      setRun(null);
      setCompareRun(null);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void refreshHistory();
    void load();
  }, []);
  useEffect(() => {
    if (!playing || !result || speed === "Instant") return;
    let request = 0,
      lastPaint = performance.now();
    const tick = (now: number) => {
      if (now - lastPaint >= 32) {
        const delta = ((now - lastPaint) / 1000) * Number(speed);
        lastPaint = now;
        setMinute((value) => Math.min(result.config.minutes, value + delta));
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, result, speed]);
  useEffect(() => {
    if (result && minute >= result.config.minutes) {
      setPlaying(false);
      setShowResults(true);
    }
  }, [minute, result]);
  const change = (key: keyof SimConfig, value: unknown) => {
    const setter = edit === "baseline" ? setBaseline : setScenario;
    setter((previous) => (previous ? { ...previous, [key]: value } : previous));
    setDirty(true);
    if (["date", "minutes", "openHour", "seed"].includes(key)) {
      const other = edit === "baseline" ? setScenario : setBaseline;
      other((previous) =>
        previous
          ? {
              ...previous,
              [key]: value,
              ...(key === "minutes"
                ? {
                    arrivalWeights: Array.from(
                      { length: Math.ceil(Number(value) / 60) },
                      (_, i) => previous.arrivalWeights[i] ?? 1,
                    ),
                  }
                : {}),
            }
          : previous,
      );
      if (key === "minutes")
        setter((previous) =>
          previous
            ? {
                ...previous,
                arrivalWeights: Array.from(
                  { length: Math.ceil(Number(value) / 60) },
                  (_, i) => previous.arrivalWeights[i] ?? 1,
                ),
              }
            : previous,
        );
    }
  };
  async function execute() {
    if (!inputs || !baseline || !scenario) return;
    setBusy(true);
    setPlaying(false);
    setError("");
    try {
      const saved = await runSimulation(inputs, baseline, scenario);
      setRun(saved);
      setConfigureOpen(false);
      setShowResults(speed === "Instant");
      setCompareRun(null);
      setView("whatIf");
      setSelectedLog(null);
      setDirty(false);
      setMinute(speed === "Instant" ? scenario.minutes : 0);
      setPlaying(speed !== "Instant");
      void refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function openSaved(id: string, comparison = false) {
    setHistoryBusy(true);
    setError("");
    setPlaying(false);
    try {
      const saved = await reopenSimulation(id);
      setHistoryOpen(false);
      if (comparison) {
        setCompareRun(saved);
        setShowResults(true);
      } else {
        setRun(saved);
        setInputs(saved.inputs);
        setBaseline(saved.baseline.config);
        setScenario(saved.whatIf.config);
        setMinute(0);
        setShowResults(false);
        setSelectedLog(null);
        setCompareRun(null);
        setView("whatIf");
        setDirty(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reopen the run.");
    } finally {
      setHistoryBusy(false);
    }
  }
  function exportRun() {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `woof-simulation-${run._id || "run"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const comparison = run?.comparison.map((row) => {
    if (!compareRun) return row;
    const b = Number(
      compareRun.whatIf.metrics[
        row.key as keyof typeof compareRun.whatIf.metrics
      ],
    );
    const w = row.whatIf;
    return {
      ...row,
      baseline: b,
      difference: w - b,
      percent: b === 0 ? null : ((w - b) / b) * 100,
    };
  });
  const timeline = result?.timeline.filter((e) => e.minute <= minute) || [];

  const injectionTemplate = eventTemplates[injectChoice];
  const canInject =
    !!run?._id &&
    !busy &&
    view === "whatIf" &&
    minute < (result?.config.minutes ?? 0) &&
    run?.engineVersion === "2.0.0";
  function chooseInjection(index: number) {
    setInjectChoice(index);
    setInjectValue(eventTemplates[index].value);
    setInjectDuration(
      Math.min(
        eventTemplates[index].duration,
        Math.max(1, (result?.config.minutes ?? 600) - Math.ceil(minute)),
      ),
    );
    setInjectAudience(
      eventTemplates[index].label.includes("surge") ? "walkIn" : "all",
    );
  }
  function openInjection(label?: string) {
    resumeAfterInjection.current = playing;
    setPlaying(false);
    chooseInjection(
      label
        ? Math.max(
            0,
            eventTemplates.findIndex((e) => e.label === label),
          )
        : 0,
    );
    setInjectOpen(true);
  }
  async function inject() {
    if (!run?._id || !result) return;
    const at = Math.ceil(minute);
    setBusy(true);
    setError("");
    try {
      const event = {
        ...addEvent(
          injectionTemplate,
          result.config,
          result.config.events.length,
          at,
        ),
        start: at,
        duration: Math.min(injectDuration, result.config.minutes - at),
        value: injectValue,
        ...(injectionTemplate.effect === "demand"
          ? { audience: injectAudience as "all" | "walkIn" | "appointment" }
          : {}),
      };
      const saved = await injectSimulationEvent(run._id, at, event);
      setRun(saved);
      setScenario(saved.whatIf.config);
      setMinute(at);
      setDirty(false);
      setInjectOpen(false);
      setPlaying(resumeAfterInjection.current && speed !== "Instant");
      void refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not inject the event.");
    } finally {
      setBusy(false);
    }
  }
  const ended = !!result && minute >= result.config.minutes;
  const timeValue = Math.floor(
    (result?.config.openHour ?? scenario?.openHour ?? 8) * 60 + minute,
  );
  const displayTime = `${String(Math.floor(timeValue / 60) % 12 || 12).padStart(2, "0")}:${String(timeValue % 60).padStart(2, "0")} ${Math.floor(timeValue / 60) >= 12 ? "PM" : "AM"}`;
  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-[#FFD9EC] bg-white p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-[#D42A7D] uppercase">
            Happy Tails · Operations control
          </p>
          <h2 className="text-xl font-bold text-[#223047] mt-1">
            Pet Cafe What-If Simulator
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {run
              ? result?.config.name
              : inputs
                ? inputs.description
                : "Loading historical analytics…"}{" "}
            · {result?.config.date ?? scenario?.date ?? date}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[9px] tracking-widest text-slate-400">
              SIMULATION TIME
            </p>
            <p className="font-mono text-2xl font-bold text-[#223047]">
              {displayTime}
            </p>
            <p className="text-[10px] text-slate-400">
              {ended
                ? "Simulation ended"
                : playing
                  ? "Live operations"
                  : run
                    ? "Paused"
                    : "Ready to open"}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setPlaying(false);
              setConfigureOpen(true);
            }}
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Configure scenario
          </Button>
          <Button
            variant="outline"
            aria-label="Open saved simulation runs"
            onClick={() => {
              setPlaying(false);
              setHistoryOpen(true);
            }}
          >
            <History className="w-4 h-4" />
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || !scenario?.services.length}
            className="bg-[#F53799] hover:bg-[#D42A7D] text-white shadow-sm"
            onClick={() => void execute()}
          >
            <Play className="w-4 h-4 mr-2" />
            {busy
              ? "Calculating…"
              : run
                ? "Run new simulation"
                : "Start simulation"}
          </Button>
          {run && (
            <>
              <Button
                variant="outline"
                disabled={busy || speed === "Instant"}
                onClick={() => {
                  if (ended) {
                    setMinute(0);
                    setShowResults(false);
                  }
                  setPlaying(!playing);
                }}
              >
                {playing ? (
                  <Pause className="w-4 h-4 mr-1" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                {playing ? "Pause" : ended ? "Replay" : "Resume"}
              </Button>
              <Button
                variant="outline"
                aria-label="Reset playback"
                onClick={() => {
                  setPlaying(false);
                  setMinute(0);
                  setShowResults(false);
                }}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </>
          )}
          <div
            className="inline-flex rounded-lg border border-[#FFD9EC] bg-white p-1"
            aria-label="Playback speed"
          >
            {["0.5", "1", "2", "5", "10", "Instant"].map((value) => (
              <button
                key={value}
                onClick={() => {
                  setSpeed(value);
                  if (value === "Instant" && result) {
                    setPlaying(false);
                    setMinute(result.config.minutes);
                  }
                }}
                className={`text-xs px-2.5 py-1.5 rounded-md ${speed === value ? "bg-[#FFF0F7] text-[#D42A7D] font-bold" : "text-slate-500"}`}
              >
                {value === "Instant" ? "Instant" : `${value}×`}
              </button>
            ))}
          </div>
        </div>
        {run && (
          <div className="flex items-center gap-2">
            <select
              aria-label="Playback scenario"
              className={`${inputClass} w-auto py-1.5`}
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
            >
              <option value="whatIf">What-If</option>
              <option value="baseline">Baseline</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSplit(!split);
                setView("whatIf");
              }}
            >
              <Columns2 className="w-4 h-4 mr-1" />
              {split ? "Single floor" : "Compare floors"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPlaying(false);
                setShowResults(!showResults);
              }}
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Results
            </Button>
          </div>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"
        >
          {error}
        </div>
      )}
      {dirty && run && (
        <p className="text-xs rounded-lg bg-amber-50 text-amber-800 p-2">
          Configuration changed. The floor is showing the saved run; start a new
          simulation to apply those edits.
        </p>
      )}
      <LiveOperations
        result={result}
        baseline={run?.baseline}
        config={scenario}
        minute={minute}
        animate={animate}
        split={split}
        playing={playing}
        onInject={openInjection}
        canInject={canInject}
      />
      {result && (
        <div className="flex items-center gap-3 px-1">
          <span className="font-mono text-xs text-slate-400">{clock(0)}</span>
          <input
            aria-label="Simulation timeline position"
            type="range"
            min={0}
            max={result.config.minutes}
            step={0.1}
            value={minute}
            onChange={(e) => {
              setPlaying(false);
              setMinute(Number(e.target.value));
            }}
            className="w-full accent-[#F53799]"
          />
          <span className="font-mono text-xs text-slate-400">
            {clock(result.config.minutes)}
          </span>
          <label className="text-[10px] text-slate-500 shrink-0 flex gap-1 items-center">
            <input
              type="checkbox"
              checked={animate}
              onChange={(e) => setAnimate(e.target.checked)}
            />
            Motion
          </label>
        </div>
      )}
      {run && showResults && (
        <>
          {" "}
          <Panel title="Baseline vs What-If · results">
            <p className="text-sm text-slate-600">
              {compareRun
                ? `Reference saved run: ${compareRun.whatIf.config.name} (${compareRun.whatIf.config.date}). Different inputs may influence this comparison.`
                : "Matched baseline and What-If use the same random seed. Percentage changes are relative to baseline; “—” means the baseline was zero."}
            </p>
            {compareRun && (
              <Button variant="outline" onClick={() => setCompareRun(null)}>
                Use matched baseline
              </Button>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-[#FFF7FB]">
                    {[
                      "Metric",
                      compareRun ? "Saved reference" : "Baseline",
                      "What-If",
                      "Absolute change",
                      "Relative change",
                    ].map((h) => (
                      <th className="p-3 whitespace-nowrap" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison?.map((row) => (
                    <tr key={row.key} className="border-t border-[#FFD9EC]">
                      <td className="p-3">{row.label}</td>
                      <td className="p-3">
                        {row.unit === "PHP"
                          ? money(row.baseline)
                          : `${number(row.baseline)} ${row.unit}`}
                      </td>
                      <td className="p-3">
                        {row.unit === "PHP"
                          ? money(row.whatIf)
                          : `${number(row.whatIf)} ${row.unit}`}
                      </td>
                      <td className="p-3">
                        {row.difference > 0 ? "+" : ""}
                        {number(row.difference)}{" "}
                        {row.unit === "%" ? "percentage points" : row.unit}
                      </td>
                      <td className="p-3">
                        {row.percent === null
                          ? "—"
                          : `${row.percent > 0 ? "+" : ""}${number(row.percent)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-amber-50 p-4">
                <h4 className="font-semibold text-sm text-amber-900">
                  Detected bottlenecks
                </h4>
                <ul className="list-disc pl-5 space-y-2 text-sm mt-2 text-amber-900">
                  {(run.whatIf.bottlenecks.length
                    ? run.whatIf.bottlenecks
                    : [
                        "No configured bottleneck threshold was exceeded in this run.",
                      ]
                  ).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-[#FFF7FB] p-4">
                <h4 className="font-semibold text-sm text-[#223047]">
                  Recommendations from simulation reruns
                </h4>
                <ul className="list-disc pl-5 space-y-2 text-sm mt-2 text-slate-600">
                  {run.recommendations.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <Button variant="outline" onClick={exportRun}>
              <Download className="w-4 h-4 mr-2" />
              Export parameters, events and results
            </Button>
          </Panel>
        </>
      )}
      <Sheet open={configureOpen} onOpenChange={setConfigureOpen}>
        <SheetContent className="w-full sm:max-w-[760px] bg-[#FFF7FB] overflow-y-auto p-5">
          <SheetHeader className="p-0 pb-4">
            <SheetTitle>Configure scenario</SheetTitle>
            <SheetDescription>
              Set your inputs, resources and events. The simulation floor stays
              the main workspace.
            </SheetDescription>
          </SheetHeader>
          <fieldset disabled={busy} className="space-y-4">
            {" "}
            <Panel title="1. Select analytics inputs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-slate-600 space-y-1">
                  Data source
                  <select
                    className={inputClass}
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="historical">Historical average</option>
                    <option value="forecast">Traffic forecast</option>
                    <option value="custom">Custom scenario</option>
                  </select>
                </label>
                <label className="text-xs text-slate-600 space-y-1">
                  Simulation date
                  <input
                    type="date"
                    className={inputClass}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="text-xs text-slate-600 space-y-1">
                  History from (optional)
                  <input
                    type="date"
                    className={inputClass}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="text-xs text-slate-600 space-y-1">
                  History to (optional)
                  <input
                    type="date"
                    className={inputClass}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
                <Button
                  disabled={busy || !date}
                  className="self-end bg-[#F53799] hover:bg-[#D42A7D] text-white"
                  onClick={() => void load()}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`}
                  />
                  {busy ? "Processing…" : "Load inputs"}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Historical = recorded activity. Forecast = expected arrivals.
                Diagnostic findings come from simulated queues and resource
                usage. What-If results are conditional estimates, not measured
                business outcomes.
              </p>
              {inputs && (
                <details className="bg-[#FFF7FB] rounded-xl p-3 text-sm">
                  <summary className="font-semibold cursor-pointer">
                    Loaded: {inputs.description}
                  </summary>
                  <ul className="list-disc pl-5 space-y-1 mt-2 text-slate-600">
                    {[...inputs.provenance, ...inputs.warnings].map(
                      (item, i) => (
                        <li key={i}>{item}</li>
                      ),
                    )}
                  </ul>
                </details>
              )}
            </Panel>
            {error && (
              <div
                role="alert"
                className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl"
              >
                {error}
              </div>
            )}
            {config && baseline && scenario && (
              <>
                <Panel title="2. Configure baseline and What-If scenario">
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex gap-1 rounded-lg bg-[#FFF2FA] p-1">
                      {(["baseline", "whatIf"] as const).map((item) => (
                        <button
                          key={item}
                          onClick={() => setEdit(item)}
                          className={`rounded-md px-4 py-2 text-sm ${edit === item ? "bg-[#F53799] text-white" : "text-[#223047]"}`}
                        >
                          Edit {item === "baseline" ? "baseline" : "What-If"}
                        </button>
                      ))}
                    </div>
                    <label className="text-xs text-slate-600 flex-1 min-w-48">
                      What-If preset
                      <select
                        className={inputClass}
                        value={preset}
                        onChange={(e) => {
                          setPreset(e.target.value);
                          setScenario(presetConfig(e.target.value, baseline));
                          setEdit("whatIf");
                          setDirty(true);
                        }}
                      >
                        {presets.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setScenario({
                          ...structuredClone(baseline),
                          name: "What-If scenario",
                        });
                        setEdit("whatIf");
                        setDirty(true);
                      }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Copy baseline
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Editing{" "}
                    {edit === "baseline"
                      ? "baseline assumptions"
                      : "What-If overrides"}
                    . Date, operating window and seed stay matched between
                    scenarios. Presets are editable assumptions; they do not
                    change measured analytics.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(
                      [
                        ["customers", "Customer demand", 1500],
                        ["staff", "Service staff / groomers", 50],
                        ["stations", "Service stations", 50],
                        ["cafeStaff", "Cafe staff", 50],
                        ["cashiers", "Cashiers", 50],
                        ["walkInRate", "Walk-in rate (%)", 100],
                      ] as const
                    ).map(([key, label, max]) => (
                      <Numeric
                        key={key}
                        label={label}
                        value={config[key]}
                        max={max}
                        onChange={(v) => change(key, v)}
                      />
                    ))}
                  </div>
                  <details className="rounded-xl border border-[#FFD9EC] p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-600">
                      Advanced operating settings
                    </summary>
                    <div className="mt-3">
                      {" "}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <label className="col-span-2 block text-xs text-slate-600 space-y-1">
                          Scenario name
                          <input
                            className={inputClass}
                            maxLength={100}
                            value={config.name}
                            onChange={(e) => change("name", e.target.value)}
                          />
                        </label>
                        <label className="text-xs text-slate-600 space-y-1">
                          Simulation date
                          <input
                            type="date"
                            className={inputClass}
                            value={config.date}
                            onChange={(e) => change("date", e.target.value)}
                          />
                        </label>
                        <label className="text-xs text-slate-600 space-y-1">
                          Day label
                          <select
                            className={inputClass}
                            value={config.dayType}
                            onChange={(e) => change("dayType", e.target.value)}
                          >
                            {["Weekday", "Weekend", "Holiday", "Payday"].map(
                              (v) => (
                                <option key={v}>{v}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <Numeric
                          label="Opening hour (Manila)"
                          value={config.openHour}
                          onChange={(v) => change("openHour", v)}
                          max={23}
                        />
                        <Numeric
                          label="Operating minutes"
                          value={config.minutes}
                          onChange={(v) => change("minutes", v)}
                          min={30}
                          max={1440}
                        />
                        <Numeric
                          label="Customer visits"
                          value={config.customers}
                          onChange={(v) => change("customers", v)}
                          max={1500}
                        />
                        <Numeric
                          label="Service staff / groomers"
                          value={config.staff}
                          onChange={(v) => change("staff", v)}
                          max={50}
                        />
                        <Numeric
                          label="Service stations"
                          value={config.stations}
                          onChange={(v) => change("stations", v)}
                          max={50}
                        />
                        <Numeric
                          label="Cafe staff"
                          value={config.cafeStaff}
                          onChange={(v) => change("cafeStaff", v)}
                          max={50}
                        />
                        <Numeric
                          label="Cafe preparation slots"
                          value={config.cafeStations}
                          onChange={(v) => change("cafeStations", v)}
                          max={50}
                        />
                        <Numeric
                          label="Cashiers"
                          value={config.cashiers}
                          onChange={(v) => change("cashiers", v)}
                          max={50}
                        />
                        <Numeric
                          label="Checkout time (minutes)"
                          value={config.checkoutMinutes}
                          onChange={(v) => change("checkoutMinutes", v)}
                          min={1}
                          max={120}
                        />
                        <Numeric
                          label="Walk-in rate (%)"
                          value={config.walkInRate}
                          onChange={(v) => change("walkInRate", v)}
                          max={100}
                        />
                        <Numeric
                          label="Appointment cancellations (%)"
                          value={config.cancellationRate}
                          onChange={(v) => change("cancellationRate", v)}
                          max={100}
                        />
                        <Numeric
                          label="Appointment no-shows (%)"
                          value={config.noShowRate}
                          onChange={(v) => change("noShowRate", v)}
                          max={100}
                        />
                        <Numeric
                          label="Late arrivals (%)"
                          value={config.lateRate}
                          onChange={(v) => change("lateRate", v)}
                          max={100}
                        />
                        <Numeric
                          label="Late arrival delay (minutes)"
                          value={config.lateMinutes}
                          onChange={(v) => change("lateMinutes", v)}
                          max={240}
                        />
                        <Numeric
                          label="Queue patience (minutes)"
                          value={config.patience}
                          onChange={(v) => change("patience", v)}
                          min={1}
                          max={1440}
                        />
                        <Numeric
                          label="Wait alert threshold (minutes)"
                          value={config.waitThreshold}
                          onChange={(v) => change("waitThreshold", v)}
                          min={1}
                          max={1440}
                        />
                        <Numeric
                          label="Waiting area capacity"
                          value={config.waitingCapacity}
                          onChange={(v) => change("waitingCapacity", v)}
                          min={1}
                          max={1500}
                        />
                        <Numeric
                          label="Service resource stock (units)"
                          value={config.serviceInventory}
                          onChange={(v) => change("serviceInventory", v)}
                        />
                        <Numeric
                          label="Cafe ingredient stock (units)"
                          value={config.cafeInventory}
                          onChange={(v) => change("cafeInventory", v)}
                        />
                        <Numeric
                          label="Payment failure after retry (%)"
                          value={config.paymentFailureRate}
                          onChange={(v) => change("paymentFailureRate", v)}
                          max={100}
                        />
                        <Numeric
                          label="Reproducible seed"
                          value={config.seed}
                          onChange={(v) => change("seed", v)}
                          max={4294967295}
                        />
                      </div>
                    </div>
                  </details>
                  <p className="text-xs text-slate-500">
                    Appointment rate = {100 - config.walkInRate}%. Day label is
                    descriptive; use a date-specific forecast, arrival weights,
                    or demand event to change demand. Pet volume comes from pets
                    per selected service visit. Stock units represent a
                    configurable required-resource bundle; substitutions are not
                    assumed.
                  </p>
                  <details>
                    <summary className="text-sm font-semibold text-[#223047] cursor-pointer">
                      Service demand, prices, duration, pet volume and resource
                      requirements
                    </summary>
                    <div className="overflow-x-auto mt-3">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr>
                            {[
                              "Existing item",
                              "Sector",
                              "Demand weight",
                              "Minutes",
                              "Price (₱)",
                              "Stock units",
                              "Pets / visit",
                            ].map((h) => (
                              <th className="px-2 py-2" key={h}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {config.services.map((service, index) => (
                            <tr
                              className="border-t border-[#FFD9EC]"
                              key={service.id}
                            >
                              <td className="p-2 min-w-40">{service.name}</td>
                              <td className="p-2">{service.sector}</td>
                              {(
                                [
                                  "weight",
                                  "duration",
                                  "price",
                                  "inventoryUnits",
                                  "pets",
                                ] as const
                              ).map((key) => (
                                <td className="p-2" key={key}>
                                  <input
                                    aria-label={`${service.name} ${key}`}
                                    type="number"
                                    min={key === "duration" ? 1 : 0}
                                    step={key === "price" ? 0.01 : 1}
                                    className={`${inputClass} min-w-20`}
                                    value={service[key]}
                                    onChange={(e) =>
                                      change(
                                        "services",
                                        config.services.map((s, i) =>
                                          i === index
                                            ? {
                                                ...s,
                                                [key]: Number(e.target.value),
                                              }
                                            : s,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!config.services.length && (
                      <p className="text-sm text-amber-700">
                        No existing items found in this history window. Choose
                        another range and reload inputs.
                      </p>
                    )}
                  </details>
                  <details>
                    <summary className="text-sm font-semibold text-[#223047] cursor-pointer">
                      Hourly arrival weights
                    </summary>
                    <p className="text-xs text-slate-500 mt-2">
                      Weights are normalized across the operating window. These
                      control arrival concentration without changing the
                      configured visit total.
                    </p>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-3">
                      {config.arrivalWeights.map((weight, i) => (
                        <Numeric
                          key={i}
                          label={`${String(Math.floor(config.openHour + i)).padStart(2, "0")}:00 weight`}
                          value={weight}
                          onChange={(v) =>
                            change(
                              "arrivalWeights",
                              config.arrivalWeights.map((w, j) =>
                                j === i ? v : w,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                  </details>
                </Panel>
                <Panel title="3. Combine operational events">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      aria-label="Event template"
                      className={`${inputClass} flex-1 min-w-60`}
                      value={eventChoice}
                      onChange={(e) => setEventChoice(Number(e.target.value))}
                    >
                      {Array.from(
                        new Set(eventTemplates.map((e) => e.category)),
                      ).map((category) => (
                        <optgroup key={category} label={category}>
                          {eventTemplates.map((event, index) =>
                            event.category === category ? (
                              <option key={index} value={index}>
                                {event.label}
                              </option>
                            ) : null,
                          )}
                        </optgroup>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      disabled={config.events.length >= 40}
                      onClick={() =>
                        change("events", [
                          ...config.events,
                          addEvent(
                            eventTemplates[eventChoice],
                            config,
                            config.events.length,
                          ),
                        ])
                      }
                    >
                      Add event to{" "}
                      {edit === "baseline" ? "baseline" : "What-If"}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Events change actual resources, arrivals or processing
                    rates. Negative staff/station values reduce availability.
                    Demand and duration values are multipliers (1.5 = 50%
                    increase). Stock changes persist until a restocking event.
                    Temporary closures pause work; they do not restart services.
                    Pet events are operational assumptions, not medical models.
                  </p>
                  {config.events.map((event, index) => (
                    <div
                      key={event.id}
                      className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-[#FFF7FB] p-3 items-end"
                    >
                      <div className="col-span-2 text-sm font-semibold text-[#223047]">
                        {event.label}
                        <div className="text-xs font-normal text-slate-500">
                          {event.sector} · {event.effect}
                        </div>
                      </div>
                      {event.effect === "demand" && (
                        <label className="col-span-2 text-xs text-slate-600">
                          Affected arrivals
                          <select
                            className={inputClass}
                            value={event.audience || "all"}
                            onChange={(e) =>
                              change(
                                "events",
                                config.events.map((item, i) =>
                                  i === index
                                    ? { ...item, audience: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="all">All visits</option>
                            <option value="walkIn">Walk-ins only</option>
                            <option value="appointment">
                              Appointments only
                            </option>
                          </select>
                        </label>
                      )}
                      {(["start", "duration", "value"] as const).map((key) => (
                        <Numeric
                          key={key}
                          label={
                            key === "start"
                              ? "Start minute"
                              : key === "duration"
                                ? "Duration (minutes)"
                                : `Effect value (${event.effect})`
                          }
                          value={event[key]}
                          min={
                            key === "value"
                              ? -100000
                              : key === "duration"
                                ? 1
                                : 0
                          }
                          max={key === "value" ? 100000 : config.minutes}
                          step={key === "value" ? 0.1 : 1}
                          onChange={(v) =>
                            change(
                              "events",
                              config.events.map((e, i) =>
                                i === index ? { ...e, [key]: v } : e,
                              ),
                            )
                          }
                        />
                      ))}
                      <Button
                        variant="outline"
                        onClick={() =>
                          change(
                            "events",
                            config.events.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-4 items-center">
                    <label className="text-sm flex gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={config.randomEvents}
                        onChange={(e) =>
                          change("randomEvents", e.target.checked)
                        }
                      />
                      Random events mode
                    </label>
                    <div className="w-56">
                      <Numeric
                        label="Chance of an event each hour (%)"
                        value={config.randomEventRate}
                        max={100}
                        onChange={(v) => change("randomEventRate", v)}
                      />
                    </div>
                    <p className="text-xs text-slate-500 flex-1">
                      Seeded hourly trials choose a staff break, station
                      interruption, extra handling, payment delay, or demand
                      surge. Probabilities are configurable assumptions;
                      generated events are saved with the run.
                    </p>
                  </div>
                </Panel>
              </>
            )}
          </fieldset>
          <div className="sticky bottom-0 bg-white/95 border border-[#FFD9EC] rounded-xl p-3 flex justify-between items-center gap-3">
            <span className="text-xs text-slate-500">
              Changes apply when you start a new run.
            </span>
            <Button
              disabled={busy || !scenario?.services.length}
              onClick={() => void execute()}
              className="bg-[#F53799] hover:bg-[#D42A7D] text-white"
            >
              <Play className="w-4 h-4 mr-2" />
              Start simulation
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full sm:max-w-[700px] overflow-y-auto bg-[#FFF7FB] p-5">
          <SheetHeader className="p-0 pb-4">
            <SheetTitle>Simulation history</SheetTitle>
            <SheetDescription>
              Reopen a saved run to watch its operations or compare its results.
            </SheetDescription>
          </SheetHeader>{" "}
          <Panel title="Saved simulation runs">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Latest 50 runs saved to your account, including analytics
                inputs, seed, parameters, events and results.
              </p>
              <Button variant="outline" onClick={() => void refreshHistory()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
            {historyError && (
              <p role="status" className="text-sm text-amber-700">
                {historyError}
              </p>
            )}
            {!history.length && !historyError && (
              <p className="text-sm text-slate-500">No saved runs yet.</p>
            )}
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item._id}
                  className="rounded-xl border border-[#FFD9EC] p-3 flex flex-wrap justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {item.whatIf.config.name} · {item.whatIf.config.date}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(item.createdAt).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}{" "}
                      · {item.createdBy} · {item.whatIf.metrics.served} paid
                      visits · {money(item.whatIf.metrics.revenue)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={historyBusy || busy}
                      onClick={() => void openSaved(item._id)}
                    >
                      Reopen
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!run || historyBusy || busy}
                      onClick={() => void openSaved(item._id, true)}
                    >
                      Compare with current
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </SheetContent>
      </Sheet>
      <Sheet
        open={injectOpen}
        onOpenChange={(open) => {
          setInjectOpen(open);
          if (!open && !busy && resumeAfterInjection.current) setPlaying(true);
        }}
      >
        <SheetContent className="w-full sm:max-w-[480px] bg-white overflow-y-auto p-5">
          <SheetHeader className="p-0 pb-4">
            <SheetTitle>Inject event · {displayTime}</SheetTitle>
            <SheetDescription>
              The clock is paused. Apply an event now, then watch its
              operational effects.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <label className="text-xs text-slate-600 space-y-1 block">
              Operational event
              <select
                className={inputClass}
                value={injectChoice}
                onChange={(e) => chooseInjection(Number(e.target.value))}
              >
                {Array.from(new Set(eventTemplates.map((e) => e.category))).map(
                  (category) => (
                    <optgroup key={category} label={category}>
                      {eventTemplates.map((event, i) =>
                        event.category === category ? (
                          <option value={i} key={i}>
                            {event.label}
                          </option>
                        ) : null,
                      )}
                    </optgroup>
                  ),
                )}
              </select>
            </label>
            <div className="rounded-xl bg-[#FFF7FB] p-3 text-xs text-slate-600">
              <strong>{injectionTemplate.sector}</strong> ·{" "}
              {injectionTemplate.effect}
              <p className="mt-1">
                {["staff", "stations"].includes(injectionTemplate.effect)
                  ? "Negative values remove available resources; positive values add them."
                  : injectionTemplate.effect === "inventory"
                    ? "Subtract stock or replenish stock now. This stock change persists."
                    : ["demand", "duration", "checkout"].includes(
                          injectionTemplate.effect,
                        )
                      ? "Multiplier: 1.5 means 50% more demand or processing time."
                      : "Event probability or area closure applied from the current time."}
              </p>
            </div>
            <Numeric
              label="Duration (simulated minutes)"
              min={1}
              max={Math.max(
                1,
                (result?.config.minutes ?? 600) - Math.ceil(minute),
              )}
              value={injectDuration}
              onChange={setInjectDuration}
            />
            <Numeric
              label={
                ["staff", "stations", "inventory"].includes(
                  injectionTemplate.effect,
                )
                  ? "Resource change"
                  : ["demand", "duration", "checkout"].includes(
                        injectionTemplate.effect,
                      )
                    ? "Multiplier"
                    : "Effect value"
              }
              min={
                ["staff", "stations", "inventory"].includes(
                  injectionTemplate.effect,
                )
                  ? -100000
                  : 0
              }
              step={
                ["demand", "duration", "checkout"].includes(
                  injectionTemplate.effect,
                )
                  ? 0.1
                  : 1
              }
              value={injectValue}
              onChange={setInjectValue}
            />
            {injectionTemplate.effect === "demand" && (
              <label className="block text-xs text-slate-600">
                Affected arrivals
                <select
                  className={inputClass}
                  value={injectAudience}
                  onChange={(e) => setInjectAudience(e.target.value)}
                >
                  <option value="all">All arrivals</option>
                  <option value="walkIn">Walk-ins only</option>
                  <option value="appointment">Appointments only</option>
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-amber-700">
                {error}
              </p>
            )}
            <Button
              disabled={busy || !canInject}
              onClick={() => void inject()}
              className="w-full bg-[#F53799] hover:bg-[#D42A7D] text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              {busy ? "Applying event…" : "Apply event now"}
            </Button>
            <p className="text-[11px] text-slate-400">
              A new run revision is saved. The backend recalculates from this
              timestamp using the same seed; past operations stay intact.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
