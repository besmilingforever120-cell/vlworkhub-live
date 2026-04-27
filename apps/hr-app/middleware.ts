import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "";
const appKey = "HR";

async function getSession(request: NextRequest) {
  if (!apiUrl) return null;
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/auth/me`, { headers: { cookie }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  return response.json() as Promise<{ user: { id?: string } }>;
}

async function getAccess(request: NextRequest) {
  if (!apiUrl) return [] as Array<{ app: string; enabled: boolean }>;
  const cookie = request.headers.get("cookie") || "";
  const response = await fetch(`${apiUrl}/api/apps/my-access`, { headers: { cookie }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) return [] as Array<{ app: string; enabled: boolean }>;
  return response.json() as Promise<Array<{ app: string; enabled: boolean }>>;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  const protoHeader = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const hostname = hostHeader.split(":")[0];
  const isProductionHost = /(^|\.)vlworkhub\.ca$/i.test(hostname);
  const rootUrl = isProductionHost
    ? process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_ROOT_URL || "http://www.vlworkhub.ca"
    : `${protoHeader}://${hostname}:3000`;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/access-denied") {
    return NextResponse.next();
  }

  const session = await getSession(request);
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", rootUrl));
  }

  const access = await getAccess(request);
  if (!access.some((item) => item.enabled && item.app === appKey)) {
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
