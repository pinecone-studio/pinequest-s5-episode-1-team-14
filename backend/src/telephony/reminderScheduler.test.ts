import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import type { Booking } from "../calendar/googleCalendar.js";
import { afterBookingConfig, dueReminders, isSoonBooking, reminderConfig, ReminderStore, scheduleAfterBooking, trackBookings, type ReminderRecord } from "./reminderScheduler.js";

const MIN = 60_000;
const config = { leadMinutes: 15, startHour: 9, endHour: 21, retryMinutes: 10, maxAttempts: 2 };
// Улаанбаатарын цагаар 12:20-ийн захиалга.
const start = Date.parse("2026-10-20T12:20:00+08:00");

function booking(id = "b1", at = start): Booking {
  return {
    id, calendarEventId: id, customerName: "Бат", phone: "99112233", serviceId: "table", serviceName: "Ширээ",
    startTime: new Date(at).toISOString(), endTime: new Date(at + 60 * MIN).toISOString(), durationMinutes: 60,
    status: "confirmed", source: "AI_PHONE_AGENT",
  };
}

const seen = (firstSeen: number, extra: Partial<ReminderRecord> = {}) =>
  new Map([["b1", { bookingId: "b1", firstSeenAt: new Date(firstSeen).toISOString(), attempts: 0, ...extra }]]);

test("reminders default to an hour before and turn off with 0", () => {
  assert.deepEqual(reminderConfig({}), { ...config, leadMinutes: 60 });
  assert.equal(reminderConfig({ REMINDER_LEAD_MINUTES: "0" }), null);
  assert.equal(reminderConfig({ REMINDER_LEAD_MINUTES: "off" }), null);
  assert.deepEqual(reminderConfig({ REMINDER_LEAD_MINUTES: "120" }), { ...config, leadMinutes: 120 });
  assert.equal(reminderConfig({ REMINDER_LEAD_MINUTES: "15", REMINDER_HOURS: "8-22" })?.endHour, 22);
  assert.equal(reminderConfig({ REMINDER_LEAD_MINUTES: "15", REMINDER_HOURS: "22-8" })?.startHour, 9);
});

test("a booking is called from its reminder time until it starts", () => {
  const records = seen(start - 20 * MIN);
  assert.deepEqual(dueReminders([booking()], records, start - 16 * MIN, config), []);
  assert.equal(dueReminders([booking()], records, start - 15 * MIN, config).length, 1);
  assert.equal(dueReminders([booking()], records, start - 1 * MIN, config).length, 1);
  assert.deepEqual(dueReminders([booking()], records, start, config), []);
});

test("bookings made after the reminder time are not called", () => {
  assert.deepEqual(dueReminders([booking()], seen(start - 10 * MIN), start - 9 * MIN, config), []);
  // Шалгагч хараахан хараагүй захиалга.
  assert.deepEqual(dueReminders([booking()], new Map(), start - 10 * MIN, config), []);
});

test("no calls outside calling hours", () => {
  const late = Date.parse("2026-10-20T21:10:00+08:00");
  const evening = booking("b1", late);
  assert.deepEqual(dueReminders([evening], seen(late - 60 * MIN), late - 5 * MIN, config), []);
  const early = Date.parse("2026-10-20T09:05:00+08:00");
  assert.deepEqual(dueReminders([booking("b1", early)], seen(early - 60 * MIN), early - 10 * MIN, config), []);
});

test("one retry after a failed dial, never after a call went through", () => {
  const now = start - 14 * MIN;
  const failed = { attempts: 1, lastAttemptAt: new Date(start - 15 * MIN).toISOString() };
  assert.deepEqual(dueReminders([booking()], seen(start - 20 * MIN, failed), now, config), []);
  assert.equal(dueReminders([booking()], seen(start - 20 * MIN, failed), start - 5 * MIN, config).length, 1);
  assert.deepEqual(dueReminders([booking()], seen(start - 20 * MIN, { ...failed, attempts: 2 }), start - 3 * MIN, config), []);
  assert.deepEqual(dueReminders([booking()], seen(start - 20 * MIN, { calledAt: failed.lastAttemptAt }), now, config), []);
});

test("new upcoming bookings are tracked and stale records dropped", () => {
  const now = start - 30 * MIN;
  const records = new Map<string, ReminderRecord>([
    ["gone", { bookingId: "gone", firstSeenAt: new Date(now - 3 * 24 * 60 * MIN).toISOString(), attempts: 1 }],
  ]);
  trackBookings([booking("b1"), booking("past", now - 60 * MIN)], records, now);
  assert.deepEqual([...records.keys()], ["b1"]);
  assert.equal(records.get("b1")?.firstSeenAt, new Date(now).toISOString());
});

test("a manual reminder stops the automatic one", () => {
  const dir = mkdtempSync(join(tmpdir(), "reminders-"));
  try {
    const store = new ReminderStore(join(dir, "reminders.json"));
    store.markCalled("b1", new Date(start - 30 * MIN).toISOString());
    const records = store.load();
    assert.equal(records.get("b1")?.attempts, 1);
    assert.deepEqual(dueReminders([booking()], records, start - 10 * MIN, config), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("after a booking call the guest is called back once the delay passes", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  mock.method(console, "log", () => {});
  try {
    const statuses = [502, 202];
    let calls = 0;
    let called = 0;
    scheduleAfterBooking(60_000, async () => { calls++; return statuses.shift() ?? 202; }, () => { called++; });
    mock.timers.tick(59_999);
    assert.equal(calls, 0);
    mock.timers.tick(1);
    await new Promise(setImmediate);
    // Шугам завгүй байсан тул 30 секундын дараа ганц удаа дахин оролдоно.
    assert.deepEqual([calls, called], [1, 0]);
    mock.timers.tick(30_000);
    await new Promise(setImmediate);
    assert.deepEqual([calls, called], [2, 1]);
  } finally {
    mock.timers.reset();
    mock.restoreAll();
  }
});

test("only bookings starting within 30 minutes get a call right after booking", () => {
  assert.deepEqual(afterBookingConfig({}), { delaySeconds: 60, withinMinutes: 30 });
  assert.equal(afterBookingConfig({ REMINDER_AFTER_BOOKING_SECONDS: "0" }), null);
  assert.equal(isSoonBooking(booking(), start - 30 * MIN, 30), true);
  assert.equal(isSoonBooking(booking(), start - 31 * MIN, 30), false);
  assert.equal(isSoonBooking(booking(), start + 1 * MIN, 30), false);
});
