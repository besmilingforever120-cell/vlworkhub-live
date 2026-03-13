import { redirect } from "next/navigation";
import { getPlatformSession } from "../../lib/session";

export default async function AdminIndexPage() {
  const user = await getPlatformSession();

  if (!user) {
    redirect("/login");
  }

  if (user.platformRole !== "super_admin") {
    redirect("/dashboard");
  }

  redirect("/admin/users");
}
