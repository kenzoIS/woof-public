export type ForecastModule = 'Cafe' | 'Services';

export interface DailyValue {
  date: string;
  /** Physical demand volume: items sold for Cafe/Retail, bookings for Services. */
  actual: number;
  orders: number;
  revenue?: number;
  lineItems?: number;
  basketItems?: number;
  discountAmount?: number;
  promoTransactions?: number;
  avgBasketSize?: number;
  avgOrderValue?: number;
  averageUnitPrice?: number;
  grossProfit?: number;
}

export interface NormalizedDailyValue extends DailyValue {
  normalized: number;
  isMissingDate: boolean;
  isTrueZeroDay: boolean;
  isClosedDay: boolean;
  isObservedDemand: boolean;
  rawActual: number;
  cappedActual: number;
  isOutlier: boolean;
  outlierCap: number | null;
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
  promoFlag: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface TransactionLineValue {
  date?: Date | string | null;
  transactionId?: string | null;
  quantity?: number | null;
  netSales?: number | null;
  totalAmount?: number | null;
  discount?: number | null;
  productName?: string | null;
}

interface DailyAccumulator {
  quantity: number;
  revenue: number;
  discountAmount: number;
  orders: number;
  lineItems: number;
  basketItems: number;
  promoTransactions: number;
}

interface TransactionAccumulator {
  date: string;
  quantity: number;
  revenue: number;
  discountAmount: number;
  lineItems: number;
  items: Set<string>;
}

export function buildDailyValuesFromTransactionLines(
  lines: TransactionLineValue[],
  module: ForecastModule,
): DailyValue[] {
  const transactionMap = new Map<string, TransactionAccumulator>();

  for (const [index, line] of lines.entries()) {
    const date = toDateKey(line.date);
    if (!date) continue;

    const transactionId =
      String(line.transactionId || '').trim() || `line-${date}-${index + 1}`;
    const key = `${date}::${transactionId}`;
    const current =
      transactionMap.get(key) ||
      ({
        date,
        quantity: 0,
        revenue: 0,
        discountAmount: 0,
        lineItems: 0,
        items: new Set<string>(),
      } satisfies TransactionAccumulator);

    current.quantity += safeNumber(line.quantity, 0);
    current.revenue += safeNumber(
      line.netSales,
      safeNumber(line.totalAmount, 0),
    );
    current.discountAmount += safeNumber(line.discount, 0);
    current.lineItems += 1;
    const item = String(line.productName || '').trim();
    if (item) current.items.add(item);
    transactionMap.set(key, current);
  }

  const dailyMap = new Map<string, DailyAccumulator>();
  for (const transaction of transactionMap.values()) {
    const current =
      dailyMap.get(transaction.date) ||
      ({
        quantity: 0,
        revenue: 0,
        discountAmount: 0,
        orders: 0,
        lineItems: 0,
        basketItems: 0,
        promoTransactions: 0,
      } satisfies DailyAccumulator);

    current.quantity += transaction.quantity;
    current.revenue += transaction.revenue;
    current.discountAmount += transaction.discountAmount;
    current.orders += 1;
    current.lineItems += transaction.lineItems;
    current.basketItems += transaction.items.size || transaction.lineItems;
    if (transaction.discountAmount > 0) current.promoTransactions += 1;
    dailyMap.set(transaction.date, current);
  }

  return [...dailyMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => toDailyValue(date, value, module));
}

export function normalizeDailySeries(
  values: DailyValue[],
  module: ForecastModule,
): NormalizedDailyValue[] {
  const validValues = values.filter((value) => isDateKey(value?.date));
  if (validValues.length === 0) return [];

  const alpha = module === 'Cafe' ? 0.3 : 0.4;
  const byDate = new Map(
    validValues.map((value) => [
      value.date,
      {
        actual: Number.isFinite(value.actual) ? value.actual : 0,
        orders: Number.isFinite(value.orders) ? value.orders : 0,
        revenue: safeNumber(value.revenue, 0),
        lineItems: safeNumber(value.lineItems, 0),
        basketItems: safeNumber(value.basketItems, 0),
        discountAmount: safeNumber(value.discountAmount, 0),
        promoTransactions: safeNumber(value.promoTransactions, 0),
        avgBasketSize: safeNumber(value.avgBasketSize, 0),
        avgOrderValue: safeNumber(value.avgOrderValue, 0),
        averageUnitPrice: safeNumber(value.averageUnitPrice, 0),
      },
    ]),
  );
  const outlierCap = computeOutlierCap(
    [...byDate.values()].map((value) => value.actual),
  );
  const sortedDates = [...byDate.keys()].sort();
  const start = new Date(`${sortedDates[0]}T00:00:00.000Z`).getTime();
  const end = new Date(
    `${sortedDates[sortedDates.length - 1]}T00:00:00.000Z`,
  ).getTime();

  const output: NormalizedDailyValue[] = [];
  let ema: number | null = null;

  for (let timestamp = start; timestamp <= end; timestamp += DAY_MS) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const existing = byDate.get(date);
    const actual = existing?.actual ?? 0;
    const isMissingDate = !existing;
    const isClosedDay = actual === 0;
    const isObservedDemand = !isClosedDay;
    const cappedActual =
      existing && outlierCap !== null ? Math.min(actual, outlierCap) : actual;
    if (ema === null && isObservedDemand) {
      ema = cappedActual;
    } else if (ema !== null && isObservedDemand) {
      ema = alpha * cappedActual + (1 - alpha) * ema;
    }
    const calendar = getCalendarFeatures(date);
    const orders = existing?.orders ?? 0;
    const revenue = existing?.revenue ?? 0;
    const lineItems = existing?.lineItems ?? 0;
    const basketItems = existing?.basketItems ?? 0;
    const discountAmount = existing?.discountAmount ?? 0;
    const promoTransactions = existing?.promoTransactions ?? 0;
    output.push({
      date,
      actual: round(actual),
      orders,
      revenue: round(revenue),
      lineItems,
      basketItems,
      discountAmount: round(discountAmount),
      promoTransactions,
      avgBasketSize:
        existing?.avgBasketSize ??
        (orders > 0 ? round(basketItems / orders) : 0),
      avgOrderValue:
        existing?.avgOrderValue ?? (orders > 0 ? round(revenue / orders) : 0),
      averageUnitPrice:
        existing?.averageUnitPrice ??
        (actual > 0 ? round(revenue / Math.max(actual, 1)) : 0),
      normalized: round(ema ?? 0),
      isMissingDate,
      isTrueZeroDay: false,
      isClosedDay,
      isObservedDemand,
      rawActual: round(actual),
      cappedActual: round(cappedActual),
      isOutlier: Boolean(
        existing && outlierCap !== null && actual > outlierCap,
      ),
      outlierCap: outlierCap === null ? null : round(outlierCap),
      ...calendar,
      promoFlag: promoTransactions > 0 || discountAmount > 0 ? 1 : 0,
    });
  }

  return output;
}

function toDailyValue(
  date: string,
  value: DailyAccumulator,
  module: ForecastModule,
): DailyValue {
  const actual = module === 'Services' ? value.orders : value.quantity;
  return {
    date,
    actual: round(actual),
    orders: value.orders,
    revenue: round(value.revenue),
    lineItems: value.lineItems,
    basketItems: value.basketItems,
    discountAmount: round(value.discountAmount),
    promoTransactions: value.promoTransactions,
    avgBasketSize:
      value.orders > 0 ? round(value.basketItems / value.orders) : 0,
    avgOrderValue: value.orders > 0 ? round(value.revenue / value.orders) : 0,
    averageUnitPrice:
      value.quantity > 0 ? round(value.revenue / value.quantity) : 0,
  };
}

function computeOutlierCap(values: number[]): number | null {
  const clean = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (clean.length < 7) return null;

  const q1 = percentile(clean, 0.25);
  const q3 = percentile(clean, 0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) {
    const median = percentile(clean, 0.5);
    const fallbackCap = median * 3;
    return fallbackCap > median ? fallbackCap : null;
  }

  const cap = q3 + 1.5 * iqr;
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function getCalendarFeatures(date: string): {
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
} {
  const value = new Date(`${date}T00:00:00.000Z`);
  const jsDay = value.getUTCDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;
  return {
    dayOfWeek,
    dayName: WEEKDAY_NAMES[jsDay],
    isWeekend: dayOfWeek === 6 || dayOfWeek === 7,
  };
}

function toDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime());
}

function safeNumber(value: unknown, fallback: number): number {
  const numeric =
    typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
