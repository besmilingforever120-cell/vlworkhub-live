import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const rootUrl = process.env.NEXT_PUBLIC_ROOT_URL || "http://localhost:3000";

export function middleware(request: NextRequest) {
  if (!request.cookies.get("vlwh_session")) {
    return NextResponse.redirect(new URL("/login", rootUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
