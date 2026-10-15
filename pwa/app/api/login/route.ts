import { NextResponse } from "next/server";
import { backendBase } from "@/lib/data-source";
import { safeNext, SESSION_COOKIE } from "@/lib/session";

// Нэвтрэх, бүртгүүлэх маягтыг backend рүү дамжуулж, амжилттай бол session cookie тавина.
// mode: "login" эсвэл "signup" (маягтын нуугдмал талбар).
// Railway-ийн цаана request.url дотоод хаяг (localhost:8080) байдаг тул харьцангуй замаар шилжүүлнэ.
const goTo = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

function back(page: string, next: string, error: string) {
  return goTo(`${page}?${new URLSearchParams({ next, error })}`);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const field = (name: string) => {
    const value = form?.get(name);
    return typeof value === "string" ? value : "";
  };
  const signup = field("mode") === "signup";
  const page = signup ? "/signup" : "/login";
  const next = safeNext(field("next"));
  let response: Response;
  try {
    response = await fetch(`${backendBase()}/api/auth/${signup ? "signup" : "login"}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${process.env.BACKEND_API_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        // Хэт олон оролдлогыг backend IP-ээр хязгаарлана.
        "X-Client-IP": request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "",
      },
      body: JSON.stringify(signup
        ? { email: field("email"), password: field("password"), businessName: field("businessName") }
        : { email: field("email"), password: field("password") }),
    });
  } catch {
    return back(page, next, "offline");
  }
  if (!response.ok) {
    const error = { 400: "invalid", 401: "wrong", 409: "exists", 429: "wait" }[response.status] ?? "offline";
    return back(page, next, error);
  }
  const { token, expiresAt } = await response.json() as { token: string; expiresAt: number };
  const done = goTo(next);
  done.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(expiresAt),
  });
  return done;
}
