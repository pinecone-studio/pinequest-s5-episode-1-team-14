// Захиалга сануулах дуудлага: AI зочин руу залгаж, захиалгаа ирэх эсэхийг баталгаажуулна.

import { CALENDAR_TIME_ZONE, type Booking } from "../calendar/googleCalendar.js";

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeOfDay = new Intl.DateTimeFormat("en-GB", { timeZone: CALENDAR_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Ярианд: "өнөөдөр 20:30", "маргааш 19:00", "10 сарын 16-нд 19:00".
export function spokenTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const day = dayKey.format(at);
  const time = timeOfDay.format(at);
  if (day === dayKey.format(now)) return `өнөөдөр ${time}`;
  if (day === dayKey.format(new Date(now.getTime() + 86_400_000))) return `маргааш ${time}`;
  const [, month, date] = day.split("-").map(Number);
  return `${month} сарын ${date}-нд ${time}`;
}

// Загварт өгөх Улаанбаатарын цагийн ISO: 2026-10-14T20:30:00+08:00.
export function localIso(iso: string): string {
  return `${dayKey.format(new Date(iso))}T${timeOfDay.format(new Date(iso))}:00+08:00`;
}

export function reminderGreeting(booking: Booking, now = new Date()): string {
  return `Сайн байна уу, ${booking.customerName}? Би рестораны AI туслах байна. Таны ${spokenTime(booking.startTime, now)} цагийн ширээ захиалгыг сануулах гэж залгалаа. Та ирэх хэвээр үү?`;
}

export function reminderInstruction(booking: Booking, now = new Date()): string {
  return `Энэ дуудлагыг чи өөрөө захиалга сануулахаар хийсэн (зочин залгаагүй).
Захиалга: ${booking.customerName}, ${spokenTime(booking.startTime, now)} цагт, ${booking.durationMinutes} минут.
- Зочин ирнэ гэвэл талархаад, хүлээж байна гэж хэлээд товч баяртай гэ.
- Ирэхгүй, цуцлах гэвэл "Захиалгаа цуцлах уу?" гэж баталгаажуулаад cancel_appointment-ийг
  startTime "${localIso(booking.startTime)}"-ээр дууд. Амжилттай бол цуцлагдлаа гэж хэлээд баяртай гэ.
- Цагаа өөрчлөх гэвэл шинэ цагийг check_availability-аар шалгаад create_appointment-аар захиал;
  дараа нь хуучныг cancel_appointment-аар цуцал.`;
}
