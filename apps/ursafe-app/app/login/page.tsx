import { redirect } from "next/navigation";

export default function UrsafeLoginRelay() {
  const rootUrl = process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_ROOT_URL || "http://www.vlworkhub.ca";
  redirect(`${rootUrl.replace(/\/$/, "")}/login`);
}
