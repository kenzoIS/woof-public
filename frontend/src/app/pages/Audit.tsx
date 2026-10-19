import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { InfoTooltip } from "../components/InfoTooltip";
import { getAuditLogs, getAuditSummary } from "../lib/api";

export type AuditEvent = {
  id: string;
  actor: "Owner" | "System" | string;
  actor_type?: "user" | "system" | "integration";
  target?: string;
  action: string;
  module: string;
  state_before?: string;
  state_after?: string;
  duration_ms?: number;
  created_at: string;
  status: "success" | "failed" | "pending";
  category: string;
  metadata?: Record<string, unknown>;
  isArchived?: boolean;
};

const formatDuration = (ms?: number) =>
  !Number.isFinite(ms) ? "N/A" : (ms || 0) < 1000 ? `${ms} ms` : `${((ms || 0) / 1000).toFixed(1)} s`;

const formatModuleName = (mod: string, target?: string) => {
  if (target && target.toLowerCase().includes("next quiet period")) {
    return "Cafe";
  }
  if (mod === "cafe" || mod === "happy_hour") return "Cafe";
  if (mod === "traffic_optimizer") return "Traffic Optimizer";
  if (mod === "alerts") return "Alerts & Notifications";
  if (mod === "prescriptions") return "Prescriptions";
  if (mod === "bundle_engine") return "Bundle Engine";
  if (mod === "smart_reports") return "Smart Reports";
  if (mod === "simulation") return "AI Simulation";
  if (mod === "data_ingestion" || mod === "csv" || mod === "pipeline") return "Data Ingestion";
  if (mod === "system_settings" || mod === "settings") return "System Settings";
  if (mod === "auth" || mod === "security") return "Auth & Security";
  return mod.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTarget = (target?: string) => {
  if (!target) return "System";
  return target.replace(/^Business Opportunity:\s*/i, "").trim() || "System";
};

const statusClass = (value: string) =>
  value === "failed"
    ? "bg-red-100 text-red-700 border-red-200"
    : value === "pending"
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-green-100 text-green-700 border-green-200";

/**
 * Accurately extracts the real failure reason recorded with an audit event.
 * Strictly avoids heuristic guessing or fabricated error explanations.
 */
const getFailureReason = (event: AuditEvent): string => {
  if (event.status === "success") return "Action completed successfully.";
  if (event.status === "pending") return "Action is queued and awaiting processing or approval.";

  const meta = event.metadata || {};
  const explicitReason =
    meta.error ||
    meta.reason ||
    meta.message ||
    meta.failureReason ||
    meta.errorDetails;

  if (typeof explicitReason === "string" && explicitReason.trim()) {
    return explicitReason.trim();
  }
  if (typeof explicitReason === "object" && explicitReason !== null) {
    return JSON.stringify(explicitReason);
  }
  if (
    event.state_after &&
    typeof event.state_after === "string" &&
    event.state_after.toLowerCase().includes("failed")
  ) {
    return event.state_after;
  }

  return "Action recorded as failed without an attached error message.";
};

/**
 * Plain, neutral, text-based Action/Event presentation matching WOOF dark navy typography.
 * Eliminates colorful badges and noisy bracketed labels.
 */
function ActionText({ action }: { action: string }) {
  const label = useMemo(() => {
    if (!action) return "System Event";
    if (action === "ALERT_TRIGGERED") return "Alert Triggered";
    if (action === "ALERT_ACKNOWLEDGED") return "Alert Acknowledged";
    if (action === "ALERT_RESOLVED") return "Alert Resolved";
    if (action === "OPPORTUNITY_DETECTED") return "Opportunity Detected";
    if (action === "OPPORTUNITY_ACTED") return "Opportunity Acted";
    if (action === "OPPORTUNITY_EXPIRED") return "Opportunity Expired";
    if (action === "AUDIT_LOGS_ARCHIVED_TO_S3") return "Audit Logs Archived to S3";
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }, [action]);

  return <span className="font-semibold text-xs text-[#223047]">{label}</span>;
}

/**
 * Structured Before/After Tracking View:
 * Parses JSON configurations, numbers, and states into a field-by-field diff comparison table.
 */
function StateDiffView({
  stateBefore,
  stateAfter,
}: {
  stateBefore?: string;
  stateAfter?: string;
}) {
  if (!stateBefore && !stateAfter) return null;

  let beforeObj: Record<string, unknown> | null = null;
  let afterObj: Record<string, unknown> | null = null;

  try {
    if (stateBefore?.trim().startsWith("{")) beforeObj = JSON.parse(stateBefore);
  } catch {}
  try {
    if (stateAfter?.trim().startsWith("{")) afterObj = JSON.parse(stateAfter);
  } catch {}

  if (beforeObj || afterObj) {
    const allKeys = Array.from(
      new Set([...Object.keys(beforeObj || {}), ...Object.keys(afterObj || {})]),
    );

    return (
      <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-3.5 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#223047]/50">
          Structured Parameter Changes (Before vs After)
        </div>
        <div className="border border-[#FFD9EC] rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FFF2FA] border-b border-[#FFD9EC] text-[10px] uppercase font-bold text-[#223047]">
              <tr>
                <th className="p-2">Field</th>
                <th className="p-2">Previous Value</th>
                <th className="p-2">New Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FFD9EC]/50 font-mono text-[11px]">
              {allKeys.map((key) => {
                const prevVal = beforeObj && beforeObj[key] !== undefined ? JSON.stringify(beforeObj[key]) : "—";
                const newVal = afterObj && afterObj[key] !== undefined ? JSON.stringify(afterObj[key]) : "—";
                const isChanged = prevVal !== newVal;
                return (
                  <tr key={key} className={isChanged ? "bg-amber-50/50" : ""}>
                    <td className="p-2 font-semibold text-[#223047]">{key}</td>
                    <td className="p-2 text-slate-500">{prevVal}</td>
                    <td
                      className={`p-2 font-semibold ${
                        isChanged ? "text-emerald-700" : "text-slate-700"
                      }`}
                    >
                      {newVal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-3.5 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#223047]/50">
        State Transition
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono">
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
            Previous State
          </span>
          <span className="text-slate-700 break-words">{stateBefore || "—"}</span>
        </div>
        <div className="p-2.5 rounded-lg border border-[#FFD9EC] bg-white font-mono">
          <span className="text-[10px] font-bold uppercase text-[#F53799] block mb-1">
            New State
          </span>
          <span className="text-emerald-700 font-semibold break-words">
            {stateAfter || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ──────────────────────────────────────────────────────────
function AuditDetailModal({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const failureReason = getFailureReason(event);
  const isFailed = event.status === "failed";
  const isPending = event.status === "pending";

  const statusColor = isFailed ? "text-red-700" : isPending ? "text-yellow-700" : "text-green-700";
  const statusBg = isFailed
    ? "bg-red-50 border-red-200"
    : isPending
      ? "bg-yellow-50 border-yellow-200"
      : "bg-green-50 border-green-200";

  const normalizedActor = event.actor === "Owner" ? "Owner" : "System";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#FFD9EC] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
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
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge className={`${statusClass(event.status)} border text-xs capitalize font-semibold`}>
                {event.status}
              </Badge>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#223047]/60">
                {event.category}
              </span>
            </div>
            <div className="mt-1">
              <ActionText action={event.action} />
            </div>
            <p className="text-xs text-[#223047]/60 mt-1">
              {formatModuleName(event.module, event.target)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 px-2.5 py-1 text-xs font-bold text-[#223047]/60 hover:text-[#F53799] border border-[#FFD9EC] hover:border-[#F53799] rounded-lg transition-colors"
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Status / Failure Banner */}
          <div className={`p-3.5 rounded-xl border ${statusBg}`}>
            <div className="text-xs leading-relaxed text-[#223047]/90">
              <span className={`font-bold ${statusColor}`}>
                {isFailed ? "Failure Explanation: " : isPending ? "Pending: " : "Status: "}
              </span>
              {failureReason}
            </div>
          </div>

          {/* Meta grid - Strictly Owner or System, no secondary initiators */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Actor Classification", value: normalizedActor },
              { label: "Target / Entity", value: formatTarget(event.target) },
              { label: "Module", value: formatModuleName(event.module, event.target) },
              { label: "Category", value: event.category },
              { label: "Duration", value: formatDuration(event.duration_ms) },
              { label: "Timestamp", value: new Date(event.created_at).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-[#FFD9EC] bg-[#FFF7FB] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#223047]/50 mb-1">
                  {label}
                </div>
                <div className="text-xs font-semibold text-[#223047] break-words">{value}</div>
              </div>
            ))}
          </div>

          {/* Structured Before/After Tracking */}
          <StateDiffView stateBefore={event.state_before} stateAfter={event.state_after} />

          {/* Event ID */}
          <div className="text-[10px] text-[#223047]/40 font-mono text-center pt-1">
            Event Record ID: {event.id}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export function Audit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    total: 0,
    pendingApprovals: 0,
    automatedTriggers: 0,
    systemBottlenecks: 0,
    averageDurationMs: 0,
  });

  // Server-side filter states
  const [search, setSearch] = useState("");
  const [scopeTab, setScopeTab] = useState<"all" | "alerts" | "automated" | "owner">("all");
  const [actorFilter, setActorFilter] = useState<"all" | "Owner" | "System">("all");
  const [module, setModule] = useState("all");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  // Synchronize Scope Tabs with Actor/Module Filters
  const handleScopeTabChange = (tab: "all" | "alerts" | "automated" | "owner") => {
    setScopeTab(tab);
    setPage(1);
    if (tab === "all") {
      setActorFilter("all");
      setModule("all");
    } else if (tab === "alerts") {
      setModule("alerts");
      setActorFilter("all");
    } else if (tab === "automated") {
      setActorFilter("System");
      setModule("all");
    } else if (tab === "owner") {
      setActorFilter("Owner");
      setModule("all");
    }
  };

  // Server-side paginated & filtered data loader
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        page,
        limit: 20,
        search: search.trim() || undefined,
        actor: actorFilter !== "all" ? actorFilter : undefined,
        module: module !== "all" ? module : undefined,
        status: status !== "all" ? status : undefined,
        category: category !== "all" ? category : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (res && Array.isArray(res.events)) {
        setEvents(res.events);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      } else if (Array.isArray(res)) {
        setEvents(res);
        setTotal(res.length);
        setTotalPages(Math.ceil(res.length / 20) || 1);
      }
    } catch (error) {
      console.error("Failed to load audit logs", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, actorFilter, module, status, category, startDate, endDate]);

  // Initial summary load
  useEffect(() => {
    getAuditSummary()
      .then((totals) => setSummary(totals as typeof summary))
      .catch((err) => console.error("Failed to load audit summary", err));
  }, []);

  // Trigger query on parameter change
  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const clearFilters = () => {
    setSearch("");
    setScopeTab("all");
    setActorFilter("all");
    setModule("all");
    setStatus("all");
    setCategory("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // Deduplicate noisy repetitive automated system evaluations while strictly preserving all Owner actions
  const displayEvents = useMemo(() => {
    const result: AuditEvent[] = [];
    const seenAutomated = new Map<string, number>();

    for (const ev of events) {
      if (ev.actor === "Owner") {
        result.push(ev);
        continue;
      }

      const key = `${ev.action}:${ev.module}:${ev.target || ""}:${ev.status}`;
      const evTime = new Date(ev.created_at).getTime();
      const lastTime = seenAutomated.get(key);

      // Suppress repeated identical automated triggers occurring within 30 minutes of a newer one
      if (lastTime !== undefined && Math.abs(lastTime - evTime) < 30 * 60 * 1000) {
        continue;
      }

      seenAutomated.set(key, evTime);
      result.push(ev);
    }

    return result;
  }, [events]);

  const exportFilteredCsv = () => {
    if (!displayEvents.length) return;
    const headers = [
      "Timestamp",
      "Actor",
      "Action",
      "Module",
      "Target",
      "Status",
      "State Before",
      "State After",
      "Duration (ms)",
      "Category",
    ];
    const rows = displayEvents.map((e) => [
      `"${new Date(e.created_at).toISOString()}"`,
      `"${(e.actor === "Owner" ? "Owner" : "System").replace(/"/g, '""')}"`,
      `"${(e.action || "").replace(/"/g, '""')}"`,
      `"${formatModuleName(e.module, e.target).replace(/"/g, '""')}"`,
      `"${formatTarget(e.target).replace(/"/g, '""')}"`,
      `"${e.status || ""}"`,
      `"${(e.state_before || "").replace(/"/g, '""')}"`,
      `"${(e.state_after || "").replace(/"/g, '""')}"`,
      `"${e.duration_ms ?? ""}"`,
      `"${e.category || ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `WOOF_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 3 Clean KPI Cards: Removed "Average Execution Time — 0 ms"
  const kpis = [
    { label: "Total Recorded Events", value: summary.total || total },
    { label: "Automated Triggers", value: summary.automatedTriggers },
    { label: "Alerts & Security Events", value: `${summary.systemBottlenecks} events` },
  ] as const;

  return (
    <div className="space-y-4 md:space-y-6 lg:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl lg:text-[36px] font-extrabold text-[#223047]">
            Audit &amp; Orchestration Logs
          </h1>
          <InfoTooltip label="Every operational event, alert evaluation, and owner action is immutably logged with actor, target, state delta, and execution metrics. Click any row for diagnostics." />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportFilteredCsv}
            className="px-3.5 py-1.5 rounded-xl border border-[#FFD9EC] bg-white text-xs font-bold text-[#223047] hover:bg-[#FFF7FB] hover:border-[#F53799] transition-colors"
          >
            Export Filtered CSV
          </button>
        </div>
      </div>

      {/* KPI Cards: Clean 3-Card Grid */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {kpis.map(({ label, value }) => (
            <div
              key={label}
              className="bg-[#FFF2FA] border border-[#FFD9EC] rounded-xl px-4 py-3.5 flex flex-col justify-between"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#223047]/60">
                {label}
              </div>
              <div className="text-xl md:text-2xl font-black text-[#223047] mt-1">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Tabs & Controls */}
      <div className="bg-white border border-[#FFD9EC] rounded-2xl md:rounded-3xl p-4 md:p-8 space-y-5">
        {/* Quick Scope Tabs - Wrapped cleanly without scrollbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#FFD9EC] pb-3">
          {[
            { id: "all", label: "All Logs" },
            { id: "alerts", label: "Alerts & Lifecycle" },
            { id: "automated", label: "Automated & AI" },
            { id: "owner", label: "Owner Operations" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleScopeTabChange(tab.id as typeof scopeTab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                scopeTab === tab.id
                  ? "bg-[#223047] text-white shadow-sm"
                  : "bg-[#FFF7FB] text-[#223047]/70 hover:text-[#223047] hover:bg-[#FFD9EC]/50"
              }`}
            >
              {tab.label}
            </button>
          ))}

          {(search ||
            actorFilter !== "all" ||
            module !== "all" ||
            status !== "all" ||
            category !== "all" ||
            startDate ||
            endDate ||
            scopeTab !== "all") && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs font-bold text-[#F53799] hover:underline whitespace-nowrap"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Filter Controls Toolbar: Dedicated widths ensure Status, Date Range, and all dropdowns never clip */}
        <div className="flex flex-col md:flex-row flex-wrap xl:flex-nowrap items-stretch md:items-center gap-2.5 w-full">
          {/* Keyword Search */}
          <div className="flex-1 min-w-[180px]">
            <Input
              className="border-[#FFD9EC] text-xs h-10 w-full bg-white text-[#223047] focus:ring-1 focus:ring-[#F53799]"
              placeholder="Search action, actor, target, or metadata..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Strict Actor Filter: Strictly Owner vs System */}
          <div className="w-full sm:w-[130px] shrink-0">
            <Select
              value={actorFilter}
              onValueChange={(val: "all" | "Owner" | "System") => {
                setActorFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="border-[#FFD9EC] text-xs h-10 w-full bg-white text-[#223047]">
                <SelectValue placeholder="Actor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actors</SelectItem>
                <SelectItem value="Owner">Owner</SelectItem>
                <SelectItem value="System">System</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Module Selector */}
          <div className="w-full sm:w-[155px] shrink-0">
            <Select
              value={module}
              onValueChange={(val) => {
                setModule(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="border-[#FFD9EC] text-xs h-10 w-full bg-white text-[#223047]">
                <SelectValue placeholder="Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                <SelectItem value="cafe">Cafe</SelectItem>
                <SelectItem value="traffic_optimizer">Traffic Optimizer</SelectItem>
                <SelectItem value="alerts">Alerts &amp; Notifications</SelectItem>
                <SelectItem value="prescriptions">Prescriptions</SelectItem>
                <SelectItem value="bundle_engine">Bundle Engine</SelectItem>
                <SelectItem value="smart_reports">Smart Reports</SelectItem>
                <SelectItem value="simulation">AI Simulation</SelectItem>
                <SelectItem value="csv">Data Ingestion</SelectItem>
                <SelectItem value="auth">Auth &amp; Security</SelectItem>
                <SelectItem value="settings">System Settings</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Selector - 130px fixed width prevents 'All Sta' truncation */}
          <div className="w-full sm:w-[130px] shrink-0">
            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="border-[#FFD9EC] text-xs h-10 w-full bg-white text-[#223047]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range Inputs: 135px width each ensures dd/mm/yyyy never clips */}
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <Input
              type="date"
              className="border-[#FFD9EC] text-xs h-10 px-2.5 w-full sm:w-[135px] bg-white text-[#223047] focus:ring-1 focus:ring-[#F53799]"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              title="Start Date"
            />
            <Input
              type="date"
              className="border-[#FFD9EC] text-xs h-10 px-2.5 w-full sm:w-[135px] bg-white text-[#223047] focus:ring-1 focus:ring-[#F53799]"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              title="End Date"
            />
          </div>
        </div>

        {/* Record count indicator (Include AWS toggle removed) */}
        <div className="flex items-center justify-between pt-1 text-xs text-[#223047]/70">
          <span className="font-semibold text-slate-500">
            {loading ? "Querying audit logs..." : `Showing ${displayEvents.length} of ${total} records`}
          </span>
        </div>

        {/* Table - Fixed 100% to container with zero horizontal scrollbar */}
        <div className="border border-[#FFD9EC] rounded-xl overflow-hidden w-full bg-white">
          <Table className="w-full table-fixed" containerClassName="overflow-hidden">
            <TableHeader>
              <TableRow className="bg-[#FFF7FB]">
                <TableHead className="w-[14%] px-3 font-bold text-xs text-[#223047] whitespace-nowrap">Timestamp</TableHead>
                <TableHead className="w-[8%] px-3 font-bold text-xs text-[#223047] whitespace-nowrap">Actor</TableHead>
                <TableHead className="w-[22%] px-3 font-bold text-xs text-[#223047] whitespace-nowrap">Action / Event</TableHead>
                <TableHead className="w-[12%] px-3 font-bold text-xs text-[#223047] whitespace-nowrap">Module</TableHead>
                <TableHead className="w-[16%] px-3 font-bold text-xs text-[#223047] whitespace-nowrap">Target</TableHead>
                <TableHead className="w-[11%] px-3 font-bold text-xs text-[#223047] whitespace-nowrap">State Transition</TableHead>
                <TableHead className="w-[10%] px-3 font-bold text-xs text-[#223047] whitespace-nowrap">Status</TableHead>
                <TableHead className="w-[7%] px-3 text-center text-xs font-bold text-[#223047] whitespace-nowrap">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-xs text-[#223047]/50">
                    {loading ? "Retrieving audit records..." : "No matching audit records found."}
                  </TableCell>
                </TableRow>
              ) : (
                displayEvents.map((event) => (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer hover:bg-[#FFF2FA] transition-colors"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <TableCell
                      className="w-[14%] px-3 py-3 text-xs text-[#223047]/80 font-mono truncate"
                      title={new Date(event.created_at).toLocaleString()}
                    >
                      {new Date(event.created_at).toLocaleDateString([], {
                        month: "2-digit",
                        day: "2-digit",
                        year: "2-digit",
                      })}{" "}
                      {new Date(event.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>

                    {/* Strict Actor Classification: Strictly Owner or System */}
                    <TableCell className="w-[8%] px-3 py-3 text-xs font-semibold text-[#223047] whitespace-nowrap">
                      {event.actor === "Owner" ? "Owner" : "System"}
                    </TableCell>

                    {/* Action / Event */}
                    <TableCell className="w-[22%] px-3 py-3 text-xs truncate" title={event.action}>
                      <ActionText action={event.action} />
                    </TableCell>

                    {/* Module */}
                    <TableCell
                      className="w-[12%] px-3 py-3 text-xs text-[#223047]/70 font-medium truncate"
                      title={formatModuleName(event.module, event.target)}
                    >
                      {formatModuleName(event.module, event.target)}
                    </TableCell>

                    {/* Target */}
                    <TableCell
                      className="w-[16%] px-3 py-3 text-xs text-[#223047]/70 font-mono truncate"
                      title={formatTarget(event.target)}
                    >
                      {formatTarget(event.target)}
                    </TableCell>

                    {/* State Transition */}
                    <TableCell className="w-[11%] px-3 py-3 text-xs truncate">
                      {event.state_before || event.state_after ? (
                        <div
                          className="flex items-center gap-1 font-mono text-[11px] truncate"
                          title={`${event.state_before || "—"} → ${event.state_after || "—"}`}
                        >
                          <span className="text-slate-500 truncate max-w-[55px]">
                            {event.state_before || "—"}
                          </span>
                          <span className="text-slate-400 shrink-0">→</span>
                          <span className="font-semibold text-slate-700 truncate max-w-[55px]">
                            {event.state_after || "—"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="w-[10%] px-3 py-3 whitespace-nowrap">
                      <Badge className={`${statusClass(event.status)} border text-[11px] px-2 py-0.5 capitalize font-semibold`}>
                        {event.status}
                      </Badge>
                    </TableCell>

                    {/* Details */}
                    <TableCell className="w-[7%] px-3 py-3 text-center whitespace-nowrap">
                      <span className="text-xs font-bold text-[#F53799] hover:underline">
                        View
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Server-Side Pagination Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-[#FFD9EC] text-xs text-[#223047]/70">
          <div>
            Showing {total === 0 ? 0 : (page - 1) * 20 + 1} to{" "}
            {Math.min(page * 20, total)} of {total} records
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-[#FFD9EC] bg-white font-semibold disabled:opacity-40 hover:bg-[#FFF7FB] transition-colors"
            >
              Previous
            </button>
            <span className="font-mono text-xs px-2 font-bold text-[#223047]">
              Page {page} of {Math.max(totalPages, 1)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg border border-[#FFD9EC] bg-white font-semibold disabled:opacity-40 hover:bg-[#FFF7FB] transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedEvent && (
        <AuditDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
