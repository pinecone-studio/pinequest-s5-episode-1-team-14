import { resolve } from "node:path";
import { readJsonArray, writeJsonArray } from "../storage/jsonFile.js";

// text: null — дуудагч ярьсан боловч бичвэр нь уншигдахуйц биш (загвар өөр хэлээр буруу таньсан).
export type TranscriptTurn = { role: "caller" | "agent"; text: string | null; at: string };
type Entry = { callId: string; turns: TranscriptTurn[] };

// Дуудлага бүрийн ярианы бичвэр. Харилцагчийн яриа агуулдаг тул data/ дотор (git-д орохгүй) хадгална.
// ponytail: бүх бичвэр нэг файлд, ээлж бүрт дахин бичнэ; түүх томорвол дуудлага тус бүрийн файл эсвэл DB.
export class TranscriptStore {
  constructor(private readonly filePath = resolve(__dirname, "../../data/transcripts.json")) {}

  all(): Record<string, TranscriptTurn[]> {
    return Object.fromEntries((readJsonArray(this.filePath) as Entry[]).map(({ callId, turns }) => [callId, turns]));
  }

  append(callId: string, turn: TranscriptTurn): void {
    const entries = readJsonArray(this.filePath) as Entry[];
    const entry = entries.find((item) => item.callId === callId);
    if (entry) entry.turns.push(turn);
    else entries.push({ callId, turns: [turn] });
    writeJsonArray(this.filePath, entries);
  }
}

// Gemini-ээс хэсэг хэсгээр ирэх бичвэрийг ээлж (turn) болгон нэгтгэнэ. Нэг тал ярьж
// эхлэхэд нөгөө талын хуримтлагдсан текст бүтэн ээлж болж хадгалагдана.
export function createTranscriptRecorder(save: (turn: TranscriptTurn) => void, now: () => string = () => new Date().toISOString()) {
  const pending = { caller: "", agent: "" };
  function flush(role: TranscriptTurn["role"]): void {
    const text = pending[role].replace(/\s+/g, " ").trim();
    pending[role] = "";
    if (!text) return;
    // Gemini монгол яриаг хааяа солонгос, япон мэт өөр бичгээр утгагүй буулгадаг — тийм мөрийг хадгалахгүй.
    save({ role, text: role === "caller" && !/[Ѐ-ӿ]/.test(text) ? null : text, at: now() });
  }
  return {
    caller(delta: string): void { flush("agent"); pending.caller += delta; },
    agent(delta: string): void { flush("caller"); pending.agent += delta; },
    // Бүтэн өгүүлбэр (жишээ нь системийн тоглуулсан мэндчилгээ).
    say(role: TranscriptTurn["role"], text: string): void { flush("caller"); flush("agent"); pending[role] = text; flush(role); },
    endTurn(): void { flush("caller"); flush("agent"); },
  };
}
