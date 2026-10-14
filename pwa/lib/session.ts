// Хянах самбарын нэвтрэлт: backend олгосон гарын үсэгтэй session-ийг HttpOnly cookie-д хадгална.
// Гарын үсгийг backend хүсэлт бүр дээр шалгана; энд (middleware) зөвхөн хугацааг нь харна.

export const SESSION_COOKIE = "fd_session";

// Токены дуусах хугацаа (мс); буруу хэлбэртэй бол null.
export function sessionExpiry(token: string | undefined): number | null {
  const payload = token?.split(".")[0];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const expires = (JSON.parse(json) as { e?: unknown }).e;
    return typeof expires === "number" ? expires : null;
  } catch {
    return null;
  }
}

export const sessionActive = (token: string | undefined, now = Date.now()) => (sessionExpiry(token) ?? 0) > now;

// Нэвтэрсний дараа зөвхөн өөрийн сайтын хуудас руу буцаана (гадны холбоос руу шилжүүлэхгүй).
export function safeNext(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/dashboard";
}
