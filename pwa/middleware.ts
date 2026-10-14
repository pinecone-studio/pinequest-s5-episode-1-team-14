import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionActive } from "./lib/session";

// Хянах самбарт зочдын нэр, утас харагддаг тул нэвтрээгүй хүнийг /login руу шилжүүлнэ.
// Нүүр хуудас (/) болон "над руу залга" API нээлттэй хэвээр.
export const config = {
  matcher: ["/dashboard/:path*", "/calls/:path*", "/bookings/:path*", "/knowledge/:path*", "/analytics/:path*", "/settings/:path*", "/demo/:path*"],
};

export function middleware(request: NextRequest) {
  if (sessionActive(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}
