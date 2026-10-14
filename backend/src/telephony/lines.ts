// Утасны дугаарууд (SIP шугам) ба тэдгээрийн бизнес. Нууц үгийг AES-256-GCM-ээр шифрлэж хадгална;
// түлхүүр нь LINE_SECRET (эсвэл SESSION_SECRET)-ээс гарна. SIP_* орчны хувьсагчаар өгсөн анхны
// дугаар үргэлж үндсэн бизнесийнх.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DEFAULT_BUSINESS_ID } from "../accounts/store.js";
import { readJsonArray, writeJsonArray } from "../storage/jsonFile.js";

export type Line = { number: string; password: string; businessId: string; server: string };
type StoredLine = { number: string; secret: string; businessId: string; server: string; createdAt: string };

const DEFAULT_SERVER = "ip-phone.mobinet.mn";

function key(): Buffer {
  const secret = process.env.LINE_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("LINE_SECRET тохируулаагүй байна");
  return createHash("sha256").update(`line:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export class LineStore {
  constructor(private readonly filePath = resolve(__dirname, "../../data/lines.json")) {}

  private stored(): StoredLine[] {
    return readJsonArray(this.filePath) as StoredLine[];
  }

  // Бүх идэвхтэй шугам: эхэнд нь орчны хувьсагчийн дугаар. Хадгалсан тохиргоо давуу:
  // ижил дугаарыг өөр бизнест шилжүүлэх, нууц үгийг солиход.
  all(env: NodeJS.ProcessEnv = process.env): Line[] {
    const lines: Line[] = this.stored().map((line) => ({
      number: line.number, password: decryptSecret(line.secret), businessId: line.businessId, server: line.server,
    }));
    if (env.SIP_SERVER && env.SIP_USER && env.SIP_PASSWORD && !lines.some((line) => line.number === env.SIP_USER)) {
      lines.unshift({ number: env.SIP_USER, password: env.SIP_PASSWORD, businessId: DEFAULT_BUSINESS_ID, server: env.SIP_SERVER });
    }
    return lines;
  }

  numbersFor(businessId: string): string[] {
    return this.all().filter((line) => line.businessId === businessId).map((line) => line.number);
  }

  // Дугаар нэмэх эсвэл шинэчлэх (нууц үг, бизнес).
  save(input: { number: string; password: string; businessId: string; server?: string }): void {
    if (!/^\d{8}$/.test(input.number)) throw new TypeError("Дугаар 8 оронтой байх ёстой");
    if (!input.password || input.password.length > 200) throw new TypeError("Нууц үг буруу");
    if (!input.businessId.trim()) throw new TypeError("Бизнес заагаагүй");
    const line: StoredLine = {
      number: input.number, secret: encryptSecret(input.password), businessId: input.businessId,
      server: input.server || DEFAULT_SERVER, createdAt: new Date().toISOString(),
    };
    writeJsonArray(this.filePath, [...this.stored().filter((item) => item.number !== input.number), line]);
  }
}
