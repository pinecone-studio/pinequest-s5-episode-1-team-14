import { proxyToBackend } from "@/lib/backend-proxy";

// Нэвтэрсэн бизнесийн AI тухайн дугаар руу туршилтаар залгана.
export async function POST(request: Request) {
  return proxyToBackend("/api/test-call", { method: "POST", body: await request.text() });
}
