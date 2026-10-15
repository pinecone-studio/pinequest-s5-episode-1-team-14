// Twilio Media Streams <-> Gemini Live bridge. Дуудлагын 8kHz mu-law
// аудиог 16kHz PCM болгож Gemini рүү явуулна. Хариуг VOICE_MODE-оор сонгоно:
// анхдагч нь Gemini-ийн текстийг ElevenLabs-аар 8kHz mu-law болгох;
// "gemini" бол Gemini-ийн өөрийн 24kHz аудиог 8kHz mu-law болгож шууд дамжуулна
// (ElevenLabs-ийн алхамгүй тул хурдан, гэхдээ хувилсан дуу хоолой биш).

import type { WebSocket, RawData } from "ws";
import { createGeminiLiveSession, type SpeechState } from "../ai/geminiLive.js";
import { createGeminiTurnSession } from "../ai/geminiTurns.js";
import { AccountStore, DEFAULT_BUSINESS_ID, voiceIdFor } from "../accounts/store.js";
import { takeSentences } from "./sentences.js";
import { greetingFor } from "../ai/callPrompt.js";
import { speakNumbers, speakPhoneNumbers, speakTimes } from "../voice/spokenNumbers.js";
import { createTimeStretcher } from "../voice/timeStretch.js";

import { cachedUlaw8k, streamUlaw8k } from "../voice/elevenlabs.js";
import { CallSessionStore } from "../calls/store.js";
import { inferIntent } from "../calls/intent.js";
import { createTranscriptRecorder, TranscriptStore } from "../calls/transcript.js";
import { consumeStreamToken } from "./streamTokens.js";
import type { SipSocket } from "./sip.js";
import type { Booking } from "../calendar/googleCalendar.js";

// AI-ийн ярианы хурд (1 = ElevenLabs-ийн анхдагч). Утсанд 1.15 хурдан ч ойлгомжтой.
const SPEECH_SPEED = Math.min(1.3, Math.max(0.8, Number(process.env.SPEECH_SPEED) || 1.15));

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;
// Дуудагч ярьж байна гэж үзэх дууны түвшин — зөвхөн хариултын хугацааг
// хэмжих лог-д ашиглана.
const CALLER_VOICE_RMS = 500;
// Холбогдоод энэ хугацаанд зөв "start" илгээгээгүй socket-ийг хаана.
const START_TIMEOUT_MS = 10_000;
const PHONE_PATTERN = /^(?:\d{8}|\+[1-9]\d{7,14})$/;
// Barge-in: Gemini-ийн "interrupted" дохио нь зөвхөн тухайн турш идэвхтэй
// үүсгэгдэж байх үед л ирдэг (богино хариулт бол бидний тоглуулж дуусахаас
// өмнө аль хэдийн turnComplete болчихсон байдаг) — иймд дуудагчийн дуу
// хоолойн эрч хүчийг шууд хэмжиж, AI тоглуулж байх үед илрэвэл дотооддоо
// давхар таслана.
const BARGE_IN_RMS_THRESHOLD = 600;
// AI ярьж дууссаны дараа цуурайн үлдэгдэл орж ирэх хугацаа.
const ECHO_TAIL_MS = 500;
// AI end_call дуудсаны дараа баяртай гэсэн үг тоглож дуусаад энэ хугацаанд зочин дуугарахгүй бол утсаа тавина.
const HANGUP_GRACE_MS = 800;
// Тоглуулалт ямар нэг шалтгаанаар дуусахгүй бол үүнээс удаан хүлээхгүй.
const HANGUP_MAX_WAIT_MS = 20_000;
// Ажилтан руу шилжүүлэхийн өмнө AI-ийн "холбож байна" гэх үг дуусахыг хүлээх дээд хугацаа.
const TRANSFER_SPEECH_WAIT_MS = 8000;
// STAFF_HOURS="10-22" (Улаанбаатарын цаг): энэ цагаас гадуур шилжүүлэхгүй, хүсэлтийг бүртгэнэ.
const staffHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ulaanbaatar", hour: "2-digit", hourCycle: "h23" });
export function staffAvailable(env: NodeJS.ProcessEnv = process.env, now = new Date()): boolean {
  if (!env.STAFF_PHONE?.replace(/\D/g, "")) return false;
  const [from, to] = (env.STAFF_HOURS ?? "").split("-").map(Number);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from >= to) return true;
  const hour = Number(staffHour.format(now));
  return hour >= from && hour < to;
}
// Мэндчилгээг дуустал хамгаална; тоглуулж чадаагүй тохиолдолд үүнээс урт хүлээхгүй.
const GREETING_GUARD_MS = 15_000;

function linearToMuLaw(sampleIn: number): number {
  let sample = sampleIn;
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > MULAW_CLIP) sample = MULAW_CLIP;
  sample += MULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function muLawToLinear(ulawByteIn: number): number {
  const ulawByte = ~ulawByteIn & 0xff;
  const sign = ulawByte & 0x80;
  const exponent = (ulawByte >> 4) & 0x07;
  const mantissa = ulawByte & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign !== 0 ? -sample : sample;
}

export function decodeMuLaw(payload: Buffer): Int16Array {
  const out = new Int16Array(payload.length);
  for (let i = 0; i < payload.length; i++) out[i] = muLawToLinear(payload[i]);
  return out;
}

export function encodeMuLaw(samples: Int16Array): Buffer {
  const out = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = linearToMuLaw(samples[i]);
  return out;
}

// Дуудагчийн 8kHz дуу хоолойг Gemini Live-ийн шаарддаг 16kHz рүү хувиргана
// (шугаман интерполяци — чанарын хувьд MVP-д хангалттай).
export function upsample8kTo16k(samples: Int16Array): Int16Array {
  const out = new Int16Array(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const current = samples[i];
    const next = samples[i + 1] ?? current;
    out[i * 2] = current;
    out[i * 2 + 1] = (current + next) >> 1;
  }
  return out;
}

// Gemini-ийн 24kHz PCM-ийг утасны 8kHz рүү буулгана: гурван дээжийн дундаж.
// Chunk нь 3 дээжийн хилээр таслагдаагүй байж болох тул үлдэгдэл байтыг
// дараагийн chunk-т залгана — дуудлага бүрт нэг хувиргагч үүсгэнэ.
export function createDownsampler24kTo8k(): (pcm24k: Buffer) => Int16Array {
  let carry: Buffer = Buffer.alloc(0);
  return (pcm24k) => {
    const data = carry.length ? Buffer.concat([carry, pcm24k]) : pcm24k;
    const out = new Int16Array(Math.floor(data.length / 6));
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.round((data.readInt16LE(i * 6) + data.readInt16LE(i * 6 + 2) + data.readInt16LE(i * 6 + 4)) / 3);
    }
    carry = Buffer.from(data.subarray(out.length * 6));
    return out;
  };
}

function rootMeanSquare(samples: Int16Array): number {
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  return samples.length ? Math.sqrt(sumSquares / samples.length) : 0;
}

function normalizePhone(value: unknown): string | null {
  return typeof value === "string" && PHONE_PATTERN.test(value) ? value : null;
}

// Дуудлага шилжүүлэлтээр (call forwarding) ирэхэд зарим оператор жинхэнэ
// дуудагчийн оронд бизнесийн дугаарыг From-д тавьдаг. Тэр тохиолдолд
// дугаарыг тодорхойгүй гэж үзнэ — agent амаар асууна.
export function resolveCallerPhone(params: URLSearchParams): string {
  // Буцааж залгасан дуудлагад From нь манай Twilio дугаар, харилцагч нь To.
  if (params.get("Direction") === "outbound-api") return params.get("To") ?? "";
  const last8 = (name: string) => (params.get(name) ?? "").replace(/\D/g, "").slice(-8);
  const from = last8("From");
  if (from.length < 8 || from === last8("To") || from === last8("ForwardedFrom")) return "";
  return params.get("From") ?? "";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Twilio-ийн "voice" webhook-д буцаах TwiML — дуудлагыг Media Stream рүү холбоно.
export function buildMediaStreamTwiml(streamUrl: string, params: Record<string, string>): string {
  const parameterTags = Object.entries(params)
    .filter(([, value]) => value)
    .map(([name, value]) => `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapeXml(streamUrl)}">${parameterTags}</Stream></Connect></Response>`;
}

type TwilioStreamMessage =
  | { event: "connected" }
  | { event: "start"; start: { streamSid: string; callSid: string; customParameters?: Record<string, string> } }
  | { event: "media"; media: { payload: string } }
  | { event: "mark"; mark: { name: string } }
  | { event: "stop" };

// Дуудлагын явцад захиалга үүссэн бол дуудлага дууссаны дараа дуудагдана (index.ts тохируулна).
let afterBookingCall: ((booking: Booking, businessId: string) => void) | null = null;
export function onBookingCallEnded(handler: (booking: Booking, businessId: string) => void): void {
  afterBookingCall = handler;
}

export function handleTwilioMediaStream(ws: WebSocket): void {
  const store = new CallSessionStore();
  let streamSid = "";
  let callId = "";
  let pendingText = "";
  let speakQueue: Promise<void> = Promise.resolve();
  // Barge-in: таслагдах бүрт нэмэгдэнэ. Хуучин үеийн ярианы хэсгүүд энэ
  // тоогоороо өөрийгөө хуучирсан гэж үзээд цааш тоглохгүй болно.
  let speechGeneration = 0;
  // Аудиог бодит хурднаас түрүүлж илгээдэг тул "AI ярьж байна" гэдгийг
  // Twilio-ийн mark-аар мэднэ: өгүүлбэр бүрийн ард mark илгээж, Twilio
  // тэр хүртэл тоглож дуусмагц буцааж мэдэгдэнэ.
  let streaming = false;
  let marksPending = 0;
  let geminiSession: Awaited<ReturnType<typeof createGeminiTurnSession>> | null = null;
  let closed = false;
  // Мэндчилгээ тоглож дуусах хүртэл (эхний mark ирэх хүртэл) зочны дууг сонсохгүй.
  let greetingDone = false;
  let lastPlayedAt = 0;
  const openedAt = Date.now();
  function speechState(): SpeechState {
    if (!greetingDone && Date.now() - openedAt < GREETING_GUARD_MS) return "protected";
    const speaking = streaming || marksPending > 0 || Date.now() - lastPlayedAt < ECHO_TAIL_MS;
    return speaking ? "speaking" : "silent";
  }
  // AI дуудлагыг дуусгах гэж буй (end_call): ярих зүйл дуусмагц утсаа тавина.
  let queuedSpeech = 0;
  let hangupRequested = false;
  let hangupAt = 0;
  let hangupTimer: NodeJS.Timeout | undefined;
  function scheduleHangup(): void {
    clearTimeout(hangupTimer);
    if (!hangupAt || closed) return;
    const idle = queuedSpeech === 0 && !streaming && marksPending === 0;
    const overdue = Date.now() - hangupAt > HANGUP_MAX_WAIT_MS;
    hangupTimer = setTimeout(() => {
      if (!hangupAt || closed) return;
      if (overdue || (queuedSpeech === 0 && !streaming && marksPending === 0)) {
        console.log("[twilio] AI яриагаа дуусгаж утсаа тавилаа");
        ws.close();
      } else {
        scheduleHangup();
      }
    }, idle || overdue ? HANGUP_GRACE_MS : 200);
  }
  // Зочныг ажилтан руу шилжүүлнэ (SIP шугамаар ирсэн дуудлагад). AI-ийн хэлж буй үгийг дуусгаад холбоно.
  async function onTransfer(): Promise<unknown> {
    const sip = ws as unknown as SipSocket;
    if (!sip.transfer || !staffAvailable()) {
      return { transferred: false, reason: "No staff can take the call now." };
    }
    if (pendingText.trim()) enqueueSpeak(pendingText);
    pendingText = "";
    for (let waited = 0; waited < TRANSFER_SPEECH_WAIT_MS && (queuedSpeech > 0 || streaming || marksPending > 0); waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (closed) return { transferred: false, reason: "The call has ended." };
    try {
      store.update(callId, { intent: "REQUEST_HUMAN" });
    } catch (error) {
      console.error("[twilio] шилжүүлэлтийг бүртгэж чадсангүй:", error);
    }
    const transferred = await sip.transfer(String(process.env.STAFF_PHONE).replace(/\D/g, ""));
    console.log(`[twilio] ажилтан руу шилжүүлэх: ${transferred ? "холбогдлоо" : "ажилтан авсангүй"}`);
    return transferred ? { transferred: true } : { transferred: false, reason: "Staff did not answer." };
  }
  function cancelHangup(): void {
    hangupRequested = false;
    hangupAt = 0;
    clearTimeout(hangupTimer);
  }
  // Энэ дуудлагад үүссэн захиалга (дууссаны дараа сануулахад).
  let createdBooking: Booking | null = null;
  let isReminderCall = false;
  let callBusinessId = DEFAULT_BUSINESS_ID;
  let callerSpokeAt = 0;
  let awaitingReply = false;
  // Дуудлагын зорилгыг дуусахад нь тодорхойлоход: AI юу хариулсан, сул цаг шалгасан эсэх.
  let replyText = "";
  let checkedAvailability = false;
  const transcripts = new TranscriptStore();
  // Бичвэр хадгалах алдаа дуудлагыг тасалдуулах ёсгүй.
  const transcript = createTranscriptRecorder((turn) => {
    try {
      transcripts.append(callId, turn);
    } catch (error) {
      console.error("[twilio] бичвэр хадгалж чадсангүй:", error);
    }
  });
  const nativeVoice = process.env.VOICE_MODE === "gemini";
  const downsample = createDownsampler24kTo8k();

  // Дуудагч сүүлд дуугарснаас хариултын эхний аудио гарах хүртэлх хугацааг
  // эргэлт бүрт нэг удаа лог-д бичнэ — горим, загваруудыг харьцуулахад.
  function sendAudio(ulaw: Uint8Array): void {
    if (awaitingReply) {
      awaitingReply = false;
      console.log(`[latency] хариултын эхний аудио: ${Date.now() - callerSpokeAt}мс (${nativeVoice ? "gemini" : "elevenlabs"})`);
    }
    ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: Buffer.from(ulaw).toString("base64") } }));
  }

  // Аудиог ирэх тусам нь хүлээлгүй явуулна — Twilio өөрөө буферлээд бодит
  // хурдаар тоглуулдаг тул 20мс-ийн таймер хэрэггүй.
  async function speak(text: string, generation: number, fixed: boolean): Promise<void> {
    if (closed || generation !== speechGeneration || !text.trim()) return;
    const audio = fixed ? [await cachedUlaw8k(text, callVoiceId)] : await streamUlaw8k(speakNumbers(speakTimes(speakPhoneNumbers(text))), callVoiceId);
    streaming = true;
    // eleven_v4_turbo speed тохиргоог үл тоодог тул дууг өндрийг нь хадгалан энд хурдасгана.
    const stretcher = SPEECH_SPEED === 1 ? null : createTimeStretcher(SPEECH_SPEED);
    try {
      for await (const chunk of audio) {
        if (closed || generation !== speechGeneration) return;
        const out = stretcher ? encodeMuLaw(stretcher.push(decodeMuLaw(Buffer.from(chunk)))) : chunk;
        if (out.length) sendAudio(out);
      }
      if (stretcher && !closed && generation === speechGeneration) {
        const rest = encodeMuLaw(stretcher.flush());
        if (rest.length) sendAudio(rest);
      }
      marksPending++;
      ws.send(JSON.stringify({ event: "mark", streamSid, mark: { name: String(generation) } }));
    } finally {
      streaming = false;
    }
  }

  // fixed: урьдчилан бэлдсэн (санах ойд хадгалсан) тогтмол өгүүлбэр.
  function enqueueSpeak(text: string, fixed = false): void {
    const generation = speechGeneration;
    queuedSpeech++;
    speakQueue = speakQueue.then(() => speak(text, generation, fixed)).catch((error) => console.error("[twilio] ярих алдаа:", error))
      .finally(() => { queuedSpeech--; });
  }

  // Дуудагч AI-г таслан орж ярихад: тоглуулж буй/дараалалд буй үгсийг хаяж,
  // Twilio-д хараахан тоглоогүй аудиог нь цэвэрлэ (clear event — энэ бол
  // Twilio-ийн barge-in-д зориулсан албан ёсны механизм).
  let liveMode = false;

  function onInterrupted(): void {
    speechGeneration++;
    pendingText = "";
    marksPending = 0;
    if (!closed && streamSid) ws.send(JSON.stringify({ event: "clear", streamSid }));
  }

  function onGeminiAudio(pcm24k: Buffer): void {
    if (!closed) sendAudio(encodeMuLaw(downsample(pcm24k)));
  }

  let callVoiceId: string | undefined;

  // Хариултыг бүтнээр нь нэг дор уншуулна: өгүүлбэр бүрийг тусад нь уншвал аялга тасарч,
  // нэг хэвийн сонсогддог. Эхний дуу ~0.25с хоцорно (Gemini хариултаа дуусгах хугацаа).
  // Бүтэн өгүүлбэр бэлэн болмогц уншиж эхэлнэ: урт хариултыг бүтнээр нь хүлээхэд ~0.5-1с алддаг.
  // Зөвхөн өгүүлбэрийн төгсгөлд (. ? !) хуваана — таслал дээр хуваавал аялга тасарна.
  function onText(delta: string): void {
    const { sentences, rest } = takeSentences(pendingText + delta);
    sentences.forEach((sentence) => enqueueSpeak(sentence));
    pendingText = rest;
  }

  function onHold(text: string): void {
    if (pendingText.trim()) enqueueSpeak(pendingText);
    pendingText = "";
    enqueueSpeak(text, true);
  }

  function onAck(text: string): void {
    enqueueSpeak(text, true);
  }

  function onToolResult(name: string, result: unknown): void {
    if (name === "check_availability") checkedAvailability = true;
    // Баяртай гэсэн үг дараагийн хэсэгт ирж болох тул хариулт бүрэн дууссаны дараа л тоолж эхэлнэ.
    if (name === "end_call") {
      hangupRequested = true;
      return;
    }
    if (name === "request_human") {
      try {
        store.update(callId, { intent: "REQUEST_HUMAN" });
      } catch (error) {
        console.error("[twilio] ажилтны хүсэлтийг бүртгэж чадсангүй:", error);
      }
      return;
    }
    const booking = result as { id?: unknown; status?: unknown } | null;
    if (name === "cancel_appointment" && booking?.status === "cancelled") {
      try {
        store.update(callId, { intent: "CANCEL_BOOKING" });
      } catch (error) {
        console.error("[twilio] цуцлалтыг дуудлагатай холбож чадсангүй:", error);
      }
      return;
    }
    if (name !== "create_appointment" || typeof booking?.id !== "string" || booking.status !== "confirmed") return;
    createdBooking = result as Booking;
    try {
      store.update(callId, { bookingId: booking.id, intent: "BOOK_APPOINTMENT" });
    } catch (error) {
      console.error("[twilio] захиалгыг дуудлагатай холбож чадсангүй:", error);
    }
  }

  function onTurnComplete(): void {
    if (pendingText.trim()) enqueueSpeak(pendingText);
    pendingText = "";
  }

  const startTimer = setTimeout(() => {
    if (!streamSid) ws.close(1008, "start timeout");
  }, START_TIMEOUT_MS);
  startTimer.unref();

  function endCall(): void {
    if (closed) return;
    closed = true;
    clearTimeout(hangupTimer);
    clearTimeout(startTimer);
    geminiSession?.close();
    if (callId) {
      transcript.endTurn();
      try {
        const intent = store.get(callId)?.intent ?? inferIntent({ checkedAvailability, replyText });
        if (intent) store.update(callId, { intent });
        store.finish(callId, { status: "completed", endedAt: new Date().toISOString() });
      } catch (error) {
        console.error("[twilio] дуудлага хаахад алдаа:", error);
      }
      // Сануулах дуудлагын үеэр цагаа сольсон бол дахин сануулахгүй.
      if (createdBooking && !isReminderCall) afterBookingCall?.(createdBooking, callBusinessId);
    }
  }

  ws.on("message", async (raw: RawData) => {
    try {
      const message: TwilioStreamMessage = JSON.parse(raw.toString());

      if (message.event === "start") {
        // Зөвхөн /voice-оос олгосон нэг удаагийн token-той, анхны start-ыг л хүлээн авна.
        if (streamSid || !consumeStreamToken(message.start.customParameters?.streamToken)) {
          console.error("[twilio] media stream-ийн token буруу эсвэл давхар start — холболтыг хаалаа");
          ws.close(1008, "unauthorized");
          return;
        }
        streamSid = message.start.streamSid;
        callId = message.start.callSid;
        const callerPhone = normalizePhone(message.start.customParameters?.callerPhone);
        // Аль бизнесийн дугаарт ирсэн (SIP шугам дамжуулна); Twilio-ийн дуудлага үндсэн бизнесийнх.
        const businessId = message.start.customParameters?.businessId || DEFAULT_BUSINESS_ID;
        const business = new AccountStore().businesses().find((item) => item.id === businessId);
        const businessName = businessId === DEFAULT_BUSINESS_ID ? undefined : business?.name;
        // Бизнесийн сонгосон дуу (тохиргоо); сонгоогүй бол анхдагч дуу.
        callVoiceId = voiceIdFor(business?.voice);
        store.start({ id: callId, callerPhone, startedAt: new Date().toISOString(), ...(businessId === DEFAULT_BUSINESS_ID ? {} : { businessId }) });
        // Gemini холбогдох хооронд дуудагч чимээгүй хүлээхгүйн тулд эхэлж мэндэлнэ.
        // Сануулах дуудлагад мэндчилгээ, заавар нь захиалга бүрээр өөр (кэшлэхгүй).
        const params = message.start.customParameters ?? {};
        const reminder = params.direction === "reminder" && params.greeting ? params : null;
        isReminderCall = params.direction === "reminder";
        callBusinessId = businessId;
        // Бизнесийн нэрээр мэндэлнэ.
        const greeting = reminder?.greeting ?? business?.greeting ?? greetingFor(business?.name);
        if (!nativeVoice) {
          enqueueSpeak(greeting, !reminder);
          transcript.say("agent", greeting);
        }
        // Анхдагч нь ээлжилсэн горим (монгол яриаг илүү таньдаг). Gemini-ийн өөрийн дуу эсвэл AI_MODE=live бол Live.
        liveMode = nativeVoice || process.env.AI_MODE === "live";
        const createSession = liveMode ? createGeminiLiveSession : createGeminiTurnSession;
        geminiSession = await createSession({
          ...(nativeVoice ? { onAudio: onGeminiAudio } : {}),
          onText: (delta) => {
            replyText += delta;
            transcript.agent(delta);
            if (!nativeVoice) onText(delta);
          },
          // Баяртай гэсний дараа зочин дахин ярьвал утсаа тавихгүй.
          onCallerText: (text) => {
            cancelHangup();
            transcript.caller(text);
          },
          onTurnComplete: () => {
            transcript.endTurn();
            if (!nativeVoice) onTurnComplete();
            if (hangupRequested && !hangupAt) {
              hangupAt = Date.now();
              scheduleHangup();
            }
          },
          onInterrupted,
          speechState,
          onTransfer,
          onAck,
          onHold,
          onToolResult,
          onError: (msg) => console.error("[twilio] Gemini алдаа:", msg),
          onClose: endCall,
        }, { callerPhone, greeted: !nativeVoice, greeting, extra: reminder?.instruction, businessId, businessName });
        // Gemini-ийн дуугаар мэндлүүлэхийн тулд эхний эргэлтийг өдөөнө.
        if (nativeVoice) geminiSession.sendRealtimeInput({ text: "(Дуудлага холбогдлоо.)" });
        return;
      }

      if (message.event === "media") {
        if (!geminiSession) return;
        const ulaw = Buffer.from(message.media.payload, "base64");
        const pcm8k = decodeMuLaw(ulaw);
        const loudness = rootMeanSquare(pcm8k);
        // Gemini-ийн дуугаар ярих горимд таслалтыг Gemini-ийн VAD дангаараа шийднэ.
        // Ээлжилсэн горимд таслалтыг яриа танигдсаны дараа session өөрөө хийнэ.
        if (liveMode && (streaming || marksPending > 0) && loudness > BARGE_IN_RMS_THRESHOLD) onInterrupted();
        if (loudness > CALLER_VOICE_RMS) {
          callerSpokeAt = Date.now();
          awaitingReply = true;
        }
        const pcm16k = upsample8kTo16k(pcm8k);
        geminiSession.sendRealtimeInput({
          audio: { data: Buffer.from(pcm16k.buffer).toString("base64"), mimeType: "audio/pcm;rate=16000" },
        });
        return;
      }

      if (message.event === "mark") {
        // Таслагдсан үеийн mark-ийг тоолохгүй (clear хийхэд Twilio тэднийг ч буцаадаг).
        if (message.mark.name === String(speechGeneration) && marksPending > 0) marksPending--;
        greetingDone = true;
        lastPlayedAt = Date.now();
        return;
      }

      if (message.event === "stop") endCall();
    } catch (error) {
      // Нэг дуудлагын гэнэтийн алдаа бусад идэвхтэй дуудлагыг унагаах ёсгүй.
      console.error("[twilio] дуудлага боловсруулахад алдаа:", error);
      endCall();
      ws.close();
    }
  });

  ws.on("close", endCall);
  ws.on("error", (error) => {
    console.error("[twilio] socket алдаа:", error);
    endCall();
  });
}
