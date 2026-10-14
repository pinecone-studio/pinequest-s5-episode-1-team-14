// Дууг өндрийг нь өөрчлөхгүйгээр хурдасгана (WSOLA). ElevenLabs-ийн eleven_v4_turbo загвар
// speed тохиргоог үл тоодог тул TTS-ийн гаралтыг энд 8kHz дээр хурдасгана. Урсгалаар ирсэн
// хэсгүүдийг тэр дор нь боловсруулна: нэмэлт хүлээлт ~40мс.

const FRAME = 240; // 30мс
const HOP = FRAME / 2; // гаралтын алхам (50% давхцал)
const TOLERANCE = 48; // ±6мс: давхцал хамгийн сайн таарах байрлалыг хайх хүрээ
const WINDOW = Float32Array.from({ length: FRAME }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / FRAME));

export function createTimeStretcher(speed: number) {
  const step = HOP * speed; // оролтын алхам
  let input = new Float32Array(0);
  let base = 0; // input[0]-ийн үнэмлэхүй байрлал
  let frames = 0;
  let previous = -1; // өмнөх сонгосон хэсгийн байрлал
  let tail = new Float32Array(HOP); // давхцуулж нэмэх үлдэгдэл

  const at = (position: number) => input[position - base] ?? 0;

  // Өмнөх хэсгийн байгалийн үргэлжлэлтэй хамгийн төстэй байрлалыг сонгоно: долгион тасрахгүй.
  function choose(nominal: number): number {
    if (previous < 0) return nominal;
    const natural = previous + HOP;
    let best = nominal;
    let bestScore = -Infinity;
    for (let delta = -TOLERANCE; delta <= TOLERANCE; delta += 2) {
      const start = nominal + delta;
      if (start < base) continue;
      let score = 0;
      for (let n = 0; n < HOP; n += 2) score += at(start + n) * at(natural + n);
      if (score > bestScore) {
        bestScore = score;
        best = start;
      }
    }
    return best;
  }

  function run(final: boolean): Int16Array {
    const out: number[] = [];
    for (;;) {
      const nominal = Math.round(frames * step);
      const needed = Math.max(nominal + TOLERANCE, previous + HOP) + FRAME;
      if (needed > base + input.length && !final) break;
      if (nominal >= base + input.length) break;
      const start = choose(nominal);
      for (let n = 0; n < HOP; n++) out.push(tail[n] + at(start + n) * WINDOW[n]);
      tail = Float32Array.from({ length: HOP }, (_, n) => at(start + HOP + n) * WINDOW[HOP + n]);
      previous = start;
      frames++;
    }
    if (final) out.push(...tail);
    // Цаашид хэрэггүй болсон оролтыг хаяна.
    const keepFrom = Math.min(previous < 0 ? base : previous, Math.round(frames * step) - TOLERANCE);
    if (keepFrom > base) {
      input = input.slice(keepFrom - base);
      base = keepFrom;
    }
    return Int16Array.from(out, (value) => Math.max(-32768, Math.min(32767, Math.round(value))));
  }

  return {
    push(samples: Int16Array): Int16Array {
      const next = new Float32Array(input.length + samples.length);
      next.set(input);
      next.set(samples, input.length);
      input = next;
      return run(false);
    },
    flush(): Int16Array {
      return run(true);
    },
  };
}
