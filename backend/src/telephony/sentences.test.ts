import assert from "node:assert/strict";
import { test } from "node:test";
import { takeSentences } from "./sentences.js";

test("splits finished sentences and keeps the unfinished tail", () => {
  assert.deepEqual(takeSentences("Сайн байна уу? Манайх 22:00 цагт хаадаг. Та"), {
    sentences: ["Сайн байна уу?", " Манайх 22:00 цагт хаадаг."], rest: " Та",
  });
  assert.deepEqual(takeSentences("Тийм ээ..."), { sentences: ["Тийм ээ..."], rest: "" });
});

test("does not split inside numbers, even when the digits arrive in a later chunk", () => {
  assert.deepEqual(takeSentences("Бууз 15.000 төгрөг."), { sentences: ["Бууз 15.000 төгрөг."], rest: "" });
  assert.deepEqual(takeSentences("Бууз 15."), { sentences: [], rest: "Бууз 15." });
  assert.deepEqual(takeSentences("Үнэ нь 15000. Өөр"), { sentences: ["Үнэ нь 15000."], rest: " Өөр" });
});
