import type { Booking } from "../../backend/src/calendar/googleCalendar";
import { fetchBackend, isMockMode, type DataSource } from "./data-source";
import { formatUlaanbaatarTime } from "./date-time";

const demoBookings: Booking[] = [
  {
    id: "demo-booking-01", calendarEventId: "demo-event-01", customerName: "А. Энхжин", phone: "+97600000002",
    serviceId: "haircut", serviceName: "Үс засалт", startTime: "2026-10-08T07:00:00.000Z", endTime: "2026-10-08T07:30:00.000Z",
    durationMinutes: 30, status: "confirmed", source: "AI_PHONE_AGENT",
  },
  {
    id: "demo-booking-02", calendarEventId: "demo-event-02", customerName: "Б. Тэмүүлэн", phone: "+97600000012",
    serviceId: "haircut", serviceName: "Үс засалт", startTime: "2026-10-08T01:00:00.000Z", endTime: "2026-10-08T01:30:00.000Z",
    durationMinutes: 30, status: "confirmed", source: "AI_PHONE_AGENT",
  },
  {
    id: "demo-booking-03", calendarEventId: "demo-event-03", customerName: "Д. Саруул", phone: "00000013",
    serviceId: "hair-color", serviceName: "Үс будах", startTime: "2026-10-08T03:00:00.000Z", endTime: "2026-10-08T04:30:00.000Z",
    durationMinutes: 90, status: "confirmed", source: "AI_PHONE_AGENT",
  },
  {
    id: "demo-booking-04", calendarEventId: "demo-event-04", customerName: "Н. Номин", phone: "+97600000014",
    serviceId: "manicure", serviceName: "Маникюр", startTime: "2026-10-08T16:15:00.000Z", endTime: "2026-10-08T17:00:00.000Z",
    durationMinutes: 45, status: "confirmed", source: "AI_PHONE_AGENT",
  },
  {
    id: "demo-booking-05", calendarEventId: "demo-event-05", customerName: "О. Мөнхжин", phone: "+97600000015",
    serviceId: "hair-color", serviceName: "Үс будах", startTime: "2026-10-09T01:00:00.000Z", endTime: "2026-10-09T02:30:00.000Z",
    durationMinutes: 90, status: "confirmed", source: "AI_PHONE_AGENT",
  },
  {
    id: "demo-booking-06", calendarEventId: "demo-event-06", customerName: "С. Анужин", phone: "+97600000016",
    serviceId: "manicure", serviceName: "Маникюр", startTime: "2026-10-09T04:30:00.000Z", endTime: "2026-10-09T05:15:00.000Z",
    durationMinutes: 45, status: "confirmed", source: "AI_PHONE_AGENT",
  },
];

export async function getBookings(): Promise<{ bookings: Booking[]; source: DataSource }> {
  if (isMockMode()) {
    return { bookings: [...demoBookings].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id)), source: "demo" };
  }
  const bookings = await fetchBackend<Booking[]>("/api/bookings");
  return bookings ? { bookings, source: "live" } : { bookings: [], source: "offline" };
}

const DAY_MS = 86400000;
const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
const dayOf = (time: number | string) => formatUlaanbaatarTime(new Date(time).toISOString()).slice(0, 10);

export type BookingDay = { date: string; label: string; items: Booking[] };

// Захиалгуудыг Улаанбаатарын өдрөөр бүлэглэнэ: өнөөдрөөс хойшхи нь ойроосоо эхэлж,
// өнгөрсөн нь шинээсээ эхэлж. Өдөр доторх захиалга цагийн дарааллаар.
export function groupBookings(bookings: readonly Booking[], now: number): { upcoming: BookingDay[]; past: BookingDay[] } {
  const today = dayOf(now), tomorrow = dayOf(now + DAY_MS);
  const days = new Map<string, Booking[]>();
  for (const booking of [...bookings].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id))) {
    const date = dayOf(booking.startTime);
    days.set(date, [...(days.get(date) ?? []), booking]);
  }
  const all = [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => {
    const [year, month, day] = date.split(".").map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return { date, items, label: date === today ? "Өнөөдөр" : date === tomorrow ? "Маргааш" : `${date.slice(5)} · ${weekday}` };
  });
  return { upcoming: all.filter(({ date }) => date >= today), past: all.filter(({ date }) => date < today).reverse() };
}
