import { proxyToBackend } from "@/lib/backend-proxy";

// Мэдээлэл нэмэх, засах (id-тай бол засна).
export async function POST(request: Request) {
  return proxyToBackend("/api/knowledge", { method: "POST", body: await request.text() });
}
