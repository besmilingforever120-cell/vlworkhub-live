import { redirect } from "next/navigation";
import { getPlatformSession } from "../../lib/session";

export default async function AdminIndexPage() {
  const user = await getPlatformSession();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  if (user.platformRole !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  redirect("/admin/users");
}
