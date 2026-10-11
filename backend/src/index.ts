import "dotenv/config";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { buildMediaStreamTwiml, handleTwilioMediaStream } from "./telephony/twilio.js";

const PORT = Number(process.env.PORT ?? 8080);

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/voice") {
    const params = new URLSearchParams(await readBody(req));
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
