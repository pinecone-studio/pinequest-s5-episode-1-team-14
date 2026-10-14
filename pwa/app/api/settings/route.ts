import { proxyToBackend } from "@/lib/backend-proxy";

// Бизнесийн нэр, дуу хоолойг хадгална.
export async function POST(request: Request) {
  return proxyToBackend("/api/settings", { method: "POST", body: await request.text() });
}
