import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function UrsafeLoginRelay() {
  const headerStore = await headers();
  const hostHeader = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const protoHeader = headerStore.get("x-forwarded-proto") || "http";
  const hostname = hostHeader.split(":")[0];
  const isProductionHost = /(^|\.)vlworkhub\.ca$/i.test(hostname);
  const rootUrl = isProductionHost
    ? process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_ROOT_URL || "http://www.vlworkhub.ca"
    : `${protoHeader}://${hostname}:3000`;
  redirect(`${rootUrl.replace(/\/$/, "")}/login`);
}
