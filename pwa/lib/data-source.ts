import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./session";

// Хуудас бүрийн өгөгдөл хаанаас ирснийг заана: жишээ, бодит backend, эсвэл холбогдоогүй.
export type DataSource = "demo" | "live" | "offline";

export const isMockMode = () => process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export const backendBase = () => process.env.BACKEND_API_URL ?? "http://localhost:8080";

// Нэвтэрсэн хэрэглэгчийн session (хүсэлтийн гадна, жишээ нь тестэд, байхгүй).
// next/headers-ийг динамикаар ачаална: энэ файлаас client component-ууд туслах функц импортолдог.
async function currentSession(): Promise<string | undefined> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get(SESSION_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

// Backend унтарсан эсвэл алдаа буцаавал null — хуудас эвдрэхгүй, "холбогдоогүй" гэж харуулна.
// Session хүчингүй бол (401) нэвтрэх хуудас руу шилжүүлнэ.
export async function fetchBackend<T>(path: string): Promise<T | null> {
  let unauthorized = false;
  try {
    const response = await fetch(`${backendBase()}${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.BACKEND_API_TOKEN ?? ""}`, "X-Session": await currentSession() ?? "" },
    });
    unauthorized = response.status === 401;
    if (response.ok) return await response.json() as T;
  } catch {
    return null;
  }
  if (unauthorized) redirect("/login");
  return null;
}
