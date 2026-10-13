import assert from "node:assert/strict";
import test from "node:test";
import { formatRelative } from "./date-time";
import { groupBookings } from "./bookings";
import { callsWithin, recentDays } from "./overview";

test("recent days are Ulaanbaatar dates, oldest first, with empty days kept as zero", () => {
  const now = Date.parse("2026-10-12T02:00:00.000Z"); // УБ: 10-р сарын 12, 10:00
  const calls = [
    { startedAt: "2026-10-11T16:00:00.000Z" }, // УБ 12-ны 00:00 — өнөөдөр
    { startedAt: "2026-10-11T15:59:59.000Z" }, // УБ 11-ний 23:59 — өчигдөр
    { startedAt: "2026-10-09T05:00:00.000Z" },
    { startedAt: "2026-10-01T05:00:00.000Z" }, // хүрээнээс гадуур
  ];
  const days = recentDays(calls, 4, now);
  assert.deepEqual(days, [
    { date: "2026-10-09", calls: 1 }, { date: "2026-10-10", calls: 0 }, { date: "2026-10-11", calls: 1 }, { date: "2026-10-12", calls: 1 },
  ]);
  assert.deepEqual(callsWithin(calls, days), calls.slice(0, 3));
  assert.deepEqual(recentDays([], 2, now), [{ date: "2026-10-11", calls: 0 }, { date: "2026-10-12", calls: 0 }]);
});

test("relative time reads naturally and falls back to the date after a day", () => {
  const now = Date.parse("2026-10-12T12:00:00.000Z");
  assert.equal(formatRelative("2026-10-12T11:59:30.000Z", now), "дөнгөж сая");
  assert.equal(formatRelative("2026-10-12T11:48:00.000Z", now), "12 мин өмнө");
  assert.equal(formatRelative("2026-10-12T08:10:00.000Z", now), "3 цагийн өмнө");
  assert.equal(formatRelative("2026-10-10T08:10:00.000Z", now), "10.10");
});

test("bookings group by Ulaanbaatar day: upcoming nearest first, past newest first", () => {
  const now = Date.parse("2026-10-12T02:00:00.000Z"); // УБ: 10-р сарын 12 (Даваа), 10:00
  const booking = (id: string, startTime: string) => ({
    id, calendarEventId: id, customerName: id, phone: "99112233", serviceId: "table", serviceName: "Ширээ",
    startTime, endTime: startTime, durationMinutes: 60, status: "confirmed" as const, source: "AI_PHONE_AGENT" as const,
  });
  const groups = groupBookings([
    booking("tomorrow", "2026-10-13T11:00:00.000Z"),
    booking("today-evening", "2026-10-12T11:00:00.000Z"),
    booking("today-morning", "2026-10-11T17:00:00.000Z"), // УБ 12-ны 01:00
    booking("later", "2026-10-15T04:00:00.000Z"),
    booking("yesterday", "2026-10-11T04:00:00.000Z"),
    booking("last-week", "2026-10-06T04:00:00.000Z"),
  ], now);
  assert.deepEqual(groups.upcoming.map(({ label, items }) => [label, items.map(({ id }) => id)]), [
    ["Өнөөдөр", ["today-morning", "today-evening"]], ["Маргааш", ["tomorrow"]], ["10.15 · Пүрэв", ["later"]],
  ]);
  assert.deepEqual(groups.past.map(({ label }) => label), ["10.11 · Ням", "10.06 · Мягмар"]);
  assert.deepEqual(groupBookings([], now), { upcoming: [], past: [] });
});
