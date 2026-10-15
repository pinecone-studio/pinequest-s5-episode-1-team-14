// Хэрэглэгчийн бүртгэл ба бизнес. Хэрэглэгч бүр нэг бизнестэй, зөвхөн түүний өгөгдлийг харна.
// Одоо байгаа (businessId-гүй) бүх өгөгдөл DEFAULT_BUSINESS_ID-д хамаарна; OWNER_EMAILS-д
// бичигдсэн имэйлээр бүртгүүлсэн хүн тэр бизнест нэгдэнэ.

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { readJsonArray, writeJsonArray } from "../storage/jsonFile.js";

export const DEFAULT_BUSINESS_ID = "default";
const SESSION_DAYS = 7;

// voice: VOICE_OPTIONS дахь түлхүүр (uyanga, naran, oyuna); байхгүй бол анхдагч дуу.
export type Business = { id: string; name: string; createdAt: string; voice?: string };

// Хэрэглэгчийн сонгох боломжтой дуунууд. ID нь ElevenLabs бүртгэлээс хамаарах тул орчны хувьсагчид:
// VOICE_OPTIONS=uyanga:<id>,naran:<id>,oyuna:<id>
const VOICE_LABELS: Record<string, string> = {
  uyanga: "Уянга — эмэгтэй, найрсаг", naran: "Наран — эрэгтэй, тайван", oyuna: "Оюуна — эмэгтэй, дулаахан",
};
export function voiceOptions(): { key: string; label: string; voiceId: string }[] {
  return (process.env.VOICE_OPTIONS ?? "").split(",").flatMap((entry) => {
    const [key, voiceId] = entry.split(":").map((part) => part.trim());
    return key && voiceId ? [{ key, label: VOICE_LABELS[key] ?? key, voiceId }] : [];
  });
}
export const voiceIdFor = (voice?: string) => voiceOptions().find((option) => option.key === voice)?.voiceId;
export type Account = { id: string; email: string; passwordHash: string; businessId: string; createdAt: string };
export type PublicAccount = { email: string; business: Business };

// Өгөгдлийн бичлэг энэ бизнесийнх эсэх: businessId-гүй хуучин бичлэг үндсэн бизнесийнх.
export const belongsTo = (businessId: string) => (record: object): boolean =>
  ((record as { businessId?: unknown }).businessId ?? DEFAULT_BUSINESS_ID) === businessId;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, "hex"), 32), Buffer.from(hash, "hex"));
}

// Олдоогүй имэйлд ч hash тооцно: хариуны хугацаагаар бүртгэлтэй имэйлийг таахгүйн тулд.
const DUMMY_HASH = hashPassword(randomUUID());

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.DASHBOARD_API_TOKEN;
  if (!secret) throw new Error("SESSION_SECRET тохируулаагүй байна");
  return secret;
}

const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("base64url");

export function createSessionToken(accountId: string, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + SESSION_DAYS * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ a: accountId, e: expiresAt })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function readSessionToken(token: unknown, now = Date.now()): string | null {
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { a?: unknown; e?: unknown };
    return typeof a === "string" && typeof e === "number" && e > now ? a : null;
  } catch {
    return null;
  }
}

function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "").split(",").map((email) => normalizeEmail(email)).filter((email): email is string => email !== null);
}

// ponytail: бүхэл файлаар хадгална; олон мянган хэрэглэгчтэй болбол өгөгдлийн сан руу шилжүүлнэ.
export class AccountStore {
  private readonly accountsPath: string;
  private readonly businessesPath: string;

  constructor(dataDir = resolve(__dirname, "../../data")) {
    this.accountsPath = resolve(dataDir, "accounts.json");
    this.businessesPath = resolve(dataDir, "businesses.json");
  }

  private accounts(): Account[] {
    return readJsonArray(this.accountsPath) as Account[];
  }

  businesses(): Business[] {
    const stored = readJsonArray(this.businessesPath) as Business[];
    if (stored.some((business) => business.id === DEFAULT_BUSINESS_ID)) return stored;
    // Үндсэн бизнес (одоо ажиллаж буй шугам) үргэлж байна.
    return [{ id: DEFAULT_BUSINESS_ID, name: process.env.BUSINESS_NAME || "Ресторан", createdAt: new Date(0).toISOString() }, ...stored];
  }

  signup(input: { email: unknown; password: unknown; businessName: unknown }): Account | "invalid" | "exists" {
    const email = normalizeEmail(input.email);
    const name = typeof input.businessName === "string" ? input.businessName.trim() : "";
    if (!email || !validPassword(input.password) || !name || name.length > 80 || /\p{Cc}/u.test(name)) return "invalid";
    const accounts = this.accounts();
    if (accounts.some((account) => account.email === email)) return "exists";
    const now = new Date().toISOString();
    let businessId = DEFAULT_BUSINESS_ID;
    if (!ownerEmails().includes(email)) {
      businessId = randomUUID();
      writeJsonArray(this.businessesPath, [...readJsonArray(this.businessesPath), { id: businessId, name, createdAt: now }]);
    }
    const account: Account = { id: randomUUID(), email, passwordHash: hashPassword(input.password), businessId, createdAt: now };
    writeJsonArray(this.accountsPath, [...accounts, account]);
    return account;
  }

  login(emailInput: unknown, password: unknown): Account | null {
    const email = normalizeEmail(emailInput);
    const account = email ? this.accounts().find((item) => item.email === email) : undefined;
    const ok = verifyPassword(typeof password === "string" ? password : "", account?.passwordHash ?? DUMMY_HASH);
    return ok && account ? account : null;
  }

  // Бизнесийн нэр, дууг солино. Үндсэн бизнесийг анх удаа засахад файлд бичигдэнэ.
  updateBusiness(businessId: string, input: { name?: unknown; voice?: unknown }): Business | "invalid" {
    const current = this.businesses().find((business) => business.id === businessId);
    if (!current) return "invalid";
    const next: Business = { ...current };
    if (input.name !== undefined) {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name || name.length > 80 || /\p{Cc}/u.test(name)) return "invalid";
      next.name = name;
    }
    if (input.voice !== undefined) {
      if (input.voice === null || input.voice === "") delete next.voice;
      else if (typeof input.voice === "string" && voiceIdFor(input.voice)) next.voice = input.voice;
      else return "invalid";
    }
    const stored = (readJsonArray(this.businessesPath) as Business[]).filter((business) => business.id !== businessId);
    writeJsonArray(this.businessesPath, [...stored, next]);
    return next;
  }

  get(accountId: string): Account | undefined {
    return this.accounts().find((account) => account.id === accountId);
  }

  describe(account: Account): PublicAccount {
    const business = this.businesses().find((item) => item.id === account.businessId);
    return { email: account.email, business: business ?? { id: account.businessId, name: "", createdAt: account.createdAt } };
  }
}
