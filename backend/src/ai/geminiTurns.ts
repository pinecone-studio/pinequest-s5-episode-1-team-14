// Ээлжилсэн (turn-based) горим: Gemini Live утасны монгол яриаг танихгүй
// (богино өгүүлбэрийн хэлийг буруу таадаг) тул зочин ярьж дуусахыг өөрсдөө
// илрүүлж, тэр хэсэг дууг Flash загварт өгч текст хариу авна. Гадна тал нь
// createGeminiLiveSession-тэй ижил тул дуудлагын урсгал өөрчлөгдөхгүй.

import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { BusinessKnowledgeStore } from "../knowledge/store.js";
import { belongsTo, DEFAULT_BUSINESS_ID } from "../accounts/store.js";
import { buildSystemInstruction } from "./callPrompt.js";
import { chimegeConfigured, toWav, transcribeChimege, warmChimege } from "./chimege.js";
import { runTool, TOOLS, type GeminiLiveCallbacks, type SpeechState } from "./geminiLive.js";

const MODELS = [process.env.GEMINI_TURN_MODEL || "gemini-3.6-flash", process.env.GEMINI_TURN_FALLBACK || "gemini-3.5-flash"];
const SAMPLE_RATE = 16_000;
const FRAME_MS = 20;
// Яриа эхэлсэн/дууссан гэж үзэх дууны түвшин ба үргэлжлэх хугацаа. Утасны шугамын суурь чимээ ~20,
// намуухан яриа 300-600 орчим байдаг тул босгыг нам тавьсан (бодит дуудлагын бичлэгээр тааруулсан).
const START_RMS = 250;
const END_RMS = 150;
const START_FRAMES = 3;
const END_SILENCE_FRAMES = 24; // ~480мс чимээгүй бол ярьж дууссан
const PRE_ROLL_FRAMES = 15; // эхний авиаг таслахгүйн тулд өмнөх 300мс
const MIN_VOICED_FRAMES = 8; // үүнээс богино бол чимээ гэж үзнэ
const MAX_FRAMES = 20_000 / FRAME_MS;
const MAX_TOOL_ROUNDS = 3;
const FIRST_CHUNK_TIMEOUT_MS = 7000;
export const WAIT_TEXT = "За, түр хүлээгээрэй.";
export const ANSWER_ACK = "За.";
// Gemini-ийн эхний үг ~1.2с-д ирдэг: хариулт өгсөн зочинд 1с, асуусан зочинд 1.6с хүлээгээд л богино үг хэлнэ.
const ANSWER_ACK_MS = 1000;
const QUESTION_ACK_MS = 1600;

// Зочны хэлсэн нь асуулт уу ("хэд вэ?", "байгаа юу", "хаана"): асуултын өмнө "За" гэхгүй.
export function isQuestion(text: string): boolean {
  const clean = text.trim().toLowerCase();
  return /[?？]\s*$/u.test(clean) || /(?:^|\s)(?:уу|үү|вэ|бэ|юу|бол)[\s.!]*$/u.test(clean) ||
    /(?:^|\s)(?:хэд|хэдэн|хэзээ|хаана|яаж|ямар|юу|хэн|аль)(?:\p{L}*)(?=\s|$)/u.test(clean);
}
// Чимэгэ хоосон буцаасан ч дуутай хэсэг нь үүнээс урт бол чимээ биш яриа гэж үзээд Gemini-ээр сонсоно.
// Нийт урт тохирохгүй: урьдчилсан 0.3с, төгсгөлийн 0.48с чимээгүй үргэлж багтдаг.
const MIN_FALLBACK_VOICED_SECONDS = 0.3;

// Дуутай (чимээгүй биш) 20мс хэсгүүдийн нийт урт, секундээр.
export function voicedSeconds(samples: Int16Array, threshold = END_RMS): number {
  const frame = (SAMPLE_RATE * FRAME_MS) / 1000;
  let voiced = 0;
  for (let offset = 0; offset + frame <= samples.length; offset += frame) {
    if (rms(samples.subarray(offset, offset + frame)) > threshold) voiced++;
  }
  return (voiced * FRAME_MS) / 1000;
}
// AI-ийн дуу зочны утаснаас (чанга яригч) буцаж орвол Чимэгэ AI-ийн өөрийн үгсийг танина.
// Танигдсан үгсийн ихэнх нь AI-ийн саяхан хэлсэн үгтэй ижил үндэстэй бол цуурай гэж үзнэ.
const ECHO_SHARE = 0.6;
const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 3);
export function isEcho(heard: string, spoken: string): boolean {
  const said = words(spoken).map((word) => word.slice(0, 4));
  const got = words(heard);
  if (!got.length || !said.length) return false;
  return got.filter((word) => said.includes(word.slice(0, 4))).length / got.length >= ECHO_SHARE;
}

const RETRY_TEXT = "Уучлаарай, дахиад нэг удаа хэлээд өгөөч?";

const TEXT_INPUT_INSTRUCTION = `Зочны яриаг таних систем текст болгож өгнө. Утасны дуу тул үг алдаатай
танигдсан байж болно: хамгийн магадлалтай утгаар нь ойлгож хариул. Тоог үсгээр бичсэн ч ("7 цагт") ойлго.
Хариулт утсаар уншигдах тул богино, тэмдэглэгээгүй энгийн өгүүлбэрээр бич.
"За"-г зөвхөн зочны хариултыг (нэр, цаг, хүний тоо) хүлээж авахад хэрэглэ; асуултад хариулахдаа бүү
хэрэглэ. "Ойлголоо" гэж бүү хэл. Хариулт бүрийг "За"-аар бүү эхлүүл.
Захиалгын асуултад (өдөр, цаг, хүний тоо, нэр) ирсэн хариулт утгагүй эсвэл асуултад тохирохгүй бол
буруу сонссон гэж үзээд тэр асуултаа дахин асуу, жишээ нь "Уучлаарай, хэдэн хүн гэж хэлсэн бэ?".
Зочин өөрөө болихоос нааш захиалгыг дуусгалгүй орхиж, өөр сэдэв рүү бүү шилж.`;

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

// Арын тогтмол чимээ (кондиционер, сэнс, машин) босгыг давж яриа мэт илрэхгүйн тулд чимээний
// түвшинг хэмжиж, босгыг түүнээс хэд дахин өндөр тавина. Чимээ удаан өсөж (яриаг чимээ гэж
// андуурахгүй), хурдан буурна. Чимээгүй шугамд босго анхны утгаараа үлдэнэ.
const NOISE_RISE = 0.01;
// Яриа үргэлжилж байх үед маш удаан өснө: дуудлагын дундуур асаасан кондиционер мэт тогтмол
// чимээ хязгааргүй урт "яриа" болж гацахгүй, жинхэнэ яриа тасрахгүй.
const NOISE_RISE_IN_SPEECH = 0.002;
const NOISE_FALL = 0.1;
const START_OVER_NOISE = 3;
const END_OVER_NOISE = 2;

export function createNoiseFloor() {
  let floor = 0;
  return {
    observe(level: number, inSpeech = false): void {
      floor += (level - floor) * (level > floor ? (inSpeech ? NOISE_RISE_IN_SPEECH : NOISE_RISE) : NOISE_FALL);
    },
    start: () => Math.max(START_RMS, floor * START_OVER_NOISE),
    end: () => Math.max(END_RMS, floor * END_OVER_NOISE),
  };
}

// 20мс-ийн хэсгүүдийг авч, нэг бүтэн яриа дуусмагц түүнийг буцаана.
// onStart: яриа эхэлсэн мөчид (жишээ нь холболтыг урьдчилан нээх).
// listen=false (AI-ийн мэндчилгээ г.м.) үед шинэ яриа эхлүүлэхгүй, зөвхөн чимээний түвшинг хэмжинэ.
export function createUtteranceDetector(onStart?: () => void) {
  let preRoll: Int16Array[] = [];
  let frames: Int16Array[] = [];
  let speaking = false;
  let loudRun = 0;
  let silentRun = 0;
  let voiced = 0;
  const noise = createNoiseFloor();

  const detect = (frame: Int16Array, listen = true): Int16Array | null => {
    const level = rms(frame);
    if (!speaking) {
      noise.observe(level);
      preRoll.push(frame);
      if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
      loudRun = listen && level > noise.start() ? loudRun + 1 : 0;
      if (loudRun < START_FRAMES) return null;
      speaking = true;
      onStart?.();
      frames = preRoll;
      preRoll = [];
      voiced = loudRun;
      silentRun = 0;
      return null;
    }
    frames.push(frame);
    noise.observe(level, true);
    if (level > noise.end()) {
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
  // Одоогийн "дуутай" босго (16kHz-ийн түвшинд): чимээ мөн эсэхийг шалгахад.
  return Object.assign(detect, { voiceLevel: () => noise.end() });
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

export async function createGeminiTurnSession(
  callbacks: GeminiLiveCallbacks,
  context: { callerPhone?: string | null; greeted?: boolean; greeting?: string; extra?: string; businessId?: string; businessName?: string } = {},
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY тохируулаагүй байна");
  const ai = new GoogleGenAI({ apiKey });
  const base = buildSystemInstruction({
    // Зөвхөн энэ дуудлагын бизнесийн мэдээлэл.
    knowledge: new BusinessKnowledgeStore().list({ activeOnly: true }).filter(belongsTo(context.businessId ?? DEFAULT_BUSINESS_ID)),
    callerPhone: context.callerPhone,
    greeted: context.greeted,
    greeting: context.greeting,
    extra: context.extra,
    businessName: context.businessName,
    bookingEnabled: !context.businessId || context.businessId === DEFAULT_BUSINESS_ID,
  });
  // Чимэгэ текст өгсөн үед загвар зөвхөн хариулна; дуу шууд өгөх үед сонссоноо эхний мөрөнд бичнэ.
  const instructions = { text: `${base}\n\n${TEXT_INPUT_INSTRUCTION}`, audio: `${base}\n\n${TURN_FORMAT_INSTRUCTION}` };

  // Дуудлага эхлэхэд (мэндчилгээ уншигдах хооронд) Чимэгэ рүү холболтыг бэлдэнэ.
  if (chimegeConfigured()) warmChimege();
  // AI ярьж байх үед эхэлсэн яриаг илүү хатуу шүүнэ (чимээ, цуурай AI-г таслахгүй).
  let state: SpeechState = "silent";
  let startedWhileSpeaking = false;
  const detect = createUtteranceDetector(() => {
    startedWhileSpeaking = state !== "silent";
    if (chimegeConfigured()) warmChimege();
  });
  // AI-ийн саяхан хэлсэн үгс: цуурайг танихад.
  let spoken = context.greeting ?? "";
  const history: Content[] = [];
  // Таслагдсан (шинэ ярианд дарагдсан) эргэлтийн хариулаагүй бичвэрүүд.
  const unanswered: string[] = [];
  let closed = false;
  // Шинэ яриа ирэх бүрт нэмэгдэнэ: өмнөх, дуусаагүй хариултыг хүчингүй болгоно.
  let turn = 0;

  // allowTools=false: хэрэгслийн хязгаарт хүрсэн үед загварыг заавал текстээр хариулуулна.
  async function generate(model: string, systemInstruction: string, contents: Content[], id: number, onDelta: (text: string) => void, allowTools = true): Promise<Part[]> {
    // Загвар гацвал (ачаалал, хязгаар) зочныг чимээгүй хүлээлгэхгүйн тулд эхний хариуг хязгаартай хүлээнэ.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FIRST_CHUNK_TIMEOUT_MS);
    const stream = await ai.models.generateContentStream({
      model, contents,
      config: { systemInstruction, ...(allowTools ? { tools: TOOLS } : {}), thinkingConfig: { thinkingBudget: 0 }, abortSignal: controller.signal },
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

  async function answer(utterance: Int16Array, whileSpeaking: boolean, voiceLevel: number): Promise<void> {
    const startedAt = Date.now();
    console.log(`[turns] яриа илэрлээ (${(utterance.length / SAMPLE_RATE).toFixed(1)}с)`);
    const loud = normalizeGain(utterance);
    // Эхлээд Чимэгэ-ээр текст болгоно; алдаа гарвал дууг Gemini-д шууд өгөх хуучин зам руу буцна.
    let transcript: string | null = null;
    if (chimegeConfigured()) {
      try {
        transcript = await transcribeChimege(loud);
        console.log(`[turns] Чимэгэ ${Date.now() - startedAt}мс`);
      } catch (error) {
        console.error("[turns] Чимэгэ алдаа, Gemini-ээр сонсоно:", error instanceof Error ? error.message : error);
      }
      if (closed) return;
      // Хоосон текст: богино бол амьсгал, ханиалга мэт чимээ (AI-г таслахгүй, хариулахгүй). Урт бол
      // Чимэгэ "тав", "дөрвүүлээ" мэт ганц үгийн хариултыг таньж чадаагүй байж болох тул дууг нь Gemini-д
      // өгнө: ярианы өмнөх хэсгийг мэддэг тул ойлгоно, ойлгохгүй бол дахин хэлэхийг хүснэ. Чимээгүй өнгөрөхгүй.
      if (transcript === "" || (transcript && !/[\p{L}\p{N}]{2}/u.test(transcript))) {
        // AI ярьж байх үед танигдаагүй дуу бол чимээ эсвэл цуурай: AI-г таслахгүй.
        if (whileSpeaking) {
          console.log("[turns] AI ярьж байхад танигдаагүй дуу — алгасав");
          return;
        }
        const voiced = voicedSeconds(utterance, voiceLevel);
        if (voiced < MIN_FALLBACK_VOICED_SECONDS) {
          console.log(`[turns] яриа танигдсангүй (чимээ, дуутай ${voiced.toFixed(2)}с) — алгасав`);
          return;
        }
        console.log(`[turns] Чимэгэ таньсангүй (дуутай ${voiced.toFixed(2)}с) — Gemini-ээр сонсоно`);
        transcript = null;
      }
    }
    if (whileSpeaking && transcript && isEcho(transcript, spoken)) {
      console.log("[turns] AI-ийн өөрийн дуу буцаж орсон (цуурай) — алгасав");
      return;
    }
    // Жинхэнэ яриа: AI ярьж байвал зогсооно.
    if (turn) callbacks.onInterrupted?.();
    const id = ++turn;
    let heard = "";
    let reply = "";
    let ending = false;
    // Хариулт удаашрах үед л богино үг хэлнэ: зочин хариулт өгсөн бол "За", асуусан бол "За, түр хүлээгээрэй".
    // Хариулт хурдан бэлэн бол юу ч нэмэхгүй: үргэлж "За" гэх нь хиймэл, асуултын өмнө утгагүй.
    let ackTimer: NodeJS.Timeout | undefined;
    if (transcript) {
      const question = isQuestion(transcript);
      ackTimer = setTimeout(() => {
        if (!closed && id === turn && !reply) callbacks.onAck?.(question ? WAIT_TEXT : ANSWER_ACK);
      }, question ? QUESTION_ACK_MS : ANSWER_ACK_MS);
    }
    let firstAt = 0;
    const parse = createReplyParser(
      (text) => {
        heard = text;
        callbacks.onCallerText?.(text);
      },
      (delta) => {
        if (!firstAt) firstAt = Date.now() - startedAt;
        reply += delta;
        spoken = reply;
        callbacks.onText?.(delta);
      },
    );
    if (transcript) {
      callbacks.onCallerText?.(transcript);
      unanswered.push(transcript);
      // Өмнөх хариулаагүй өгүүлбэрүүдийг хамт өгнө: зочин хэд хэдэн хэсэг болгон ярьж болно.
      transcript = unanswered.join(" ");
      heard = transcript;
    }
    const onDelta = transcript
      ? (delta: string) => {
        clearTimeout(ackTimer);
        if (!firstAt) firstAt = Date.now() - startedAt;
        reply += delta;
        spoken = reply;
        callbacks.onText?.(delta);
      }
      : parse;
    const systemInstruction = transcript ? instructions.text : instructions.audio;
    const turnContents: Content[] = [{
      role: "user",
      parts: [transcript ? { text: transcript } : { inlineData: { mimeType: "audio/wav", data: toWav(loud).toString("base64") } }],
    }];

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let parts: Part[] | null = null;
      for (const model of MODELS) {
        try {
          // Сүүлийн эргэлтэд хэрэгсэлгүй: "түр хүлээгээрэй" гээд чимээгүй болохгүйн тулд олсон мэдээллээрээ хариулна.
          parts = await generate(model, systemInstruction, [...history, ...turnContents], id, onDelta, round < MAX_TOOL_ROUNDS);
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
      if (calls.some((call) => call.name === "end_call")) ending = true;
      // Утас тавихын өмнө "түр хүлээгээрэй" гэхгүй.
      if (!reply.trim() && calls.some((call) => call.name !== "end_call")) {
        reply += `${WAIT_TEXT} `;
        // Хариулт бүтнээрээ уншигддаг тул хүлээлгийн үгийг тусад нь шууд хэлүүлнэ.
        if (callbacks.onHold) callbacks.onHold(WAIT_TEXT);
        else callbacks.onText?.(`${WAIT_TEXT} `);
      }
      const responses: Part[] = [];
      for (const call of calls) {
        const result = await runTool(call.name ?? "", (call.args ?? {}) as Record<string, unknown>, { callerPhone: context.callerPhone, businessId: context.businessId, transfer: callbacks.onTransfer });
        callbacks.onToolResult?.(call.name ?? "", result);
        responses.push({ functionResponse: { name: call.name, id: call.id, response: { result: toUlaanbaatarTimes(result) } } });
      }
      turnContents.push({ role: "user", parts: responses });
    }

    // Баяртай гээд утсаа тавих гэж буй бол "дахин хэлнэ үү" гэхгүй.
    if (!reply.trim() && !ending) callbacks.onText?.(RETRY_TEXT);
    console.log(`[turns] яриа ${(utterance.length / SAMPLE_RATE).toFixed(1)}с → эхний үг ${firstAt}мс, нийт ${Date.now() - startedAt}мс`);
    // Түүхэнд дууг биш сонссон текстийг үлдээнэ: дараагийн хүсэлтүүд жижиг, хурдан байна.
    turnContents[0] = { role: "user", parts: [{ text: heard || "(сонсогдоогүй)" }] };
    history.push(...turnContents);
    unanswered.length = 0;
    callbacks.onTurnComplete?.();
  }

  callbacks.onOpen?.();
  return {
    sendRealtimeInput(input: { audio?: { data: string; mimeType: string }; text?: string }): void {
      if (closed || !input.audio) return;
      const bytes = Buffer.from(input.audio.data, "base64");
      state = callbacks.speechState?.() ?? "silent";
      // Buffer-ийн эхлэл тэгш бус байж болох тул хуулж авна.
      const utterance = detect(new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.length & ~1))), state !== "protected");
      if (!utterance) return;
      answer(utterance, startedWhileSpeaking, detect.voiceLevel()).catch((error) => {
        console.error("[turns] алдаа:", error instanceof Error ? error.message : error);
        callbacks.onError?.(error instanceof Error ? error.message : "алдаа");
      });
    },
    close(): void {
      closed = true;
    },
  };
}
