import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";
import { HrPortalHeader } from "../../components/hr-portal-header";
import { HrAdminPanel } from "../../components/hr-admin-panel";

async function getSession() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const response = await fetch(`${platformLinks.api}/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const data = await response.json();
  return data.user as { role?: string; platformRole?: string } | null;
}

export default async function AdminPage() {
  const user = await getSession();

  if (!user) {
    redirect(`${platformLinks.root}/login`);
  }

  const platformRole = String(user.platformRole || user.role || "USER").toUpperCase();
  if (platformRole !== "SUPER_ADMIN" && platformRole !== "ADMIN" && platformRole !== "IT_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div>
      <HrPortalHeader
        title="HR Administration"
        description="Assign HR Admin, Manager, and Employee permissions, and manage the reporting hierarchy from shared VLWorkHub users."
        breadcrumb="Admin"
      />
      <HrAdminPanel />
    </div>
  );
}
