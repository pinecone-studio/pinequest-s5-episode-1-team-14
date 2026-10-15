// Автомат захиалга сануулга: минут тутам ирэх захиалгуудыг шалгаж, сануулах цаг нь болсон
// захиалга руу AI өөрөө залгана. Сануулсан эсэхийг файлд хадгалж, дахин асахад давтан залгахгүй.

import { resolve } from "node:path";
import { CALENDAR_TIME_ZONE, type Booking } from "../calendar/googleCalendar.js";
import { readJsonArray, writeJsonArray } from "../storage/jsonFile.js";

export type ReminderRecord = {
  bookingId: string;
  // Захиалгыг анх харсан мөч: сануулах цаг өнгөрсний дараа үүссэн захиалгад залгахгүй.
  firstSeenAt: string;
  attempts: number;
  lastAttemptAt?: string;
  // Утас дуугарч эхэлсэн (эсвэл гараар сануулсан) мөч — үүнээс хойш дахин залгахгүй.
  calledAt?: string;
};

export type ReminderConfig = { leadMinutes: number; startHour: number; endHour: number; retryMinutes: number; maxAttempts: number };

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const TICK_MS = MINUTE_MS;

// Анхдагчаар захиалгаас 60 минутын өмнө сануулна; REMINDER_LEAD_MINUTES=0 бол унтраалттай.
// REMINDER_HOURS: "9-21" (Улаанбаатарын цаг).
export function reminderConfig(env: NodeJS.ProcessEnv = process.env): ReminderConfig | null {
  const leadMinutes = env.REMINDER_LEAD_MINUTES ? Number(env.REMINDER_LEAD_MINUTES) : 60;
  if (!Number.isFinite(leadMinutes) || leadMinutes <= 0) return null;
  const [startHour, endHour] = (env.REMINDER_HOURS || "9-21").split("-").map(Number);
  const hoursValid = Number.isInteger(startHour) && Number.isInteger(endHour) && startHour >= 0 && endHour <= 24 && startHour < endHour;
  return { leadMinutes, startHour: hoursValid ? startHour : 9, endHour: hoursValid ? endHour : 21, retryMinutes: 10, maxAttempts: 2 };
}

const hourOf = new Intl.DateTimeFormat("en-GB", { timeZone: CALENDAR_TIME_ZONE, hour: "2-digit", hourCycle: "h23" });

// Энэ мөчид аль захиалгууд руу залгахыг шийднэ (цэвэр функц).
export function dueReminders(bookings: readonly Booking[], records: ReadonlyMap<string, ReminderRecord>, now: number, config: ReminderConfig): Booking[] {
  const hour = Number(hourOf.format(now));
  if (hour < config.startHour || hour >= config.endHour) return [];
  return bookings.filter((booking) => {
    const start = Date.parse(booking.startTime);
    const remindAt = start - config.leadMinutes * MINUTE_MS;
    const record = records.get(booking.id);
    if (!record || record.calledAt || now < remindAt || now >= start) return false;
    if (Date.parse(record.firstSeenAt) > remindAt) return false;
    if (record.attempts >= config.maxAttempts) return false;
    return !record.lastAttemptAt || now - Date.parse(record.lastAttemptAt) >= config.retryMinutes * MINUTE_MS;
  });
}

export class ReminderStore {
  constructor(private readonly filePath = resolve(__dirname, "../../data/reminders.json")) {}

  load(): Map<string, ReminderRecord> {
    const records = readJsonArray(this.filePath) as ReminderRecord[];
    return new Map(records.map((record) => [record.bookingId, record]));
  }

  save(records: ReadonlyMap<string, ReminderRecord>): void {
    writeJsonArray(this.filePath, [...records.values()]);
  }

  // Гараар сануулсан үед: автомат шалгагч дахин залгахгүй.
  markCalled(bookingId: string, at = new Date().toISOString()): void {
    const records = this.load();
    const record = records.get(bookingId) ?? { bookingId, firstSeenAt: at, attempts: 0 };
    records.set(bookingId, { ...record, attempts: record.attempts + 1, lastAttemptAt: at, calledAt: at });
    this.save(records);
  }
}

// Захиалгыг анх харсан цагийг тэмдэглэж, хуучирсан бичлэгийг хасна.
export function trackBookings(bookings: readonly Booking[], records: Map<string, ReminderRecord>, now: number): void {
  const listed = new Set(bookings.map((booking) => booking.id));
  for (const booking of bookings) {
    if (!records.has(booking.id) && Date.parse(booking.startTime) > now) {
      records.set(booking.id, { bookingId: booking.id, firstSeenAt: new Date(now).toISOString(), attempts: 0 });
    }
  }
  for (const [id, record] of records) {
    if (!listed.has(id) && now - Date.parse(record.firstSeenAt) > 2 * DAY_MS) records.delete(id);
  }
}

export function startReminderScheduler(deps: {
  config: ReminderConfig;
  list: () => Promise<Booking[]>;
  // Утас дуугарч эхэлбэл true.
  call: (booking: Booking) => Promise<boolean>;
  store?: ReminderStore;
}): () => void {
  const store = deps.store ?? new ReminderStore();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const bookings = await deps.list();
      // Жагсаалт уншиж байх хооронд гараар сануулсан бичлэгийг дарахгүйн тулд дараа нь уншина.
      const now = Date.now();
      const records = store.load();
      trackBookings(bookings, records, now);
      const due = dueReminders(bookings, records, now, deps.config);
      store.save(records);
      for (const booking of due) {
        const latest = store.load();
        const record = latest.get(booking.id);
        if (!record || record.calledAt) continue;
        const at = new Date().toISOString();
        const ok = await deps.call(booking);
        latest.set(booking.id, { ...record, attempts: record.attempts + 1, lastAttemptAt: at, ...(ok ? { calledAt: at } : {}) });
        store.save(latest);
        console.log(`[remind] автомат сануулга …${booking.phone.slice(-2)}: ${ok ? "залгалаа" : "залгаж чадсангүй"}`);
      }
    } catch (error) {
      console.error("[remind] автомат сануулгын алдаа:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref();
  void tick();
  console.log(`[remind] автомат сануулга асаалттай: захиалгаас ${deps.config.leadMinutes} минутын өмнө, ${deps.config.startHour}:00–${deps.config.endHour}:00`);
  return () => clearInterval(timer);
}

export type AfterBookingConfig = { delaySeconds: number; withinMinutes: number };

// Ойрын захиалгад (анхдагч: 30 минутын дотор эхлэх) дуудлага дууссанаас 60 секундын дараа сануулна.
// REMINDER_AFTER_BOOKING_SECONDS=0 бол унтраалттай.
export function afterBookingConfig(env: NodeJS.ProcessEnv = process.env): AfterBookingConfig | null {
  const delaySeconds = env.REMINDER_AFTER_BOOKING_SECONDS ? Number(env.REMINDER_AFTER_BOOKING_SECONDS) : 60;
  const withinMinutes = env.REMINDER_SOON_MINUTES ? Number(env.REMINDER_SOON_MINUTES) : 30;
  if (!Number.isFinite(delaySeconds) || delaySeconds <= 0 || !Number.isFinite(withinMinutes) || withinMinutes <= 0) return null;
  return { delaySeconds, withinMinutes };
}

// Захиалга удахгүй (withinMinutes дотор) эхлэх бол л дуудлагын дараа шууд сануулна.
export function isSoonBooking(booking: Booking, now: number, withinMinutes: number): boolean {
  const start = Date.parse(booking.startTime);
  return start > now && start - now <= withinMinutes * MINUTE_MS;
}

// Захиалга авсан дуудлага дууссанаас хойш delayMs-ийн дараа шууд сануулж залгана.
// Шугам чөлөөлөгдөөгүй (502) бол 30 секундын дараа ганц удаа дахин оролдоно.
export function scheduleAfterBooking(delayMs: number, remind: () => Promise<number>, onCalled: () => void, retryMs = 30_000): void {
  const attempt = (retriesLeft: number, wait: number) => {
    setTimeout(() => {
      remind().then((status) => {
        if (status === 202) onCalled();
        else if (status === 502 && retriesLeft > 0) attempt(retriesLeft - 1, retryMs);
        console.log(`[remind] захиалгын дараах сануулга: ${status === 202 ? "залгалаа" : `залгаж чадсангүй (${status})`}`);
      }).catch((error) => console.error("[remind] захиалгын дараах сануулгын алдаа:", error instanceof Error ? error.message : error));
    }, wait).unref();
  };
  attempt(1, delayMs);
}
