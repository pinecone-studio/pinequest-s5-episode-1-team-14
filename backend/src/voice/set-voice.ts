// Идэвхтэй ElevenLabs voice ID-г хүссэн үедээ солих — сервер дахин
// асаах шаардлагагүй, дараагийн синтезээс шууд хэрэгжинэ.
// Ажиллуулах: npx tsx src/voice/set-voice.ts <voiceId> (backend/-ээс)

import { getActiveVoiceId, setActiveVoiceId } from "./settings.js";

const voiceId = process.argv[2];
if (!voiceId) {
  console.error("Ашиглах заавар: npx tsx src/voice/set-voice.ts <voiceId>");
  process.exit(1);
}

setActiveVoiceId(voiceId);
console.log(`Идэвхтэй voice ID: ${getActiveVoiceId()}`);
