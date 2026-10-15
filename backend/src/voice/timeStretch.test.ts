import assert from "node:assert/strict";
import { test } from "node:test";
import { createTimeStretcher } from "./timeStretch.js";

const tone = (seconds: number, hz: number) =>
  Int16Array.from({ length: Math.round(seconds * 8000) }, (_, n) => Math.round(8000 * Math.sin((2 * Math.PI * hz * n) / 8000)));

// Тэгийг огтлох тоо: давтамж хэвээр эсэхийг шалгана.
function crossingsPerSecond(samples: Int16Array): number {
  let count = 0;
  for (let n = 1; n < samples.length; n++) if ((samples[n - 1] < 0) !== (samples[n] < 0)) count++;
  return count / (samples.length / 8000);
}

test("speech is shortened by the speed factor without changing pitch", () => {
  const input = tone(2, 200);
  const stretcher = createTimeStretcher(1.15);
  // Урсгалаар ирэх мэт жижиг хэсгүүдээр өгнө.
  const parts: Int16Array[] = [];
  for (let offset = 0; offset < input.length; offset += 333) parts.push(stretcher.push(input.subarray(offset, offset + 333)));
  parts.push(stretcher.flush());
  const output = Int16Array.from(parts.flatMap((part) => [...part]));
  assert.ok(Math.abs(output.length / input.length - 1 / 1.15) < 0.03, `урт ${output.length}`);
  const middle = output.subarray(800, output.length - 800);
  assert.ok(Math.abs(crossingsPerSecond(middle) - 400) < 15, `давтамж ${crossingsPerSecond(middle)}`);
});

test("speed 1 keeps the length", () => {
  const stretcher = createTimeStretcher(1);
  const input = tone(1, 300);
  const output = [...stretcher.push(input), ...stretcher.flush()];
  assert.ok(Math.abs(output.length - input.length) < 300);
});
