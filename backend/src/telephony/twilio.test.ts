import assert from "node:assert/strict";
import { test } from "node:test";
import { createDownsampler24kTo8k, decodeMuLaw, encodeMuLaw, resolveCallerPhone } from "./twilio.js";

function pcm(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, index * 2));
  return buffer;
}

test("24kHz audio is averaged to 8kHz across arbitrary chunk boundaries", () => {
  const whole = pcm([300, 600, 900, -30, -60, -90, 1000, 1000, 1000]);
  assert.deepEqual([...createDownsampler24kTo8k()(whole)], [600, -60, 1000]);

  // 5 байт + үлдсэн хэсэг: дээжийн дундуур таслагдсан ч үр дүн ижил.
  const downsample = createDownsampler24kTo8k();
  const pieces = [whole.subarray(0, 5), whole.subarray(5, 13), whole.subarray(13)];
  assert.deepEqual(pieces.flatMap((piece) => [...downsample(piece)]), [600, -60, 1000]);
});

test("mu-law round trip stays close to the original samples", () => {
  const samples = Int16Array.from([0, 100, -100, 1000, -1000, 12000, -12000, 32000, -32000]);
  const decoded = decodeMuLaw(encodeMuLaw(samples));
  samples.forEach((sample, index) => {
    assert.ok(Math.abs(decoded[index] - sample) <= Math.max(16, Math.abs(sample) * 0.05), `${sample} -> ${decoded[index]}`);
  });
});

test("caller phone is kept for real callers and dropped when forwarding hides it", () => {
  const phone = (fields: Record<string, string>) => resolveCallerPhone(new URLSearchParams(fields));
  assert.equal(phone({ From: "+97699112233", To: "+15005550006", ForwardedFrom: "+97677112233" }), "+97699112233");
  assert.equal(phone({ From: "+97699112233", To: "+15005550006" }), "+97699112233");
  // Оператор бизнесийн дугаарыг From-д тавьсан (форматаас үл хамааран таарна).
  assert.equal(phone({ From: "+97677112233", To: "+15005550006", ForwardedFrom: "77112233" }), "");
  assert.equal(phone({ From: "+15005550006", To: "+15005550006" }), "");
  assert.equal(phone({ From: "anonymous", To: "+15005550006" }), "");
  assert.equal(phone({ To: "+15005550006" }), "");
});
