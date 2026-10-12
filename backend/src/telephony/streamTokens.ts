// /media-stream WebSocket-ийн нэг удаагийн нэвтрэх token. Twilio Stream URL
// дээр query дамжуулдаггүй тул token-ийг <Parameter>-ээр өгч, "start"
// мессежээс шалгана. Зөвхөн гарын үсгээр баталгаажсан /voice хүсэлт л token
// авна — ингэснээр гадны хүн шууд холбогдож Gemini/ElevenLabs зарцуулж чадахгүй.
// ponytail: санах ойд хадгалсан тул нэг backend процесст л ажиллана; олон
// replica болбол хугацаатай HMAC token эсвэл дундын сан хэрэгтэй.

import { randomBytes } from "node:crypto";

const TTL_MS = 60_000;
const tokens = new Map<string, number>();

export function issueStreamToken(now = Date.now()): string {
  for (const [token, expiresAt] of tokens) if (expiresAt <= now) tokens.delete(token);
  const token = randomBytes(32).toString("base64url");
  tokens.set(token, now + TTL_MS);
  return token;
}

// Зөв ч, буруу ч нэг л удаа ашиглагдана — дахин тоглуулах (replay) боломжгүй.
export function consumeStreamToken(token: unknown, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const expiresAt = tokens.get(token);
  tokens.delete(token);
  return expiresAt !== undefined && expiresAt > now;
}
