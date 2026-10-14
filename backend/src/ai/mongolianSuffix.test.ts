import assert from "node:assert/strict";
import { test } from "node:test";
import { withSuffix } from "./mongolianSuffix.js";

test("business names take Mongolian case endings by vowel harmony", () => {
  assert.equal(withSuffix("Тал Нутаг", "comitative"), "Тал Нутагтай");
  assert.equal(withSuffix("Тал Нутаг", "ablative"), "Тал Нутгаас");
  assert.equal(withSuffix("Хөх Өргөө", "comitative"), "Хөх Өргөөтэй");
  assert.equal(withSuffix("Хөх Өргөө", "ablative"), "Хөх Өргөөгөөс");
  assert.equal(withSuffix("Гоо сайхны төв", "comitative"), "Гоо сайхны төвтэй");
  assert.equal(withSuffix("Монгол хот", "ablative"), "Монгол хотоос");
  assert.equal(withSuffix("Эрдэнэ", "ablative"), "Эрдэнэгээс");
  assert.equal(withSuffix("CallAI", "comitative"), "CallAI-тай");
  assert.equal(withSuffix("CallAI", "ablative"), "CallAI-аас");
});
