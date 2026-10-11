// ElevenLabs TTS эзэмшигчийн хувилсан дуу хоолойгоор. Gemini-ийн текст
// хариултыг аваад, Twilio руу шууд явуулах боломжтой 8kHz mu-law аудио
// (Buffer) болгон буцаана — дахин sample rate хөрвүүлэх шаардлагагүй.

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { getActiveVoiceId } from "./settings.js";

const MODEL_ID = "eleven_v4";

let client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (client) return client;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY тохируулаагүй байна");
  client = new ElevenLabsClient({ apiKey });
  return client;
}

async function collectStream(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Twilio Media Stream-д шууд явуулах 8kHz mu-law аудио үүсгэнэ.
export async function synthesizeToUlaw8k(text: string): Promise<Buffer> {
  const stream = await getClient().textToSpeech.convert(getActiveVoiceId(), {
    text,
    modelId: MODEL_ID,
    outputFormat: "ulaw_8000",
  });
  return collectStream(stream);
}
