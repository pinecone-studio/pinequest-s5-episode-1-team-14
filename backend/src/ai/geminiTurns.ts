// Ээлжилсэн (turn-based) горим: Gemini Live утасны монгол яриаг танихгүй
// (богино өгүүлбэрийн хэлийг буруу таадаг) тул зочин ярьж дуусахыг өөрсдөө
// илрүүлж, тэр хэсэг дууг Flash загварт өгч текст хариу авна. Гадна тал нь
// createGeminiLiveSession-тэй ижил тул дуудлагын урсгал өөрчлөгдөхгүй.

import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { BusinessKnowledgeStore } from "../knowledge/store.js";
import { buildSystemInstruction } from "./callPrompt.js";
import { runTool, TOOLS, type GeminiLiveCallbacks } from "./geminiLive.js";

const MODELS = [process.env.GEMINI_TURN_MODEL || "gemini-3.6-flash", process.env.GEMINI_TURN_FALLBACK || "gemini-3.5-flash"];
const SAMPLE_RATE = 16_000;
const FRAME_MS = 20;
// Яриа эхэлсэн/дууссан гэж үзэх дууны түвшин ба үргэлжлэх хугацаа. Утасны шугамын суурь чимээ ~20,
// намуухан яриа 300-600 орчим байдаг тул босгыг нам тавьсан (бодит дуудлагын бичлэгээр тааруулсан).
const START_RMS = 250;
const END_RMS = 150;
const START_FRAMES = 3;
const END_SILENCE_FRAMES = 32; // ~640мс чимээгүй бол ярьж дууссан
const PRE_ROLL_FRAMES = 15; // эхний авиаг таслахгүйн тулд өмнөх 300мс
const MIN_VOICED_FRAMES = 8; // үүнээс богино бол чимээ гэж үзнэ
const MAX_FRAMES = 20_000 / FRAME_MS;
const MAX_TOOL_ROUNDS = 3;
const FIRST_CHUNK_TIMEOUT_MS = 7000;
const RETRY_TEXT = "Уучлаарай, дахин хэлж өгнө үү?";

const TURN_FORMAT_INSTRUCTION = `Хариултын хэлбэр (ЗААВАЛ): зочны яриа дуугаар ирнэ. Хариултаа ХОЁР мөрөөр бич.
1-р мөр: зочны хэлснийг яг сонссоноороо, монгол кириллээр, <<...>> хаалтанд. Жишээ: <<Бууз хэдэн төгрөг вэ?>>
2-р мөр: зочинд хэлэх хариулт. Утсаар уншигдах тул богино, тэмдэглэгээгүй энгийн өгүүлбэр.
Зөвхөн дуунд байгаа үгийг бич: өмнөх ярианаас таамаглаж бүү зохио. Тодорхойгүй эсвэл юу ч
сонсогдоогүй бол 1-р мөрөнд <<>> гэж бичээд дахин хэлэхийг хүс.`;

function rms(frame: Int16Array): number {
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
}

// 20мс-ийн хэсгүүдийг авч, нэг бүтэн яриа дуусмагц түүнийг буцаана.
export function createUtteranceDetector() {
  let preRoll: Int16Array[] = [];
  let frames: Int16Array[] = [];
  let speaking = false;
  let loudRun = 0;
  let silentRun = 0;
  let voiced = 0;

  return (frame: Int16Array): Int16Array | null => {
    const level = rms(frame);
    if (!speaking) {
      preRoll.push(frame);
      if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
      loudRun = level > START_RMS ? loudRun + 1 : 0;
      if (loudRun < START_FRAMES) return null;
      speaking = true;
      frames = preRoll;
      preRoll = [];
      voiced = loudRun;
      silentRun = 0;
      return null;
    }
    frames.push(frame);
    if (level > END_RMS) {
      silentRun = 0;
      voiced++;
    } else {
      silentRun++;
    }
    if (silentRun < END_SILENCE_FRAMES && frames.length < MAX_FRAMES) return null;
    const done = frames;
    const enough = voiced >= MIN_VOICED_FRAMES;
    speaking = false;
    frames = [];
    loudRun = 0;
    if (!enough) return null;
    const out = new Int16Array(done.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of done) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  };
}

// Урсгалаар ирэх хариунаас "<<сонссон>>" мөрийг салгаж, үлдсэнийг хариулт болгон дамжуулна.
export function createReplyParser(onHeard: (text: string) => void, onReply: (delta: string) => void) {
  let pending = "";
  let inBody = false;
  return (delta: string): void => {
    if (inBody) {
      onReply(delta);
      return;
    }
    pending += delta;
    const trimmed = pending.trimStart();
    if (trimmed.length < 2) return;
    if (!trimmed.startsWith("<<")) {
      inBody = true;
      onReply(trimmed);
      return;
    }
    const end = trimmed.indexOf(">>");
    if (end < 0) return;
    inBody = true;
    const heard = trimmed.slice(2, end).trim();
    if (heard) onHeard(heard);
    const rest = trimmed.slice(end + 2).trimStart();
    if (rest) onReply(rest);
  };
}

// Утасны дуу ихэвчлэн сул ирдэг: оргилыг ~70% хүртэл өсгөж өгвөл загвар тод сонсоно.
export function normalizeGain(samples: Int16Array): Int16Array {
  let peak = 1;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const factor = Math.min(8, 23_000 / peak);
  return factor <= 1 ? samples : samples.map((sample) => Math.round(sample * factor));
}

// Календарь цагийг UTC-ээр буцаадаг; загвар 11:00Z-г 19:00 гэж бодолгүй шууд уншдаг тул
// Улаанбаатарын цаг (+08:00, зуны цаггүй) болгож өгнө.
export function toUlaanbaatarTimes<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null).replace(/"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?Z"/g, (_, stamp: string) => {
    const local = new Date(Date.parse(`${stamp}Z`) + 8 * 3_600_000).toISOString().slice(0, 19);
    return `"${local}+08:00"`;
  })) as T;
}

function toWav(samples: Int16Array): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SAMPLE_RATE, 24);
  head.writeUInt32LE(SAMPLE_RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

export async function createGeminiTurnSession(
  callbacks: GeminiLiveCallbacks,
  context: { callerPhone?: string | null; greeted?: boolean } = {},
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY тохируулаагүй байна");
  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = `${buildSystemInstruction({
    knowledge: new BusinessKnowledgeStore().list({ activeOnly: true }),
    callerPhone: context.callerPhone,
    greeted: context.greeted,
  })}\n\n${TURN_FORMAT_INSTRUCTION}`;

  const detect = createUtteranceDetector();
  const history: Content[] = [];
  let closed = false;
  // Шинэ яриа ирэх бүрт нэмэгдэнэ: өмнөх, дуусаагүй хариултыг хүчингүй болгоно.
  let turn = 0;

  async function generate(model: string, contents: Content[], id: number, onDelta: (text: string) => void): Promise<Part[]> {
    // Загвар гацвал (ачаалал, хязгаар) зочныг чимээгүй хүлээлгэхгүйн тулд эхний хариуг хязгаартай хүлээнэ.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FIRST_CHUNK_TIMEOUT_MS);
    const stream = await ai.models.generateContentStream({
      model, contents,
      config: { systemInstruction, tools: TOOLS, thinkingConfig: { thinkingBudget: 0 }, abortSignal: controller.signal },
    });
    const parts: Part[] = [];
    for await (const chunk of stream) {
      clearTimeout(timer);
      if (closed || id !== turn) break;
      // Хэсгүүдийг байгаагаар нь хадгална: function дуудлагын гарын үсэг (thoughtSignature) алдагдах ёсгүй.
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought) onDelta(part.text);
      }
    }
    return parts;
  }

  async function answer(utterance: Int16Array): Promise<void> {
    const id = ++turn;
    const startedAt = Date.now();
    console.log(`[turns] яриа илэрлээ (${(utterance.length / SAMPLE_RATE).toFixed(1)}с) — загвараас хариу хүлээж байна`);
    let heard = "";
    let reply = "";
    let firstAt = 0;
    const parse = createReplyParser(
      (text) => {
        heard = text;
        callbacks.onCallerText?.(text);
      },
      (delta) => {
        if (!firstAt) firstAt = Date.now() - startedAt;
        reply += delta;
        callbacks.onText?.(delta);
      },
    );
    const turnContents: Content[] = [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: toWav(normalizeGain(utterance)).toString("base64") } }] }];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let parts: Part[] | null = null;
      for (const model of MODELS) {
        try {
          parts = await generate(model, [...history, ...turnContents], id, parse);
          break;
        } catch (error) {
          console.error(`[turns] ${model} алдаа:`, error instanceof Error ? error.message.slice(0, 160) : error);
        }
      }
      if (closed || id !== turn) return;
      if (!parts) {
        callbacks.onError?.("загвар хариу өгсөнгүй");
        callbacks.onText?.(RETRY_TEXT);
        callbacks.onTurnComplete?.();
        return;
      }
      turnContents.push({ role: "model", parts });
      const calls = parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
      if (!calls.length) break;
      const responses: Part[] = [];
      for (const call of calls) {
        const result = await runTool(call.name ?? "", (call.args ?? {}) as Record<string, unknown>);
        callbacks.onToolResult?.(call.name ?? "", result);
        responses.push({ functionResponse: { name: call.name, id: call.id, response: { result: toUlaanbaatarTimes(result) } } });
      }
      turnContents.push({ role: "user", parts: responses });
    }

    if (!reply.trim()) callbacks.onText?.(RETRY_TEXT);
    console.log(`[turns] яриа ${(utterance.length / SAMPLE_RATE).toFixed(1)}с → эхний үг ${firstAt}мс, нийт ${Date.now() - startedAt}мс`);
    // Түүхэнд дууг биш сонссон текстийг үлдээнэ: дараагийн хүсэлтүүд жижиг, хурдан байна.
    turnContents[0] = { role: "user", parts: [{ text: heard || "(сонсогдоогүй)" }] };
    history.push(...turnContents);
    callbacks.onTurnComplete?.();
  }

  callbacks.onOpen?.();
  return {
    sendRealtimeInput(input: { audio?: { data: string; mimeType: string }; text?: string }): void {
      if (closed || !input.audio) return;
      const bytes = Buffer.from(input.audio.data, "base64");
      // Buffer-ийн эхлэл тэгш бус байж болох тул хуулж авна.
      const utterance = detect(new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.length & ~1))));
      if (!utterance) return;
      // Өмнөх хариулт дуусаагүй байхад шинэ яриа ирвэл түүнийг зогсооно.
      if (turn && callbacks.onInterrupted) callbacks.onInterrupted();
      answer(utterance).catch((error) => {
        console.error("[turns] алдаа:", error instanceof Error ? error.message : error);
        callbacks.onError?.(error instanceof Error ? error.message : "алдаа");
      });
    },
    close(): void {
      closed = true;
    },
  };
}
