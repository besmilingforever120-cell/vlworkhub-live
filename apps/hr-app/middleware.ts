import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "";
const appKey = "HR";

async function getSession(request: NextRequest) {
  if (!apiUrl) return { status: "API_URL_MISSING" as const, user: null };
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/auth/me`, { headers: { cookie }, cache: "no-store" }).catch(() => null);
  if (!response) return { status: "FETCH_ERROR" as const, user: null };
  if (!response.ok) return { status: response.status, user: null };
  const data = await (response.json() as Promise<{ user: { id?: string } }>);
  return { status: response.status, user: data.user || null };
}

async function getAccess(request: NextRequest) {
  if (!apiUrl) return { status: "API_URL_MISSING" as const, items: [] as Array<{ app: string; enabled: boolean }> };
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/api/apps/my-access`, { headers: { cookie }, cache: "no-store" }).catch(() => null);
  if (!response) return { status: "FETCH_ERROR" as const, items: [] as Array<{ app: string; enabled: boolean }> };
  if (!response.ok) return { status: response.status, items: [] as Array<{ app: string; enabled: boolean }> };
  const items = await (response.json() as Promise<Array<{ app: string; enabled: boolean }>>);
  return { status: response.status, items };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestUrl = request.nextUrl.href;
  const cookieHeaderExists = Boolean(request.headers.get("cookie"));
  const authMeUrl = apiUrl ? `${apiUrl}/auth/me` : "";
  const myAccessUrl = apiUrl ? `${apiUrl}/api/apps/my-access` : "";
  const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  const protoHeader = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const hostname = hostHeader.split(":")[0];
  const isProductionHost = /(^|\.)vlworkhub\.ca$/i.test(hostname);
  const rootUrl = isProductionHost
    ? process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_ROOT_URL || "http://www.vlworkhub.ca"
    : `${protoHeader}://${hostname}:3000`;

  console.info("[HR middleware] request", {
    requestUrl,
    cookieHeaderExists,
    authMeUrl,
    myAccessUrl
  });

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/access-denied") {
    return NextResponse.next();
  }

  const session = await getSession(request);
  console.info("[HR middleware] /auth/me result", { status: session.status, hasUser: Boolean(session.user) });
  if (!session.user) {
    const redirectTarget = new URL("/login", rootUrl).toString();
    console.warn("[HR middleware] redirect", { reason: "session-missing", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/login", rootUrl));
  }

  const access = await getAccess(request);
  const hasAppAccess = access.items.some((item) => item.enabled && item.app === appKey);
  console.info("[HR middleware] /api/apps/my-access result", { status: access.status, hasAppAccess, appKey });
  if (!hasAppAccess) {
    const redirectTarget = new URL("/access-denied", request.url).toString();
    console.warn("[HR middleware] redirect", { reason: "app-access-missing", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
