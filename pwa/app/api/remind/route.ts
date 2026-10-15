import { proxyToBackend } from "@/lib/backend-proxy";

// Захиалгын зочин руу AI сануулах дуудлага хийнэ (зөвхөн нэвтэрсэн бизнесийн захиалга).
export async function POST(request: Request) {
  return proxyToBackend("/api/remind", { method: "POST", body: await request.text() });
}
