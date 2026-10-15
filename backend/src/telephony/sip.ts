// SIP шугам: Монголын IP утасны дугаараар операторын серверт "утас" болж
// бүртгүүлээд, ирсэн дуудлагын дууг (RTP, G.711 mu-law 8kHz) Twilio Media
// Stream-ийн хэлбэрт оруулж handleTwilioMediaStream-д өгнө. Ингэснээр AI-ийн
// урсгал өөрчлөгдөхгүй, дуудлага Twilio-гүйгээр шууд ирнэ.

import { createHash, randomBytes } from "node:crypto";
import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { createWriteStream, mkdirSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { issueStreamToken } from "./streamTokens.js";
import { decodeMuLaw, encodeMuLaw, handleTwilioMediaStream } from "./twilio.js";
import { createLegTranscriber } from "./bridgeTranscript.js";

const FRAME_BYTES = 160; // 20мс, 8kHz mu-law
const FRAME_MS = 20;
const MULAW_SILENCE = 0xff;
const REGISTER_EXPIRES = 120;
// Оператор хүссэн хугацаанаас үл хамааран 60 секунд л олгодог тул түүний талаас бага байна.
const REGISTER_EVERY_MS = 25_000;
const KEEPALIVE_MS = 20_000;
const MEDIA_TIMEOUT_MS = 30_000;
const MAX_CALLS = 5;
const STUN_HOST = "stun.l.google.com";
const SILENCE_FRAME = Buffer.alloc(FRAME_BYTES, MULAW_SILENCE);

type Headers = [string, string][];
export type SipMessage = { startLine: string; headers: Headers; body: string };

const COMPACT: Record<string, string> = { v: "via", f: "from", t: "to", i: "call-id", m: "contact", l: "content-length", c: "content-type" };

export function parseSipMessage(text: string): SipMessage {
  const [head, ...rest] = text.split("\r\n\r\n");
  const [startLine, ...lines] = head.split("\r\n");
  const headers: Headers = [];
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    headers.push([COMPACT[name] ?? name, line.slice(colon + 1).trim()]);
  }
  return { startLine, headers, body: rest.join("\r\n\r\n") };
}

const header = (message: SipMessage, name: string) => message.headers.find(([key]) => key === name)?.[1] ?? "";
const headersNamed = (message: SipMessage, name: string) => message.headers.filter(([key]) => key === name).map(([, value]) => value);
const md5 = (value: string) => createHash("md5").update(value).digest("hex");
const token = (bytes = 8) => randomBytes(bytes).toString("hex");

export function parseChallenge(value: string): Record<string, string> {
  return Object.fromEntries([...value.matchAll(/(\w+)="?([^",]+)"?/g)].map((match) => [match[1].toLowerCase(), match[2]]));
}

// RFC 2617 digest. qop байвал cnonce/nc ашиглана.
export function digestAuthorization(input: {
  username: string; password: string; method: string; uri: string; challenge: Record<string, string>; cnonce?: string;
}): string {
  const { username, password, method, uri, challenge } = input;
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  let value = `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}"`;
  if (challenge.qop) {
    const cnonce = input.cnonce ?? token();
    value += `, qop=auth, nc=00000001, cnonce="${cnonce}", response="${md5(`${ha1}:${challenge.nonce}:00000001:${cnonce}:auth:${ha2}`)}"`;
  } else {
    value += `, response="${md5(`${ha1}:${challenge.nonce}:${ha2}`)}"`;
  }
  if (challenge.opaque) value += `, opaque="${challenge.opaque}"`;
  return `${value}, algorithm=MD5`;
}

export function parseSdpAudio(sdp: string): { ip: string; port: number; payloadTypes: number[] } | null {
  const ip = sdp.match(/^c=IN IP4 (\S+)/m)?.[1];
  const media = sdp.match(/^m=audio (\d+) RTP\/AVP ([\d ]+)/m);
  if (!ip || !media) return null;
  return { ip, port: Number(media[1]), payloadTypes: media[2].trim().split(/\s+/).map(Number) };
}

// Дараалал: давхардсан, бага зэрэг хоцорсон (хаяна), дараагийнх, эсвэл урсгал шинээр эхэлсэн (хүлээн авна).
export function rtpOrder(last: number, sequence: number): "next" | "duplicate" | "late" | "restart" {
  const ahead = (sequence - last + 0x10000) % 0x10000;
  if (ahead === 0) return "duplicate";
  if (ahead >= 0x10000 - 100) return "late";
  return ahead > 3000 ? "restart" : "next";
}

export function buildRtpPacket(sequence: number, timestamp: number, ssrc: number, payload: Uint8Array, marker = false, payloadType = 0): Buffer {
  const packet = Buffer.alloc(12 + payload.length);
  packet[0] = 0x80;
  packet[1] = (marker ? 0x80 : 0x00) | payloadType; // 0 = PCMU, 8 = PCMA
  packet.writeUInt16BE(sequence & 0xffff, 2);
  packet.writeUInt32BE(timestamp >>> 0, 4);
  packet.writeUInt32BE(ssrc >>> 0, 8);
  packet.set(payload, 12);
  return packet;
}

export function parseRtpPacket(packet: Buffer): { payloadType: number; sequence: number; payload: Buffer } | null {
  if (packet.length < 12 || packet[0] >> 6 !== 2) return null;
  let offset = 12 + (packet[0] & 0x0f) * 4;
  if (packet[0] & 0x10) {
    if (packet.length < offset + 4) return null;
    offset += 4 + packet.readUInt16BE(offset + 2) * 4;
  }
  let end = packet.length;
  if (packet[0] & 0x20) end -= packet[end - 1];
  return end > offset ? { payloadType: packet[1] & 0x7f, sequence: packet.readUInt16BE(2), payload: packet.subarray(offset, end) } : null;
}

// G.711 A-law <-> mu-law: зарим дуудлагад оператор зөвхөн A-law (PCMA) санал болгодог.
function aLawToLinear(value: number): number {
  const a = value ^ 0x55;
  const segment = (a & 0x70) >> 4;
  let sample = ((a & 0x0f) << 4) + (segment === 0 ? 8 : 0x108);
  if (segment > 1) sample <<= segment - 1;
  return a & 0x80 ? sample : -sample;
}

function linearToALaw(input: number): number {
  let sample = input >> 3;
  const mask = sample >= 0 ? 0xd5 : 0x55;
  if (sample < 0) sample = -sample - 1;
  let segment = 0;
  while (segment < 8 && sample > (0x1f << segment) + ((1 << segment) - 1)) segment++;
  if (segment >= 8) return 0x7f ^ mask;
  return ((segment << 4) | ((sample >> (segment < 2 ? 1 : segment)) & 0x0f)) ^ mask;
}

const ALL_BYTES = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
const A_TO_MU = encodeMuLaw(Int16Array.from(ALL_BYTES, aLawToLinear));
const MU_TO_A = Buffer.from(Array.from(decodeMuLaw(ALL_BYTES), linearToALaw));
export const aLawToMuLaw = (payload: Buffer): Buffer => Buffer.from(payload.map((byte) => A_TO_MU[byte]));
export const muLawToALaw = (payload: Buffer): Buffer => Buffer.from(payload.map((byte) => MU_TO_A[byte]));

// Twilio аудиог өөрөө буферлээд бодит хурдаар тоглуулдаг. RTP-д бид өөрсдөө
// 20мс тутам нэг хэсгийг гаргана; mark нь өмнөх аудио бүрэн гарсны дараа буцна.
export class PacedAudio {
  private items: (Buffer | { mark: string })[] = [];

  push(ulaw: Buffer): void {
    if (ulaw.length) this.items.push(ulaw);
  }

  mark(name: string): void {
    this.items.push({ mark: name });
  }

  // Barge-in: тоглоогүй аудиог хаяж, хүлээгдэж буй mark-уудыг буцаана.
  clear(): string[] {
    const marks = this.items.flatMap((item) => (Buffer.isBuffer(item) ? [] : [item.mark]));
    this.items = [];
    return marks;
  }

  next(): { frame: Buffer | null; marks: string[] } {
    const marks: string[] = [];
    while (this.items.length && !Buffer.isBuffer(this.items[0])) marks.push((this.items.shift() as { mark: string }).mark);
    if (!this.items.length) return { frame: null, marks };
    const frame = Buffer.alloc(FRAME_BYTES, MULAW_SILENCE);
    let filled = 0;
    while (filled < FRAME_BYTES && Buffer.isBuffer(this.items[0])) {
      const chunk = this.items[0];
      const take = Math.min(FRAME_BYTES - filled, chunk.length);
      chunk.copy(frame, filled, 0, take);
      filled += take;
      if (take === chunk.length) this.items.shift();
      else this.items[0] = chunk.subarray(take);
    }
    return { frame, marks };
  }
}

const STUN_MAGIC = 0x2112a442;

export function parseStunMappedAddress(reply: Buffer): { address: string; port: number } | null {
  if (reply.length < 20 || reply.readUInt16BE(0) !== 0x0101 || reply.readUInt32BE(4) !== STUN_MAGIC) return null;
  for (let offset = 20; offset + 4 <= reply.length;) {
    const type = reply.readUInt16BE(offset);
    const length = reply.readUInt16BE(offset + 2);
    if (type === 0x0020 && length >= 8 && reply[offset + 5] === 0x01) {
      const port = reply.readUInt16BE(offset + 6) ^ (STUN_MAGIC >>> 16);
      const raw = reply.readUInt32BE(offset + 8) ^ STUN_MAGIC;
      return { address: [raw >>> 24, (raw >>> 16) & 255, (raw >>> 8) & 255, raw & 255].join("."), port };
    }
    offset += 4 + length + ((4 - (length % 4)) % 4);
  }
  return null;
}

// NAT-ийн цаанаас гадагш харагдах хаяг, портыг STUN-аар асууна. Нийтийн IP-тэй сервер дээр өөрийнх нь хаяг буцна.
async function stunMappedAddress(socket: Socket, host: string): Promise<{ address: string; port: number } | null> {
  try {
    const stun = (await lookup(host, 4)).address;
    const request = Buffer.alloc(20);
    request.writeUInt16BE(0x0001, 0);
    request.writeUInt32BE(STUN_MAGIC, 4);
    randomBytes(12).copy(request, 8);
    return await new Promise((resolve) => {
      const timer = setTimeout(() => { socket.off("message", onReply); resolve(null); }, 700);
      const onReply = (reply: Buffer) => {
        const mapped = parseStunMappedAddress(reply);
        if (!mapped) return;
        clearTimeout(timer);
        socket.off("message", onReply);
        resolve(mapped);
      };
      socket.on("message", onReply);
      socket.send(request, 19302, stun);
    });
  } catch {
    return null;
  }
}

export type SipConfig = {
  server: string; user: string; password: string; port?: number; publicIp?: string; rtpPortStart?: number;
  // Энэ дугаар аль бизнесийнх (дуудлага, мэдлэгийн сан, AI-ийн танилцуулга үүгээр сонгогдоно).
  businessId?: string;
};

type Call = {
  invite: SipMessage;
  // Манай талын From/To толгой (tag-тай), эсрэг талынх, BYE илгээх хаяг ба замууд.
  toHeader: string;
  peerHeader: string;
  target: string;
  routes: string[];
  byeCseq: number;
  codec: number;
  ackText?: string;
  rtp: Socket;
  rtpPort: number;
  remote: { address: string; port: number };
  socket: EventEmitter & { send: (data: string) => void; close: () => void };
  audio: PacedAudio;
  ended: boolean;
  acked: boolean;
  timers: NodeJS.Timeout[];
  tickTimer?: NodeJS.Timeout;
  begin?: () => void;
  lastMediaAt: number;
  okResponse: string;
  sdp: string;
  stats: { sent: number; received: number; ignored: number; lost: number; late: number; peak: number };
  lastSequence: number;
  // Ажилтан руу шилжүүлсэн үед: энэ дуудлагын дууг AI-д биш, холбосон дуудлага руу дамжуулна.
  forward?: (payload: Buffer) => void;
  peerId?: string;
  // AI-тай ярилцлагын дуудлагын дугаар (бичвэр хадгалах) ба шилжүүлсний дараах тэмдэглэгч.
  sessionId?: string;
  listen?: (payload: Buffer) => void;
};

// Ажилтан утсаа авахыг хүлээх хугацаа: үүнээс удвал AI зочинтой үргэлжлүүлнэ.
const TRANSFER_RING_TIMEOUT_MS = 25_000;
export type SipSocket = { transfer?: (number: string) => Promise<boolean> };

export type SipLine = { dial: (number: string, params?: Record<string, string>) => Promise<boolean> };
const RING_TIMEOUT_MS = 45_000;
// Гадагш дуудлагад хариулсны дараа дууны зам нээгдэж, хүн утсаа чихэндээ ойртуулах хугацаа:
// түүнээс өмнө эхэлсэн мэндчилгээний эхний үгс сонсогдохгүй байсан.
const OUTBOUND_GREETING_DELAY_MS = 1000;

export async function startSipLine(config: SipConfig): Promise<SipLine> {
  const serverIp = (await lookup(config.server, 4)).address;
  const server = { address: serverIp, port: 5060 };
  const signal = createSocket("udp4");
  await new Promise<void>((resolve) => signal.bind(config.port ?? 5060, resolve));
  const localPort = signal.address().port;
  // NAT-ийн цаана байвал гадаад хаягаа серверийн хариуны Via-аас (received/rport) мэднэ.
  const mappedSignal = config.publicIp ? null : await stunMappedAddress(signal, STUN_HOST);
  let publicIp = config.publicIp ?? mappedSignal?.address ?? "0.0.0.0";
  let publicPort = mappedSignal?.port ?? localPort;
  const registerCallId = token(16);
  const registerTag = token(4);
  let registerCseq = 0;
  let registered = false;
  let authTried = false;
  let lastRegisteredAt = 0;
  let lastChallenge: { header: string; values: Record<string, string> } | undefined;
  let registerWatchdog: NodeJS.Timeout | undefined;
  // Өмнөх ажиллагааны хуучин бүртгэл үлдвэл оператор нэг дуудлагыг хоёр хувь илгээдэг тул эхлээд бүгдийг арилгана.
  let clearing = true;
  const calls = new Map<string, Call>();
  // Хариу бэлдэж байх хооронд ирсэн давтан INVITE-ийг хоёр дахь дуудлага гэж андуурахгүйн тулд.
  const answering = new Set<string>();
  const rtpPorts = new Set<number>();
  const rtpPortStart = config.rtpPortStart ?? 10_000;
  // Гадагш залгаж буй (хариу хүлээж буй) дуудлагууд: Call-ID → хариуг боловсруулах функц.
  const dialing = new Map<string, (response: SipMessage) => void>();

  const send = (text: string, to = server) => signal.send(text, to.port, to.address);
  const via = () => `Via: SIP/2.0/UDP ${publicIp}:${publicPort};branch=z9hG4bK${token()};rport`;
  const contact = () => `Contact: <sip:${config.user}@${publicIp}:${publicPort}>`;

  function startRegister(): void {
    authTried = false;
    // Нууц үггүй сэргээх хүсэлтэд сервер 200 гэж хариулсан ч бүртгэлийг сунгадаггүй тул
    // сүүлийн challenge-аар шууд баталгаажуулж илгээнэ; хуучирсан бол 401 ирж, шинээр авна.
    register(lastChallenge);
    // Хариу огт ирэхгүй бол (сүлжээ тасарсан, NAT-ийн нүх хаагдсан) чимээгүй алдахгүйн тулд мэдэгдэнэ.
    clearTimeout(registerWatchdog);
    registerWatchdog = setTimeout(() => {
      if (Date.now() - lastRegisteredAt > 15_000) console.error("[sip] бүртгэлийн хүсэлтэд хариу ирсэнгүй — дахин оролдож байна");
    }, 10_000);
    registerWatchdog.unref();
  }

  function register(challenge?: { header: string; values: Record<string, string> }): void {
    const uri = `sip:${config.server}`;
    const lines = [
      `REGISTER ${uri} SIP/2.0`, via(), "Max-Forwards: 70",
      `From: <sip:${config.user}@${config.server}>;tag=${registerTag}`, `To: <sip:${config.user}@${config.server}>`,
      `Call-ID: ${registerCallId}`, `CSeq: ${++registerCseq} REGISTER`, ...(clearing ? ["Contact: *", "Expires: 0"] : [contact(), `Expires: ${REGISTER_EXPIRES}`]), "User-Agent: ai-frontdesk",
    ];
    if (challenge) {
      lines.push(`${challenge.header}: ${digestAuthorization({ username: config.user, password: config.password, method: "REGISTER", uri, challenge: challenge.values })}`);
    }
    send(`${lines.join("\r\n")}\r\nContent-Length: 0\r\n\r\n`);
  }

  function respond(request: SipMessage, status: string, to: RemoteInfo | { address: string; port: number }, extra: string[] = [], body = "", toHeader?: string): string {
    const lines = [`SIP/2.0 ${status}`];
    for (const [name, value] of request.headers) {
      if (name === "via") lines.push(`Via: ${value}`);
      if (name === "record-route") lines.push(`Record-Route: ${value}`);
    }
    lines.push(`From: ${header(request, "from")}`, `To: ${toHeader ?? header(request, "to")}`, `Call-ID: ${header(request, "call-id")}`, `CSeq: ${header(request, "cseq")}`, ...extra);
    if (body) lines.push("Content-Type: application/sdp");
    const text = `${lines.join("\r\n")}\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    send(text, to);
    return text;
  }

  function endCall(callId: string, sendBye: boolean): void {
    const call = calls.get(callId);
    if (!call || call.ended) return;
    call.ended = true;
    call.timers.forEach((timer) => clearTimeout(timer));
    clearTimeout(call.tickTimer);
    call.rtp.close();
    rtpPorts.delete(call.rtpPort);
    if (sendBye) {
      const lines = [`BYE ${call.target} SIP/2.0`, via(), "Max-Forwards: 70", ...call.routes.map((route) => `Route: ${route}`),
        `From: ${call.toHeader}`, `To: ${call.peerHeader}`, `Call-ID: ${callId}`, `CSeq: ${call.byeCseq} BYE`];
      send(`${lines.join("\r\n")}\r\nContent-Length: 0\r\n\r\n`);
    }
    call.socket.emit("message", JSON.stringify({ event: "stop" }));
    call.socket.emit("close");
    // Ажилтантай холбосон бол нөгөө талыг ч таслана.
    if (call.peerId) endCall(call.peerId, true);
    // Хоцорч ирсэн давтан мессежид хариулахын тулд түр хадгална.
    setTimeout(() => calls.delete(callId), 10_000).unref();
    console.log(`[sip] дуу: илгээсэн ${call.stats.sent} хэсэг, хүлээн авсан ${call.stats.received} (алдагдсан ${call.stats.lost}, хоцорсон ${call.stats.late}, оргил түвшин ${Math.round(call.stats.peak / 327.68)}%), өөр хаягаас ${call.stats.ignored}`);
    console.log(`[sip] дуудлага дууслаа (${[...calls.values()].filter((item) => !item.ended).length} идэвхтэй үлдлээ)`);
  }

  const activeCalls = () => [...calls.values()].filter((call) => !call.ended).length + dialing.size;

  // Дууны порт нөөцөлж нээгээд SDP-д зарлах гадаад хаяг, портыг буцаана.
  async function openRtp(): Promise<{ rtp: Socket; rtpPort: number; mediaIp: string; mediaPort: number }> {
    const rtp = createSocket("udp4");
    // Зэрэг ирсэн дуудлагууд нэг порт авахгүйн тулд хүлээхээс өмнө нөөцөлнө.
    let rtpPort = rtpPortStart;
    while (rtpPorts.has(rtpPort)) rtpPort += 2;
    rtpPorts.add(rtpPort);
    try {
      await new Promise<void>((resolve, reject) => rtp.once("error", reject).bind(rtpPort, resolve));
      // NAT-ийн цаана дотоод порт өөр харагддаг тул гадаад хаягийг STUN-аар асууна.
      const mapped = config.publicIp ? null : await stunMappedAddress(rtp, STUN_HOST);
      return { rtp, rtpPort, mediaIp: mapped?.address ?? publicIp, mediaPort: mapped?.port ?? rtpPort };
    } catch (error) {
      rtpPorts.delete(rtpPort);
      rtp.close();
      throw error;
    }
  }

  function buildSdp(ip: string, port: number, codecs: number[]): string {
    const sessionId = Date.now();
    return ["v=0", `o=- ${sessionId} ${sessionId} IN IP4 ${ip}`, "s=ai-frontdesk", `c=IN IP4 ${ip}`, "t=0 0",
      `m=audio ${port} RTP/AVP ${codecs.join(" ")}`, ...codecs.map((codec) => `a=rtpmap:${codec} ${codec === 8 ? "PCMA" : "PCMU"}/8000`),
      "a=ptime:20", "a=sendrecv", ""].join("\r\n");
  }

  // Дуудлагын дуу (RTP)-г AI-ийн урсгалтай холбох Twilio хэлбэрийн socket үүсгэж, 20мс тутмын илгээлтийг эхлүүлнэ.
  function createCall(callId: string, fields: Pick<Call, "invite" | "toHeader" | "peerHeader" | "target" | "routes" | "byeCseq" | "codec" | "rtp" | "rtpPort" | "remote" | "sdp">): Call {
    const { codec, rtp } = fields;
    const audio = new PacedAudio();
    const socket = Object.assign(new EventEmitter(), {
      send(data: string) {
        const event = JSON.parse(data) as { event: string; media?: { payload: string }; mark?: { name: string } };
        if (event.event === "media" && event.media) audio.push(Buffer.from(event.media.payload, "base64"));
        if (event.event === "mark" && event.mark) audio.mark(event.mark.name);
        if (event.event === "clear") audio.clear().forEach(emitMark);
      },
      close() {
        endCall(callId, true);
      },
      // Зочныг ажилтантай холбоно: ажилтан руу залгаж, авбал хоёр дуудлагын дууг хооронд нь дамжуулна.
      // AI-ийн яриа (энэ socket) зогсоно. Ажилтан авахгүй бол false, AI үргэлжлүүлнэ.
      transfer(number: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
          dial(number, { direction: "transfer" }, {
            ringTimeoutMs: TRANSFER_RING_TIMEOUT_MS,
            onAnswered: (peerId, peer) => {
              const self = calls.get(callId);
              if (!self || self.ended) {
                endCall(peerId, true);
                resolve(false);
                return;
              }
              self.audio.clear();
              self.forward = (payload) => peer.audio.push(payload);
              peer.forward = (payload) => self.audio.push(payload);
              self.peerId = peerId;
              peer.peerId = callId;
              // Ажилтантай ярьсныг AI-тай ярьсан бичвэрийн үргэлжлэл болгож тэмдэглэнэ.
              if (self.sessionId) {
                self.listen = createLegTranscriber(self.sessionId, "caller");
                peer.listen = createLegTranscriber(self.sessionId, "staff");
              }
              console.log("[sip] зочныг ажилтантай холболоо");
              // AI-ийн сешнийг хаана; SIP дуудлага (зочин ↔ ажилтан) үргэлжилнэ.
              socket.emit("message", JSON.stringify({ event: "stop" }));
              resolve(true);
            },
            onFailed: () => resolve(false),
          }).then((ringing) => {
            if (!ringing) resolve(false);
          }, () => resolve(false));
        });
      },
    });
    const emitMark = (name: string) => socket.emit("message", JSON.stringify({ event: "mark", mark: { name } }));

    const call: Call = {
      ...fields, socket, audio, ended: false, acked: false, timers: [], lastMediaAt: Date.now(), okResponse: "",
      stats: { sent: 0, received: 0, ignored: 0, lost: 0, late: 0, peak: 0 }, lastSequence: -1,
    };
    calls.set(callId, call);

    // Оношлогоо: SIP_RECORD_DIR заасан үед л залгагчийн түүхий дууг (mu-law 8kHz) файлд хадгална.
    const recordDir = process.env.SIP_RECORD_DIR;
    if (recordDir) mkdirSync(recordDir, { recursive: true });
    const recording = recordDir ? createWriteStream(`${recordDir}/${Date.now()}.ulaw`) : null;
    call.timers.push(setTimeout(() => recording?.end(), 10 * 60_000));

    rtp.on("message", (packet, rinfo) => {
      // Зөвхөн SDP-д заасан хаягаас ирсэн дууг авна; порт нь NAT-аас болж өөр байж болно.
      if (rinfo.address !== call.remote.address) {
        call.stats.ignored++;
        return;
      }
      call.remote.port = rinfo.port;
      const parsed = parseRtpPacket(packet);
      if (!parsed || parsed.payloadType !== codec) return;
      if (codec === 8) parsed.payload = aLawToMuLaw(parsed.payload);
      call.lastMediaAt = Date.now();
      call.stats.received++;
      // Хоцорч, давхардаж ирсэн хэсгийг хаяна: дарааллаас гадуур тоглуулбал яриа гажна.
      if (call.lastSequence >= 0) {
        const order = rtpOrder(call.lastSequence, parsed.sequence);
        if (order === "duplicate" || order === "late") {
          call.stats.late++;
          return;
        }
        if (order === "next") call.stats.lost += (parsed.sequence - call.lastSequence + 0x10000) % 0x10000 - 1;
      }
      call.lastSequence = parsed.sequence;
      for (const sample of decodeMuLaw(parsed.payload)) call.stats.peak = Math.max(call.stats.peak, Math.abs(sample));
      recording?.write(parsed.payload);
      if (call.forward) {
        call.forward(parsed.payload);
        call.listen?.(parsed.payload);
        return;
      }
      socket.emit("message", JSON.stringify({ event: "media", media: { payload: parsed.payload.toString("base64") } }));
    });
    rtp.on("error", (error) => console.error("[sip] RTP алдаа:", error.message));

    // 20мс тутам нэг хэсэг; чимээгүй үед ч цаг (timestamp) урагшилна.
    const ssrc = randomBytes(4).readUInt32BE();
    let sequence = randomBytes(2).readUInt16BE();
    let timestamp = randomBytes(4).readUInt32BE();
    let talking = false;
    let nextAt = Date.now();
    const tick = () => {
      if (call.ended) return;
      const { frame, marks } = audio.next();
      marks.forEach(emitMark);
      // Чимээгүй үед ч илгээнэ: NAT-ийн нүхийг нээлттэй байлгаж, сервер манай хаягийг танихад тусална.
      const out = frame ?? SILENCE_FRAME;
      rtp.send(buildRtpPacket(sequence++, timestamp, ssrc, codec === 8 ? muLawToALaw(out) : out, frame !== null && !talking, codec), call.remote.port, call.remote.address);
      if (frame) call.stats.sent++;
      talking = frame !== null;
      timestamp += FRAME_BYTES;
      if (Date.now() - call.lastMediaAt > MEDIA_TIMEOUT_MS) {
        console.error("[sip] дуу ирэхээ больсон тул дуудлагыг таслалаа");
        endCall(callId, true);
        return;
      }
      nextAt += FRAME_MS;
      call.tickTimer = setTimeout(tick, Math.max(0, nextAt - Date.now()));
    };
    call.tickTimer = setTimeout(tick, 0);
    return call;
  }

  // Дуудлага бүрэн холбогдсоны дараа AI-тай ярилцлагыг эхлүүлнэ.
  function startConversation(callId: string, call: Call, callerPhone: string, params: Record<string, string> = {}): void {
    if (call.ended) return;
    handleTwilioMediaStream(call.socket as unknown as WebSocket);
    call.sessionId = `SIP${token(12)}`;
    call.socket.emit("message", JSON.stringify({
      event: "start",
      start: { streamSid: callId, callSid: call.sessionId, // Туршилтын дуудлагад өөр бизнесийн AI ярьж болно (params.businessId).
      customParameters: { ...params, businessId: params.businessId ?? config.businessId ?? "default", streamToken: issueStreamToken(), callerPhone } },
    }));
  }

  async function onInvite(message: SipMessage, from: RemoteInfo): Promise<void> {
    const callId = header(message, "call-id");
    const existing = calls.get(callId);
    if (existing) {
      if (existing.ended) return;
      // Давтан INVITE бол өмнөх хариугаа, re-INVITE (шинэ CSeq) бол ижил SDP-тэй шинэ хариу илгээнэ.
      if (existing.okResponse && header(message, "cseq") === header(existing.invite, "cseq")) send(existing.okResponse, from);
      else respond(message, "200 OK", from, [contact()], existing.sdp, existing.toHeader);
      return;
    }
    if (answering.has(callId)) return;
    const offer = parseSdpAudio(message.body);
    const codec = offer?.payloadTypes.includes(0) ? 0 : offer?.payloadTypes.includes(8) ? 8 : -1;
    if (!offer || codec < 0) {
      console.error(`[sip] дуудлагыг авч чадсангүй: ${offer ? `дэмжих codec алга (санал болгосон: ${offer.payloadTypes.join(" ")})` : `SDP алга (${message.body.length} байт)`}`);
      respond(message, "488 Not Acceptable Here", from);
      return;
    }
    const active = activeCalls();
    if (active >= MAX_CALLS) {
      console.error(`[sip] дуудлагыг авсангүй: ${active} дуудлага идэвхтэй байна`);
      respond(message, "486 Busy Here", from);
      return;
    }
    respond(message, "100 Trying", from);
    answering.add(callId);
    const { rtp, rtpPort, mediaIp, mediaPort } = await openRtp();
    const toHeader = `${header(message, "to")};tag=${token(4)}`;
    const sdp = buildSdp(mediaIp, mediaPort, [codec]);
    const call = createCall(callId, {
      invite: message, toHeader, peerHeader: header(message, "from"),
      // Дуудлагын дотор манай тал нь To; BYE-ийн Request-URI нь эсрэг талын Contact.
      target: header(message, "contact").match(/<([^>]+)>/)?.[1] ?? `sip:${config.server}`,
      routes: headersNamed(message, "record-route"), byeCseq: 1, codec, rtp, rtpPort, remote: { address: offer.ip, port: offer.port }, sdp,
    });
    answering.delete(callId);

    call.okResponse = respond(message, "200 OK", from, [contact(), "Allow: INVITE, ACK, BYE, CANCEL, OPTIONS"], sdp, toHeader);
    // ACK иртэл 200-г давтана (UDP алдагдаж болно).
    [500, 1000, 2000, 4000].forEach((delay) => call.timers.push(setTimeout(() => {
      if (!call.acked && !call.ended) send(call.okResponse, from);
    }, delay)));

    const callerDigits = (header(message, "from").match(/sip:([^@>;]+)/)?.[1] ?? "").replace(/\D/g, "");
    const callerPhone = callerDigits.length === 8 ? callerDigits : callerDigits.length > 8 ? `+${callerDigits}` : "";
    console.log(`[sip] дуудлага ирлээ (залгагчийн дугаар ${callerPhone ? "тодорхой" : "тодорхойгүй"})`);
    // Мэндчилгээг дуудлага бүрэн холбогдсоны (ACK) дараа эхлүүлнэ: түүнээс өмнө илгээсэн дуу залгагчид хүрэхгүй.
    call.begin = () => {
      call.begin = undefined;
      startConversation(callId, call, callerPhone);
    };
    call.timers.push(setTimeout(() => call.begin?.(), 2000));
  }

  // Шугамаар гадагш залгана (буцааж залгах, захиалга сануулах). Утас дуугарч эхэлбэл true, татгалзвал false.
  // options.onAnswered: хариулсан дуудлагыг AI-тай биш, өөр зүйлтэй (ажилтны шилжүүлэг) холбоно.
  async function dial(number: string, params: Record<string, string> = {}, options: {
    ringTimeoutMs?: number;
    onAnswered?: (callId: string, call: Call) => void;
    onFailed?: () => void;
  } = {}): Promise<boolean> {
    const ringTimeout = options.ringTimeoutMs ?? RING_TIMEOUT_MS;
    if (!registered) return false;
    if (activeCalls() >= MAX_CALLS) return false;
    const { rtp, rtpPort, mediaIp, mediaPort } = await openRtp();
    const callId = token(16);
    const uri = `sip:${number}@${config.server}`;
    const fromHeader = `<sip:${config.user}@${config.server}>;tag=${token(4)}`;
    const sdp = buildSdp(mediaIp, mediaPort, [0, 8]);
    let cseq = 0;
    let branch = "";
    let authAttempts = 0;
    let gotResponse = false;
    let settled = false;
    let settle: (ok: boolean) => void = () => {};
    const result = new Promise<boolean>((resolve) => { settle = resolve; });
    const finish = (ok: boolean) => {
      if (!settled) settle(ok);
      settled = true;
    };
    const timers: NodeJS.Timeout[] = [];
    const viaLine = () => `Via: SIP/2.0/UDP ${publicIp}:${publicPort};branch=${branch};rport`;

    const sendInvite = (auth?: string) => {
      branch = `z9hG4bK${token()}`;
      gotResponse = false;
      const lines = [`INVITE ${uri} SIP/2.0`, viaLine(), "Max-Forwards: 70", `From: ${fromHeader}`, `To: <${uri}>`, `Call-ID: ${callId}`,
        `CSeq: ${++cseq} INVITE`, contact(), ...(auth ? [auth] : []), "Allow: INVITE, ACK, BYE, CANCEL, OPTIONS", "User-Agent: ai-frontdesk", "Content-Type: application/sdp"];
      const text = `${lines.join("\r\n")}\r\nContent-Length: ${Buffer.byteLength(sdp)}\r\n\r\n${sdp}`;
      send(text);
      // Хариу иртэл давтана (UDP алдагдаж болно).
      [500, 1000, 2000].forEach((delay) => timers.push(setTimeout(() => {
        if (!gotResponse && dialing.has(callId)) send(text);
      }, delay)));
    };
    const cleanup = () => {
      timers.forEach((timer) => clearTimeout(timer));
      dialing.delete(callId);
    };
    const abandon = (reason: string) => {
      cleanup();
      rtp.close();
      rtpPorts.delete(rtpPort);
      console.error(`[sip] гадагш дуудлага амжилтгүй: ${reason}`);
      finish(false);
      options.onFailed?.();
    };
    // 2xx-ээс бусад эцсийн хариуг ижил branch-тай ACK-аар баталгаажуулна.
    const ackFailure = (response: SipMessage) => send([`ACK ${uri} SIP/2.0`, viaLine(), "Max-Forwards: 70", `From: ${fromHeader}`, `To: ${header(response, "to")}`,
      `Call-ID: ${callId}`, `CSeq: ${cseq} ACK`].join("\r\n") + "\r\nContent-Length: 0\r\n\r\n");

    dialing.set(callId, (response) => {
      if (!header(response, "cseq").includes("INVITE")) return;
      // Өмнөх (нууц үггүй) INVITE-ийн давтан хариуг алгасна.
      if (Number.parseInt(header(response, "cseq"), 10) !== cseq) return;
      gotResponse = true;
      const status = Number(response.startLine.split(" ")[1]);
      const challenge = header(response, "proxy-authenticate") || header(response, "www-authenticate");
      // Оношлогоо: нууц мэдээлэлгүйгээр хариуны төрөл, challenge-ийн талбаруудыг харуулна.
      console.log(`[sip] гадагш: ${status} (${header(response, "cseq")})${challenge ? ` challenge ${Object.keys(parseChallenge(challenge)).join(",")}${/stale=true/i.test(challenge) ? " stale" : ""}` : ""}`);
      if (status < 200) {
        // Утас дуугарч эхэлсэн (эсвэл оператор хүлээн авсан).
        finish(true);
        return;
      }
      if ((status === 401 || status === 407) && (authAttempts === 0 || (authAttempts < 3 && /stale=true/i.test(challenge)))) {
        authAttempts++;
        ackFailure(response);
        const challenge = parseChallenge(header(response, status === 401 ? "www-authenticate" : "proxy-authenticate"));
        const name = status === 401 ? "Authorization" : "Proxy-Authorization";
        sendInvite(`${name}: ${digestAuthorization({ username: config.user, password: config.password, method: "INVITE", uri, challenge })}`);
        return;
      }
      if (status >= 300) {
        ackFailure(response);
        abandon(response.startLine.replace(/\d{6,}/g, "…"));
        return;
      }
      // 200 OK: хариулсан. ACK илгээж, дууг холбоно.
      cleanup();
      const answer = parseSdpAudio(response.body);
      const codec = answer?.payloadTypes.find((type) => type === 0 || type === 8);
      const routes = headersNamed(response, "record-route").reverse();
      const target = header(response, "contact").match(/<([^>]+)>/)?.[1] ?? uri;
      const ackText = [`ACK ${target} SIP/2.0`, via(), "Max-Forwards: 70", ...routes.map((route) => `Route: ${route}`), `From: ${fromHeader}`,
        `To: ${header(response, "to")}`, `Call-ID: ${callId}`, `CSeq: ${cseq} ACK`].join("\r\n") + "\r\nContent-Length: 0\r\n\r\n";
      send(ackText);
      const call = createCall(callId, {
        invite: response, toHeader: fromHeader, peerHeader: header(response, "to"), target, routes, byeCseq: cseq + 1,
        codec: codec ?? 0, rtp, rtpPort, remote: { address: answer?.ip ?? serverIp, port: answer?.port ?? 0 }, sdp,
      });
      call.acked = true;
      call.ackText = ackText;
      finish(true);
      if (!answer || codec === undefined) {
        console.error("[sip] гадагш дуудлага: дэмжих codec алга");
        endCall(callId, true);
        options.onFailed?.();
        return;
      }
      console.log("[sip] гадагш дуудлагад хариулав");
      if (options.onAnswered) {
        options.onAnswered(callId, call);
        return;
      }
      call.timers.push(setTimeout(() => {
        if (!call.ended) startConversation(callId, call, number, params);
      }, OUTBOUND_GREETING_DELAY_MS));
    });

    console.log("[sip] гадагш залгаж байна");
    sendInvite();
    // Хариу ирэхгүй бол болиулна; хэт удаан дуугарвал CANCEL илгээнэ.
    timers.push(setTimeout(() => {
      if (!gotResponse && dialing.has(callId)) abandon("операторын хариу ирсэнгүй");
    }, 8000));
    timers.push(setTimeout(() => {
      if (!dialing.has(callId)) return;
      send([`CANCEL ${uri} SIP/2.0`, viaLine(), "Max-Forwards: 70", `From: ${fromHeader}`, `To: <${uri}>`, `Call-ID: ${callId}`, `CSeq: ${cseq} CANCEL`].join("\r\n") + "\r\nContent-Length: 0\r\n\r\n");
    }, ringTimeout));
    // Цуцалсны дараа 487 ирэхгүй бол цэвэрлэнэ.
    timers.push(setTimeout(() => {
      if (dialing.has(callId)) abandon("хариулсангүй");
    }, ringTimeout + 5000));
    return result;
  }

  signal.on("message", (data, from) => {
    if (from.address !== serverIp || data.length < 12) {
      // Гадны эх үүсвэр эсвэл keepalive. Оператор өөр хаягаас дуудлага илгээдэг бол эндээс харагдана.
      if (process.env.SIP_DEBUG && data.length >= 12) console.debug(`[sip] ← үл мэдэх хаягаас: ${data.toString("utf8", 0, 24).replace(/\s+/g, " ").replace(/\d{6,}/g, "…")}`);
      return;
    }
    const message = parseSipMessage(data.toString("utf8"));
    const callId = header(message, "call-id");
    if (process.env.SIP_DEBUG) {
      const expires = header(message, "expires") || header(message, "contact").match(/expires=(\d+)/)?.[1] || "-";
      console.debug(`[sip] ← ${message.startLine.replace(/\d{6,}/g, "…")} (${header(message, "cseq")}, expires ${expires}, contacts ${headersNamed(message, "contact").length})`);
    }

    if (message.startLine.startsWith("SIP/2.0")) {
      const status = Number(message.startLine.split(" ")[1]);
      const onDialResponse = dialing.get(callId);
      if (onDialResponse) {
        onDialResponse(message);
        return;
      }
      // Хариулсан дуудлагын 200 давтагдвал ACK алдагдсан: дахин илгээнэ.
      const answered = calls.get(callId);
      if (answered?.ackText && status === 200 && header(message, "cseq").includes("INVITE")) {
        send(answered.ackText);
        return;
      }
      if (callId !== registerCallId || !header(message, "cseq").includes("REGISTER")) return;
      if (status === 401 || status === 407) {
        const name = status === 401 ? "www-authenticate" : "proxy-authenticate";
        // Нэг хүсэлтэд нэг л удаа нууц үгээр хариулна; дахин татгалзвал нууц үг буруу.
        if (!authTried) {
          authTried = true;
          lastChallenge = { header: status === 401 ? "Authorization" : "Proxy-Authorization", values: parseChallenge(header(message, name)) };
          register({ header: status === 401 ? "Authorization" : "Proxy-Authorization", values: parseChallenge(header(message, name)) });
        } else {
          console.error("[sip] бүртгэл татгалзагдлаа — SIP_USER / SIP_PASSWORD-оо шалгана уу");
        }
      } else if (status === 200) {
        if (clearing) {
          clearing = false;
          startRegister();
          return;
        }
        const top = headersNamed(message, "via")[0] ?? "";
        const seenIp = top.match(/received=([\d.]+)/)?.[1];
        const seenPort = Number(top.match(/rport=(\d+)/)?.[1] ?? 0);
        const changed = !config.publicIp && seenIp && (seenIp !== publicIp || (seenPort && seenPort !== publicPort));
        if (changed) {
          publicIp = seenIp;
          if (seenPort) publicPort = seenPort;
          startRegister();
          return;
        }
        if (!registered) console.log(`[sip] …${config.user.slice(-2)} дугаар ${config.server} дээр бүртгэгдлээ — дуудлага хүлээж байна (гадаад хаяг ${publicIp === "0.0.0.0" ? "олдсонгүй" : "олдсон"}, порт ${publicPort === localPort ? "ижил" : "өөр"})`);
        registered = true;
        lastRegisteredAt = Date.now();
      } else if (status >= 300) {
        console.error(`[sip] бүртгэлийн алдаа: ${message.startLine}`);
        // Сервер бүгдийг арилгах хүсэлтийг дэмжихгүй бол энгийн бүртгэлээр үргэлжлүүлнэ.
        if (clearing) {
          clearing = false;
          startRegister();
        }
      }
      return;
    }

    const method = message.startLine.split(" ")[0];
    const call = calls.get(callId);
    // Оношлогоо: INVITE-ийн зам (дугааруудыг нууна).
    if (process.env.SIP_DEBUG && method === "INVITE") {
      const mask = (value: string) => value.replace(/\d{5,}/g, "…");
      console.debug(`[sip] INVITE ${from.address}:${from.port} call ${callId.slice(0, 8)} via ${mask(headersNamed(message, "via").join(" | "))} rr ${mask(headersNamed(message, "record-route").join(" | ") || "-")} contact ${mask(header(message, "contact"))} sdp ${mask(message.body.match(/^c=.*$/m)?.[0] ?? "-")} ${message.body.match(/^m=.*$/m)?.[0] ?? ""}`);
    }
    if (method === "INVITE") {
      onInvite(message, from).catch((error) => {
        answering.delete(callId);
        console.error("[sip] дуудлага хүлээн авахад алдаа:", error instanceof Error ? error.message : error);
        respond(message, "500 Server Error", from);
      });
    } else if (method === "ACK") {
      if (call) {
        call.acked = true;
        const begin = call.begin;
        if (begin) call.timers.push(setTimeout(begin, 300));
        call.begin = undefined;
      }
    } else if (method === "BYE") {
      respond(message, "200 OK", from);
      endCall(callId, false);
    } else if (method === "CANCEL") {
      respond(message, "200 OK", from);
      endCall(callId, false);
    } else if (method === "OPTIONS" || method === "NOTIFY" || method === "INFO" || method === "UPDATE") {
      respond(message, "200 OK", from);
    } else {
      respond(message, "405 Method Not Allowed", from);
    }
  });
  signal.on("error", (error) => console.error("[sip] socket алдаа:", error.message));

  startRegister();
  setInterval(startRegister, REGISTER_EVERY_MS).unref();
  setInterval(() => send("\r\n\r\n"), KEEPALIVE_MS).unref();
  return { dial };
}
