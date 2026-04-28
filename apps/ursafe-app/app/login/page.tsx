import { redirect } from "next/navigation";

export default async function UrsafeLoginRelay() {
  const rootUrl = String(process.env.MAIN_PLATFORM_URL || process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_ROOT_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!rootUrl) {
    throw new Error("[URSafe login] Missing required URL environment variable: MAIN_PLATFORM_URL.");
  }

  redirect(`${rootUrl.replace(/\/$/, "")}/login`);
}
