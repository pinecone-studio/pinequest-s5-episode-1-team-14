// Ажилтан руу шилжүүлсэн ярианы тэмдэглэл: тал бүрийн дууг (μ-law 8kHz) өгүүлбэр болгон хувааж,
// Чимэгэ-ээр бичвэр болгоод тухайн дуудлагын бичвэрт "caller" / "staff" гэж нэмнэ.
// Тал бүр тусдаа шугамаар ирдэг тул хэн хэлснийг андуурахгүй.

import { chimegeConfigured, transcribeChimege } from "../ai/chimege.js";
import { createUtteranceDetector, normalizeGain } from "../ai/geminiTurns.js";
import { TranscriptStore, type TranscriptTurn } from "../calls/transcript.js";
import { decodeMuLaw } from "./twilio.js";

type Deps = {
  transcribe?: (samples16k: Int16Array) => Promise<string>;
  save?: (turn: TranscriptTurn) => void;
  now?: () => string;
};

// 8kHz → 16kHz (дээж бүрийг давхарлана): яриа илрүүлэгч ба Чимэгэ 16kHz хүлээнэ.
function upsample(pcm8k: Int16Array): Int16Array {
  const out = new Int16Array(pcm8k.length * 2);
  for (let i = 0; i < pcm8k.length; i++) out[2 * i] = out[2 * i + 1] = pcm8k[i];
  return out;
}

export function createLegTranscriber(callId: string, role: "caller" | "staff", deps: Deps = {}): (payload: Buffer) => void {
  const transcribe = deps.transcribe ?? (chimegeConfigured() ? transcribeChimege : null);
  const store = new TranscriptStore();
  const save = deps.save ?? ((turn: TranscriptTurn) => store.append(callId, turn));
  const now = deps.now ?? (() => new Date().toISOString());
  if (!transcribe) return () => {};
  const detect = createUtteranceDetector();
  let startedAt = now();
  // Нэг тал дээрх өгүүлбэрүүдийг дарааллаар нь бичнэ.
  let queue: Promise<void> = Promise.resolve();
  return (payload) => {
    const utterance = detect(upsample(decodeMuLaw(payload)));
    if (!utterance) return;
    const at = startedAt;
    startedAt = now();
    queue = queue.then(async () => {
      const text = (await transcribe(normalizeGain(utterance))).trim();
      // Чимээ (үг танигдаагүй) бол бичихгүй.
      if (/[\p{L}\p{N}]{2}/u.test(text)) save({ role, text, at });
    }).catch((error) => console.error("[bridge] тэмдэглэл бичихэд алдаа:", error instanceof Error ? error.message : error));
  };
}
