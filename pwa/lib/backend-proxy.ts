import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendBase } from "./data-source";
import { SESSION_COOKIE } from "./session";

// Browser-оос ирсэн бичих хүсэлтийг нэвтэрсэн хэрэглэгчийн session-тэй backend рүү дамжуулна.
export async function proxyToBackend(path: string, init: { method: string; body?: string }): Promise<NextResponse> {
  try {
    const response = await fetch(`${backendBase()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${process.env.BACKEND_API_TOKEN ?? ""}`,
        "X-Session": cookies().get(SESSION_COOKIE)?.value ?? "",
        "Content-Type": "application/json",
      },
    });
    const body = response.status === 204 ? null : await response.text();
    return new NextResponse(body, { status: response.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
