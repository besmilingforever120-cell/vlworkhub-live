import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function requireUrl(name: string, aliases: string[] = []) {
  const candidates = [name, ...aliases];
  for (const candidate of candidates) {
    const value = String(process.env[candidate] || "").trim().replace(/\/+$/, "");
    if (value) return value;
  }

  throw new Error(
    `[Care middleware] Missing required URL environment variable: ${name}.` +
    (aliases.length ? ` Accepted aliases: ${aliases.join(", ")}` : "")
  );
}

const apiUrl = requireUrl("API_INTERNAL_URL", ["API_BASE_URL", "NEXT_PUBLIC_API_URL"]);
const rootUrl = requireUrl("MAIN_PLATFORM_URL", ["NEXT_PUBLIC_MAIN_APP_URL", "NEXT_PUBLIC_ROOT_URL"]);
const appKey = "CARE";

async function getSession(request: NextRequest) {
  if (!apiUrl) return { status: "API_URL_MISSING" as const, user: null };
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/auth/me`, { headers: { cookie }, cache: "no-store" }).catch(() => null);
  if (!response) return { status: "FETCH_ERROR" as const, user: null };
  if (!response.ok) return { status: response.status, user: null };
  const data = await (response.json() as Promise<{ user: { id?: string; mustChangePassword?: boolean } }>);
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

  console.info("[Care middleware] request", {
    requestUrl,
    cookieHeaderExists,
    authMeUrl,
    myAccessUrl
  });

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/access-denied") {
    return NextResponse.next();
  }

  const session = await getSession(request);
  console.info("[Care middleware] /auth/me result", { status: session.status, hasUser: Boolean(session.user) });
  if (!session.user) {
    const redirectTarget = new URL("/login", rootUrl).toString();
    console.warn("[Care middleware] redirect", { reason: "session-missing", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/login", rootUrl));
  }

  if (session.user.mustChangePassword) {
    const redirectTarget = new URL("/change-password", rootUrl).toString();
    console.warn("[Care middleware] redirect", { reason: "must-change-password", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/change-password", rootUrl));
  }

  const access = await getAccess(request);
  const hasAppAccess = access.items.some((item) => item.enabled && item.app === appKey);
  console.info("[Care middleware] /api/apps/my-access result", { status: access.status, hasAppAccess, appKey });
  if (!hasAppAccess) {
    const redirectTarget = new URL("/access-denied", request.url).toString();
    console.warn("[Care middleware] redirect", { reason: "app-access-missing", redirectTo: redirectTarget });
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
