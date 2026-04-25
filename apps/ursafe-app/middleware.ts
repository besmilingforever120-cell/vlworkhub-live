import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "";
const appKey = "URSAFE";
const allowFrontendOnlyMode = process.env.URSAFE_FRONTEND_ONLY_MODE === "true";

async function getSession(request: NextRequest) {
  if (!apiUrl) return null;
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/auth/me`, { headers: { cookie }, cache: "no-store" }).catch(() => "UNAVAILABLE" as const);
  if (response === "UNAVAILABLE") return "UNAVAILABLE" as const;
  if (!response?.ok) return null;
  return response.json() as Promise<{ user: { id?: string } }>;
}

async function getAccess(request: NextRequest) {
  if (!apiUrl) return [] as Array<{ app: string; enabled: boolean }>;
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/api/apps/my-access`, { headers: { cookie }, cache: "no-store" }).catch(() => "UNAVAILABLE" as const);
  if (response === "UNAVAILABLE") return "UNAVAILABLE" as const;
  if (!response?.ok) return [] as Array<{ app: string; enabled: boolean }>;
  return response.json() as Promise<Array<{ app: string; enabled: boolean }>>;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    const session = await getSession(request);
    if (session !== "UNAVAILABLE" && session?.user) {
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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await getSession(request);
  if (session === "UNAVAILABLE") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const access = await getAccess(request);
  if (access === "UNAVAILABLE") {
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  if (!access.some((item) => item.enabled && String(item.app || "").toUpperCase() === appKey)) {
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
