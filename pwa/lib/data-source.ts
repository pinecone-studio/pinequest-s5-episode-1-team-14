// Хуудас бүрийн өгөгдөл хаанаас ирснийг заана: жишээ, бодит backend, эсвэл холбогдоогүй.
export type DataSource = "demo" | "live" | "offline";

export const isMockMode = () => process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

// Backend унтарсан эсвэл алдаа буцаавал null — хуудас эвдрэхгүй, "холбогдоогүй" гэж харуулна.
export async function fetchBackend<T>(path: string): Promise<T | null> {
  try {
    const base = process.env.BACKEND_API_URL ?? "http://localhost:8080";
    const response = await fetch(`${base}${path}`, {
      cache: "no-store", headers: { Authorization: `Bearer ${process.env.BACKEND_API_TOKEN ?? ""}` },
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    return null;
  }
}
