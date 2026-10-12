// Twilio Media Streams <-> Gemini Live bridge. Дуудлагын 8kHz mu-law
// аудиог 16kHz PCM болгож Gemini рүү явуулна. Хариуг VOICE_MODE-оор сонгоно:
// анхдагч нь Gemini-ийн текстийг ElevenLabs-аар 8kHz mu-law болгох;
// "gemini" бол Gemini-ийн өөрийн 24kHz аудиог 8kHz mu-law болгож шууд дамжуулна
// (ElevenLabs-ийн алхамгүй тул хурдан, гэхдээ хувилсан дуу хоолой биш).

import type { WebSocket, RawData } from "ws";
import { createGeminiLiveSession } from "../ai/geminiLive.js";
import { CALL_GREETING } from "../ai/callPrompt.js";
import { streamUlaw8k } from "../voice/elevenlabs.js";
import { CallSessionStore } from "../calls/store.js";
import { takeSentences } from "./sentences.js";

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;
// Дуудагч ярьж байна гэж үзэх дууны түвшин — зөвхөн хариултын хугацааг
// хэмжих лог-д ашиглана.
const CALLER_VOICE_RMS = 500;
const PHONE_PATTERN = /^(?:\d{8}|\+[1-9]\d{7,14})$/;

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
  let streamSid = "";
  let callId = "";
  let pendingText = "";
  let speakQueue: Promise<void> = Promise.resolve();
  let geminiSession: Awaited<ReturnType<typeof createGeminiLiveSession>> | null = null;
  let closed = false;
  let callerSpokeAt = 0;
  let awaitingReply = false;
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
  async function speak(text: string): Promise<void> {
    if (closed || !text.trim()) return;
    for await (const chunk of await streamUlaw8k(text)) {
      if (closed) return;
      sendAudio(chunk);
    }
  }

  function enqueueSpeak(text: string): void {
    speakQueue = speakQueue.then(() => speak(text)).catch((error) => console.error("[twilio] ярих алдаа:", error));
  }

  function onGeminiAudio(pcm24k: Buffer): void {
    if (!closed) sendAudio(encodeMuLaw(downsample(pcm24k)));
  }

  // Twilio-д буферлэгдсэн, хараахан тоглоогүй аудиог хаяна.
  function onInterrupted(): void {
    if (!closed && streamSid) ws.send(JSON.stringify({ event: "clear", streamSid }));
  }

  function onText(delta: string): void {
    const { sentences, rest } = takeSentences(pendingText + delta);
    sentences.forEach(enqueueSpeak);
    pendingText = rest;
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
        // Gemini холбогдох хооронд дуудагч чимээгүй хүлээхгүйн тулд эхэлж мэндэлнэ.
        if (!nativeVoice) enqueueSpeak(CALL_GREETING);
        geminiSession = await createGeminiLiveSession({
          ...(nativeVoice ? { onAudio: onGeminiAudio, onInterrupted } : { onText, onTurnComplete }),
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
        if (rootMeanSquare(pcm8k) > CALLER_VOICE_RMS) {
          callerSpokeAt = Date.now();
          awaitingReply = true;
        }
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
