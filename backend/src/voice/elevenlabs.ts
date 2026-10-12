// ElevenLabs TTS эзэмшигчийн хувилсан дуу хоолойгоор. Gemini-ийн текст
// хариултыг Twilio руу шууд явуулах боломжтой 8kHz mu-law аудио болгон
// ирэх тусам нь урсгаж өгнө — дахин sample rate хөрвүүлэх шаардлагагүй.

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { getActiveVoiceId } from "./settings.js";

const DEFAULT_MODEL_ID = "eleven_v4";

let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (client) return client;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY тохируулаагүй байна");
  client = new ElevenLabsClient({ apiKey });
  return client;
}

// Эхний chunk бэлэн болмогц дуудагчид сонсогдож эхэлнэ; бүтэн өгүүлбэрийг
// хүлээхгүй. ELEVENLABS_MODEL_ID-ээр загварыг (жишээ нь eleven_v4_turbo)
// код өөрчлөхгүйгээр сольж харьцуулна.
export function streamUlaw8k(text: string): Promise<AsyncIterable<Uint8Array>> {
  return getClient().textToSpeech.stream(getActiveVoiceId(), {
    text,
    modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
    outputFormat: "ulaw_8000",
  });
}
