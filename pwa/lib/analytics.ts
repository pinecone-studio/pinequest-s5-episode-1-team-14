import type { CallSession } from "../../backend/src/calls/store";
import type { Booking } from "../../backend/src/calendar/googleCalendar";
import { formatUlaanbaatarTime } from "./date-time";

export type AnalyticsCall = Pick<CallSession, "startedAt" | "duration" | "status" | "intent" | "bookingCreated">;
export type AnalyticsBooking = Pick<Booking, "startTime">;

const dayOf = (timestamp: string) => formatUlaanbaatarTime(timestamp).slice(0, 10).replace(/\./g, "-");

export function summarizeAnalytics(calls: readonly AnalyticsCall[], bookings: readonly AnalyticsBooking[], date = "") {
  const selectedCalls = calls.filter((call) => !date || dayOf(call.startedAt) === date);
  const selectedBookings = bookings.filter((booking) => !date || dayOf(booking.startTime) === date);
  const statuses: Record<CallSession["status"], number> = { active: 0, completed: 0, failed: 0, handed_off: 0 };
  const intents: Record<NonNullable<CallSession["intent"]> | "unknown", number> = {
    ASK_PRICE: 0, ASK_SERVICE: 0, ASK_OPENING_HOURS: 0, BOOK_APPOINTMENT: 0,
    CANCEL_BOOKING: 0, ASK_PRODUCT: 0, REQUEST_HUMAN: 0, GENERAL_QUERY: 0, unknown: 0,
  };
  const daily = new Map<string, { date: string; calls: number; bookings: number }>();
  function day(timestamp: string) {
    const key = dayOf(timestamp);
    if (!daily.has(key)) daily.set(key, { date: key, calls: 0, bookings: 0 });
    return daily.get(key)!;
  }
  let finishedCalls = 0, convertedCalls = 0, duration = 0;
  for (const call of selectedCalls) {
    statuses[call.status]++;
    intents[call.intent ?? "unknown"]++;
    day(call.startedAt).calls++;
    // Active calls have no final outcome or duration, even if they already created a booking.
    if (call.status !== "active") {
      finishedCalls++;
      duration += call.duration;
      if (call.bookingCreated) convertedCalls++;
    }
  }
  for (const booking of selectedBookings) day(booking.startTime).bookings++;
  return {
    totalCalls: selectedCalls.length, totalBookings: selectedBookings.length,
    finishedCalls, convertedCalls,
    conversionRate: finishedCalls ? convertedCalls / finishedCalls * 100 : null,
    averageDuration: finishedCalls ? Math.round(duration / finishedCalls) : null,
    statuses, intents, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
