import { NextResponse } from "next/server";

const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "";
const sessionCookieName = "vlwh_session";
const legacyCookieNames = ["token"];

function clearCookieHeader(name: string, secure: boolean, domain?: string) {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "SameSite=Lax",
    secure ? "Secure" : ""
  ].filter(Boolean);

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  return parts.join("; ");
}

export async function POST(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const requestProtocol = new URL(request.url).protocol;
  const secure = forwardedProto === "https" || requestProtocol === "https:";

  // Forward the session cookie to the API so it can do any server-side cleanup
  const cookieHeader = request.headers.get("cookie") || "";
  await fetch(`${apiUrl}/auth/logout`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    credentials: "include"
  }).catch(() => null);

  const response = NextResponse.json({ success: true });
  const domains = new Set<string | undefined>([undefined, process.env.COOKIE_DOMAIN || undefined]);

  for (const domain of domains) {
    response.headers.append("Set-Cookie", clearCookieHeader(sessionCookieName, secure, domain));
    for (const legacyName of legacyCookieNames) {
      response.headers.append("Set-Cookie", clearCookieHeader(legacyName, secure, domain));
    }
  }

  return response;
}
