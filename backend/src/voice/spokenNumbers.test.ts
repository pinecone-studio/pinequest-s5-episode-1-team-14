import assert from "node:assert/strict";
import { test } from "node:test";
import { pairToWords, speakPhoneNumbers } from "./spokenNumbers.js";

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
