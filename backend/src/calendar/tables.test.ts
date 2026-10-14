import assert from "node:assert/strict";
import { test } from "node:test";
import { JWT } from "google-auth-library";
import { checkAvailability, tablesFor } from "./googleCalendar.js";

test("with several tables, overlapping bookings share the restaurant until tables run out", async (context) => {
  const names = ["GOOGLE_CALENDAR_CLIENT_EMAIL", "GOOGLE_CALENDAR_PRIVATE_KEY", "GOOGLE_CALENDAR_ID", "TABLE_COUNT", "SEATS_PER_TABLE"];
  const original = names.map((name) => process.env[name]);
  context.after(() => names.forEach((name, index) => {
    if (original[index] === undefined) delete process.env[name];
    else process.env[name] = original[index];
  }));
  process.env.GOOGLE_CALENDAR_CLIENT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = "test\nkey";
  process.env.GOOGLE_CALENDAR_ID = "calendar@example.invalid";
  process.env.TABLE_COUNT = "3";
  process.env.SEATS_PER_TABLE = "4";
  context.mock.method(Date, "now", () => Date.parse("2030-01-15T00:00:00Z"));
  const event = (start: string, end: string, partySize?: string) => ({
    status: "confirmed", start: { dateTime: start }, end: { dateTime: end },
    ...(partySize ? { extendedProperties: { private: { partySize } } } : {}),
  });
  context.mock.method(JWT.prototype, "request", (async (options: Parameters<JWT["request"]>[0]) => {
    assert.match(String(options.url), /\/events$/);
    // 19:00-20:30: 6 хүн (2 ширээ) + хүний тоогүй эвент (1 ширээ) = 3 ширээ дүүрэн. 20:30-аас 1 ширээ.
    return { data: { items: [
      event("2030-01-16T19:00:00+08:00", "2030-01-16T20:30:00+08:00", "6"),
      event("2030-01-16T19:00:00+08:00", "2030-01-16T20:30:00+08:00"),
      event("2030-01-16T20:30:00+08:00", "2030-01-16T22:00:00+08:00", "2"),
      { status: "cancelled", start: { dateTime: "2030-01-16T17:30:00+08:00" }, end: { dateTime: "2030-01-16T19:00:00+08:00" } },
    ] } };
  }) as unknown as JWT["request"]);

  const slots = async (partySize: number) => (await checkAvailability({
    date: "2030-01-16", timeRange: { start: "17:30", end: "22:00" }, durationMinutes: 90, partySize,
  })).slots.map((slot) => slot.startTime);
  // 17:30 сул (цуцлагдсан эвент тооцогдохгүй), 19:00 дүүрэн, 20:30-д 2 ширээ сул.
  assert.deepEqual(await slots(4), ["2030-01-16T09:30:00.000Z", "2030-01-16T12:30:00.000Z"]);
  assert.deepEqual(await slots(8), ["2030-01-16T09:30:00.000Z", "2030-01-16T12:30:00.000Z"]);
  assert.deepEqual(await slots(9), ["2030-01-16T09:30:00.000Z"]);
  assert.deepEqual(await slots(13), []);
  assert.equal(tablesFor(undefined), 1);
  assert.equal(tablesFor(5), 2);
});
