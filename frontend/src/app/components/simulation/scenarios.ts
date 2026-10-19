import type {
  EventEffect,
  Sector,
  SimConfig,
  SimEvent,
} from "../../lib/simulationTypes";
export interface EventTemplate {
  label: string;
  category: string;
  effect: EventEffect;
  sector: Sector | "All";
  value: number;
  duration: number;
}
export const eventTemplates: EventTemplate[] = [
  {
    label: "Relief cafe staff arrives",
    category: "Staff",
    effect: "staff",
    sector: "Cafe",
    value: 1,
    duration: 120,
  },
  {
    label: "Cafe staff meal break",
    category: "Staff",
    effect: "staff",
    sector: "Cafe",
    value: -1,
    duration: 30,
  },
  {
    label: "Backup grooming station opened",
    category: "Equipment",
    effect: "stations",
    sector: "Services",
    value: 1,
    duration: 120,
  },
  {
    label: "Cafe preparation station malfunction",
    category: "Equipment",
    effect: "stations",
    sector: "Cafe",
    value: -1,
    duration: 45,
  },
  {
    label: "Backup cafe preparation station opened",
    category: "Equipment",
    effect: "stations",
    sector: "Cafe",
    value: 1,
    duration: 120,
  },
  {
    label: "Cafe sanitation pause",
    category: "Facility",
    effect: "closure",
    sector: "Cafe",
    value: 1,
    duration: 15,
  },
  {
    label: "Grooming area deep cleaning",
    category: "Facility",
    effect: "closure",
    sector: "Services",
    value: 1,
    duration: 20,
  },
  {
    label: "Grooming consumables damaged (20 units)",
    category: "Inventory",
    effect: "inventory",
    sector: "Services",
    value: -20,
    duration: 1,
  },
  {
    label: "Cafe ingredient spoilage (20 units)",
    category: "Inventory",
    effect: "inventory",
    sector: "Cafe",
    value: -20,
    duration: 1,
  },
  {
    label: "Express checkout process enabled",
    category: "Payment",
    effect: "checkout",
    sector: "All",
    value: 0.5,
    duration: 60,
  },
  {
    label: "Manual payment verification required",
    category: "Payment",
    effect: "checkout",
    sector: "All",
    value: 2,
    duration: 45,
  },
  {
    label: "Nearby event increases customer arrivals",
    category: "Demand / external",
    effect: "demand",
    sector: "All",
    value: 1.4,
    duration: 90,
  },
  {
    label: "Road closure reduces customer arrivals",
    category: "Demand / external",
    effect: "demand",
    sector: "All",
    value: 0.6,
    duration: 60,
  },
  {
    label: "Complex grooming requests slow service",
    category: "Pet handling",
    effect: "duration",
    sector: "Services",
    value: 1.3,
    duration: 60,
  },
  {
    label: "Groomer / service staff absent",
    category: "Staff",
    effect: "staff",
    sector: "Services",
    value: -1,
    duration: 600,
  },
  {
    label: "Multiple service staff absent",
    category: "Staff",
    effect: "staff",
    sector: "Services",
    value: -2,
    duration: 600,
  },
  {
    label: "Staff break / temporary reassignment",
    category: "Staff",
    effect: "staff",
    sector: "Services",
    value: -1,
    duration: 30,
  },
  {
    label: "Additional service staff / overtime",
    category: "Staff",
    effect: "staff",
    sector: "Services",
    value: 1,
    duration: 120,
  },
  {
    label: "Less experienced staff / longer service",
    category: "Staff",
    effect: "duration",
    sector: "Services",
    value: 1.25,
    duration: 600,
  },
  {
    label: "More efficient service",
    category: "Staff",
    effect: "duration",
    sector: "Services",
    value: 0.8,
    duration: 600,
  },
  {
    label: "Cafe staff shortage",
    category: "Cafe",
    effect: "staff",
    sector: "Cafe",
    value: -1,
    duration: 120,
  },
  {
    label: "Cafe orders surge",
    category: "Cafe",
    effect: "demand",
    sector: "Cafe",
    value: 1.5,
    duration: 120,
  },
  {
    label: "Cafe preparation / turnover delay",
    category: "Cafe",
    effect: "duration",
    sector: "Cafe",
    value: 1.5,
    duration: 120,
  },
  {
    label: "Service station / equipment unavailable",
    category: "Equipment",
    effect: "stations",
    sector: "Services",
    value: -1,
    duration: 120,
  },
  {
    label: "Dryer or clipper interruption",
    category: "Equipment",
    effect: "stations",
    sector: "Services",
    value: -1,
    duration: 60,
  },
  {
    label: "Cleaning / maintenance closure",
    category: "Equipment",
    effect: "closure",
    sector: "Services",
    value: 1,
    duration: 30,
  },
  {
    label: "Water interruption",
    category: "Equipment",
    effect: "closure",
    sector: "Services",
    value: 1,
    duration: 60,
  },
  {
    label: "Payment / internet / POS delay",
    category: "Payment",
    effect: "checkout",
    sector: "All",
    value: 3,
    duration: 60,
  },
  {
    label: "Payment terminal failures",
    category: "Payment",
    effect: "paymentFailure",
    sector: "All",
    value: 30,
    duration: 60,
  },
  {
    label: "Required service consumables depleted",
    category: "Inventory",
    effect: "inventory",
    sector: "Services",
    value: -100,
    duration: 1,
  },
  {
    label: "Cafe ingredient shortage",
    category: "Inventory",
    effect: "inventory",
    sector: "Cafe",
    value: -100,
    duration: 1,
  },
  {
    label: "Emergency service restocking",
    category: "Inventory",
    effect: "inventory",
    sector: "Services",
    value: 100,
    duration: 1,
  },
  {
    label: "Cafe ingredients restored",
    category: "Inventory",
    effect: "inventory",
    sector: "Cafe",
    value: 100,
    duration: 1,
  },
  {
    label: "Pet anxiety / extra handling",
    category: "Pet handling",
    effect: "duration",
    sector: "Services",
    value: 1.5,
    duration: 30,
  },
  {
    label: "Pet refusal / owner cancels before arrival",
    category: "Pet handling",
    effect: "cancel",
    sector: "Services",
    value: 25,
    duration: 120,
  },
  {
    label: "Pet incident / safe recovery interruption",
    category: "Pet handling",
    effect: "closure",
    sector: "Services",
    value: 1,
    duration: 20,
  },
  {
    label: "Pet requires additional staff assistance",
    category: "Pet handling",
    effect: "staff",
    sector: "Services",
    value: -1,
    duration: 20,
  },
  {
    label: "Appointments cancelled / rescheduled outside day",
    category: "Appointments",
    effect: "cancel",
    sector: "All",
    value: 20,
    duration: 600,
  },
  {
    label: "Higher no-show rate",
    category: "Appointments",
    effect: "noShow",
    sector: "All",
    value: 20,
    duration: 600,
  },
  {
    label: "Late appointments / local traffic",
    category: "Appointments",
    effect: "late",
    sector: "All",
    value: 40,
    duration: 120,
  },
  {
    label: "Peak-hour customer surge",
    category: "Demand / external",
    effect: "demand",
    sector: "All",
    value: 1.5,
    duration: 120,
  },
  {
    label: "Promotion / holiday / payday rush",
    category: "Demand / external",
    effect: "demand",
    sector: "All",
    value: 1.3,
    duration: 600,
  },
  {
    label: "Rain / extreme heat: lower arrivals",
    category: "Demand / external",
    effect: "demand",
    sector: "All",
    value: 0.7,
    duration: 120,
  },
  {
    label: "Low customer turnout",
    category: "Demand / external",
    effect: "demand",
    sector: "All",
    value: 0.5,
    duration: 600,
  },
  {
    label: "Medical / staff injury operational pause",
    category: "Emergency",
    effect: "staff",
    sector: "Services",
    value: -1,
    duration: 30,
  },
  {
    label: "Fire alarm / evacuation / power outage",
    category: "Emergency",
    effect: "closure",
    sector: "All",
    value: 1,
    duration: 30,
  },
];
export const presets = [
  "Normal Day",
  "Busy Weekend",
  "Peak Hours",
  "Fully Booked Day",
  "High Walk-In Day",
  "Staff Shortage",
  "Multiple Staff Absences",
  "Equipment Failure",
  "Inventory Shortage",
  "High Cancellation Day",
  "High No-Show Day",
  "Promotion Day",
  "Holiday Rush",
  "Unexpected Demand Surge",
  "Low Demand Day",
  "Emergency Disruption",
  "Worst-Case Operations",
];
export function addEvent(
  template: EventTemplate,
  c: SimConfig,
  index: number,
  start = 120,
): SimEvent {
  return {
    id: `event-${index}-${Date.now()}`,
    label: template.label,
    effect: template.effect,
    sector: template.sector,
    value: template.value,
    start: Math.min(start, c.minutes - 1),
    duration: Math.min(template.duration, c.minutes),
  };
}
export function presetConfig(name: string, baseline: SimConfig): SimConfig {
  const c = structuredClone(baseline);
  c.name = name;
  c.events = [];
  const push = (label: string, start = 120) =>
    c.events.push(
      addEvent(
        eventTemplates.find((t) => t.label === label)!,
        c,
        c.events.length,
        start,
      ),
    );
  if (["Busy Weekend", "Fully Booked Day", "Holiday Rush"].includes(name))
    c.customers = Math.min(1500, Math.round(c.customers * 1.5));
  if (name === "High Walk-In Day") c.walkInRate = 80;
  if (name === "High Cancellation Day") c.cancellationRate = 25;
  if (name === "High No-Show Day") c.noShowRate = 25;
  if (name === "Staff Shortage") push("Groomer / service staff absent", 0);
  if (name === "Multiple Staff Absences")
    push("Multiple service staff absent", 0);
  if (name === "Equipment Failure")
    push("Service station / equipment unavailable");
  if (name === "Inventory Shortage")
    push("Required service consumables depleted");
  if (name === "Promotion Day") push("Promotion / holiday / payday rush", 0);
  if (name === "Peak Hours")
    push("Peak-hour customer surge", Math.min(300, c.minutes - 1));
  if (name === "Unexpected Demand Surge")
    c.customers = Math.min(1500, Math.round(c.customers * 1.3));
  if (name === "Low Demand Day") c.customers = Math.round(c.customers * 0.5);
  if (name === "Emergency Disruption")
    push("Fire alarm / evacuation / power outage");
  if (name === "Worst-Case Operations") {
    c.customers = Math.min(1500, Math.round(c.customers * 1.2));
    c.cancellationRate = 10;
    push("Groomer / service staff absent", 0);
    push("Service station / equipment unavailable");
    push("Promotion / holiday / payday rush", 0);
  }
  return c;
}
