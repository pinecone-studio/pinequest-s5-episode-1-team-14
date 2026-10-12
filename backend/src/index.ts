import "dotenv/config";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { buildMediaStreamTwiml, handleTwilioMediaStream, resolveCallerPhone } from "./telephony/twilio.js";
import { isValidTwilioSignature } from "./telephony/twilioSignature.js";
import { issueStreamToken } from "./telephony/streamTokens.js";
import { CALL_GREETING } from "./ai/callPrompt.js";
import { cachedUlaw8k } from "./voice/elevenlabs.js";
import { CallSessionStore } from "./calls/store.js";
import { TranscriptStore } from "./calls/transcript.js";
import { BusinessKnowledgeStore } from "./knowledge/store.js";
import { listBookings } from "./calendar/googleCalendar.js";

const PORT = Number(process.env.PORT ?? 8080);

// Хянах самбарын (PWA) зөвхөн унших өгөгдөл.
const DASHBOARD_ROUTES: Record<string, () => unknown> = {
  "/api/calls": () => new CallSessionStore().list(),
  "/api/transcripts": () => new TranscriptStore().all(),
  "/api/knowledge": () => new BusinessKnowledgeStore().list({ activeOnly: false }),
  "/api/bookings": () => listBookings(),
};

function hasDashboardToken(req: IncomingMessage): boolean {
  const expected = process.env.DASHBOARD_API_TOKEN;
  if (!expected) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(req.headers.authorization ?? ""), digest(`Bearer ${expected}`));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// Twilio ngrok/reverse-proxy-ийн цаана https-ээр дуудсан ч бидэнд энгийн
// http хүсэлт ирдэг тул анхны public URL-ийг толгойноос сэргээнэ.
function publicUrl(req: IncomingMessage): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0].trim();
  return `${proto}://${req.headers.host}${req.url}`;
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/voice") {
    const body = await readBody(req);
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      console.error("[voice] TWILIO_AUTH_TOKEN тохируулаагүй тул webhook баталгаажуулж чадахгүй байна");
      res.writeHead(500);
      res.end();
      return;
    }
    const params = new URLSearchParams(body);
    if (!isValidTwilioSignature(authToken, publicUrl(req), params, req.headers["x-twilio-signature"])) {
      console.error("[voice] Twilio гарын үсэг буруу байна — хүсэлтийг татгалзлаа");
      res.writeHead(403);
      res.end();
      return;
    }
    const callerPhone = resolveCallerPhone(params);
    // Шилжүүлсэн дуудлагад оператор ямар дугаар дамжуулж буйг шалгахад хэрэгтэй.
    console.log("[voice] дуудлага:", {
      from: params.get("From"), to: params.get("To"), forwardedFrom: params.get("ForwardedFrom"),
      callerPhone: callerPhone || "(тодорхойгүй)",
    });
    const twiml = buildMediaStreamTwiml(`wss://${req.headers.host}/media-stream`, {
      callerPhone,
      streamToken: issueStreamToken(),
    });
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml);
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/")) {
    // Харилцагчийн нэр, утас агуулдаг тул сервер ngrok-оор нээлттэй үед ч token-гүйгээр уншуулахгүй.
    if (!hasDashboardToken(req)) {
      res.writeHead(401);
      res.end();
      return;
    }
    const load = DASHBOARD_ROUTES[req.url];
    if (!load) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const body = JSON.stringify(await load());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
    } catch (error) {
      console.error(`[api] ${req.url} алдаа:`, error instanceof Error ? error.message : error);
      res.writeHead(502);
      res.end();
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

// Twilio-ийн мессеж жижиг (20мс аудио ~300 байт); том payload-ыг хүлээн авахгүй.
const mediaStreamServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/media-stream") {
    socket.destroy();
    return;
  }
  mediaStreamServer.handleUpgrade(req, socket, head, (ws) => handleTwilioMediaStream(ws));
});

server.listen(PORT, () => {
  console.log(`AI Front-Desk сервер ${PORT} порт дээр ажиллаж байна`);
  // Эхний дуудлага ч мэндчилгээг шууд сонсохын тулд урьдчилан бэлдэнэ.
  if (process.env.VOICE_MODE !== "gemini" && process.env.ELEVENLABS_API_KEY) {
    cachedUlaw8k(CALL_GREETING).catch((error) => console.error("[voice] мэндчилгээг урьдчилан бэлдэж чадсангүй:", error));
  }
});
