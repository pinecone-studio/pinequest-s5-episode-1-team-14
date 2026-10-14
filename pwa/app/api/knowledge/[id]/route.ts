import { proxyToBackend } from "@/lib/backend-proxy";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  return proxyToBackend(`/api/knowledge/${encodeURIComponent(params.id)}`, { method: "DELETE" });
}
