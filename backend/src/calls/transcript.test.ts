import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createTranscriptRecorder, TranscriptStore, type TranscriptTurn } from "./transcript.js";

test("recorder joins streamed fragments into alternating turns and skips empty ones", () => {
  const turns: TranscriptTurn[] = [];
  let tick = 0;
  const recorder = createTranscriptRecorder((turn) => turns.push(turn), () => `t${++tick}`);
  recorder.say("agent", "Сайн байна уу?");
  recorder.caller(" Буузны "); recorder.caller("үнэ  хэд вэ?");
  recorder.agent("Бууз 15,000 "); recorder.agent("төгрөг.");
  recorder.endTurn();
  recorder.endTurn(); // хоосон ээлж нэмэгдэхгүй
  recorder.caller("   ");
  recorder.agent("Өөр асуух зүйл байна уу?");
  recorder.caller("Үгүй, баярлалаа."); // AI-г таслан орсон ч хэлсэн хэсэг нь хадгалагдана
  recorder.agent("Баяртай.");
  recorder.caller("선배는 보트니 운이 있대."); // буруу хэлээр танигдсан — текстгүй тэмдэглэнэ
  recorder.endTurn();
  assert.deepEqual(turns, [
    { role: "agent", text: "Сайн байна уу?", at: "t1" },
    { role: "caller", text: "Буузны үнэ хэд вэ?", at: "t2" },
    { role: "agent", text: "Бууз 15,000 төгрөг.", at: "t3" },
    { role: "agent", text: "Өөр асуух зүйл байна уу?", at: "t4" },
    { role: "caller", text: "Үгүй, баярлалаа.", at: "t5" },
    { role: "agent", text: "Баяртай.", at: "t6" },
    { role: "caller", text: null, at: "t7" },
  ]);
});

test("transcript store keeps turns per call across reopen", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "frontdesk-transcript-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "transcripts.json");
  assert.deepEqual(new TranscriptStore(file).all(), {});
  new TranscriptStore(file).append("call-1", { role: "caller", text: "Сайн уу", at: "2026-10-12T00:00:00.000Z" });
  new TranscriptStore(file).append("call-2", { role: "agent", text: "Сайн байна уу?", at: "2026-10-12T00:00:01.000Z" });
  new TranscriptStore(file).append("call-1", { role: "agent", text: "Юугаар туслах вэ?", at: "2026-10-12T00:00:02.000Z" });
  const all = new TranscriptStore(file).all();
  assert.deepEqual(all["call-1"].map((turn) => turn.role), ["caller", "agent"]);
  assert.equal(all["call-2"].length, 1);
});
