import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl =
  String(process.env.API_INTERNAL_URL || process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "")
    .trim()
    .replace(/\/+$/, "");

if (!apiUrl) {
  throw new Error("[Main middleware] Missing required URL environment variable: API_INTERNAL_URL.");
}

async function getSession(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: { cookie: cookie },
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

  const platformRole = String(session.user.platformRole || session.user.role || "USER").toUpperCase();
  const isSuperAdmin = platformRole === "SUPER_ADMIN";
  const isItAdmin = platformRole === "IT_ADMIN";

  if (pathname.startsWith("/platform/admin") && !isSuperAdmin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname.startsWith("/admin")) {
    if (isSuperAdmin) {
      return NextResponse.next();
    }

    if (isItAdmin && (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/departments"))) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
