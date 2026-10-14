import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decryptSecret, encryptSecret, LineStore } from "./lines.js";

test("lines keep passwords encrypted and list the env line first for the default business", (context) => {
  const dir = mkdtempSync(join(tmpdir(), "lines-"));
  const secret = process.env.LINE_SECRET;
  context.after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (secret === undefined) delete process.env.LINE_SECRET;
    else process.env.LINE_SECRET = secret;
  });
  process.env.LINE_SECRET = "test-line-secret";
  assert.equal(decryptSecret(encryptSecret("нууц")), "нууц");

  const file = join(dir, "lines.json");
  const store = new LineStore(file);
  store.save({ number: "75000001", password: "sip-pass", businessId: "cafe" });
  assert.ok(!readFileSync(file, "utf8").includes("sip-pass"));

  const env = { SIP_SERVER: "sip.example", SIP_USER: "75000000", SIP_PASSWORD: "env-pass" };
  assert.deepEqual(store.all(env).map((line) => [line.number, line.businessId, line.password]), [
    ["75000000", "default", "env-pass"],
    ["75000001", "cafe", "sip-pass"],
  ]);
  // Ижил дугаарыг дахин хадгалбал шинэчилнэ.
  store.save({ number: "75000001", password: "new-pass", businessId: "cafe" });
  assert.equal(store.all({}).length, 1);
  assert.equal(store.all({})[0].password, "new-pass");
  assert.throws(() => store.save({ number: "123", password: "x", businessId: "cafe" }), /8 оронтой/);
});

test("a stored line overrides the env line so it can move to another business", (context) => {
  const dir = mkdtempSync(join(tmpdir(), "lines-move-"));
  const secret = process.env.LINE_SECRET;
  context.after(() => {
    rmSync(dir, { recursive: true, force: true });
    if (secret === undefined) delete process.env.LINE_SECRET;
    else process.env.LINE_SECRET = secret;
  });
  process.env.LINE_SECRET = "test-line-secret";
  const store = new LineStore(join(dir, "lines.json"));
  store.save({ number: "75000000", password: "env-pass", businessId: "callai" });
  store.save({ number: "75000002", password: "new-pass", businessId: "default" });
  const env = { SIP_SERVER: "sip.example", SIP_USER: "75000000", SIP_PASSWORD: "env-pass" };
  assert.deepEqual(store.all(env).map((line) => [line.number, line.businessId]), [["75000000", "callai"], ["75000002", "default"]]);
});
