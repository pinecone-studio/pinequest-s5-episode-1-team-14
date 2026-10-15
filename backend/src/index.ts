import "dotenv/config";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { buildMediaStreamTwiml, handleTwilioMediaStream, onBookingCallEnded, resolveCallerPhone } from "./telephony/twilio.js";
import { isValidTwilioSignature } from "./telephony/twilioSignature.js";
import { issueStreamToken } from "./telephony/streamTokens.js";
import { startSipLine, type SipLine } from "./telephony/sip.js";
import { LineStore, type Line } from "./telephony/lines.js";
import { createCallbackLimiter, normalizeMongolianNumber, startCallback } from "./telephony/callback.js";
import { ACK_PHRASES, CALLBACK_GREETING, CALLBACK_INSTRUCTION, greetingFor } from "./ai/callPrompt.js";
import { WAIT_TEXT } from "./ai/geminiTurns.js";
import { cachedUlaw8k } from "./voice/elevenlabs.js";
import { CallSessionStore } from "./calls/store.js";
import { TranscriptStore } from "./calls/transcript.js";
import { BusinessKnowledgeStore } from "./knowledge/store.js";
import { listBookings, type Booking } from "./calendar/googleCalendar.js";
import { reminderGreeting, reminderInstruction } from "./telephony/reminder.js";
import { afterBookingConfig, isSoonBooking, ReminderStore, reminderConfig, scheduleAfterBooking, startReminderScheduler } from "./telephony/reminderScheduler.js";
import { AccountStore, belongsTo, DEFAULT_BUSINESS_ID, voiceOptions, createSessionToken, readSessionToken, type Account } from "./accounts/store.js";
import { createAttemptLimiter } from "./accounts/limiter.js";

const PORT = Number(process.env.PORT ?? 8080);

// Хянах самбарын (PWA) зөвхөн унших өгөгдөл: нэвтэрсэн хэрэглэгчийн бизнесийнх л.
const businessCalls = (businessId: string) => new CallSessionStore().list().filter(belongsTo(businessId));
const DASHBOARD_ROUTES: Record<string, (businessId: string) => unknown> = {
  "/api/calls": businessCalls,
  "/api/transcripts": (businessId) => {
    const ids = new Set(businessCalls(businessId).map((call) => call.id));
    return Object.fromEntries(Object.entries(new TranscriptStore().all()).filter(([callId]) => ids.has(callId)));
  },
  "/api/knowledge": (businessId) => new BusinessKnowledgeStore().list({ activeOnly: false }).filter(belongsTo(businessId)),
  "/api/bookings": async (businessId) => {
    // Сануулсан захиалгыг хянах самбарт тэмдэглэнэ.
    const reminders = new ReminderStore().load();
    return (await listBookings()).filter(belongsTo(businessId)).map((booking) => {
      const remindedAt = reminders.get(booking.id)?.calledAt;
      return remindedAt ? { ...booking, remindedAt } : booking;
    });
  },
};

const accounts = new AccountStore();
// Нууц үг таах, олноор бүртгүүлэхийг IP-ээр хязгаарлана (IP-г PWA X-Client-IP-ээр дамжуулна).
const loginLimiter = createAttemptLimiter(10, 10 * 60_000);
const signupLimiter = createAttemptLimiter(5, 60 * 60_000);

// PWA-ийн service token дээр нэмээд хэрэглэгчийн session (X-Session) шаардана.
function sessionAccount(req: IncomingMessage): Account | undefined {
  const accountId = readSessionToken(req.headers["x-session"]);
  return accountId ? accounts.get(accountId) : undefined;
}

const clientIp = (req: IncomingMessage) => String(req.headers["x-client-ip"] ?? "unknown").slice(0, 64);

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Захиалга сануулах дуудлага (гараар болон автоматаар). HTTP төлөвийн кодыг буцаана.
async function remindBooking(businessId: string, booking: Booking): Promise<number> {
  const phone = normalizeMongolianNumber(booking.phone);
  const line = sipLines.get(businessId);
  if (!phone) return 422;
  if (!line) return 503;
  if (!allowCallback(phone)) return 429;
  const ok = await line.dial(phone.replace(/^\+976/, ""), {
    direction: "reminder", greeting: reminderGreeting(booking, new Date(), accounts.businesses().find((item) => item.id === businessId)?.name),
    instruction: reminderInstruction(booking),
  });
  return ok ? 202 : 502;
}

function hasDashboardToken(req: IncomingMessage): boolean {
  const expected = process.env.DASHBOARD_API_TOKEN;
  if (!expected) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(req.headers.authorization ?? ""), digest(`Bearer ${expected}`));
}

// Бизнес бүрийн SIP шугам (эхний дугаар): гадагш залгахад тухайн бизнесийн дугаар харагдана.
const sipLines = new Map<string, SipLine>();
const lineStore = new LineStore();
// Гадагш дуудлага (буцааж залгах, сануулах) нийтдээ цагт 5: нээлттэй маягтаар их төлбөр гаргуулахаас хамгаална.
const allowCallback = createCallbackLimiter(Number(process.env.CALLBACK_HOURLY_LIMIT) || 5);

// Удахгүй эхлэх захиалга авсан дуудлага дуусмагц AI сануулж залгана (1 цагийн өмнөх сануулга амжихгүй тул).
const afterBooking = afterBookingConfig();
if (afterBooking) {
  onBookingCallEnded((booking, businessId) => {
    if (!isSoonBooking(booking, Date.now(), afterBooking.withinMinutes)) return;
    scheduleAfterBooking(
      afterBooking.delaySeconds * 1000,
      () => remindBooking(businessId, booking),
      () => new ReminderStore().markCalled(booking.id),
    );
  });
  console.log(`[remind] ${afterBooking.withinMinutes} минутын дотор эхлэх захиалгад дуудлагын дараа ${afterBooking.delaySeconds} секундэд сануулна`);
}

// Twilio /voice-ийг дуудах нийтийн хаяг. Railway домэйнээ өөрөө өгдөг; бусад орчинд PUBLIC_URL-ээр заана.
function publicBaseUrl(req: IncomingMessage): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `https://${req.headers.host}`;
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

  if (req.method === "POST" && req.url === "/api/callback") {
    // Зөвхөн PWA-гийн сервер дуудна: token-гүй бол хэн ч дуудлага эхлүүлж чадахгүй.
    if (!hasDashboardToken(req)) {
      res.writeHead(401);
      res.end();
      return;
    }
    let phone: string | null = null;
    try {
      phone = normalizeMongolianNumber(String((JSON.parse(await readBody(req)) as { phone?: unknown }).phone ?? ""));
    } catch {
      phone = null;
    }
    if (!phone) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!allowCallback(phone)) {
      res.writeHead(429);
      res.end();
      return;
    }
    try {
      // Landing-ийн "над руу залга": CALLBACK_BUSINESS_ID-ийн AI тухайн бизнесийн дугаараас залгана.
      const businessId = process.env.CALLBACK_BUSINESS_ID || DEFAULT_BUSINESS_ID;
      const sipLine = sipLines.get(businessId) ?? sipLines.get(DEFAULT_BUSINESS_ID);
      if (sipLine) {
        res.writeHead(await sipLine.dial(phone.replace(/^\+976/, ""), {
          businessId, direction: "callback", greeting: CALLBACK_GREETING, instruction: CALLBACK_INSTRUCTION,
        }) ? 202 : 502);
      } else {
        const result = await startCallback(phone, `${publicBaseUrl(req)}/voice`);
        res.writeHead(result.ok ? 202 : result.reason === "not_configured" ? 503 : 502);
      }
    } catch (error) {
      console.error("[callback] алдаа:", error instanceof Error ? error.message : error);
      res.writeHead(502);
    }
    res.end();
    return;
  }

  if (req.method === "POST" && (req.url === "/api/auth/signup" || req.url === "/api/auth/login")) {
    if (!hasDashboardToken(req)) {
      res.writeHead(401);
      res.end();
      return;
    }
    const signup = req.url === "/api/auth/signup";
    const ip = clientIp(req);
    if (!(signup ? signupLimiter : loginLimiter).allowed(ip)) {
      res.writeHead(429);
      res.end();
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (signup) {
      signupLimiter.fail(ip);
      const result = accounts.signup({ email: body.email, password: body.password, businessName: body.businessName });
      if (result === "invalid" || result === "exists") {
        res.writeHead(result === "invalid" ? 400 : 409);
        res.end();
        return;
      }
      console.log("[auth] шинэ бүртгэл үүслээ");
      sendJson(res, 201, { ...createSessionToken(result.id), account: accounts.describe(result) });
      return;
    }
    const account = accounts.login(body.email, body.password);
    if (!account) {
      loginLimiter.fail(ip);
      res.writeHead(401);
      res.end();
      return;
    }
    sendJson(res, 200, { ...createSessionToken(account.id), account: accounts.describe(account) });
    return;
  }

  // Мэдлэгийн сан: нэвтэрсэн хэрэглэгч зөвхөн өөрийн бизнесийн мэдээллийг нэмж, засаж, устгана.
  const knowledgeId = req.url?.match(/^\/api\/knowledge(?:\/([\w-]{1,100}))?$/);
  if (knowledgeId && (req.method === "POST" || req.method === "DELETE")) {
    const account = hasDashboardToken(req) ? sessionAccount(req) : undefined;
    if (!account) {
      res.writeHead(401);
      res.end();
      return;
    }
    const store = new BusinessKnowledgeStore();
    const owned = (id: unknown) => typeof id === "string" && [store.get(id)].some((item) => item && belongsTo(account.businessId)(item));
    try {
      if (req.method === "DELETE") {
        res.writeHead(knowledgeId[1] && owned(knowledgeId[1]) && store.delete(knowledgeId[1]) ? 204 : 404);
        res.end();
        return;
      }
      const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      const { id, category, title, content, price, active } = body;
      if (id !== undefined && !owned(id)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const item = store.save({
        ...(id === undefined ? {} : { id }), category, title, content, active: active === true,
        ...(price === undefined || price === null ? {} : { price }), businessId: account.businessId,
      });
      sendJson(res, 200, item);
    } catch (error) {
      console.error("[knowledge] хадгалж чадсангүй:", error instanceof Error ? error.message : error);
      res.writeHead(400);
      res.end();
    }
    return;
  }

  // Тохиргоо (нэр, дуу) ба туршилтын дуудлага: нэвтэрсэн хэрэглэгчийн бизнест.
  if (req.method === "POST" && (req.url === "/api/settings" || req.url === "/api/test-call")) {
    const account = hasDashboardToken(req) ? sessionAccount(req) : undefined;
    if (!account) {
      res.writeHead(401);
      res.end();
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (req.url === "/api/settings") {
      const result = accounts.updateBusiness(account.businessId, { name: body.name, voice: body.voice, greeting: body.greeting });
      if (result === "invalid") {
        res.writeHead(400);
        res.end();
      } else {
        sendJson(res, 200, { name: result.name, voice: result.voice ?? null, greeting: result.greeting ?? "" });
      }
      return;
    }
    // Туршилтын дуудлага: бизнесийн өөрийн дугаараас, дугааргүй бол аль нэг шугамаас тухайн бизнесийн AI залгана.
    const phone = normalizeMongolianNumber(String(body.phone ?? ""));
    const line = sipLines.get(account.businessId) ?? sipLines.values().next().value;
    if (!phone) {
      res.writeHead(400);
    } else if (!line) {
      res.writeHead(503);
    } else if (!allowCallback(phone)) {
      res.writeHead(429);
    } else {
      console.log("[test-call] туршилтын дуудлага эхэллээ");
      res.writeHead(await line.dial(phone.replace(/^\+976/, ""), { businessId: account.businessId }) ? 202 : 502);
    }
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/remind") {
    // Захиалга сануулах дуудлага: dashboard-аас захиалгын id-аар, зөвхөн өөрийн бизнесийнх.
    const account = hasDashboardToken(req) ? sessionAccount(req) : undefined;
    if (!account) {
      res.writeHead(401);
      res.end();
      return;
    }
    try {
      const { bookingId } = JSON.parse(await readBody(req)) as { bookingId?: unknown };
      const booking = (await listBookings()).filter(belongsTo(account.businessId)).find((item) => item.id === bookingId);
      const status = booking ? await remindBooking(account.businessId, booking) : 404;
      if (status === 202 && booking) new ReminderStore().markCalled(booking.id);
      res.writeHead(status);
    } catch (error) {
      console.error("[remind] алдаа:", error instanceof Error ? error.message : error);
      res.writeHead(400);
    }
    res.end();
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/")) {
    // Харилцагчийн нэр, утас агуулдаг тул сервер ngrok-оор нээлттэй үед ч token-гүйгээр уншуулахгүй.
    if (!hasDashboardToken(req)) {
      res.writeHead(401);
      res.end();
      return;
    }
    const account = sessionAccount(req);
    if (!account) {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.url === "/api/settings") {
      const business = accounts.businesses().find((item) => item.id === account.businessId);
      sendJson(res, 200, {
        name: business?.name ?? "", voice: business?.voice ?? null, greeting: business?.greeting ?? "",
        voices: voiceOptions().map(({ key, label }) => ({ key, label })), numbers: lineStore.numbersFor(account.businessId),
      });
      return;
    }
    if (req.url === "/api/me") {
      sendJson(res, 200, { ...accounts.describe(account), numbers: lineStore.numbersFor(account.businessId) });
      return;
    }
    const load = DASHBOARD_ROUTES[req.url];
    if (!load) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const body = JSON.stringify(await load(account.businessId));
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
  const closed = new CallSessionStore().closeActive(new Date().toISOString());
  if (closed) console.log(`[calls] өмнө дуусаагүй ${closed} дуудлагыг хаалаа`);
  console.log(`AI Front-Desk сервер ${PORT} порт дээр ажиллаж байна`);
  // Эхний дуудлага ч мэндчилгээг шууд сонсохын тулд урьдчилан бэлдэнэ.
  if (process.env.VOICE_MODE !== "gemini" && process.env.ELEVENLABS_API_KEY) {
    const greetings = accounts.businesses().filter((business) => !business.voice).map((business) => business.greeting ?? greetingFor(business.name));
    for (const phrase of [...greetings, CALLBACK_GREETING, ...ACK_PHRASES, WAIT_TEXT]) {
      cachedUlaw8k(phrase).catch((error) => console.error("[voice] тогтмол өгүүлбэрийг урьдчилан бэлдэж чадсангүй:", error));
    }
  }
  // Монголын IP утасны дугаар бүрээр Twilio-гүйгээр шууд дуудлага авна. Дугаар бүр өөрийн SIP порт
  // (5060, 5062, ...) ба дууны портын хүрээтэй (10000-аас 40 порт тутам); firewall-д нээлттэй байх ёстой.
  const sipPort = Number(process.env.SIP_PORT ?? 5060);
  const rtpStart = Number(process.env.SIP_RTP_PORT_START ?? 10000);
  let lines: Line[] = [];
  try {
    lines = lineStore.all();
  } catch (error) {
    console.error("[sip] дугааруудыг уншиж чадсангүй:", error instanceof Error ? error.message : error);
  }
  lines.forEach((line, index) => {
    startSipLine({
      server: line.server, user: line.number, password: line.password, businessId: line.businessId,
      port: sipPort + index * 2, publicIp: process.env.SIP_PUBLIC_IP || undefined, rtpPortStart: rtpStart + index * 40,
    }).then((started) => {
      if (!sipLines.has(line.businessId)) sipLines.set(line.businessId, started);
    }).catch((error) => console.error(`[sip] …${line.number.slice(-2)} дугаарыг эхлүүлж чадсангүй:`, error instanceof Error ? error.message : error));
  });
  // Автомат сануулга зөвхөн үндсэн бизнест (календарь одоогоор зөвхөн түүнд).
  const reminders = reminderConfig();
  if (reminders) {
    startReminderScheduler({
      config: reminders,
      list: async () => (await listBookings()).filter(belongsTo(DEFAULT_BUSINESS_ID)),
      call: async (booking) => (await remindBooking(DEFAULT_BUSINESS_ID, booking)) === 202,
    });
  }
});
