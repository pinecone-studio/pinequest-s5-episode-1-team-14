import { createHash } from "node:crypto";
import { JWT } from "google-auth-library";

export const CALENDAR_TIME_ZONE = "Asia/Ulaanbaatar";
export type AvailabilityRequest = {
  date: string;
  timeRange: { start: string; end: string };
  durationMinutes: number;
};
export type AvailableSlot = { startTime: string; endTime: string };

// Ширээний тоо: нэг цагт хэдэн захиалга зэрэг авах. 1 бол календарийн аливаа эвент тэр цагийг бүхэлд нь хаана
// (анхны горим). 1-ээс их бол захиалга бүр хүний тоогоороо ширээ эзэлж, нийт ширээ дүүртэл захиалга авна.
const tableCount = () => Math.max(1, Math.floor(Number(process.env.TABLE_COUNT) || 1));
const seatsPerTable = () => Math.max(1, Math.floor(Number(process.env.SEATS_PER_TABLE) || 4));
export const tablesFor = (partySize?: number) => Math.max(1, Math.ceil((partySize ?? 1) / seatsPerTable()));

function partySizeOf(value: unknown): number | undefined {
  const size = Number(value);
  return Number.isInteger(size) && size >= 1 && size <= 100 ? size : undefined;
}

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
});
const calendarClients = new Map<string, JWT>();
let bookingQueue = Promise.resolve();

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
    throw new TypeError("Calendar timestamp must be a valid RFC3339 timestamp with an offset");
  }
  return Date.parse(value);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Google Calendar`);
  return value;
}

function serviceDuration(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1440) {
    throw new RangeError("Service duration must be an integer from 1 to 1440 minutes");
  }
  return value;
}

function calendarClient(access: "freebusy" | "readonly" | "write" = "freebusy"): { auth: JWT; calendarId: string } {
  const email = requiredEnv("GOOGLE_CALENDAR_CLIENT_EMAIL");
  const key = requiredEnv("GOOGLE_CALENDAR_PRIVATE_KEY").replace(/\\n/g, "\n");
  const calendarId = requiredEnv("GOOGLE_CALENDAR_ID");
  const scope = `https://www.googleapis.com/auth/calendar.events${access === "write" ? "" : `.${access}`}`;
  let auth = calendarClients.get(scope);
  if (!auth || auth.email !== email || auth.key !== key) {
    auth = new JWT({ email, key, scopes: [scope], transporterOptions: { timeout: 10000, retry: false } });
    calendarClients.set(scope, auth);
  }
  return { auth, calendarId };
}

// Энэ хугацаанд давхцах эвентүүд, тус бүр хэдэн ширээ эзэлж буйгаар (ширээгээр тооцох горимд).
async function tableLoad(start: number, end: number): Promise<{ from: number; to: number; weight: number }[]> {
  const { auth, calendarId } = calendarClient("readonly");
  let items: unknown;
  try {
    items = record((await auth.request<unknown>({
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      method: "GET", timeout: 10000, retry: false,
      params: { singleEvents: true, maxResults: 250, timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() },
    })).data).items;
  } catch {
    throw new Error("Google Calendar availability request failed");
  }
  if (!Array.isArray(items)) throw new TypeError("Google Calendar response is missing events");
  return items.flatMap((value) => {
    const event = record(value);
    if (event.status === "cancelled" || event.transparency === "transparent") return [];
    try {
      const from = providerTime(record(event.start).dateTime);
      const to = providerTime(record(event.end).dateTime);
      const metadata = (record(event.extendedProperties ?? {}).private ?? {}) as Record<string, unknown>;
      // Хүний тоогүй (гараар нэмсэн, хуучин) эвент нэг ширээ эзэлнэ.
      return to > from ? [{ from, to, weight: tablesFor(partySizeOf(metadata.partySize)) }] : [];
    } catch {
      return []; // Бүтэн өдрийн эвент (dateTime-гүй) ширээ эзлэхгүй.
    }
  });
}

export async function checkAvailability(input: AvailabilityRequest & { partySize?: number }): Promise<{
  timeZone: typeof CALENDAR_TIME_ZONE;
  slots: AvailableSlot[];
}> {
  const request = record(input);
  if (!validDate(request.date)) throw new TypeError("Calendar date must be a valid YYYY-MM-DD");
  const range = record(request.timeRange);
  const start = localTime(request.date, range.start);
  const end = localTime(request.date, range.end);
  const duration = serviceDuration(request.durationMinutes);
  if (end <= start) throw new RangeError("Calendar time range must end after it starts on the same date");
  const capacity = tableCount();
  const need = capacity > 1 ? tablesFor(partySizeOf(request.partySize)) : 1;
  const busy = capacity > 1 ? await tableLoad(start, end) : await freeBusy(start, end);
  if (need > capacity) return { timeZone: CALENDAR_TIME_ZONE, slots: [] };

  const slots: AvailableSlot[] = [];
  const length = duration * 60000;
  const now = Date.now();
  // ponytail: one-day, duration-sized grid from the requested start; add a
  // separate slot step only when a business needs different appointment cadence.
  for (let time = start; time + length <= end; time += length) {
    const load = busy.filter(({ from, to }) => time < to && time + length > from).reduce((sum, { weight }) => sum + weight, 0);
    if (time >= now && load + need <= capacity) {
      slots.push({ startTime: new Date(time).toISOString(), endTime: new Date(time + length).toISOString() });
    }
  }
  return { timeZone: CALENDAR_TIME_ZONE, slots };
}

// Анхны горим: календарь дахь аливаа завгүй хугацаа тэр цагийг бүхэлд нь хаана.
async function freeBusy(start: number, end: number): Promise<{ from: number; to: number; weight: number }[]> {
  const { auth, calendarId } = calendarClient();
  let data: unknown;
  try {
    const response = await auth.request<unknown>({
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
    return { from, to, weight: Infinity };
  });
  return busy;
}

export type AppointmentRequest = {
  requestId: string;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  startTime: string;
  durationMinutes: number;
  // Хүний тоо: ширээгээр тооцох горимд хэдэн ширээ эзлэхийг тодорхойлно.
  partySize?: number;
};
export type Booking = Omit<AppointmentRequest, "requestId"> & {
  id: string;
  calendarEventId: string;
  endTime: string;
  status: "confirmed";
  source: "AI_PHONE_AGENT";
};

function bookingText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || /[\p{Cc}]/u.test(value)) {
    throw new TypeError(`${field} must be non-empty text, at most 200 characters, without control characters`);
  }
  return value.trim();
}

export async function createAppointment(input: AppointmentRequest): Promise<Booking> {
  const request = record(input);
  const requestId = bookingText(request.requestId, "requestId");
  const properties = {
    source: "AI_PHONE_AGENT" as const,
    customerName: bookingText(request.customerName, "customerName"),
    phone: bookingText(request.phone, "phone"),
    serviceId: bookingText(request.serviceId, "serviceId"),
    serviceName: bookingText(request.serviceName, "serviceName"),
  };
  if (!/^(?:\d{8}|\+[1-9]\d{7,14})$/.test(properties.phone)) {
    throw new TypeError("phone must be 8 local digits or an international number with + and 8-15 digits");
  }
  const durationMinutes = serviceDuration(request.durationMinutes);
  const start = providerTime(request.startTime);
  if (start % 60000 !== 0) throw new RangeError("Appointment start must align to a whole minute");
  const end = start + durationMinutes * 60000;
  const from = localParts(start);
  const to = localParts(end);
  const date = `${from.year}-${from.month}-${from.day}`;
  if (date !== `${to.year}-${to.month}-${to.day}`) throw new RangeError("Appointment must end on the same local date");
  const timeRange = { start: `${from.hour}:${from.minute}`, end: `${to.hour}:${to.minute}` };
  // Reuse availability's validation, including historical ambiguous local times.
  if (localTime(date, timeRange.start) !== start || localTime(date, timeRange.end) !== end) {
    throw new RangeError("Invalid appointment time range");
  }
  const id = createHash("sha256").update(requestId).digest("hex");
  // Календарьт хүний тоо текстээр, захиалгын объектод тоогоор хадгалагдана.
  const party = partySizeOf(request.partySize);
  const stored: Record<string, string> = { ...properties, ...(party ? { partySize: String(party) } : {}) };
  const booking: Booking = {
    ...properties, ...(party ? { partySize: party } : {}), id, calendarEventId: id, startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(), durationMinutes, status: "confirmed",
  };
  const { auth, calendarId } = calendarClient("write");
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const verify = (value: unknown): Booking => {
    const event = record(value);
    const metadata = record(record(event.extendedProperties).private);
    if (event.id !== id || event.status !== "confirmed" || event.transparency === "transparent" ||
        providerTime(record(event.start).dateTime) !== start || providerTime(record(event.end).dateTime) !== end ||
        Object.entries(stored).some(([key, value]) => metadata[key] !== value)) {
      throw new Error("Calendar event does not match the confirmed booking request; verify it manually");
    }
    return booking;
  };
  const existing = async (): Promise<{ data: unknown } | undefined> => {
    try {
      return await auth.request<unknown>({ url: `${url}/${id}`, method: "GET", timeout: 10000, retry: false });
    } catch (error) {
      if ((error as { response?: { status?: number } } | null)?.response?.status === 404) return undefined;
      throw new Error("Google Calendar booking lookup failed");
    }
  };
  // ponytail: serialize one backend process; multiple replicas need a shared lock.
  // External Calendar writers can still race Google's non-atomic check/insert.
  const result = bookingQueue.then(async () => {
    const previous = await existing();
    if (previous !== undefined) return verify(previous.data);
    const available = await checkAvailability({ date, timeRange, durationMinutes, partySize: partySizeOf(request.partySize) });
    if (!available.slots.some((slot) => slot.startTime === booking.startTime && slot.endTime === booking.endTime) ||
        start <= Date.now()) throw new Error("Appointment time is unavailable or in the past");
    let event: unknown;
    try {
      event = (await auth.request<unknown>({
        url, method: "POST", timeout: 10000, retry: false,
        data: {
          id, summary: `${properties.serviceName} - ${properties.customerName}`, description: `Phone: ${properties.phone}`,
          start: { dateTime: booking.startTime, timeZone: CALENDAR_TIME_ZONE },
          end: { dateTime: booking.endTime, timeZone: CALENDAR_TIME_ZONE },
          status: "confirmed", transparency: "opaque", visibility: "private",
          extendedProperties: { private: stored },
        },
      })).data;
    } catch {
      // An insert may have succeeded before a timeout/409. Read back the same ID;
      // never retry with a fresh ID or report success without a matching event.
      try { event = (await existing())?.data; } catch { /* outcome remains unknown */ }
      if (event === undefined) {
        throw new Error("Booking outcome is unknown; retry with the same requestId or check the calendar manually");
      }
    }
    return verify(event);
  });
  bookingQueue = result.then(() => undefined, () => undefined);
  // Шинэ захиалга хянах самбарт шууд харагдахын тулд жагсаалтын кэшийг цэвэрлэнэ.
  result.then(() => { bookingList = undefined; }, () => undefined);
  return result;
}

const BOOKING_LIST_TTL_MS = 15000;
const BOOKING_LIST_PAST_MS = 30 * 86400000;
let bookingList: { at: number; bookings: Promise<Booking[]> } | undefined;

function toBooking(value: unknown): Booking | null {
  try {
    const event = record(value);
    const metadata = record(record(event.extendedProperties).private);
    const start = providerTime(record(event.start).dateTime);
    const end = providerTime(record(event.end).dateTime);
    if (typeof event.id !== "string" || event.status !== "confirmed" || end <= start) return null;
    return {
      id: event.id, calendarEventId: event.id,
      customerName: bookingText(metadata.customerName, "customerName"), phone: bookingText(metadata.phone, "phone"),
      serviceId: bookingText(metadata.serviceId, "serviceId"), serviceName: bookingText(metadata.serviceName, "serviceName"),
      startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(),
      durationMinutes: Math.round((end - start) / 60000), status: "confirmed", source: "AI_PHONE_AGENT",
      ...(partySizeOf(metadata.partySize) ? { partySize: partySizeOf(metadata.partySize) } : {}),
    };
  } catch {
    return null; // Гараар зассан, бүтэц нь эвдэрсэн эвент жагсаалтыг бүхэлд нь унагаахгүй.
  }
}

const lastDigits = (phone: string) => phone.replace(/\D/g, "").slice(-8);

// Залгаж буй дугаарт бүртгэлтэй ирээдүйн захиалгыг цуцална. Дугаарыг AI биш, дуудлагын мэдээлэл өгнө.
// Энэ дугаарын ирээдүйн захиалгууд (цуцлах үед аль нь болохыг тодруулахад).
export async function upcomingBookingsFor(phone: string): Promise<Booking[]> {
  const digits = lastDigits(phone);
  return (await listBookings()).filter((item) => lastDigits(item.phone) === digits && Date.parse(item.startTime) > Date.now());
}

export async function cancelAppointment(input: { phone: string; startTime: string }): Promise<{ id: string; startTime: string; status: "cancelled" }> {
  const start = providerTime(input.startTime);
  const phone = lastDigits(input.phone);
  if (phone.length < 8) throw new TypeError("Caller phone is unknown");
  bookingList = undefined;
  const own = (await listBookings()).filter((item) => lastDigits(item.phone) === phone && Date.parse(item.startTime) > Date.now());
  // Цаг нь яг таарахгүй ч ("маргааш орой") тэр өдөр ганц захиалгатай бол түүнийг авна.
  const day = (time: number) => { const p = localParts(time); return `${p.year}-${p.month}-${p.day}`; };
  const sameDay = own.filter((item) => day(Date.parse(item.startTime)) === day(start));
  const booking = own.find((item) => Date.parse(item.startTime) === start) ?? (sameDay.length === 1 ? sameDay[0] : undefined);
  if (!booking) throw new Error("No booking for this caller at that time");
  const { auth, calendarId } = calendarClient("write");
  try {
    await auth.request({
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(booking.calendarEventId)}`,
      method: "DELETE", timeout: 10000, retry: false, params: { sendUpdates: "none" },
    });
  } catch (error) {
    // Аль хэдийн устсан бол цуцлагдсан гэж үзнэ.
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    if (status !== 404 && status !== 410) throw new Error("Google Calendar cancellation failed");
  }
  bookingList = undefined;
  return { id: booking.id, startTime: booking.startTime, status: "cancelled" };
}

// AI-ийн үүсгэсэн захиалгууд (сүүлийн 30 хоног ба ирээдүй), эхлэх цагаар өсөх дарааллаар.
// ponytail: 15 секундийн кэш, эхний 250 эвент; олон захиалгатай болвол хуудаслана.
export function listBookings(): Promise<Booking[]> {
  if (bookingList && Date.now() - bookingList.at < BOOKING_LIST_TTL_MS) return bookingList.bookings;
  const { auth, calendarId } = calendarClient("readonly");
  const bookings = auth.request<unknown>({
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    method: "GET", timeout: 10000, retry: false,
    params: {
      privateExtendedProperty: "source=AI_PHONE_AGENT", singleEvents: true, orderBy: "startTime", maxResults: 250,
      timeMin: new Date(Date.now() - BOOKING_LIST_PAST_MS).toISOString(),
    },
  }).then(({ data }) => {
    const items = record(data).items;
    if (!Array.isArray(items)) throw new TypeError("Google Calendar response is missing events");
    return items.map(toBooking).filter((booking): booking is Booking => booking !== null);
  }, () => {
    // SDK errors can contain request headers/tokens; never expose them to callers.
    throw new Error("Google Calendar booking list request failed");
  });
  const entry = { at: Date.now(), bookings };
  bookingList = entry;
  bookings.catch(() => { if (bookingList === entry) bookingList = undefined; });
  return bookings;
}
