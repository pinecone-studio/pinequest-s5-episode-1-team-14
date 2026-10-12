import assert from "node:assert/strict";
import { test } from "node:test";
import { JWT } from "google-auth-library";
import { listBookings } from "./googleCalendar.js";

test("booking list reads AI-created events read-only, skips malformed ones and caches briefly", async (context) => {
  const names = ["GOOGLE_CALENDAR_CLIENT_EMAIL", "GOOGLE_CALENDAR_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"];
  const original = names.map((name) => process.env[name]);
  context.after(() => names.forEach((name, index) => {
    if (original[index] === undefined) delete process.env[name];
    else process.env[name] = original[index];
  }));
  process.env.GOOGLE_CALENDAR_CLIENT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = "test\nkey";
  process.env.GOOGLE_CALENDAR_ID = "calendar@example.invalid";
  let now = Date.parse("2030-01-15T00:00:00Z");
  context.mock.method(Date, "now", () => now);
  const details = { source: "AI_PHONE_AGENT", customerName: "Туршилт", phone: "99112233", serviceId: "table", serviceName: "Ширээ" };
  const event = {
    id: "booking-1", status: "confirmed", extendedProperties: { private: details },
    start: { dateTime: "2030-01-16T19:00:00+08:00" }, end: { dateTime: "2030-01-16T20:30:00+08:00" },
  };
  let failure = false;
  const http = context.mock.method(JWT.prototype, "request", (async function (
    this: JWT, options: Parameters<JWT["request"]>[0],
  ) {
    assert.deepEqual(this.scopes, ["https://www.googleapis.com/auth/calendar.events.readonly"]);
    assert.equal(options.url, "https://www.googleapis.com/calendar/v3/calendars/calendar%40example.invalid/events");
    assert.equal(options.method, "GET");
    assert.deepEqual(options.params, {
      privateExtendedProperty: "source=AI_PHONE_AGENT", singleEvents: true, orderBy: "startTime", maxResults: 250,
      timeMin: new Date(now - 30 * 86400000).toISOString(),
    });
    if (failure) throw new Error("secret token in provider error");
    // Хоёр дахь нь хүн гараар зассан (утасгүй), гурав дахь нь цуцлагдсан — хоёулаа алгасагдана.
    return { data: { items: [event, { ...event, id: "edited", extendedProperties: { private: { ...details, phone: "" } } }, { ...event, id: "gone", status: "cancelled" }] } };
  }) as unknown as JWT["request"]);

  const expected = [{
    id: "booking-1", calendarEventId: "booking-1", customerName: "Туршилт", phone: "99112233", serviceId: "table", serviceName: "Ширээ",
    startTime: "2030-01-16T11:00:00.000Z", endTime: "2030-01-16T12:30:00.000Z", durationMinutes: 90, status: "confirmed", source: "AI_PHONE_AGENT",
  }];
  assert.deepEqual(await listBookings(), expected);
  now += 14000;
  assert.deepEqual(await listBookings(), expected);
  assert.equal(http.mock.callCount(), 1);
  now += 2000;
  await listBookings();
  assert.equal(http.mock.callCount(), 2);

  // Алдаа кэшлэгдэхгүй, мөн provider-ийн дэлгэрэнгүй мэдээлэл гадагш гарахгүй.
  now += 16000;
  failure = true;
  await assert.rejects(listBookings(), (error: Error) => error.message === "Google Calendar booking list request failed");
  failure = false;
  assert.deepEqual(await listBookings(), expected);
  assert.equal(http.mock.callCount(), 4);
});
