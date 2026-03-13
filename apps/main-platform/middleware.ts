import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function getSession(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: { cookie },
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  return response.json() as Promise<{ user: { role?: string; platformRole?: string; apps?: string[] } }>;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    const session = await getSession(request);
    if (session?.user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  const protectedPath = pathname.startsWith("/dashboard") || pathname.startsWith("/applications") || pathname.startsWith("/platform") || pathname.startsWith("/admin");
  if (!protectedPath) {
    return NextResponse.next();
  }

  const session = await getSession(request);
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname.startsWith("/platform/admin") || pathname.startsWith("/admin")) && (session.user.role || session.user.platformRole) !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
