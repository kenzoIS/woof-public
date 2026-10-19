export type Sector = "Services" | "Cafe";
export interface SimService {
  id: string;
  name: string;
  sector: Sector;
  weight: number;
  duration: number;
  price: number;
  inventoryUnits: number;
  pets: number;
}
export type EventEffect =
  | "staff"
  | "stations"
  | "demand"
  | "duration"
  | "inventory"
  | "checkout"
  | "closure"
  | "late"
  | "cancel"
  | "noShow"
  | "paymentFailure";
export interface SimEvent {
  audience?: "all" | "walkIn" | "appointment";
  id: string;
  label: string;
  effect: EventEffect;
  sector: Sector | "All";
  start: number;
  duration: number;
  value: number;
}
export interface SimConfig {
  name: string;
  date: string;
  dayType: string;
  openHour: number;
  minutes: number;
  seed: number;
  customers: number;
  staff: number;
  cafeStaff: number;
  stations: number;
  cafeStations: number;
  cashiers: number;
  checkoutMinutes: number;
  patience: number;
  waitThreshold: number;
  waitingCapacity: number;
  walkInRate: number;
  cancellationRate: number;
  noShowRate: number;
  lateRate: number;
  lateMinutes: number;
  serviceInventory: number;
  cafeInventory: number;
  paymentFailureRate: number;
  randomEvents: boolean;
  randomEventRate: number;
  arrivalWeights: number[];
  services: SimService[];
  events: SimEvent[];
}
export interface SimInputs {
  source: "historical" | "forecast" | "custom";
  startDate?: string;
  endDate?: string;
  description: string;
  provenance: string[];
  warnings: string[];
  config: SimConfig;
}
export interface SimWorkSegment {
  start: number;
  end: number;
  processedStart: number;
  processedEnd: number;
  slot: number;
  working: boolean;
}
export interface SimCustomer {
  id: number;
  serviceId: string;
  sector: Sector;
  pets: number;
  price: number;
  duration: number;
  walkIn: boolean;
  arrival: number;
  checkInEnd?: number;
  serviceStart?: number;
  serviceEnd?: number;
  checkoutStart?: number;
  completed?: number;
  lostAt?: number;
  reason?: string;
  cancelled?: boolean;
  noShow?: boolean;
  stockUsed?: number;
  inventoryBlockedAt?: number;
  workSegments?: SimWorkSegment[];
}
export interface SimMetrics {
  demand: number;
  arrived: number;
  served: number;
  waiting: number;
  petsWaiting: number;
  active: number;
  completedServices: number;
  checkoutQueue: number;
  inCheckout: number;
  avgWait: number;
  maxWait: number;
  currentWait: number;
  avgQueue: number;
  maxQueue: number;
  staffUtilization: number;
  stationUtilization: number;
  cafeUtilization: number;
  cashierUtilization: number;
  revenue: number;
  lostRevenue: number;
  potentialRevenue: number;
  projectedRevenue: number;
  cancelled: number;
  noShows: number;
  walkIns: number;
  abandoned: number;
  unserved: number;
  paymentFailures: number;
  serviceStock: number;
  cafeStock: number;
  inventoryConsumed: number;
  inventoryAffected: number;
  stockoutMinute: number | null;
  customersPerHour: number;
  servicesPerHour: number;
  satisfaction: number;
  efficiency: number;
}
export interface SimLog {
  minute: number;
  label: string;
  impact: string;
  customerId?: number;
}
export interface SimFrame {
  minute: number;
  metrics: SimMetrics;
  serviceStaff: number;
  cafeStaff: number;
  stations: number;
  cafeStations: number;
  cashiers?: number;
}
export interface SimResult {
  config: SimConfig;
  metrics: SimMetrics;
  customers: SimCustomer[];
  frames: SimFrame[];
  timeline: SimLog[];
  events: SimEvent[];
  bottlenecks: string[];
}
export interface SimComparisonRow {
  key: string;
  label: string;
  unit: string;
  baseline: number;
  whatIf: number;
  difference: number;
  percent: number | null;
}
export interface SimRun {
  _id?: string;
  createdAt?: string;
  createdBy?: string;
  engineVersion: string;
  inputs: SimInputs;
  baseline: SimResult;
  whatIf: SimResult;
  comparison: SimComparisonRow[];
  recommendations: string[];
}
