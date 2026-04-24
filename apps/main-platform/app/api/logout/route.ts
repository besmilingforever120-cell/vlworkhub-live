import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.156:8080";

export async function POST(request: Request) {
  // Forward the session cookie to the API so it can do any server-side cleanup
  const cookieHeader = request.headers.get("cookie") || "";
  await fetch(`${apiUrl}/auth/logout`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    credentials: "include"
  }).catch(() => null);

  // Clear the cookie from the Next.js side (same-origin — browser will always accept this)
  const cookieStore = await cookies();
  cookieStore.delete("token");
  cookieStore.delete("vlwh_session");

  return NextResponse.json({ success: true });
}
