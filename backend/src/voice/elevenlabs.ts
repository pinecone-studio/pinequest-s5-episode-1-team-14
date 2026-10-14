// ElevenLabs TTS эзэмшигчийн хувилсан дуу хоолойгоор. Gemini-ийн текст
// хариултыг Twilio руу шууд явуулах боломжтой 8kHz mu-law аудио болгон
// ирэх тусам нь урсгаж өгнө — дахин sample rate хөрвүүлэх шаардлагагүй.

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { getActiveVoiceId } from "./settings.js";

// eleven_v4_turbo: эхний дуу ~0.25с (eleven_v4 ~1с), утасны ярианд хурд чухал.
const DEFAULT_MODEL_ID = "eleven_v4_turbo";

// Сэтгэл хөдлөлтэй, хүн шиг аялга: тогтвортой байдал бага, хэв маяг дунд (жишээ дуунуудаас "C"-г сонгосон).
// VOICE_STABILITY, VOICE_STYLE-ээр солино.
const voiceSettings = () => ({
  stability: Number(process.env.VOICE_STABILITY ?? 0.3),
  similarityBoost: 0.75,
  style: Number(process.env.VOICE_STYLE ?? 0.4),
  useSpeakerBoost: true,
});

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
// voiceId: бизнесийн сонгосон дуу; өгөөгүй бол анхдагч (идэвхтэй) дуу.
export function streamUlaw8k(text: string, voiceId = getActiveVoiceId()): Promise<AsyncIterable<Uint8Array>> {
  return getClient().textToSpeech.stream(voiceId, {
    text,
    modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
    outputFormat: "ulaw_8000",
    voiceSettings: voiceSettings(),
  });
}

const fixedSpeech = new Map<string, Promise<Buffer>>();

async function collect(text: string, voiceId: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of await streamUlaw8k(text, voiceId)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Мэндчилгээ шиг тогтмол өгүүлбэрийг нэг удаа синтезлээд санах ойд хадгална —
// дуудлага авмагц TTS-ийг хүлээлгүй шууд тоглуулна. Voice эсвэл загвар
// солигдвол шинээр үүсгэнэ; амжилтгүй болсон оролдлогыг хадгалахгүй.
export async function cachedUlaw8k(text: string, voiceId = getActiveVoiceId()): Promise<Buffer> {
  const key = `${voiceId}|${process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID}|${JSON.stringify(voiceSettings())}|${text}`;
  let audio = fixedSpeech.get(key);
  if (!audio) {
    audio = collect(text, voiceId);
    fixedSpeech.set(key, audio);
    audio.catch(() => fixedSpeech.delete(key));
  }
  return audio;
}
