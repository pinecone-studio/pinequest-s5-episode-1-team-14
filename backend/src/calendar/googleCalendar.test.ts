import assert from "node:assert/strict";
import { test } from "node:test";
import { JWT } from "google-auth-library";
import { CALENDAR_TIME_ZONE, checkAvailability, type AvailabilityRequest } from "./googleCalendar.js";

test("Calendar availability queries Google read-only, validates responses and excludes conflicts", async (context) => {
  const names = ["GOOGLE_CALENDAR_CLIENT_EMAIL", "GOOGLE_CALENDAR_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"];
  const original = names.map((name) => process.env[name]);
  context.after(() => names.forEach((name, index) => {
    if (original[index] === undefined) delete process.env[name];
    else process.env[name] = original[index];
  }));
  process.env.GOOGLE_CALENDAR_CLIENT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = "test\\nkey";
  process.env.GOOGLE_CALENDAR_ID = "calendar@example.invalid";
  let now = Date.parse("2030-01-15T00:30:00Z");
  context.mock.method(Date, "now", () => now);
  const request: AvailabilityRequest = {
    date: "2030-01-15", timeRange: { start: "09:00", end: "12:00" }, durationMinutes: 30,
  };
  const empty = {
    timeMin: "2030-01-15T09:00:00+08:00", timeMax: "2030-01-15T12:00:00+08:00",
    calendars: { "calendar@example.invalid": { busy: [] } },
  };
  let response: unknown = empty;
  let expectedWindow = { timeMin: "2030-01-15T01:00:00.000Z", timeMax: "2030-01-15T04:00:00.000Z" };
  let failure = false;
  const clients: JWT[] = [];
  const http = context.mock.method(JWT.prototype, "request", (async function (
    this: JWT, options: Parameters<JWT["request"]>[0],
  ) {
    clients.push(this);
    assert.equal(this.key, "test\nkey");
    assert.deepEqual(this.scopes, ["https://www.googleapis.com/auth/calendar.events.freebusy"]);
    assert.equal(this.transporter.defaults.timeout, 10000);
    assert.equal(options.url, "https://www.googleapis.com/calendar/v3/freeBusy");
    assert.equal(options.method, "POST");
    assert.equal(options.timeout, 10000);
    assert.equal(options.retry, false);
    assert.deepEqual(options.data, {
      ...expectedWindow,
      timeZone: CALENDAR_TIME_ZONE, items: [{ id: "calendar@example.invalid" }],
    });
    if (failure) throw new Error("secret token in provider error");
    return { data: response };
  }) as unknown as JWT["request"]);

  const free = await checkAvailability(request);
  assert.equal(free.timeZone, "Asia/Ulaanbaatar");
  assert.equal(free.slots.length, 6);
  assert.deepEqual(free.slots[0], { startTime: "2030-01-15T01:00:00.000Z", endTime: "2030-01-15T01:30:00.000Z" });
  assert.equal(free.slots.at(-1)?.endTime, "2030-01-15T04:00:00.000Z");
  const withBusy = (busy: unknown[]) => ({ ...empty, calendars: { "calendar@example.invalid": { busy } } });
  response = withBusy([
    { start: "2030-01-15T02:00:00Z", end: "2030-01-15T02:30:00Z" },
    { start: "2030-01-15T09:30:00+08:00", end: "2030-01-15T10:15:00+08:00" },
    { start: "2030-01-14T23:00:00Z", end: "2030-01-15T01:00:00Z" },
    { start: "2030-01-15T04:00:00Z", end: "2030-01-15T05:00:00Z" },
  ]);
  assert.deepEqual((await checkAvailability(request)).slots, [free.slots[0], ...free.slots.slice(3)]);
  assert.equal(clients[0], clients[1], "reuse the SDK client for its token cache");
  response = withBusy([{ start: "2030-01-15T01:29:59Z", end: "2030-01-15T01:30:01Z" }]);
  assert.deepEqual((await checkAvailability(request)).slots, free.slots.slice(2));
  response = withBusy([{ start: "2030-01-14T16:00:00Z", end: "2030-01-15T16:00:00Z" }]);
  assert.deepEqual((await checkAvailability(request)).slots, []);
  response = empty;
  now = Date.parse("2030-01-15T01:10:00Z");
  assert.deepEqual((await checkAvailability(request)).slots, free.slots.slice(1));
  assert.deepEqual((await checkAvailability({ ...request, durationMinutes: 240 })).slots, []);

  const calls = http.mock.callCount();
  const invalid: unknown[] = [
    null, {}, { ...request, date: "2030-02-30" }, { ...request, date: "2030-2-01" },
    { ...request, timeRange: { start: "24:00", end: "12:00" } },
    { ...request, timeRange: { start: "9:00", end: "12:00" } },
    { ...request, timeRange: { start: "12:00", end: "09:00" } },
    { ...request, timeRange: { start: "09:00", end: "09:00" } },
    // Ulaanbaatar's historical DST gap and repeated hour must not map silently.
    { ...request, date: "2016-03-26", timeRange: { start: "02:30", end: "03:30" } },
    { ...request, date: "2016-09-23", timeRange: { start: "23:30", end: "23:59" } },
    ...[0, -1, NaN, Infinity, 1.5, 1441, "30"].map((durationMinutes) => ({ ...request, durationMinutes })),
  ];
  for (const input of invalid) await assert.rejects(checkAvailability(input as AvailabilityRequest));
  assert.equal(http.mock.callCount(), calls, "reject bad requests before authentication/network access");
  for (const name of names) {
    const value = process.env[name];
    delete process.env[name];
    await assert.rejects(checkAvailability(request), new RegExp(name));
    process.env[name] = value;
  }
  assert.equal(http.mock.callCount(), calls);

  for (const broken of [
    null, {}, { ...empty, timeMax: "2030-01-15T03:00:00Z" },
    { ...empty, calendars: {} }, { ...empty, calendars: { "calendar@example.invalid": {} } },
    { ...empty, calendars: { "calendar@example.invalid": { errors: [{ reason: "notFound" }], busy: [] } } },
    withBusy([{ start: "2030-01-15T01:00:00", end: "2030-01-15T02:00:00Z" }]),
    withBusy([{ start: "2030-02-30T01:00:00Z", end: "2030-03-03T01:00:00Z" }]),
    withBusy([{ start: "2030-01-15T02:00:00Z", end: "2030-01-15T01:00:00Z" }]),
  ]) {
    response = broken;
    await assert.rejects(checkAvailability(request));
  }
  failure = true;
  await assert.rejects(checkAvailability(request), (error: Error) =>
    error.message === "Google Calendar availability request failed" && !error.message.includes("secret"));

  failure = false;
  now = Date.parse("2028-02-28T00:00:00Z");
  expectedWindow = { timeMin: "2028-02-28T16:30:00.000Z", timeMax: "2028-02-28T17:30:00.000Z" };
  response = { ...expectedWindow, calendars: empty.calendars };
  const leapDay = await checkAvailability({
    date: "2028-02-29", timeRange: { start: "00:30", end: "01:30" }, durationMinutes: 30,
  });
  assert.equal(leapDay.slots.length, 2);
  assert.equal(leapDay.slots[0].startTime, expectedWindow.timeMin);
  assert.equal(leapDay.slots.at(-1)?.endTime, expectedWindow.timeMax);
});
