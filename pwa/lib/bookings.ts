import type { Booking } from "../../backend/src/calendar/googleCalendar";

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

export function getBookings(): { bookings: Booking[]; isDemo: boolean } {
  const isDemo = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";
  // ponytail: synthetic history only until a reviewed, authenticated booking-list API exists.
  const bookings = isDemo ? [...demoBookings].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id)) : [];
  return { bookings, isDemo };
}
