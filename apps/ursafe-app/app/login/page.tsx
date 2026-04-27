import { redirect } from "next/navigation";

export default function UrsafeLoginRelay() {
  const rootUrl = process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_ROOT_URL || (process.env.NODE_ENV === "production" ? "http://www.vlworkhub.ca" : "http://192.168.1.47:3000");
  redirect(`${rootUrl.replace(/\/$/, "")}/login`);
}
