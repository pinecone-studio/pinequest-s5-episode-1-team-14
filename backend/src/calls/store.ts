import { resolve } from "node:path";
import { readJsonArray, writeJsonArray } from "../storage/jsonFile.js";

export const CALL_INTENTS = [
  "ASK_PRICE", "ASK_SERVICE", "ASK_OPENING_HOURS", "BOOK_APPOINTMENT",
  "CANCEL_BOOKING", "ASK_PRODUCT", "REQUEST_HUMAN", "GENERAL_QUERY",
] as const;
export const CALL_STATUSES = ["active", "completed", "failed", "handed_off"] as const;
export type CallSession = {
  id: string;
  callerPhone: string | null;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  intent: (typeof CALL_INTENTS)[number] | null;
  status: (typeof CALL_STATUSES)[number];
  bookingId: string | null;
  bookingCreated: boolean;
};

function fields(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Call data must be an object");
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError("Unknown call field");
  return value as Record<string, unknown>;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    value.trim() === value && !/\p{Cc}/u.test(value);
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError("Call timestamps must be canonical UTC ISO strings");
  }
  return Date.parse(value);
}

function validateCall(value: unknown): asserts value is CallSession {
  const call = fields(value, ["id", "callerPhone", "startedAt", "endedAt", "duration", "intent", "status", "bookingId", "bookingCreated"]);
  if (!validId(call.id)) throw new TypeError("Call id must be non-empty text of at most 200 characters without padding or controls");
  if (call.callerPhone !== null && (typeof call.callerPhone !== "string" || !/^(?:\d{8}|\+[1-9]\d{7,14})$/.test(call.callerPhone))) {
    throw new TypeError("callerPhone must be null, 8 local digits or an international number with + and 8-15 digits");
  }
  if (call.intent !== null && !CALL_INTENTS.some((intent) => intent === call.intent)) throw new TypeError("Invalid call intent");
  if (!CALL_STATUSES.some((status) => status === call.status)) throw new TypeError("Invalid call status");
  if (call.bookingId !== null && !validId(call.bookingId)) throw new TypeError("Invalid booking id");
  if (call.bookingCreated !== (call.bookingId !== null)) throw new TypeError("bookingCreated must match the booking link");
  const start = timestamp(call.startedAt);
  if (call.status === "active") {
    if (call.endedAt !== null || call.duration !== 0) throw new TypeError("Active calls cannot have an end time or final duration");
  } else {
    const end = timestamp(call.endedAt);
    if (end < start || call.duration !== Math.floor((end - start) / 1000)) throw new TypeError("Invalid call duration or end time");
  }
}

// ponytail: synchronous whole-file storage for one small-business backend process;
// move both JSON stores to transactional storage before multiple writers or large histories.
export class CallSessionStore {
  constructor(private readonly filePath = resolve(__dirname, "../../data/calls.json")) {}

  list(): CallSession[] {
    const ids = new Set<string>();
    const calls = readJsonArray(this.filePath).map((value) => {
      validateCall(value);
      if (ids.has(value.id)) throw new TypeError("Duplicate call id");
      ids.add(value.id);
      return value;
    });
    return calls.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.id.localeCompare(b.id, "en"));
  }

  get(id: string): CallSession | undefined {
    if (!validId(id)) throw new TypeError("Invalid call id");
    return this.list().find((call) => call.id === id);
  }

  start(input: { id: string; callerPhone: string | null; startedAt: string }): CallSession {
    const data = fields(input, ["id", "callerPhone", "startedAt"]);
    const call = { ...data, endedAt: null, duration: 0, intent: null, status: "active", bookingId: null, bookingCreated: false };
    validateCall(call);
    const calls = this.list();
    const existing = calls.find((item) => item.id === call.id);
    if (existing) {
      if (existing.callerPhone !== call.callerPhone || existing.startedAt !== call.startedAt) {
        throw new Error("Call id is already associated with different start metadata");
      }
      return existing;
    }
    writeJsonArray(this.filePath, [...calls, call]);
    return call;
  }

  update(id: string, input: Partial<Pick<CallSession, "intent" | "bookingId">>): CallSession {
    const patch = fields(input, ["intent", "bookingId"]);
    return this.change(id, (call) => {
      if (call.bookingId !== null && Object.hasOwn(patch, "bookingId") && patch.bookingId !== call.bookingId) {
        throw new Error("A recorded booking cannot be cleared or replaced");
      }
      return { ...call, ...patch, bookingCreated: (patch.bookingId === undefined ? call.bookingId : patch.bookingId) !== null };
    });
  }

  finish(id: string, input: { status: Exclude<CallSession["status"], "active">; endedAt: string }): CallSession {
    const end = fields(input, ["status", "endedAt"]);
    if (!CALL_STATUSES.some((status) => status !== "active" && status === end.status)) throw new TypeError("Invalid terminal call status");
    const endedAt = timestamp(end.endedAt);
    return this.change(id, (call) => {
      if (call.status !== "active" && (call.status !== end.status || call.endedAt !== end.endedAt)) {
        throw new Error("A finished call cannot change its status or end time");
      }
      return { ...call, ...end, duration: Math.floor((endedAt - timestamp(call.startedAt)) / 1000) };
    });
  }

  private change(id: string, apply: (call: CallSession) => unknown): CallSession {
    if (!validId(id)) throw new TypeError("Invalid call id");
    const calls = this.list();
    const index = calls.findIndex((call) => call.id === id);
    if (index === -1) throw new Error("Call session not found");
    const call = apply(calls[index]);
    validateCall(call);
    if (JSON.stringify(call) !== JSON.stringify(calls[index])) {
      calls[index] = call;
      writeJsonArray(this.filePath, calls);
    }
    return call;
  }
}
