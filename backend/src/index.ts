import "dotenv/config";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { buildMediaStreamTwiml, handleTwilioMediaStream } from "./telephony/twilio.js";
import { isValidTwilioSignature } from "./telephony/twilioSignature.js";

const PORT = Number(process.env.PORT ?? 8080);

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
    const twiml = buildMediaStreamTwiml(`wss://${req.headers.host}/media-stream`, {
      callerPhone: params.get("From") ?? "",
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

  res.writeHead(404);
  res.end();
});

const mediaStreamServer = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/media-stream") {
    socket.destroy();
    return;
  }
  mediaStreamServer.handleUpgrade(req, socket, head, (ws) => handleTwilioMediaStream(ws));
});

server.listen(PORT, () => console.log(`AI Front-Desk сервер ${PORT} порт дээр ажиллаж байна`));
