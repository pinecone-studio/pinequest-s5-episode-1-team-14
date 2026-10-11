// Идэвхтэй ElevenLabs voice ID-г файлд хадгална. synthesizeToUlaw8k
// синтез хийх бүрт үүнийг шинээр уншдаг тул сервер дахин асаахгүйгээр,
// дуудлагын дундуур ч гэсэн voice-оо солих боломжтой.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FILE_PATH = resolve(__dirname, "../../data/voice-settings.json");
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{10,40}$/;

export function getActiveVoiceId(): string {
  let json: string;
  try {
    json = readFileSync(FILE_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return envVoiceId();
    throw error;
  }
  const data: unknown = JSON.parse(json);
  const voiceId = (data as { voiceId?: unknown })?.voiceId;
  if (typeof voiceId !== "string" || !VOICE_ID_PATTERN.test(voiceId)) {
    throw new TypeError("voice-settings.json-ийн бүтэц буруу байна");
  }
  return voiceId;
}

export function setActiveVoiceId(voiceId: string): void {
  if (!VOICE_ID_PATTERN.test(voiceId)) throw new TypeError("ElevenLabs voice ID буруу форматтай байна");
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  const temporaryPath = `${FILE_PATH}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, JSON.stringify({ voiceId }, null, 2) + "\n", {
      encoding: "utf8", flag: "wx", mode: 0o600,
    });
    renameSync(temporaryPath, FILE_PATH);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function envVoiceId(): string {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID тохируулаагүй байна");
  return voiceId;
}
