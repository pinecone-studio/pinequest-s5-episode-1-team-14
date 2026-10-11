// geminiLive.ts-ийн function calling (RAG + Calendar)-ийг текстээр турших.
// Ажиллуулах: npx tsx src/ai/test-function-calling.ts (backend/-ээс)
// Шаардлага: data/knowledge.json seed хийгдсэн байх (npx tsx src/knowledge/seed.ts)

import "dotenv/config";
import { createGeminiLiveSession } from "./geminiLive.js";

const TEST_MESSAGES = [
  "Сайн байна уу, та нар хэдэн цагт хаадаг вэ?",
  "Маргааш орой 7 цагт 4 хүнд ширээ захиалж болох уу?",
  "Та нарт вегетарианы хоол байдаг уу?",
];

// Жич: function calling-той эргэлтэд turnComplete нэг асуултад хэд хэд ирж
// болдог тул "turnsLeft" тоолж хаахгүй — бүх асуулт илгээгдсэний дараа
// нэмэлт хугацаа хүлээгээд session-ийг гараар хаана.
async function main() {
  const session = await createGeminiLiveSession({
    onOpen: () => console.log("--- Холбогдлоо ---\n"),
    onText: (text) => process.stdout.write(text),
    onTurnComplete: () => console.log("\n"),
    onError: (msg) => console.error("Алдаа:", msg),
    onClose: (reason) => console.log("--- Хаагдлаа:", reason, "---"),
  });

  for (const text of TEST_MESSAGES) {
    console.log(`Хэрэглэгч: ${text}`);
    session.sendRealtimeInput({ text });
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }

  await new Promise((resolve) => setTimeout(resolve, 6000));
  session.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
