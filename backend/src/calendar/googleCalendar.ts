import { JWT } from "google-auth-library";

export const CALENDAR_TIME_ZONE = "Asia/Ulaanbaatar";
export type AvailabilityRequest = {
  date: string;
  timeRange: { start: string; end: string };
  durationMinutes: number;
};
export type AvailableSlot = { startTime: string; endTime: string };

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
});
let calendarAuth: JWT | undefined;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Expected a calendar data object");
  }
  return value as Record<string, unknown>;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function localParts(time: number): Record<string, string> {
  return Object.fromEntries(clock.formatToParts(time).map(({ type, value }) => [type, value]));
}

function localTime(date: string, time: unknown): number {
  if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new TypeError("Calendar times must use HH:mm (00:00 through 23:59)");
  }
  const nominal = Date.parse(`${date}T${time}:00Z`);
  // Use the IANA timezone offsets around this date, not the server's timezone.
  const offsets = new Set([-1, 0, 1].map((day) =>
    localParts(nominal + day * 86400000).timeZoneName.replace("GMT", "") || "Z"));
  const candidates = [...offsets].map((offset) => Date.parse(`${date}T${time}:00${offset}`))
    .filter((instant) => {
      if (!Number.isFinite(instant)) return false;
      const p = localParts(instant);
      return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === `${date}T${time}`;
    });
  if (candidates.length !== 1) throw new RangeError("Calendar time is nonexistent or ambiguous");
  return candidates[0];
}

function providerTime(value: unknown): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) ||
      !validDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError("Invalid timestamp in Google Calendar response");
  }
  return Date.parse(value);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Google Calendar availability`);
  return value;
}

export async function checkAvailability(input: AvailabilityRequest): Promise<{
  timeZone: typeof CALENDAR_TIME_ZONE;
  slots: AvailableSlot[];
}> {
  const request = record(input);
  if (!validDate(request.date)) throw new TypeError("Calendar date must be a valid YYYY-MM-DD");
  const range = record(request.timeRange);
  const start = localTime(request.date, range.start);
  const end = localTime(request.date, range.end);
  const duration = request.durationMinutes;
  if (end <= start) throw new RangeError("Calendar time range must end after it starts on the same date");
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
    throw new RangeError("Service duration must be an integer from 1 to 1440 minutes");
  }

  const email = requiredEnv("GOOGLE_CALENDAR_CLIENT_EMAIL");
  const key = requiredEnv("GOOGLE_CALENDAR_PRIVATE_KEY").replace(/\\n/g, "\n");
  const calendarId = requiredEnv("GOOGLE_CALENDAR_ID");
  if (!calendarAuth || calendarAuth.email !== email || calendarAuth.key !== key) {
    calendarAuth = new JWT({
      email, key, scopes: ["https://www.googleapis.com/auth/calendar.events.freebusy"],
      transporterOptions: { timeout: 10000, retry: false },
    });
  }
  let data: unknown;
  try {
    const response = await calendarAuth.request<unknown>({
      url: "https://www.googleapis.com/calendar/v3/freeBusy", method: "POST",
      timeout: 10000, retry: false,
      data: {
        timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(),
        timeZone: CALENDAR_TIME_ZONE, items: [{ id: calendarId }],
      },
    });
    data = response.data;
  } catch {
    // SDK errors can contain request headers/tokens; never expose them to callers.
    throw new Error("Google Calendar availability request failed");
  }

  const response = record(data);
  if (providerTime(response.timeMin) !== start || providerTime(response.timeMax) !== end) {
    throw new Error("Google Calendar returned a different time range");
  }
  const calendar = record(record(response.calendars)[calendarId]);
  if (calendar.errors !== undefined && (!Array.isArray(calendar.errors) || calendar.errors.length)) {
    throw new Error("Google Calendar could not determine availability for this calendar");
  }
  if (!Array.isArray(calendar.busy)) throw new TypeError("Google Calendar response is missing busy intervals");
  const busy = (calendar.busy as unknown[]).map((value) => {
    const interval = record(value);
    const from = providerTime(interval.start);
    const to = providerTime(interval.end);
    if (to <= from) throw new TypeError("Invalid busy interval in Google Calendar response");
    return { from, to };
  });

  const slots: AvailableSlot[] = [];
  const length = duration * 60000;
  const now = Date.now();
  // ponytail: one-day, duration-sized grid from the requested start; add a
  // separate slot step only when a business needs different appointment cadence.
  for (let time = start; time + length <= end; time += length) {
    if (time >= now && !busy.some(({ from, to }) => time < to && time + length > from)) {
      slots.push({ startTime: new Date(time).toISOString(), endTime: new Date(time + length).toISOString() });
    }
  }
  return { timeZone: CALENDAR_TIME_ZONE, slots };
}

export function bookAppointment(): void {
  throw new Error("not implemented");
}
