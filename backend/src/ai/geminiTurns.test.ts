import assert from "node:assert/strict";
import { test } from "node:test";
import { createReplyParser, createUtteranceDetector, isEcho, isQuestion, normalizeGain, toUlaanbaatarTimes, voicedSeconds } from "./geminiTurns.js";

const frame = (level: number) => new Int16Array(320).fill(level);

test("an utterance is returned once the caller goes quiet, with a little audio before it", () => {
  const detect = createUtteranceDetector();
  for (let i = 0; i < 30; i++) assert.equal(detect(frame(0)), null);
  for (let i = 0; i < 40; i++) assert.equal(detect(frame(3000)), null);
  let utterance: Int16Array | null = null;
  for (let i = 0; i < 40 && !utterance; i++) utterance = detect(frame(0));
  assert.ok(utterance);
  // 12 өмнөх + 40 яриа + 24 чимээгүй (эхлэлийг илрүүлсэн 3 хэсэг өмнөхөд тоологдсон).
  assert.equal(utterance.length, (12 + 40 + 24) * 320);
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

test("voiced length ignores the silent padding around an utterance", () => {
  const speech = Int16Array.from({ length: 16_000 * 0.4 }, (_, n) => Math.round(3000 * Math.sin(n / 5)));
  const padded = new Int16Array(16_000 * 1.2);
  padded.set(speech, 16_000 * 0.3);
  assert.ok(Math.abs(voicedSeconds(padded) - 0.4) < 0.03);
  assert.equal(voicedSeconds(new Int16Array(16_000)), 0);
});

test("questions are told apart from answers so we never say За before answering a question", () => {
  for (const text of ["Хорхог хэд вэ?", "Зогсоол байгаа юу", "Хаана байрладаг вэ", "Ням гарагт ажилладаг уу", "Ямар хоол байна"]) assert.equal(isQuestion(text), true, text);
  for (const text of ["Маргааш.", "Тав", "Баярзул", "Орой долоо хагаст", "Тийм ээ"]) assert.equal(isQuestion(text), false, text);
});

test("a loud air conditioner heard during the greeting is not taken for speech", () => {
  const detect = createUtteranceDetector();
  // Мэндчилгээний үеэр зөвхөн чимээний түвшинг хэмжинэ.
  for (let i = 0; i < 250; i++) assert.equal(detect(frame(500), false), null);
  for (let i = 0; i < 500; i++) assert.equal(detect(frame(500)), null);
  // Чимээнээс илт чанга яриа илэрсээр байна.
  for (let i = 0; i < 40; i++) assert.equal(detect(frame(3000)), null);
  let utterance: Int16Array | null = null;
  for (let i = 0; i < 60 && !utterance; i++) utterance = detect(frame(500));
  assert.ok(utterance);
  assert.ok(voicedSeconds(utterance, detect.voiceLevel()) < 1);
});

test("noise that starts mid-call settles instead of becoming endless speech", () => {
  const detect = createUtteranceDetector();
  for (let i = 0; i < 100; i++) detect(frame(20));
  const heard: Int16Array[] = [];
  for (let i = 0; i < 1500; i++) {
    const utterance = detect(frame(500));
    if (utterance) heard.push(utterance);
  }
  // Нэг удаа "яриа" болж магадгүй, гэхдээ дуутай хэсэг нь шинэ босгоор чимээ гэж танигдана.
  assert.ok(heard.length <= 1);
  for (const utterance of heard) assert.ok(voicedSeconds(utterance, detect.voiceLevel()) < 0.3);
});

test("nothing new is picked up while the greeting plays", () => {
  const detect = createUtteranceDetector();
  for (let i = 0; i < 40; i++) assert.equal(detect(frame(3000), false), null);
  for (let i = 0; i < 60; i++) assert.equal(detect(frame(0), false), null);
});

test("the AI's own words coming back through a speakerphone are recognised as echo", () => {
  const spoken = "Маргааш хэдэн цагт, хэдэн хүний ширээ захиалах вэ?";
  assert.equal(isEcho("хэдэн цагт хэдэн хүний", spoken), true);
  assert.equal(isEcho("Маргааш орой долоон цагт", spoken), false);
  assert.equal(isEcho("Ганцаараа", spoken), false);
  assert.equal(isEcho("", spoken), false);
});
