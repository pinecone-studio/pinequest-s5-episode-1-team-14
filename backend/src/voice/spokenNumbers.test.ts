import assert from "node:assert/strict";
import { test } from "node:test";
import { pairToWords, speakNumbers, speakPhoneNumbers, speakTimes } from "./spokenNumbers.js";

test("phone numbers are read as Mongolian two-digit words", () => {
  assert.equal(speakPhoneNumbers("Таны дугаар 99112233 мөн үү?"), "Таны дугаар ерэн ес, арван нэг, хорин хоёр, гучин гурав мөн үү?");
  assert.equal(pairToWords("14"), "арван дөрөв");
  assert.equal(speakPhoneNumbers("94 00 30 42"), "ерэн дөрөв, тэг тэг, гуч, дөчин хоёр");
  assert.equal(speakPhoneNumbers("+976 9400-3042"), "ерэн дөрөв, тэг тэг, гуч, дөчин хоёр");
  assert.equal(pairToWords("10"), "арав");
  assert.equal(pairToWords("05"), "тэг тав");
  // Үнэ, цаг хэвээр.
  assert.equal(speakPhoneNumbers("15000 төгрөг, 18:00 цагт"), "15000 төгрөг, 18:00 цагт");
});

test("numbers become Mongolian words in the form used before a noun", () => {
  assert.equal(speakNumbers("Гурилтай шөл 18,000, банштай шөл 16,000 төгрөг."), "Гурилтай шөл арван найман мянга, банштай шөл арван зургаан мянга.");
  assert.equal(speakNumbers("Хорхог 85,000₮, 20,000 хүний"), "Хорхог наян таван мянга, хорин мянган хүний");
  assert.equal(speakNumbers("Маргааш оройн 8 цагт 5 хүний ширээ"), "Маргааш оройн найман цагт таван хүний ширээ");
  assert.equal(speakNumbers("Хорхог 85000 төгрөг"), "Хорхог наян таван мянга");
  assert.equal(speakNumbers("Нийт 12 байна"), "Нийт арван хоёр байна");
  assert.equal(speakNumbers("Нийт 12."), "Нийт арван хоёр.");
  assert.equal(speakNumbers("Хүний тоо: 20"), "Хүний тоо: хорь");
  assert.equal(speakNumbers("1,500 төгрөг, 250 грамм"), "мянга таван зуу, хоёр зуун тавин грамм");
  // Цаг, утасны дугаарыг хөндөхгүй.
  assert.equal(speakNumbers("18:00 цагт"), "18:00 цагт");
  assert.equal(speakNumbers("99112233"), "99112233");
});

test("times are spoken in the 12-hour form with the part of day and right case ending", () => {
  assert.equal(speakTimes("18:00 цагт ирнэ"), "оройн зургаан цагт ирнэ");
  assert.equal(speakTimes("11:00-оос 22:00 цаг хүртэл"), "өглөөний арван нэгэн цагаас оройн арван цаг хүртэл");
  assert.equal(speakTimes("7:30-д уулзъя"), "өглөө долоо хагаст уулзъя");
  assert.equal(speakTimes("20:30 цагийн захиалга"), "орой найм хагасын захиалга");
  assert.equal(speakTimes("19:15 цагт"), "оройн долоон цаг арван таван минутад");
  assert.equal(speakTimes("12:00 цагт"), "өдрийн арван хоёр цагт");
  assert.equal(speakTimes("1:00 цагт, 21:00 цагт"), "шөнийн нэг цагт, оройн есөн цагт");
  assert.equal(speakTimes("Гал тогоо 21 цаг 30 минутад хаана"), "Гал тогоо орой ес хагаст хаана");
  assert.equal(speakTimes("15 цагт ирнэ"), "өдрийн гурван цагт ирнэ");
  assert.equal(speakTimes("оройн 21:00 цагт"), "оройн есөн цагт");
  assert.equal(speakTimes("маргааш орой 7 цаг хагаст"), "маргааш орой долоо хагаст");
  assert.equal(speakTimes("19 хагаст"), "орой долоо хагаст");
  assert.equal(speakTimes("Оройн 8 хагаст болох уу?"), "Орой найм хагаст болох уу?");
  // 12-оос бага цагийг (оройн 7 цагт) хөндөхгүй.
  assert.equal(speakTimes("оройн 7 цагт"), "оройн 7 цагт");
});
