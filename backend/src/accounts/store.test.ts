import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AccountStore, belongsTo, createSessionToken, DEFAULT_BUSINESS_ID, readSessionToken, verifyPassword, voiceIdFor, voiceOptions } from "./store.js";
import { createAttemptLimiter } from "./limiter.js";

test("signup creates an isolated business; owner emails join the existing one", (context) => {
  const dir = mkdtempSync(join(tmpdir(), "accounts-"));
  const owners = process.env.OWNER_EMAILS;
  context.after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (owners === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = owners;
  });
  process.env.OWNER_EMAILS = "owner@example.com";
  const store = new AccountStore(dir);

  const owner = store.signup({ email: " Owner@Example.com ", password: "long-password", businessName: "Ресторан" });
  assert.ok(typeof owner === "object");
  assert.equal(owner.businessId, DEFAULT_BUSINESS_ID);
  assert.notEqual(owner.passwordHash, "long-password");
  assert.ok(verifyPassword("long-password", owner.passwordHash));

  const other = store.signup({ email: "cafe@example.com", password: "another-pass", businessName: "Кафе" });
  assert.ok(typeof other === "object");
  assert.notEqual(other.businessId, DEFAULT_BUSINESS_ID);
  assert.equal(store.describe(other).business.name, "Кафе");

  assert.equal(store.signup({ email: "cafe@example.com", password: "another-pass", businessName: "x" }), "exists");
  assert.equal(store.signup({ email: "bad", password: "another-pass", businessName: "x" }), "invalid");
  assert.equal(store.signup({ email: "a@b.mn", password: "short", businessName: "x" }), "invalid");

  assert.equal(store.login("CAFE@example.com", "another-pass")?.id, other.id);
  assert.equal(store.login("cafe@example.com", "wrong-pass"), null);
  assert.equal(store.login("nobody@example.com", "another-pass"), null);

  // Хуучин (businessId-гүй) бичлэг үндсэн бизнесийнх; бусдад харагдахгүй.
  assert.equal(belongsTo(DEFAULT_BUSINESS_ID)({ id: "old" }), true);
  assert.equal(belongsTo(other.businessId)({ id: "old" }), false);
});

test("session tokens are signed and expire", (context) => {
  const secret = process.env.SESSION_SECRET;
  context.after(() => {
    if (secret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = secret;
  });
  process.env.SESSION_SECRET = "test-secret";
  const now = Date.parse("2026-10-14T00:00:00Z");
  const { token } = createSessionToken("account-1", now);
  assert.equal(readSessionToken(token, now + 1000), "account-1");
  assert.equal(readSessionToken(token, now + 8 * 86_400_000), null);
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ a: "account-2", e: now + 86_400_000 })).toString("base64url");
  assert.equal(readSessionToken(`${forged}.${signature}`, now), null);
  assert.equal(readSessionToken(`${payload}.x`, now), null);
  process.env.SESSION_SECRET = "rotated";
  assert.equal(readSessionToken(token, now + 1000), null);
});

test("attempt limiter blocks after too many failures and resets", () => {
  let now = 0;
  const limiter = createAttemptLimiter(2, 1000, () => now);
  assert.equal(limiter.allowed("ip"), true);
  limiter.fail("ip");
  limiter.fail("ip");
  assert.equal(limiter.allowed("ip"), false);
  assert.equal(limiter.allowed("other"), true);
  now = 1001;
  assert.equal(limiter.allowed("ip"), true);
});

test("businesses can rename themselves and pick one of the offered voices", (context) => {
  const dir = mkdtempSync(join(tmpdir(), "business-settings-"));
  const voices = process.env.VOICE_OPTIONS;
  context.after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (voices === undefined) delete process.env.VOICE_OPTIONS;
    else process.env.VOICE_OPTIONS = voices;
  });
  process.env.VOICE_OPTIONS = "uyanga:voice1,naran:voice2";
  const store = new AccountStore(dir);
  assert.deepEqual(voiceOptions().map((option) => option.key), ["uyanga", "naran"]);
  assert.equal(voiceIdFor("naran"), "voice2");

  const updated = store.updateBusiness(DEFAULT_BUSINESS_ID, { name: "Тал Нутаг", voice: "uyanga" });
  assert.ok(typeof updated === "object");
  assert.equal(store.businesses().find((business) => business.id === DEFAULT_BUSINESS_ID)?.voice, "uyanga");
  assert.equal(store.businesses().filter((business) => business.id === DEFAULT_BUSINESS_ID).length, 1);
  assert.equal(store.updateBusiness(DEFAULT_BUSINESS_ID, { voice: "robot" }), "invalid");
  assert.equal(store.updateBusiness(DEFAULT_BUSINESS_ID, { name: " " }), "invalid");
  assert.equal(store.updateBusiness("missing", { name: "x" }), "invalid");
  store.updateBusiness(DEFAULT_BUSINESS_ID, { voice: null });
  assert.equal(store.businesses().find((business) => business.id === DEFAULT_BUSINESS_ID)?.voice, undefined);
});

test("a business can set and clear its own greeting", (context) => {
  const dir = mkdtempSync(join(tmpdir(), "business-greeting-"));
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = new AccountStore(dir);
  store.updateBusiness(DEFAULT_BUSINESS_ID, { greeting: "  Сайн байна уу, Тал Нутаг ресторан байна.  " });
  assert.equal(store.businesses()[0].greeting, "Сайн байна уу, Тал Нутаг ресторан байна.");
  assert.equal(store.updateBusiness(DEFAULT_BUSINESS_ID, { greeting: "x".repeat(301) }), "invalid");
  store.updateBusiness(DEFAULT_BUSINESS_ID, { greeting: "" });
  assert.equal(store.businesses()[0].greeting, undefined);
});

