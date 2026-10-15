import assert from "node:assert/strict";
import { test } from "node:test";
import { padForChimege, toWav, transcribeChimege } from "./chimege.js";

test("short utterances are padded with silence to the API's minimum WAV size", () => {
  const short = new Int16Array(8000).fill(1000);
  const padded = padForChimege(short);
  assert.ok(toWav(padded).length >= 52_000);
  // Яриа дунд нь, хоёр тал нь чимээгүй.
  assert.equal(padded[0], 0);
  assert.equal(padded[padded.length - 1], 0);
  assert.equal(padded.filter((sample) => sample === 1000).length, 8000);
  const long = new Int16Array(40_000);
  assert.equal(padForChimege(long), long);
});

test("WAV header describes 16kHz mono 16-bit audio", () => {
  const wav = toWav(new Int16Array(10));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 20);
});

test("transcribe sends the token and returns trimmed text, and reports API errors", async () => {
  const saved = process.env.CHIMEGE_API_KEY;
  process.env.CHIMEGE_API_KEY = "test-token";
  try {
    let headers: Record<string, string> = {};
    const text = await transcribeChimege(new Int16Array(100), (async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return new Response(" Бууз хэдэн төгрөг вэ? \n", { status: 200 });
    }) as typeof fetch);
    assert.equal(text, "Бууз хэдэн төгрөг вэ?");
    assert.equal(headers.Token, "test-token");
    assert.equal(headers.Punctuate, "true");

    await assert.rejects(
      transcribeChimege(new Int16Array(100), (async () => new Response("", { status: 403, headers: { "Error-Code": "1000" } })) as typeof fetch),
      /403 \(код 1000\)/,
    );
  } finally {
    if (saved === undefined) delete process.env.CHIMEGE_API_KEY;
    else process.env.CHIMEGE_API_KEY = saved;
  }
});
