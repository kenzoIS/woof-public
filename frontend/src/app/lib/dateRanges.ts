export const HISTORY_START_DATE = "2021-02-28";
export const INGESTED_HISTORY_END_DATE = "2026-05-31";

export type DateRange = {
  start: string;
  end: string;
  isCustom: boolean;
};

export type DateBounds = {
  min?: string | null;
  max?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function clampHistoryDate(date: string, bounds: DateBounds = {}): string {
  const min = bounds.min || HISTORY_START_DATE;
  const max = bounds.max || INGESTED_HISTORY_END_DATE;
  if (!date || date < min) return min;
  if (date > max) return max;
  return date;
}

export function encodeCustomRange(start: string, end: string, bounds: DateBounds = {}): string {
  const safeStart = clampHistoryDate(start, bounds);
  const safeEnd = end && end >= safeStart ? end : safeStart;
  return `custom:${safeStart}:${safeEnd}`;
}

export function parseCustomRange(value: string, bounds: DateBounds = {}): DateRange | null {
  if (!value?.startsWith("custom:")) return null;
  const [, rawStart, rawEnd] = value.split(":");
  const start = clampHistoryDate(rawStart, bounds);
  const end = rawEnd && rawEnd >= start ? clampHistoryDate(rawEnd, bounds) : start;
  return { start, end, isCustom: true };
}

export function parseGlobalRange(
  value: string,
  latestHistoryDate = INGESTED_HISTORY_END_DATE,
  bounds: DateBounds = {},
): DateRange {
  const latest = clampHistoryDate(latestHistoryDate, bounds);
  if (value?.startsWith("custom:")) {
    const customRange = parseCustomRange(value, bounds);
    const start = customRange?.start || bounds.min || HISTORY_START_DATE;
    const end = clampHistoryDate(customRange?.end || start, bounds);
    return { start, end: end >= start ? end : start, isCustom: true };
  }

  if (value === "all-time") {
    const start = bounds.min || HISTORY_START_DATE;
    return {
      start,
      end: latest,
      isCustom: false,
    };
  }

  const end = latest;
  const days =
    value === "today" || value === "yesterday"
      ? 1
      : value === "last-30-days"
        ? 30
        : value === "last-90-days"
          ? 90
          : value === "last-12-months"
            ? 365
            : 7;
  const rawEnd = value === "yesterday" ? addDays(end, -1) : end;
  return {
    start: clampHistoryDate(addDays(rawEnd, -(days - 1)), bounds),
    end: clampHistoryDate(rawEnd, bounds),
    isCustom: false,
  };
}

export function filterByDateRange<T extends { date?: string; day?: string }>(
  rows: T[],
  range: DateRange,
): T[] {
  return rows.filter((row) => {
    const date = row.date || row.day || "";
    return date >= range.start && date <= range.end;
  });
}

export function forecastRangeFromHorizon(
  latestHistoryDate: string,
  days: number,
): DateRange {
  const start = addDays(latestHistoryDate || INGESTED_HISTORY_END_DATE, 1);
  return { start, end: addDays(start, days - 1), isCustom: false };
}

export function countDays(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${end}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return 0;
  }
  return Math.floor((endTime - startTime) / DAY_MS) + 1;
}
