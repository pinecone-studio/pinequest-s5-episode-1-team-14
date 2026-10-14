import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNext, sessionActive, sessionExpiry } from "./session";

const token = (expires: number) => `${Buffer.from(JSON.stringify({ a: "account", e: expires })).toString("base64url")}.signature`;

test("session cookie expiry is read from the backend token", () => {
  const now = Date.parse("2026-10-14T00:00:00Z");
  assert.equal(sessionExpiry(token(now + 1000)), now + 1000);
  assert.equal(sessionActive(token(now + 1000), now), true);
  assert.equal(sessionActive(token(now - 1), now), false);
  assert.equal(sessionActive("garbage", now), false);
  assert.equal(sessionActive(undefined, now), false);
});

test("login only redirects back to own pages", () => {
  assert.equal(safeNext("/bookings"), "/bookings");
  assert.equal(safeNext("//evil.example"), "/dashboard");
  assert.equal(safeNext("https://evil.example"), "/dashboard");
  assert.equal(safeNext(String.raw`/\evil.example`), "/dashboard");
  assert.equal(safeNext(undefined), "/dashboard");
});
