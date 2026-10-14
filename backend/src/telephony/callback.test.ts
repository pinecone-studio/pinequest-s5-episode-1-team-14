import assert from "node:assert/strict";
import { test } from "node:test";
import { createCallbackLimiter, normalizeMongolianNumber, startCallback } from "./callback.js";

test("only Mongolian 8-digit numbers are accepted", () => {
  assert.equal(normalizeMongolianNumber("9911 2233"), "+97699112233");
  assert.equal(normalizeMongolianNumber("+976 8811-2233"), "+97688112233");
  assert.equal(normalizeMongolianNumber("97655112233"), "+97655112233");
  assert.equal(normalizeMongolianNumber("+15005550006"), null);
  assert.equal(normalizeMongolianNumber("11112233"), null);
  assert.equal(normalizeMongolianNumber("991122"), null);
  assert.equal(normalizeMongolianNumber(""), null);
});

test("limiter blocks repeat calls to one number and caps the hourly total", () => {
  const allow = createCallbackLimiter(2);
  assert.equal(allow("+97699112233", 0), true);
  assert.equal(allow("+97699112233", 60_000), false);
  assert.equal(allow("+97688112233", 60_000), true);
  // Цагийн дээд хязгаарт хүрсэн.
  assert.equal(allow("+97655112233", 90_000), false);
  // Нэг цагийн дараа дахин нээгдэнэ.
  assert.equal(allow("+97699112233", 61 * 60_000), true);
});

test("startCallback asks Twilio to call the number and connect it to /voice", async () => {
  const saved = { ...process.env };
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "secret", TWILIO_PHONE_NUMBER: "+15005550006" });
  try {
    let url = "";
    let body = new URLSearchParams();
    const ok = await startCallback("+97699112233", "https://example.test/voice", (async (input, init) => {
      url = String(input);
      body = init?.body as URLSearchParams;
      return new Response("{}", { status: 201 });
    }) as typeof fetch);
    assert.deepEqual(ok, { ok: true });
    assert.equal(url, "https://api.twilio.com/2010-04-01/Accounts/ACtest/Calls.json");
    assert.equal(body.get("To"), "+97699112233");
    assert.equal(body.get("From"), "+15005550006");
    assert.equal(body.get("Url"), "https://example.test/voice");

    const failed = await startCallback("+97699112233", "https://example.test/voice", (async () =>
      new Response(JSON.stringify({ code: 21215 }), { status: 400 })) as typeof fetch);
    assert.deepEqual(failed, { ok: false, reason: "twilio_error" });

    delete process.env.TWILIO_PHONE_NUMBER;
    assert.deepEqual(await startCallback("+97699112233", "https://example.test/voice"), { ok: false, reason: "not_configured" });
  } finally {
    process.env = saved;
  }
});
