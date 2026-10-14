import assert from "node:assert/strict";
import { test } from "node:test";
import { JWT } from "google-auth-library";
import { cancelAppointment } from "./googleCalendar.js";

test("cancel deletes only the caller's own future booking", async (context) => {
  const names = ["GOOGLE_CALENDAR_CLIENT_EMAIL", "GOOGLE_CALENDAR_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"];
  const original = names.map((name) => process.env[name]);
  context.after(() => names.forEach((name, index) => {
    if (original[index] === undefined) delete process.env[name];
    else process.env[name] = original[index];
  }));
  process.env.GOOGLE_CALENDAR_CLIENT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_CALENDAR_PRIVATE_KEY = "test\nkey";
  process.env.GOOGLE_CALENDAR_ID = "calendar@example.invalid";
  context.mock.method(Date, "now", () => Date.parse("2030-01-15T00:00:00Z"));
  const details = { source: "AI_PHONE_AGENT", customerName: "Туршилт", phone: "99112233", serviceId: "table", serviceName: "Ширээ" };
  const event = {
    id: "booking-1", status: "confirmed", extendedProperties: { private: details },
    start: { dateTime: "2030-01-16T19:00:00+08:00" }, end: { dateTime: "2030-01-16T20:30:00+08:00" },
  };
  const deleted: string[] = [];
  context.mock.method(JWT.prototype, "request", (async (options: Parameters<JWT["request"]>[0]) => {
    if (options.method === "DELETE") {
      deleted.push(String(options.url));
      return { data: "" };
    }
    return { data: { items: [event] } };
  }) as unknown as JWT["request"]);

  // Өөр дугаар эсвэл өөр цаг: цуцлахгүй.
  await assert.rejects(cancelAppointment({ phone: "88001122", startTime: "2030-01-16T19:00:00+08:00" }), /No booking/);
  await assert.rejects(cancelAppointment({ phone: "99112233", startTime: "2030-01-17T19:00:00+08:00" }), /No booking/);
  assert.equal(deleted.length, 0);

  // Өдөр нь таарч, тэр өдөр ганц захиалгатай бол цаг нь зөрсөн ч ("орой") цуцлана.
  assert.deepEqual(await cancelAppointment({ phone: "+97699112233", startTime: "2030-01-16T20:00:00+08:00" }),
    { id: "booking-1", startTime: "2030-01-16T11:00:00.000Z", status: "cancelled" });
  assert.deepEqual(deleted, ["https://www.googleapis.com/calendar/v3/calendars/calendar%40example.invalid/events/booking-1"]);
});
