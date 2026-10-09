import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAnalytics, type AnalyticsCall } from "./analytics";
import { getCalls } from "./calls";
import { getBookings } from "./bookings";

const base: AnalyticsCall = { startedAt: "2026-10-08T01:00:00.000Z", status: "completed", duration: 90, intent: "BOOK_APPOINTMENT", bookingCreated: true };

test("all statuses and unknown intents are counted; active bookings do not inflate final conversion", () => {
  const calls = Object.freeze([
    Object.freeze({ ...base, status: "active" as const, duration: 0 }),
    Object.freeze(base),
    Object.freeze({ ...base, status: "failed" as const, duration: 0, intent: null, bookingCreated: false }),
    Object.freeze({ ...base, status: "handed_off" as const, duration: 30, intent: "REQUEST_HUMAN" as const, bookingCreated: false }),
  ]);
  const result = summarizeAnalytics(calls, []);
  assert.equal(result.totalCalls, 4);
  assert.equal(result.finishedCalls, 3);
  assert.equal(result.convertedCalls, 1);
  assert.ok(Math.abs(result.conversionRate! - 100 / 3) < 1e-10);
  assert.equal(result.averageDuration, 40);
  assert.deepEqual(result.statuses, { active: 1, completed: 1, failed: 1, handed_off: 1 });
  assert.equal(result.intents.unknown, 1);
  assert.equal(Object.values(result.intents).reduce((sum, count) => sum + count, 0), 4);
});

test("empty and active-only histories have unavailable ratios; a finished zero-duration call is real zero", () => {
  for (const calls of [[], [{ ...base, status: "active" as const, duration: 0 }]]) {
    const result = summarizeAnalytics(calls, []);
    assert.equal(result.conversionRate, null);
    assert.equal(result.averageDuration, null);
  }
  const result = summarizeAnalytics([{ ...base, status: "failed", duration: 0, bookingCreated: false }], []);
  assert.equal(result.conversionRate, 0);
  assert.equal(result.averageDuration, 0);
});

test("dates use Ulaanbaatar midnight for both calls and scheduled bookings; days are sorted", () => {
  const calls = [{ ...base, startedAt: "2026-10-07T16:00:00.000Z" }, { ...base, startedAt: "2026-10-07T15:59:59.000Z" }];
  const bookings = [{ startTime: "2026-10-08T16:00:00.000Z" }, { startTime: "2026-10-07T16:00:00.000Z" }];
  assert.deepEqual(summarizeAnalytics(calls, bookings).daily, [
    { date: "2026-10-07", calls: 1, bookings: 0 }, { date: "2026-10-08", calls: 1, bookings: 1 }, { date: "2026-10-09", calls: 0, bookings: 1 },
  ]);
  const eighth = summarizeAnalytics(calls, bookings, "2026-10-08");
  assert.equal(eighth.totalCalls, 1); assert.equal(eighth.totalBookings, 1);
  assert.equal(eighth.conversionRate, 100);
  const ninth = summarizeAnalytics(calls, bookings, "2026-10-09");
  assert.equal(ninth.totalCalls, 0); assert.equal(ninth.totalBookings, 1);
  assert.equal(ninth.conversionRate, null);
  assert.deepEqual(summarizeAnalytics(calls, bookings, "2026-10-10").daily, []);
});

test("analytics agrees with the existing demo adapters and their disabled mode", () => {
  const original = process.env.NEXT_PUBLIC_USE_MOCK_API;
  try {
    process.env.NEXT_PUBLIC_USE_MOCK_API = "true";
    const result = summarizeAnalytics(getCalls().calls, getBookings().bookings);
    assert.equal(result.totalCalls, 6); assert.equal(result.totalBookings, 6);
    assert.equal(result.statuses.completed, 3); assert.equal(result.finishedCalls, 5);
    assert.equal(result.conversionRate, 20); assert.equal(result.averageDuration, 86);
    assert.deepEqual(result.daily, [{ date: "2026-10-08", calls: 6, bookings: 3 }, { date: "2026-10-09", calls: 0, bookings: 3 }]);
    process.env.NEXT_PUBLIC_USE_MOCK_API = "false";
    assert.equal(getCalls().isDemo, false); assert.equal(getBookings().isDemo, false);
    assert.deepEqual(summarizeAnalytics(getCalls().calls, getBookings().bookings), summarizeAnalytics([], []));
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_API;
    else process.env.NEXT_PUBLIC_USE_MOCK_API = original;
  }
});
