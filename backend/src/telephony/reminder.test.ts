import assert from "node:assert/strict";
import { test } from "node:test";
import type { Booking } from "../calendar/googleCalendar.js";
import { localIso, reminderGreeting, spokenTime } from "./reminder.js";

test("reminder speaks the booking time in Ulaanbaatar time", () => {
  const now = new Date("2026-10-14T02:00:00.000Z"); // УБ 10:00
  assert.equal(spokenTime("2026-10-14T12:30:00.000Z", now), "өнөөдөр 20:30");
  assert.equal(spokenTime("2026-10-15T11:00:00.000Z", now), "маргааш 19:00");
  assert.equal(spokenTime("2026-10-16T11:00:00.000Z", now), "10 сарын 16-нд 19:00");
  const booking = { customerName: "Болд", startTime: "2026-10-14T12:30:00.000Z" } as Booking;
  assert.equal(reminderGreeting(booking, now, "Тал Нутаг"), "Сайн байна уу, Болд мөн үү? Тал Нутгаас холбогдож байна. Таны өнөөдөр 20:30 цагийн ширээ захиалгыг сануулах гэж залгалаа. Та ирэх хэвээрээ юу?");
});

test("reminder gives the model the booking time with the Ulaanbaatar offset", () => {
  assert.equal(localIso("2026-10-14T12:30:00.000Z"), "2026-10-14T20:30:00+08:00");
});
