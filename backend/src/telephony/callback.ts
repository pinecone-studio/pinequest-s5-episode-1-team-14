// "Буцааж залгах" горим: Twilio-оор харилцагчийн утас руу залгаж, хариулмагц
// /voice webhook-оор AI-тай холбоно. Дуудлага шилжүүлэлт шаардахгүй.

const NUMBER_COOLDOWN_MS = 2 * 60_000;
const HOUR_MS = 60 * 60_000;

// Зөвхөн Монголын 8 оронтой дугаар: гадаад руу залгуулж зардал гаргуулахаас сэргийлнэ.
export function normalizeMongolianNumber(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("976")) digits = digits.slice(3);
  return /^[5-9]\d{7}$/.test(digits) ? `+976${digits}` : null;
}

// Нэг дугаар руу дахин дахин залгуулах, нийт дуудлагыг хэтрүүлэхээс хамгаална.
// ponytail: санах ойд хадгалсан тул нэг backend процесст л ажиллана.
export function createCallbackLimiter(hourlyLimit: number) {
  const lastCallAt = new Map<string, number>();
  let recent: number[] = [];
  return (phone: string, now = Date.now()): boolean => {
    recent = recent.filter((at) => now - at < HOUR_MS);
    const last = lastCallAt.get(phone);
    if (recent.length >= hourlyLimit || (last !== undefined && now - last < NUMBER_COOLDOWN_MS)) return false;
    recent.push(now);
    lastCallAt.set(phone, now);
    return true;
  };
}

export type CallbackResult = { ok: true } | { ok: false; reason: "not_configured" | "twilio_error" };

export async function startCallback(to: string, voiceUrl: string, request: typeof fetch = fetch): Promise<CallbackResult> {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE_NUMBER: from } = process.env;
  if (!sid || !token || !from) return { ok: false, reason: "not_configured" };
  const response = await request(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Url: voiceUrl, Method: "POST" }),
  });
  if (response.ok) return { ok: true };
  // Twilio-ийн алдааны код (жишээ нь 21215: тухайн улс руу залгах эрх хаалттай) оношлогоонд хэрэгтэй.
  const detail = await response.json().catch(() => null) as { code?: number; message?: string } | null;
  console.error("[callback] Twilio татгалзлаа:", response.status, detail?.code, detail?.message);
  return { ok: false, reason: "twilio_error" };
}
