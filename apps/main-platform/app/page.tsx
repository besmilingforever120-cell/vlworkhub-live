import { redirect } from "next/navigation";
import { getPlatformSession } from "../lib/session";

export default async function HomePage() {
  const user = await getPlatformSession();
  redirect(user ? "/dashboard" : "/login");
}
