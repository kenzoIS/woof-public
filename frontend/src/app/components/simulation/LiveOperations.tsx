import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Coins,
  PawPrint,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import { OperationsLayout } from "./OperationsLayout";
import { eventTemplates } from "./scenarios";
import { currentFloor, frameAt } from "./floorState";
import { Button } from "../ui/button";
import type { SimConfig, SimResult } from "../../lib/simulationTypes";
const num = (n: number) =>
  new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 }).format(n);
const money = (n: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(n);
export function LiveOperations({
  result,
  baseline,
  config,
  minute,
  animate,
  split,
  onInject,
  canInject,
  playing,
}: {
  result?: SimResult;
  baseline?: SimResult;
  config?: SimConfig | null;
  minute: number;
  animate: boolean;
  split: boolean;
  onInject: (template?: string) => void;
  canInject: boolean;
  playing: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [logIndex, setLogIndex] = useState<number | null>(null);
  const floor = useMemo(
    () => (result ? currentFloor(result, minute) : null),
    [result, minute],
  );
  const m = floor?.frame.metrics;
  const previous = result
    ? frameAt(result, Math.max(0, minute - 5)).metrics
    : undefined;
  const logs =
    result?.timeline
      .filter((e) => e.minute <= minute)
      .slice(-60)
      .reverse() ?? [];
  const selectedVisit = result?.customers.find((p) => p.id === selected);
  const visitState = floor?.visits.find((v) => v.customer.id === selected);
  const clock = (min: number) => {
    const value = Math.floor(
      (result?.config.openHour ?? config?.openHour ?? 8) * 60 + min,
    );
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  };
  const kpis = [
    {
      label: "Customers arrived",
      value: m ? `${m.arrived} / ${m.demand}` : "—",
      icon: Users,
    },
    {
      label: "In waiting queue",
      value: m ? `${floor?.queue.length} visits` : "—",
      icon: PawPrint,
      delta: m && previous ? floor!.queue.length - previous.waiting : 0,
      lower: true,
    },
    {
      label: "Average service wait",
      value: m ? `${num(m.avgWait)} min` : "—",
      icon: Clock3,
      delta: m && previous ? m.avgWait - previous.avgWait : 0,
      lower: true,
    },
    {
      label: "Revenue collected",
      value: m ? money(m.revenue) : "—",
      icon: Coins,
      delta: m && previous ? m.revenue - previous.revenue : 0,
      lower: false,
    },
    {
      label: "Groomers / service staff",
      value: floor
        ? `${floor.frame.serviceStaff} / ${result!.config.staff}`
        : `${config?.staff ?? "—"} configured`,
      icon: Users,
    },
    {
      label: "Stations available",
      value: floor
        ? `${floor.frame.stations} / ${result!.config.stations}`
        : `${config?.stations ?? "—"} configured`,
      icon: Activity,
    },
    {
      label: "Staff utilization",
      value: m ? `${num(m.staffUtilization)}%` : "—",
      icon: Activity,
    },
    {
      label: "Paid / lost visits",
      value: m ? `${m.served} / ${m.unserved}` : "—",
      icon: CheckCircle2,
    },
    {
      label: "Satisfaction proxy",
      value: m ? `${num(m.satisfaction)} / 100` : "—",
      icon: PawPrint,
    },
    {
      label: "Checkout queue",
      value: m
        ? `${floor!.visits.filter((v) => v.state === "checkout").length} visits`
        : "—",
      icon: Coins,
    },
  ];
  return (
    <div
      className={`grid gap-4 ${split ? "xl:grid-cols-[minmax(0,1fr)_300px]" : "xl:grid-cols-[minmax(0,1fr)_300px]"}`}
    >
      <div className="min-w-0 space-y-3">
        {split && baseline ? (
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>BASELINE</span>
                <span>
                  {baseline.config.staff} service staff · queue{" "}
                  {currentFloor(baseline, minute).queue.length}
                </span>
              </div>
              <OperationsLayout
                result={baseline}
                minute={minute}
                animate={animate}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#D42A7D]">
                <span>WHAT-IF</span>
                <span>
                  {floor?.frame.serviceStaff} service staff · queue{" "}
                  {floor?.queue.length}
                </span>
              </div>
              <OperationsLayout
                result={result}
                config={config}
                minute={minute}
                animate={animate}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          </div>
        ) : (
          <OperationsLayout
            result={result}
            config={config}
            minute={minute}
            animate={animate}
            selected={selected}
            onSelect={setSelected}
          />
        )}
        {selectedVisit && (
          <div className="rounded-xl border border-[#FFD9EC] bg-white px-4 py-3 flex flex-wrap justify-between gap-2 text-xs">
            <div>
              <strong className="text-[#D42A7D]">
                Visit #{selectedVisit.id}
              </strong>{" "}
              ·{" "}
              {
                result?.config.services.find(
                  (s) => s.id === selectedVisit.serviceId,
                )?.name
              }
              <p className="text-slate-500 mt-1">
                {selectedVisit.walkIn ? "Walk-in" : "Appointment"} ·{" "}
                {selectedVisit.pets} pet(s) · arrived{" "}
                {clock(selectedVisit.arrival)} · {visitState?.state}
              </p>
            </div>
            <div className="text-right text-slate-600">
              {visitState?.progress.percent !== null &&
              visitState?.progress.percent !== undefined ? (
                <>
                  <strong>
                    {Math.floor(visitState.progress.percent)}% complete
                  </strong>
                  <p>
                    {Math.ceil(visitState.progress.remaining ?? 0)} work minutes
                    remaining ·{" "}
                    {visitState.progress.working ? "processing" : "paused"}
                  </p>
                </>
              ) : (
                (selectedVisit.reason ??
                "Select a service in progress to inspect its work state.")
              )}
            </div>
            <button
              aria-label="Close visit inspector"
              onClick={() => setSelected(null)}
              className="text-slate-400"
            >
              ✕
            </button>
          </div>
        )}
        <section className="rounded-2xl border border-[#FFD9EC] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#FFF0F7] px-4 py-3">
            <h3 className="text-sm font-bold text-[#223047] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#F53799]" />
              Live event timeline
            </h3>
            <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${playing ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`}
              />
              {playing ? "Updating live" : "Paused / ready"}
            </span>
          </div>
          <div
            className="h-44 overflow-y-auto px-3 py-2 space-y-1"
            aria-live="off"
          >
            {logs.map((log, index) => (
              <div
                key={`${log.minute}-${log.customerId}-${log.label}-${index}`}
              >
                <button
                  onClick={() => setLogIndex(logIndex === index ? null : index)}
                  className="flex items-start gap-3 w-full text-left text-xs rounded-lg px-2 py-2 hover:bg-[#FFF7FB]"
                >
                  <span className="font-mono text-[#B42C6C] shrink-0">
                    {clock(log.minute)}
                  </span>
                  <span
                    className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${/unavailable|shortage|failed|threshold|abandon|closure/i.test(log.label) ? "bg-amber-500" : "bg-[#F53799]"}`}
                  />
                  <span className="text-slate-600">{log.label}</span>
                </button>
                {logIndex === index && (
                  <p className="ml-16 text-[11px] p-2 rounded-lg bg-[#FFF7FB] text-slate-600">
                    {log.impact}
                  </p>
                )}
              </div>
            ))}
            {!logs.length && (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">
                Customer arrivals, service changes and events appear here as the
                clock advances.
              </div>
            )}
          </div>
        </section>
      </div>
      <aside className="space-y-3 min-w-0">
        <section className="rounded-2xl border border-[#FFD9EC] bg-white p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-[#223047]">Live analytics</h3>
            <span className="text-[10px] text-slate-400">
              {m ? `State ${clock(floor!.frame.minute)}` : "Awaiting run"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="rounded-xl bg-[#FFF7FB] px-3 py-2.5"
              >
                <div className="flex gap-1 items-center text-[10px] text-slate-500">
                  <k.icon className="w-3 h-3 shrink-0" />
                  {k.label}
                </div>
                <div className="font-bold text-sm text-[#223047] mt-1 flex items-center gap-1">
                  {k.value}
                  {!!k.delta && (
                    <span
                      className={
                        k.delta < 0 === k.lower
                          ? "text-emerald-500"
                          : "text-amber-500"
                      }
                      title="Change in the last five simulated minutes"
                    >
                      {k.delta > 0 ? (
                        <ArrowUp className="w-3 h-3" />
                      ) : (
                        <ArrowDown className="w-3 h-3" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section
          className={`rounded-2xl border p-4 ${floor?.problems.length ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50/60"}`}
        >
          <h3 className="text-sm font-bold text-[#223047] flex items-center gap-2">
            {floor?.problems.length ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            Current bottleneck
          </h3>
          {floor?.problems.length ? (
            floor.problems.slice(0, 3).map((problem) => (
              <div key={problem.title} className="mt-3">
                <strong
                  className={`text-xs ${problem.tone === "danger" ? "text-red-700" : "text-amber-800"}`}
                >
                  {problem.title}
                </strong>
                <p className="text-xs text-slate-600 mt-1">{problem.detail}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {problem.cause}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 mt-2">
              {result
                ? "No active queue bottleneck at this moment."
                : "Start the simulation to observe demand and capacity."}
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-[#FFD9EC] bg-white p-4">
          <h3 className="text-sm font-bold text-[#223047] mb-2">
            Test a change now
          </h3>
          <p className="text-xs text-slate-500 mb-3">
            Introduce a disruption or add resources at the current simulation
            time.
          </p>
          <Button
            disabled={!canInject}
            onClick={() => onInject()}
            className="w-full bg-[#F53799] hover:bg-[#D42A7D] text-white"
          >
            <Plus className="w-4 h-4 mr-1" />
            Inject event
          </Button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {[
              ["Staff absent", "Groomer / service staff absent"],
              ["Walk-in surge", "Peak-hour customer surge"],
              ["Equipment fault", "Service station / equipment unavailable"],
              ["Add staff", "Additional service staff / overtime"],
            ].map(([label, template]) => (
              <button
                key={label}
                disabled={!canInject}
                onClick={() => onInject(template)}
                className="text-[11px] rounded-lg border border-[#FFD9EC] px-2 py-2 text-slate-600 hover:bg-[#FFF7FB] disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-[#FFD9EC] pt-3">
            <h4 className="text-xs font-semibold text-[#223047] mb-2">
              All injectable events ({eventTemplates.length})
            </h4>
            {!canInject && (
              <p className="text-[11px] text-slate-500 mb-2">
                Run a What-If simulation to enable event injection.
              </p>
            )}
            <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
              {Array.from(new Set(eventTemplates.map((event) => event.category))).map((category) => (
                <div key={category}>
                  <h5 className="text-[10px] font-semibold text-slate-500 mb-1">
                    {category}
                  </h5>
                  <div className="space-y-1">
                    {eventTemplates.filter((event) => event.category === category).map((event) => (
                      <button
                        key={event.label}
                        disabled={!canInject}
                        onClick={() => onInject(event.label)}
                        className="w-full text-left text-[11px] rounded-lg border border-[#FFD9EC] px-2 py-2 text-slate-600 hover:bg-[#FFF7FB] disabled:opacity-40"
                      >
                        {event.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <p className="text-[10px] text-slate-400 px-1">
          The engine determines operations; the floor visualizes its state.
          Satisfaction is a queue-based estimate. Click an avatar to inspect its
          service.
        </p>
      </aside>
    </div>
  );
}
