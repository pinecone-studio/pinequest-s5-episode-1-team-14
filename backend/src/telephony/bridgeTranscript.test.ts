import assert from "node:assert/strict";
import { test } from "node:test";
import { createLegTranscriber } from "./bridgeTranscript.js";
import { encodeMuLaw } from "./twilio.js";
import type { TranscriptTurn } from "../calls/transcript.js";

const frame = (level: number) => Buffer.from(encodeMuLaw(new Int16Array(160).fill(level)));

test("each side of a transferred call is written down as its own speaker, and noise is skipped", async () => {
  const saved: TranscriptTurn[] = [];
  const texts = ["", "Маргааш долоон цагт ирнэ."];
  const listen = createLegTranscriber("call-1", "staff", { transcribe: async () => texts.shift() ?? "", save: (turn) => saved.push(turn), now: () => "t" });
  for (const level of [0, 3000, 0, 3000]) for (let i = 0; i < 40; i++) listen(frame(level));
  for (let i = 0; i < 40; i++) listen(frame(0));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(saved, [{ role: "staff", text: "Маргааш долоон цагт ирнэ.", at: "t" }]);
});
