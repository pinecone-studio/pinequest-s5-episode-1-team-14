// Day 1-2 task: sanity-check Gemini Live API's Mongolian quality before
// building anything on top of it. Text-in/text-out only (no audio yet) —
// this is the cheapest way to see if the model understands and writes
// natural Mongolian before we add Twilio/audio plumbing on top.
//
// Usage: npm run test:gemini-mn   (from backend/)
// Requires GEMINI_API_KEY in backend/.env (copy backend/.env.example).

import "dotenv/config";
import { GoogleGenAI, Modality } from "@google/genai";

const MODEL = "gemini-3.8-live";

const SYSTEM_INSTRUCTION = `Чи бол Улаанбаатар хотын жижиг рестораны монгол хэлээр ярьдаг
AI ресепшн ажилтан. Ажлын цаг 11:00-22:00. Зочдод эелдэг, товч, ойлгомжтой
хариулна. Мэдэхгүй зүйлээ бүү зохиож хэлээрэй.`;

const TEST_MESSAGES = [
  "Сайн байна уу, та нар хэдэн цагт хаадаг вэ?",
  "Маргааш орой 7 цагт 4 хүнд ширээ захиалж болох уу?",
  "Та нарт вегетарианы хоол байдаг уу?",
];

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY тохируулаагүй байна — backend/.env-д нэмнэ үү.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  let turnsLeft = TEST_MESSAGES.length;

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.TEXT],
      systemInstruction: SYSTEM_INSTRUCTION,
    },
    callbacks: {
      onopen: () => console.log("--- Холбогдлоо ---\n"),
      onmessage: (message) => {
        if (message.text) {
          process.stdout.write(message.text);
        }
        if (message.serverContent?.turnComplete) {
          console.log("\n");
          turnsLeft -= 1;
          if (turnsLeft <= 0) session.close();
        }
      },
      onerror: (e) => console.error("Алдаа:", e.message),
      onclose: (e) => console.log("--- Хаагдлаа:", e.reason, "---"),
    },
  });

  for (const text of TEST_MESSAGES) {
    console.log(`Хэрэглэгч: ${text}`);
    session.sendRealtimeInput({ text });
    // give the model time to finish each turn before sending the next
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
