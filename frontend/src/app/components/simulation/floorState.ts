import type {
  SimCustomer,
  SimResult,
  SimConfig,
  SimFrame,
} from "../../lib/simulationTypes";
export type VisitState =
  | "scheduled"
  | "reception"
  | "waiting"
  | "service"
  | "cafe"
  | "checkout"
  | "payment"
  | "completed"
  | "lost";
export function customerState(p: SimCustomer, minute: number): VisitState {
  if (p.cancelled || p.noShow || p.arrival > minute) return "scheduled";
  if (p.lostAt !== undefined && p.lostAt <= minute) return "lost";
  if (p.completed !== undefined && p.completed <= minute) return "completed";
  if (p.checkoutStart !== undefined && p.checkoutStart <= minute)
    return "payment";
  if (p.serviceEnd !== undefined && p.serviceEnd <= minute) return "checkout";
  if (p.serviceStart !== undefined && p.serviceStart <= minute)
    return p.sector === "Cafe" ? "cafe" : "service";
  if (p.checkInEnd !== undefined && p.checkInEnd <= minute) return "waiting";
  return "reception";
}
export function frameAt(result: SimResult, minute: number): SimFrame {
  let low = 0,
    high = result.frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (result.frames[mid].minute <= minute) low = mid;
    else high = mid - 1;
  }
  return result.frames[low];
}
export function serviceProgress(p: SimCustomer, minute: number) {
  const segment =
    p.workSegments?.find((s) => s.start <= minute && minute < s.end) ||
    p.workSegments?.filter((s) => s.end <= minute).at(-1);
  if (!segment)
    return { percent: null, remaining: null, slot: null, working: true };
  const fraction = Math.min(
    1,
    Math.max(0, (minute - segment.start) / (segment.end - segment.start)),
  );
  const processed =
    segment.processedStart +
    (segment.processedEnd - segment.processedStart) * fraction;
  return {
    percent: Math.min(100, (processed / p.duration) * 100),
    remaining: Math.max(0, p.duration - processed),
    slot: segment.slot,
    working: segment.working,
  };
}
export function currentFloor(result: SimResult, minute: number) {
  const frame = frameAt(result, minute);
  const visits = result.customers.map((p) => ({
    customer: p,
    state: customerState(p, minute),
    progress: serviceProgress(p, minute),
  }));
  const queue = visits
    .filter((v) => v.state === "waiting")
    .sort(
      (a, b) =>
        (a.customer.checkInEnd ?? 0) - (b.customer.checkInEnd ?? 0) ||
        a.customer.id - b.customer.id,
    );
  const activeEvents = result.events.filter(
    (e) => e.start <= minute && minute < e.start + e.duration,
  );
  const wait = Math.max(
    0,
    ...queue.map((v) => minute - (v.customer.checkInEnd ?? v.customer.arrival)),
  );
  const serviceQueue = queue.filter((v) => v.customer.sector === "Services"),
    cafeQueue = queue.filter((v) => v.customer.sector === "Cafe");
  const problems: Array<{
    title: string;
    detail: string;
    tone: "danger" | "warning";
    cause: string;
  }> = [];
  for (const [sector, list, staff, stations] of [
    ["Services", serviceQueue, frame.serviceStaff, frame.stations],
    ["Cafe", cafeQueue, frame.cafeStaff, frame.cafeStations],
  ] as const) {
    const sectorWait = Math.max(
      0,
      ...list.map(
        (v) => minute - (v.customer.checkInEnd ?? v.customer.arrival),
      ),
    );
    const occupied = visits.filter(
      (v) => v.state === (sector === "Services" ? "service" : "cafe"),
    ).length;
    const events = activeEvents.filter(
      (e) =>
        (e.sector === sector || e.sector === "All") &&
        ["staff", "stations", "closure", "duration", "demand"].includes(
          e.effect,
        ),
    );
    const stock =
      sector === "Services"
        ? frame.metrics.serviceStock
        : frame.metrics.cafeStock;
    const stockBlocked = list.some(
      (v) =>
        stock <
        (result.config.services.find((s) => s.id === v.customer.serviceId)
          ?.inventoryUnits ?? 0),
    );
    if (
      list.length &&
      (stockBlocked ||
        occupied >= Math.min(staff, stations) ||
        sectorWait > result.config.waitThreshold)
    )
      problems.push({
        title: stockBlocked
          ? `${sector} supply shortage`
          : `${sector} queue building`,
        detail: `${list.length} visits waiting · ${Math.floor(sectorWait)} min longest wait · ${Math.min(staff, stations)} available capacity`,
        tone:
          stockBlocked || sectorWait > result.config.waitThreshold
            ? "danger"
            : "warning",
        cause: stockBlocked
          ? "Required stock is insufficient for a waiting visit."
          : events.map((e) => e.label).join(" + ") ||
            "Demand exceeds currently free staff and stations.",
      });
  }
  const paymentQueue = visits.filter((v) => v.state === "checkout");
  if (
    paymentQueue.length > Math.max(1, frame.cashiers ?? result.config.cashiers)
  )
    problems.push({
      title: "Checkout congestion",
      detail: `${paymentQueue.length} visits waiting to pay`,
      tone: "warning",
      cause:
        activeEvents
          .filter((e) => e.effect === "checkout" || e.effect === "closure")
          .map((e) => e.label)
          .join(" + ") || "Cashier capacity is below current checkout demand.",
    });
  return {
    frame,
    visits,
    queue,
    activeEvents,
    problems,
    serviceQueue,
    cafeQueue,
  };
}
export function floorConfig(config?: SimConfig | null) {
  return {
    stations: config?.stations ?? 3,
    cafeStations: config?.cafeStations ?? 2,
    staff: config?.staff ?? 3,
    cafeStaff: config?.cafeStaff ?? 2,
    cashiers: config?.cashiers ?? 1,
  };
}
