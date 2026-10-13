// Twilio Media Streams <-> Gemini Live bridge. Дуудлагын 8kHz mu-law
// аудиог 16kHz PCM болгож Gemini рүү явуулна. Хариуг VOICE_MODE-оор сонгоно:
// анхдагч нь Gemini-ийн текстийг ElevenLabs-аар 8kHz mu-law болгох;
// "gemini" бол Gemini-ийн өөрийн 24kHz аудиог 8kHz mu-law болгож шууд дамжуулна
// (ElevenLabs-ийн алхамгүй тул хурдан, гэхдээ хувилсан дуу хоолой биш).

import type { WebSocket, RawData } from "ws";
import { createGeminiLiveSession } from "../ai/geminiLive.js";
import { createGeminiTurnSession } from "../ai/geminiTurns.js";
import { CALL_GREETING } from "../ai/callPrompt.js";
import { cachedUlaw8k, streamUlaw8k } from "../voice/elevenlabs.js";
import { CallSessionStore } from "../calls/store.js";
import { inferIntent } from "../calls/intent.js";
import { createTranscriptRecorder, TranscriptStore } from "../calls/transcript.js";
import { takeSentences } from "./sentences.js";
import { consumeStreamToken } from "./streamTokens.js";

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
    const audio = fixed ? [await cachedUlaw8k(text)] : await streamUlaw8k(text);
    streaming = true;
    try {
      for await (const chunk of audio) {
        if (closed || generation !== speechGeneration) return;
        sendAudio(chunk);
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
    speakQueue = speakQueue.then(() => speak(text, generation, fixed)).catch((error) => console.error("[twilio] ярих алдаа:", error));
  }

  // Дуудагч AI-г таслан орж ярихад: тоглуулж буй/дараалалд буй үгсийг хаяж,
  // Twilio-д хараахан тоглоогүй аудиог нь цэвэрлэ (clear event — энэ бол
  // Twilio-ийн barge-in-д зориулсан албан ёсны механизм).
  function onInterrupted(): void {
    speechGeneration++;
    pendingText = "";
    marksPending = 0;
    if (!closed && streamSid) ws.send(JSON.stringify({ event: "clear", streamSid }));
  }

  function onGeminiAudio(pcm24k: Buffer): void {
    if (!closed) sendAudio(encodeMuLaw(downsample(pcm24k)));
  }

  function onText(delta: string): void {
    const { sentences, rest } = takeSentences(pendingText + delta);
    sentences.forEach((sentence) => enqueueSpeak(sentence));
    pendingText = rest;
  }

  function onToolResult(name: string, result: unknown): void {
    if (name === "check_availability") checkedAvailability = true;
    const booking = result as { id?: unknown; status?: unknown } | null;
    if (name !== "create_appointment" || typeof booking?.id !== "string" || booking.status !== "confirmed") return;
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
        store.start({ id: callId, callerPhone, startedAt: new Date().toISOString() });
        // Gemini холбогдох хооронд дуудагч чимээгүй хүлээхгүйн тулд эхэлж мэндэлнэ.
        if (!nativeVoice) {
          enqueueSpeak(CALL_GREETING, true);
          transcript.say("agent", CALL_GREETING);
        }
        // Анхдагч нь ээлжилсэн горим (монгол яриаг илүү таньдаг). Gemini-ийн өөрийн дуу эсвэл AI_MODE=live бол Live.
        const createSession = nativeVoice || process.env.AI_MODE === "live" ? createGeminiLiveSession : createGeminiTurnSession;
        geminiSession = await createSession({
          ...(nativeVoice ? { onAudio: onGeminiAudio } : {}),
          onText: (delta) => {
            replyText += delta;
            transcript.agent(delta);
            if (!nativeVoice) onText(delta);
          },
          onCallerText: transcript.caller,
          onTurnComplete: () => {
            transcript.endTurn();
            if (!nativeVoice) onTurnComplete();
          },
          onInterrupted,
          onToolResult,
          onError: (msg) => console.error("[twilio] Gemini алдаа:", msg),
          onClose: endCall,
        }, { callerPhone, greeted: !nativeVoice });
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
        if ((streaming || marksPending > 0) && loudness > BARGE_IN_RMS_THRESHOLD) onInterrupted();
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
