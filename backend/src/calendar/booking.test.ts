import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { JWT } from "google-auth-library";
import { createAppointment, type AppointmentRequest } from "./googleCalendar.js";

test("Bookings recheck availability, validate confirmed events and recover retries without duplicates", async (context) => {
  const names = ["GOOGLE_CALENDAR_CLIENT_EMAIL", "GOOGLE_CALENDAR_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"];
  const original = names.map((name) => process.env[name]);
  context.after(() => names.forEach((name, index) => {
    if (original[index] === undefined) delete process.env[name];
    else process.env[name] = original[index];
  }));
  process.env.GOOGLE_CALENDAR_CLIENT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = "test\\nkey";
  const calendarId = "calendar+test@example.invalid";
  process.env.GOOGLE_CALENDAR_ID = calendarId;
  let now = Date.parse("2030-01-15T00:00:00Z");
  context.mock.method(Date, "now", () => now);
  const request: AppointmentRequest = {
    requestId: "call-1-confirmation-1", customerName: "Бат", phone: "+97699112233",
    serviceId: "consultation", serviceName: "Зөвлөгөө", startTime: "2030-01-15T09:00:00+08:00", durationMinutes: 30,
  };
  type Event = {
    id: string; summary: string; description: string; start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string }; status: string; transparency: string; visibility: string;
    extendedProperties: { private: Record<string, string> };
  };
  const events = new Map<string, Event>();
  const calls: string[] = [];
  let inserts = 0;
  let busy = false;
  let mode = "normal";
  let getOverride: { data: unknown } | undefined;
  const failure = (status: number) => Object.assign(new Error("secret SDK token"), { response: { status } });
  context.mock.method(JWT.prototype, "request", (async function (
    this: JWT, options: Parameters<JWT["request"]>[0],
  ) {
    assert.equal(this.key, "test\nkey");
    assert.equal(options.timeout, 10000);
    assert.equal(options.retry, false);
    assert.equal(this.transporter.defaults.timeout, 10000);
    if (options.url === "https://www.googleapis.com/calendar/v3/freeBusy") {
      calls.push("freebusy");
      assert.deepEqual(this.scopes, ["https://www.googleapis.com/auth/calendar.events.freebusy"]);
      const query = options.data as { timeMin: string; timeMax: string; timeZone: string; items: { id: string }[] };
      assert.equal(options.method, "POST");
      assert.equal(query.timeZone, "Asia/Ulaanbaatar");
      assert.deepEqual(query.items, [{ id: calendarId }]);
      if (mode === "availability-failure") throw failure(503);
      if (mode === "clock-advanced") now = Date.parse(query.timeMin);
      return { data: {
        timeMin: query.timeMin, timeMax: query.timeMax,
        calendars: { [calendarId]: { busy: busy ? [{ start: query.timeMin, end: query.timeMax }] :
          [...events.values()].map((event) => ({ start: event.start.dateTime, end: event.end.dateTime })) } },
      } };
    }
    assert.deepEqual(this.scopes, ["https://www.googleapis.com/auth/calendar.events"]);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    if (options.method === "GET") {
      calls.push("get");
      assert.ok(String(options.url).startsWith(`${url}/`));
      if (mode === "lookup-failure") throw failure(403);
      if (getOverride) return getOverride;
      const found = events.get(String(options.url).slice(url.length + 1));
      if (!found) throw failure(404);
      return { data: structuredClone(found) };
    }
    calls.push("insert");
    assert.equal(options.method, "POST");
    assert.equal(options.url, url);
    const event = structuredClone(options.data) as Event;
    assert.match(event.id, /^[0-9a-v]{64}$/);
    assert.equal(event.start.timeZone, "Asia/Ulaanbaatar");
    assert.equal(event.end.timeZone, "Asia/Ulaanbaatar");
    assert.equal(event.visibility, "private");
    assert.equal(event.transparency, "opaque");
    assert.equal(event.status, "confirmed");
    assert.equal(event.extendedProperties.private.source, "AI_PHONE_AGENT");
    assert.ok(!("attendees" in event));
    inserts++;
    if (mode === "insert-failure") throw failure(503);
    events.set(event.id, event);
    if (mode === "timeout-after-insert") throw failure(504);
    if (mode === "conflict-after-insert") throw failure(409);
    if (mode === "malformed-insert") return { data: { id: event.id } };
    return { data: event };
  }) as unknown as JWT["request"]);

  const booking = await createAppointment(request);
  assert.deepEqual(calls, ["get", "freebusy", "insert"]);
  assert.deepEqual(booking, {
    id: createHash("sha256").update(request.requestId).digest("hex"),
    calendarEventId: booking.id, customerName: "Бат", phone: "+97699112233",
    serviceId: "consultation", serviceName: "Зөвлөгөө", startTime: "2030-01-15T01:00:00.000Z",
    endTime: "2030-01-15T01:30:00.000Z", durationMinutes: 30, status: "confirmed", source: "AI_PHONE_AGENT",
  });
  assert.equal(events.get(booking.id)?.description, "Phone: +97699112233");
  assert.deepEqual(await createAppointment({ ...request, startTime: booking.startTime }), booking);
  assert.equal(inserts, 1, "same request ID reads back its original event");
  assert.equal(calls.at(-1), "get");
  await assert.rejects(createAppointment({ ...request, customerName: "Өөр хүн" }), /does not match/);
  await assert.rejects(createAppointment({ ...request, requestId: "overlapping" }), /unavailable/);
  assert.equal(inserts, 1);

  const callCount = calls.length;
  for (const invalid of [
    null, {}, { ...request, requestId: " " }, { ...request, customerName: "a\nb" },
    { ...request, serviceId: "" }, { ...request, serviceName: "x".repeat(201) }, { ...request, phone: "bad" },
    { ...request, startTime: "2030-02-30T09:00:00+08:00" }, { ...request, startTime: "2030-01-15T09:00:00" },
    { ...request, startTime: "2030-01-15T09:00:01Z" }, { ...request, startTime: "2030-01-15T23:45:00+08:00" },
    ...[0, -1, 1.5, NaN, 1441, "30"].map((durationMinutes) => ({ ...request, durationMinutes })),
  ]) await assert.rejects(createAppointment(invalid as AppointmentRequest));
  for (const name of names) {
    const value = process.env[name];
    delete process.env[name];
    await assert.rejects(createAppointment(request), new RegExp(name));
    process.env[name] = value;
  }
  assert.equal(calls.length, callCount, "invalid requests and configuration never call Google");

  const stored = events.get(booking.id)!;
  for (const data of [
    undefined, null, {}, { ...stored, id: "wrong" }, { ...stored, status: "cancelled" },
    { ...stored, transparency: "transparent" }, { ...stored, start: { dateTime: "2030-01-15T02:00:00Z" } },
    { ...stored, extendedProperties: { private: { source: "another-app" } } },
  ]) {
    getOverride = { data };
    await assert.rejects(createAppointment(request));
  }
  getOverride = undefined;
  assert.equal(inserts, 1, "malformed/conflicting existing events must never cause an insert");
  events.clear();
  for (const scenario of ["lookup-failure", "availability-failure", "insert-failure", "clock-advanced", "malformed-insert"]) {
    mode = scenario;
    const before: number = inserts;
    await assert.rejects(createAppointment({ ...request, requestId: scenario }), (error: Error) => !error.message.includes("secret"));
    assert.equal(inserts - before, scenario === "insert-failure" || scenario === "malformed-insert" ? 1 : 0);
    events.clear();
    now = Date.parse("2030-01-15T00:00:00Z");
  }
  mode = "normal";
  busy = true;
  const beforeBusy = inserts;
  await assert.rejects(createAppointment(request), /unavailable/);
  busy = false;
  await assert.rejects(createAppointment({ ...request, startTime: "2030-01-14T09:00:00+08:00" }), /unavailable/);
  assert.equal(inserts, beforeBusy);

  for (const scenario of ["timeout-after-insert", "conflict-after-insert"]) {
    mode = scenario;
    const before: number = inserts;
    const recovered = await createAppointment({ ...request, requestId: scenario });
    assert.equal(recovered.status, "confirmed");
    assert.equal(inserts, before + 1);
    assert.deepEqual(calls.slice(-4), ["get", "freebusy", "insert", "get"]);
    assert.deepEqual(await createAppointment({ ...request, requestId: scenario }), recovered);
    assert.equal(inserts, before + 1);
    events.clear();
  }
  mode = "normal";
  const beforeConcurrent = inserts;
  const results = await Promise.allSettled([
    createAppointment({ ...request, requestId: "concurrent-a" }),
    createAppointment({ ...request, requestId: "concurrent-b", startTime: "2030-01-15T09:15:00+08:00" }),
  ]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected"]);
  assert.equal(inserts, beforeConcurrent + 1, "serialize overlapping bookings within this process");
  const adjacent = await createAppointment({ ...request, requestId: "adjacent", startTime: "2030-01-15T09:30:00+08:00" });
  assert.equal(adjacent.status, "confirmed", "queue recovers after rejection; touching bookings remain valid");
});
