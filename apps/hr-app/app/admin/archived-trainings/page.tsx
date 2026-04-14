import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";
import { HrPortalHeader } from "../../../components/hr-portal-header";
import { AdminArchivedTrainings } from "../../../components/admin-archived-trainings";

async function getSession() {
  const cookieHeader = cookies().toString();
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

export default async function AdminArchivedTrainingsPage() {
  const user = await getSession();

  if (!user) {
    redirect(`${platformLinks.root}/login`);
  }

  const platformRole = String(user.platformRole || user.role || "USER").toUpperCase();
  if (platformRole !== "SUPER_ADMIN" && platformRole !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div>
      <HrPortalHeader
        title="Archived Trainings"
        description="Browse archived training completions by user and open related survey links from HR administration."
        breadcrumb="Admin"
      />
      <AdminArchivedTrainings />
    </div>
  );
}
