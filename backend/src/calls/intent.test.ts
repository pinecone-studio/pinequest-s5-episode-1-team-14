import assert from "node:assert/strict";
import { test } from "node:test";
import { inferIntent } from "./intent.js";

test("intent comes from tool use first, then from what the agent answered", () => {
  const intent = (replyText: string, checkedAvailability = false) => inferIntent({ replyText, checkedAvailability });
  assert.equal(intent("Маргааш 19:00 цаг сул байна.", true), "BOOK_APPOINTMENT");
  assert.equal(intent("Бууз нэг порц нь 15,000 төгрөг.", true), "BOOK_APPOINTMENT");
  assert.equal(intent("Бууз нэг порц нь 15,000 Төгрөг."), "ASK_PRICE");
  assert.equal(intent("Манайх өдөр бүр 11:00 цагаас 22:00 цаг хүртэл ажилладаг."), "ASK_OPENING_HOURS");
  assert.equal(intent("Манайд вегетариан хоол байдаг."), "GENERAL_QUERY");
  // Дуудагч юу ч асуугаагүй (AI хариулаагүй) бол зорилго тодорхойгүй хэвээр.
  assert.equal(intent(""), null);
  assert.equal(intent("  \n"), null);
});
