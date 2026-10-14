import assert from "node:assert/strict";
import { test } from "node:test";
import { createReplyParser, createUtteranceDetector, normalizeGain, toUlaanbaatarTimes } from "./geminiTurns.js";

const frame = (level: number) => new Int16Array(320).fill(level);

test("an utterance is returned once the caller goes quiet, with a little audio before it", () => {
  const detect = createUtteranceDetector();
  for (let i = 0; i < 30; i++) assert.equal(detect(frame(0)), null);
  for (let i = 0; i < 40; i++) assert.equal(detect(frame(3000)), null);
  let utterance: Int16Array | null = null;
  for (let i = 0; i < 40 && !utterance; i++) utterance = detect(frame(0));
  assert.ok(utterance);
  // 15 хэсэг өмнөх + 40 яриа + 32 чимээгүй (эхлэлийг илрүүлсэн хэсгүүд өмнөх хэсэгт орсон).
  assert.equal(utterance.length, (12 + 40 + 32) * 320);
  assert.equal(utterance[0], 0);
  assert.equal(utterance[12 * 320], 3000);
});

test("short noises are ignored", () => {
  const detect = createUtteranceDetector();
  for (let i = 0; i < 5; i++) assert.equal(detect(frame(3000)), null);
  for (let i = 0; i < 60; i++) assert.equal(detect(frame(0)), null);
});

test("reply parser separates what was heard from the spoken reply across chunk boundaries", () => {
  const heard: string[] = [];
  let reply = "";
  const parse = createReplyParser((text) => heard.push(text), (delta) => { reply += delta; });
  for (const chunk of ["<", "<Бууз хэд", " вэ?>", ">\nБууз 15000 ", "төгрөг."]) parse(chunk);
  assert.deepEqual(heard, ["Бууз хэд вэ?"]);
  assert.equal(reply, "Бууз 15000 төгрөг.");
});

test("reply parser tolerates a missing or empty heard line", () => {
  let reply = "";
  const heard: string[] = [];
  createReplyParser((text) => heard.push(text), (delta) => { reply += delta; })("Сайн байна уу?");
  assert.equal(reply, "Сайн байна уу?");
  let second = "";
  createReplyParser((text) => heard.push(text), (delta) => { second += delta; })("<<>>\nДахин хэлнэ үү?");
  assert.equal(second, "Дахин хэлнэ үү?");
  assert.deepEqual(heard, []);
});

test("quiet audio is amplified and loud audio is left alone", () => {
  assert.deepEqual([...normalizeGain(Int16Array.from([1000, -2300, 0]))], [8000, -18400, 0]);
  const loud = Int16Array.from([30000, -100]);
  assert.equal(normalizeGain(loud), loud);
});

test("calendar times are handed to the model in Ulaanbaatar time", () => {
  const result = { timeZone: "Asia/Ulaanbaatar", slots: [{ startTime: "2026-10-14T11:00:00.000Z", endTime: "2026-10-14T17:30:00Z" }], note: "Z" };
  assert.deepEqual(toUlaanbaatarTimes(result), {
    timeZone: "Asia/Ulaanbaatar", slots: [{ startTime: "2026-10-14T19:00:00+08:00", endTime: "2026-10-15T01:30:00+08:00" }], note: "Z",
  });
  assert.equal(toUlaanbaatarTimes(undefined), null);
});
