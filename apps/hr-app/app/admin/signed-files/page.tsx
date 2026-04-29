import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";
import { HrPortalHeader } from "../../../components/hr-portal-header";
import { AdminSignedFilesView } from "../../../components/admin-signed-files-view";

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

export default async function AdminSignedFilesPage() {
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
        title="Signed User Files"
        description="Browse signed document copies by user folder from the HR administration area."
        breadcrumb="Admin"
      />
      <AdminSignedFilesView />
    </div>
  );
}
