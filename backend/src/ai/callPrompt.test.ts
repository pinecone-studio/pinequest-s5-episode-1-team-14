import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemInstruction, CALL_GREETING } from "./callPrompt.js";
import { runTool } from "./geminiLive.js";

const knowledge = [
  { id: "menu-buuz", category: "product" as const, title: "Бууз", content: "5ш нэг порц.", price: 15000, active: true, updatedAt: "2026-10-08T06:00:00.000Z" },
];

test("instruction carries the Ulaanbaatar date, greeting, caller phone and all given knowledge", () => {
  // 2026-10-11 17:30 UTC нь Улаанбаатарт аль хэдийн 10-12 (Даваа) 01:30.
  const text = buildSystemInstruction({ knowledge, callerPhone: "+97699112233", now: new Date("2026-10-11T17:30:00Z") });
  assert.match(text, /Одоо 2026-10-12 \(Даваа гараг\) 01:30/);
  assert.ok(text.includes(CALL_GREETING));
  assert.ok(text.includes("+97699112233"));
  const facts = JSON.parse(text.slice(text.lastIndexOf('{"approvedBusinessKnowledge"')));
  assert.deepEqual(facts, { approvedBusinessKnowledge: [{ id: "menu-buuz", category: "product", title: "Бууз", content: "5ш нэг порц.", price: 15000 }] });
});

test("instruction omits the phone line for unknown callers and still grounds on empty knowledge", () => {
  const text = buildSystemInstruction({ knowledge: [], callerPhone: null });
  assert.ok(!text.includes("Дуудагчийн утасны дугаар"));
  assert.ok(text.endsWith('{"approvedBusinessKnowledge":[]}'));
  assert.ok(text.includes("аль хэдийн мэндэлсэн"));
  const selfGreeting = buildSystemInstruction({ knowledge: [], greeted: false });
  assert.ok(selfGreeting.includes("хамгийн түрүүнд") && !selfGreeting.includes("аль хэдийн мэндэлсэн"));
});

test("another business gets its own name instead of the restaurant persona", () => {
  const text = buildSystemInstruction({ knowledge: [], businessName: "CallAI", now: new Date("2026-10-14T02:00:00Z") });
  assert.match(text, /Чи бол «CallAI»-ийн монгол хэлээр ярьдаг AI ресепшн ажилтан/);
  assert.doesNotMatch(text, /рестораны/);
  assert.match(buildSystemInstruction({ knowledge: [], now: new Date("2026-10-14T02:00:00Z") }), /жижиг рестораны/);
});

test("calendar tools are refused for businesses without their own calendar", async () => {
  const result = await runTool("check_availability", {}, { businessId: "cafe" }) as { error?: string };
  assert.match(result.error ?? "", /календарь холбогдоогүй/);
});
