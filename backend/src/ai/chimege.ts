// Чимэгэ (chimege.com) яриа таних API: монгол яриаг Gemini-ээс хамаагүй сайн, ~0.6 секундэд
// текст болгоно (бодит дуудлагын 12 өгүүлбэр дээр 11 зөв, Flash 3–4). Нэг өгүүлбэрийг WAV-аар
// илгээж, цэг таслалтай текст буцааж авна. Баримт: https://docs.api.chimege.com/v1.2/mn/

import https from "node:https";

const ENDPOINT = "https://api.chimege.com/v1.2/transcribe";
// Чимэгэгийн сервер холгүй (~230мс) тул холболтыг дахин ашиглана: шинэ TLS холболтод ~0.8с алддаг.
const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });

type Post = (url: string, init: { method: "POST"; body: Uint8Array<ArrayBuffer>; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

const postKeepAlive: Post = (url, init) => new Promise((resolve, reject) => {
  const request = https.request(url, {
    method: "POST", agent, signal: init.signal, headers: { ...init.headers, "Content-Length": String(init.body.length) },
  }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("error", reject);
    response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
      status: response.statusCode ?? 502,
      headers: Object.entries(response.headers).flatMap(([name, value]) => (typeof value === "string" ? [[name, value] as [string, string]] : [])),
    })));
  });
  request.on("error", reject);
  request.end(init.body);
});

// Холболтыг урьдчилан нээнэ. Чимэгэ хүсэлт бүрт ~1.2с боловсруулдаг тул нээлттэй (чөлөөтэй) холболт
// байвал дахин бүү нээ: эс тэгвээс урьдчилсан хүсэлт холболтыг эзэлж, жинхэнэ хүсэлт шинээр холбогдоно.
let warming = false;
export function warmChimege(): void {
  const idle = Object.values(agent.freeSockets).some((sockets) => (sockets?.length ?? 0) > 0);
  if (idle || warming) return;
  warming = true;
  https.get("https://api.chimege.com/", { agent }, (response) => {
    response.resume();
    response.on("end", () => { warming = false; });
  }).on("error", () => { warming = false; });
}
// API нь WAV-д доод тал нь 50KB шаарддаг; богино өгүүлбэрийг хоёр талаас нь чимээгүйгээр гүйцээнэ.
const MIN_WAV_BYTES = 52_000;
const TIMEOUT_MS = 4000;

export function toWav(samples: Int16Array, sampleRate = 16_000): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

export function padForChimege(samples: Int16Array): Int16Array {
  const need = Math.ceil((MIN_WAV_BYTES - 44) / 2);
  if (samples.length >= need) return samples;
  const out = new Int16Array(need);
  out.set(samples, Math.floor((need - samples.length) / 2));
  return out;
}

export const chimegeConfigured = () => Boolean(process.env.CHIMEGE_API_KEY);

// 16kHz PCM-ийг текст болгоно. Хоосон мөр бол яриа биш чимээ байсан гэсэн үг.
export async function transcribeChimege(samples16k: Int16Array, request: Post = postKeepAlive): Promise<string> {
  const response = await request(ENDPOINT, {
    method: "POST",
    body: new Uint8Array(toWav(padForChimege(samples16k))),
    headers: { "Content-Type": "application/octet-stream", Punctuate: "true", Token: process.env.CHIMEGE_API_KEY ?? "" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  // Алдааны кодыг Error-Code толгойд өгдөг (жишээ нь 1000 буруу токен, 2004 буруу формат).
  if (!response.ok) throw new Error(`Чимэгэ ${response.status} (код ${response.headers.get("error-code") ?? "-"})`);
  return text.trim();
}
