import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.47:8080";
const appKey = "URSAFE";
const allowFrontendOnlyMode = process.env.URSAFE_FRONTEND_ONLY_MODE === "true";

async function getSession(request: NextRequest) {
  if (!apiUrl) return { status: "API_URL_MISSING" as const, user: null };
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/auth/me`, { headers: { cookie }, cache: "no-store" }).catch(() => "UNAVAILABLE" as const);
  if (response === "UNAVAILABLE") return { status: "FETCH_ERROR" as const, user: null };
  if (!response?.ok) return { status: response.status, user: null };
  const data = await (response.json() as Promise<{ user: { id?: string } }>);
  return { status: response.status, user: data.user || null };
}

async function getAccess(request: NextRequest) {
  if (!apiUrl) return { status: "API_URL_MISSING" as const, items: [] as Array<{ app: string; enabled: boolean }> };
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/api/apps/my-access`, { headers: { cookie }, cache: "no-store" }).catch(() => "UNAVAILABLE" as const);
  if (response === "UNAVAILABLE") return { status: "FETCH_ERROR" as const, items: [] as Array<{ app: string; enabled: boolean }> };
  if (!response?.ok) return { status: response.status, items: [] as Array<{ app: string; enabled: boolean }> };
  const items = await (response.json() as Promise<Array<{ app: string; enabled: boolean }>>);
  return { status: response.status, items };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestUrl = request.nextUrl.href;
  const cookieHeaderExists = Boolean(request.headers.get("cookie"));
  const authMeUrl = apiUrl ? `${apiUrl}/auth/me` : "";
  const myAccessUrl = apiUrl ? `${apiUrl}/api/apps/my-access` : "";

  console.info("[URSafe middleware] request", {
    requestUrl,
    cookieHeaderExists,
    authMeUrl,
    myAccessUrl
  });

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    const session = await getSession(request);
    console.info("[URSafe middleware] /auth/me result", { status: session.status, hasUser: Boolean(session.user) });
    if (session.user) {
      const redirectTarget = new URL("/dashboard", request.url).toString();
      console.warn("[URSafe middleware] redirect", { reason: "already-authenticated-login", redirectTo: redirectTarget });
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/access-denied") {
    return NextResponse.next();
  }

  // Optional explicit dev override for offline UI checks.
  if (allowFrontendOnlyMode) {
    return NextResponse.next();
  }

  if (!apiUrl) {
    const redirectTarget = new URL("/login", request.url).toString();
    console.warn("[URSafe middleware] redirect", { reason: "api-url-missing", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await getSession(request);
  console.info("[URSafe middleware] /auth/me result", { status: session.status, hasUser: Boolean(session.user) });
  if (!session.user) {
    const redirectTarget = new URL("/login", request.url).toString();
    console.warn("[URSafe middleware] redirect", { reason: "session-missing", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const access = await getAccess(request);
  const hasAppAccess = access.items.some((item) => item.enabled && String(item.app || "").toUpperCase() === appKey);
  console.info("[URSafe middleware] /api/apps/my-access result", { status: access.status, hasAppAccess, appKey });
  if (!hasAppAccess) {
    const redirectTarget = new URL("/access-denied", request.url).toString();
    console.warn("[URSafe middleware] redirect", { reason: "app-access-missing", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
