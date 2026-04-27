import { redirect } from "next/navigation";
import { getPlatformSession } from "../lib/session";

export default async function HomePage() {
  const user = await getPlatformSession();
  if (!user) {
    redirect("/login");
  }

  redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
}
