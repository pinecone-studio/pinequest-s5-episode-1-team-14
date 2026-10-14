import { NextResponse } from "next/server";

// Нүүр хуудасны "над руу залга" хүсэлтийг backend рүү дамжуулна. Token сервер талд үлдэнэ.
export async function POST(request: Request) {
  const { phone } = await request.json().catch(() => ({})) as { phone?: unknown };
  try {
    const base = process.env.BACKEND_API_URL ?? "http://localhost:8080";
    const response = await fetch(`${base}/api/callback`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.BACKEND_API_TOKEN ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone: typeof phone === "string" ? phone : "" }),
    });
    // 400 буруу дугаар, 429 хязгаар; бусад алдааг нэг төрөл болгож буцаана.
    const status = response.ok ? 202 : response.status === 400 || response.status === 429 ? response.status : 502;
    return new NextResponse(null, { status });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
