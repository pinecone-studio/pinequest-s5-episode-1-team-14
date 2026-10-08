import type { CallSession } from "../../backend/src/calls/store";

const demoCalls: CallSession[] = [
  { id: "demo-call-01", callerPhone: "+97600000001", startedAt: "2026-10-08T06:10:00.000Z", endedAt: null, duration: 0, intent: null, status: "active", bookingId: null, bookingCreated: false },
  { id: "demo-call-02", callerPhone: "+97600000002", startedAt: "2026-10-08T05:45:00.000Z", endedAt: "2026-10-08T05:48:24.000Z", duration: 204, intent: "BOOK_APPOINTMENT", status: "completed", bookingId: "demo-booking-01", bookingCreated: true },
  { id: "demo-call-03", callerPhone: "+97600000003", startedAt: "2026-10-08T05:20:00.000Z", endedAt: "2026-10-08T05:21:12.000Z", duration: 72, intent: "ASK_PRICE", status: "completed", bookingId: null, bookingCreated: false },
  { id: "demo-call-04", callerPhone: null, startedAt: "2026-10-08T04:30:00.000Z", endedAt: "2026-10-08T04:30:00.000Z", duration: 0, intent: null, status: "failed", bookingId: null, bookingCreated: false },
  { id: "demo-call-05", callerPhone: "00000005", startedAt: "2026-10-08T02:15:00.000Z", endedAt: "2026-10-08T02:16:35.000Z", duration: 95, intent: "REQUEST_HUMAN", status: "handed_off", bookingId: null, bookingCreated: false },
  { id: "demo-call-06", callerPhone: "+97600000006", startedAt: "2026-10-07T16:15:00.000Z", endedAt: "2026-10-07T16:16:01.000Z", duration: 61, intent: "ASK_OPENING_HOURS", status: "completed", bookingId: null, bookingCreated: false },
];

export function getCalls(): { calls: CallSession[]; isDemo: boolean } {
  const isDemo = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";
  // ponytail: only synthetic data until a reviewed, authenticated call-list API exists.
  const calls = isDemo ? [...demoCalls].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id)) : [];
  return { calls, isDemo };
}
