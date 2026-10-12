import type { AnalyticsCall } from "./analytics";
import { formatUlaanbaatarTime } from "./date-time";

const DAY_MS = 86400000;
const dayOf = (time: number | string) => formatUlaanbaatarTime(new Date(time).toISOString()).slice(0, 10).replace(/\./g, "-");

// Сүүлийн `days` хоногийн (өнөөдрийг оруулаад) өдөр тутмын дуудлагын тоо, хуучнаас шинэ рүү.
// Улаанбаатар зуны цаггүй тул 24 цагаар ухрахад өдөр алгасахгүй.
export function recentDays(calls: readonly Pick<AnalyticsCall, "startedAt">[], days: number, now: number) {
  const counts = new Map<string, number>();
  for (const call of calls) counts.set(dayOf(call.startedAt), (counts.get(dayOf(call.startedAt)) ?? 0) + 1);
  return Array.from({ length: days }, (_, index) => {
    const date = dayOf(now - (days - 1 - index) * DAY_MS);
    return { date, calls: counts.get(date) ?? 0 };
  });
}

// Тухайн өдрүүдэд эхэлсэн дуудлагууд.
export function callsWithin<T extends Pick<AnalyticsCall, "startedAt">>(calls: readonly T[], dates: readonly { date: string }[]): T[] {
  const wanted = new Set(dates.map(({ date }) => date));
  return calls.filter((call) => wanted.has(dayOf(call.startedAt)));
}
