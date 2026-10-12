import assert from "node:assert/strict";
import { test } from "node:test";
import { sharesRoot } from "./mongolianMorphology.js";

test("sharesRoot matches common Mongolian suffix inflections", () => {
  for (const [a, b] of [
    ["цаг", "цагт"], // өгөх-орших
    ["засалт", "засалтын"], // харьяалах
    ["дэлгүүр", "дэлгүүрт"], // өгөх-орших
    ["цаг", "цагаас"], // гарах
    ["цаг", "цагаар"], // үйлдэх
    ["компани", "компанитай"], // хамтрах
    ["үйлчилгээ", "үйлчилгээнүүд"], // олон тоо
    ["ном", "номын"], // харьяалах
  ] as const) {
    assert.equal(sharesRoot(a, b), true, `${a} / ${b}`);
    assert.equal(sharesRoot(b, a), true, `${b} / ${a}`);
  }
});

test("sharesRoot requires an exact match, a shared root of 3+ letters, and a known suffix", () => {
  assert.equal(sharesRoot("үс", "үст"), false); // язгуур хэт богино
  assert.equal(sharesRoot("гар", "гарц"), false); // "ц" мэдэгдэх нөхцөл биш
  assert.equal(sharesRoot("цаг", "цай"), false); // өөр үг, угтвар биш
  assert.equal(sharesRoot("шампунь", "шампунь"), true);
  assert.equal(sharesRoot("", ""), true);
});
