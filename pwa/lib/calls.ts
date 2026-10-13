import type { CallSession } from "../../backend/src/calls/store";
import type { TranscriptTurn } from "../../backend/src/calls/transcript";
import { fetchBackend, isMockMode, type DataSource } from "./data-source";

const demoCalls: CallSession[] = [
  { id: "demo-call-01", callerPhone: "+97600000001", startedAt: "2026-10-08T06:10:00.000Z", endedAt: null, duration: 0, intent: null, status: "active", bookingId: null, bookingCreated: false },
  { id: "demo-call-02", callerPhone: "+97600000002", startedAt: "2026-10-08T05:45:00.000Z", endedAt: "2026-10-08T05:48:24.000Z", duration: 204, intent: "BOOK_APPOINTMENT", status: "completed", bookingId: "demo-booking-01", bookingCreated: true },
  { id: "demo-call-03", callerPhone: "+97600000003", startedAt: "2026-10-08T05:20:00.000Z", endedAt: "2026-10-08T05:21:12.000Z", duration: 72, intent: "ASK_PRICE", status: "completed", bookingId: null, bookingCreated: false },
  { id: "demo-call-04", callerPhone: null, startedAt: "2026-10-08T04:30:00.000Z", endedAt: "2026-10-08T04:30:00.000Z", duration: 0, intent: null, status: "failed", bookingId: null, bookingCreated: false },
  { id: "demo-call-05", callerPhone: "00000005", startedAt: "2026-10-08T02:15:00.000Z", endedAt: "2026-10-08T02:16:35.000Z", duration: 95, intent: "REQUEST_HUMAN", status: "handed_off", bookingId: null, bookingCreated: false },
  { id: "demo-call-06", callerPhone: "+97600000006", startedAt: "2026-10-07T16:15:00.000Z", endedAt: "2026-10-07T16:16:01.000Z", duration: 61, intent: "ASK_OPENING_HOURS", status: "completed", bookingId: null, bookingCreated: false },
];

export async function getCalls(): Promise<{ calls: CallSession[]; source: DataSource }> {
  if (isMockMode()) {
    return { calls: [...demoCalls].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id)), source: "demo" };
  }
  const calls = await fetchBackend<CallSession[]>("/api/calls");
  return calls ? { calls, source: "live" } : { calls: [], source: "offline" };
}

const demoTranscripts: Record<string, TranscriptTurn[]> = {
  "demo-call-02": [
    { role: "agent", text: "Сайн байна уу? Би AI туслах байна. Танд юугаар туслах вэ?", at: "2026-10-08T05:45:02.000Z" },
    { role: "caller", text: "Маргааш 3 цагт үс засуулах цаг авъя.", at: "2026-10-08T05:45:10.000Z" },
    { role: "agent", text: "Маргааш 15:00 цаг сул байна. Таны нэрийг хэлнэ үү?", at: "2026-10-08T05:45:18.000Z" },
    { role: "caller", text: null, at: "2026-10-08T05:45:24.000Z" },
    { role: "agent", text: "Энхжин ээ, маргааш 15:00 цагт үс засалт захиалагдлаа.", at: "2026-10-08T05:45:40.000Z" },
  ],
  "demo-call-03": [
    { role: "agent", text: "Сайн байна уу? Би AI туслах байна. Танд юугаар туслах вэ?", at: "2026-10-08T05:20:02.000Z" },
    { role: "caller", text: "Үс засалт хэд вэ?", at: "2026-10-08T05:20:09.000Z" },
    { role: "agent", text: "Үс засалт 30,000 төгрөг.", at: "2026-10-08T05:20:14.000Z" },
  ],
};

// Дуудлага бүрийн ярианы бичвэр (callId -> ээлжүүд).
// ponytail: бүх бичвэрийг нэг дор татна; түүх томорвол дуудлага дэлгэх үед тус тусад нь татна.
export async function getTranscripts(): Promise<Record<string, TranscriptTurn[]>> {
  if (isMockMode()) return demoTranscripts;
  return await fetchBackend<Record<string, TranscriptTurn[]>>("/api/transcripts") ?? {};
}
