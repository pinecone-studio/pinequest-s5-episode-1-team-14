// Twilio Media Streams <-> Gemini Live bridge. Дуудлагын 8kHz mu-law
// аудиог 16kHz PCM болгож Gemini рүү, Gemini-ийн текстийг ElevenLabs-аар
// 8kHz mu-law болгож буцаан Twilio руу явуулна.

import type { WebSocket, RawData } from "ws";
import { createGeminiLiveSession } from "../ai/geminiLive.js";
import { synthesizeToUlaw8k } from "../voice/elevenlabs.js";
import { CallSessionStore } from "../calls/store.js";

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;
const FRAME_BYTES = 160; // 8kHz mu-law дээр 20мс
const FRAME_MS = 20;
const PHONE_PATTERN = /^(?:\d{8}|\+[1-9]\d{7,14})$/;
// Barge-in: Gemini-ийн "interrupted" дохио нь зөвхөн тухайн турш идэвхтэй
// үүсгэгдэж байх үед л ирдэг (богино хариулт бол бидний тоглуулж дуусахаас
// өмнө аль хэдийн turnComplete болчихсон байдаг) — иймд дуудагчийн дуу
// хоолойн эрч хүчийг шууд хэмжиж, AI тоглуулж байх үед илрэвэл дотооддоо
// давхар таслана.
const BARGE_IN_RMS_THRESHOLD = 600;

function rootMeanSquare(samples: Int16Array): number {
  let sumSquares = 0;
  for (const sample of samples) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / samples.length);
}

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

function normalizePhone(value: unknown): string | null {
  return typeof value === "string" && PHONE_PATTERN.test(value) ? value : null;
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
  | { event: "stop" };

export function handleTwilioMediaStream(ws: WebSocket): void {
  const store = new CallSessionStore();
  const sentenceBoundary = /[.!?]/;
  let streamSid = "";
  let callId = "";
  let pendingText = "";
  let speakQueue: Promise<void> = Promise.resolve();
  // Barge-in: таслагдах бүрт нэмэгдэнэ. Хуучин үеийн ярианы хэсгүүд энэ
  // тоогоороо өөрийгөө хуучирсан гэж үзээд цааш тоглохгүй болно.
  let speechGeneration = 0;
  let aiSpeaking = false;
  let geminiSession: Awaited<ReturnType<typeof createGeminiLiveSession>> | null = null;
  let closed = false;

  async function speak(text: string, generation: number): Promise<void> {
    if (closed || generation !== speechGeneration || !text.trim()) return;
    const audio = await synthesizeToUlaw8k(text);
    if (closed || generation !== speechGeneration) return;
    aiSpeaking = true;
    try {
      for (let offset = 0; offset < audio.length; offset += FRAME_BYTES) {
        if (closed || generation !== speechGeneration) return;
        const frame = audio.subarray(offset, offset + FRAME_BYTES);
        ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: frame.toString("base64") } }));
        await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
      }
    } finally {
      if (generation === speechGeneration) aiSpeaking = false;
    }
  }

  function enqueueSpeak(text: string): void {
    const generation = speechGeneration;
    speakQueue = speakQueue.then(() => speak(text, generation)).catch((error) => console.error("[twilio] ярих алдаа:", error));
  }

  // Дуудагч AI-г таслан орж ярихад: тоглуулж буй/дараалалд буй үгсийг хаяж,
  // Twilio-д хараахан тоглоогүй аудиог нь цэвэрлэ (clear event — энэ бол
  // Twilio-ийн barge-in-д зориулсан албан ёсны механизм).
  function onInterrupted(): void {
    speechGeneration++;
    pendingText = "";
    if (streamSid) ws.send(JSON.stringify({ event: "clear", streamSid }));
  }

  function onText(delta: string): void {
    pendingText += delta;
    let match: RegExpMatchArray | null;
    while ((match = pendingText.match(sentenceBoundary))) {
      const splitAt = (match.index ?? 0) + 1;
      enqueueSpeak(pendingText.slice(0, splitAt));
      pendingText = pendingText.slice(splitAt);
    }
  }

  function onTurnComplete(): void {
    if (pendingText.trim()) enqueueSpeak(pendingText);
    pendingText = "";
  }

  function endCall(): void {
    if (closed) return;
    closed = true;
    geminiSession?.close();
    if (callId) {
      try {
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
        streamSid = message.start.streamSid;
        callId = message.start.callSid;
        const callerPhone = normalizePhone(message.start.customParameters?.callerPhone);
        store.start({ id: callId, callerPhone, startedAt: new Date().toISOString() });
        geminiSession = await createGeminiLiveSession({
          onText,
          onTurnComplete,
          onInterrupted,
          onError: (msg) => console.error("[twilio] Gemini алдаа:", msg),
          onClose: endCall,
        });
        return;
      }

      if (message.event === "media") {
        if (!geminiSession) return;
        const ulaw = Buffer.from(message.media.payload, "base64");
        const pcm8k = decodeMuLaw(ulaw);
        if (aiSpeaking && rootMeanSquare(pcm8k) > BARGE_IN_RMS_THRESHOLD) onInterrupted();
        const pcm16k = upsample8kTo16k(pcm8k);
        geminiSession.sendRealtimeInput({
          audio: { data: Buffer.from(pcm16k.buffer).toString("base64"), mimeType: "audio/pcm;rate=16000" },
        });
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
