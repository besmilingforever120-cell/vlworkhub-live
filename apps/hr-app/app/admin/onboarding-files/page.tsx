import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";
import { HrPortalHeader } from "../../../components/hr-portal-header";
import { AdminOnboardingFilesView } from "../../../components/admin-onboarding-files-view";

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

export default async function AdminOnboardingFilesPage() {
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
        title="Employee Onboarding Files"
        description="Browse onboarding uploads for any employee from the HR administration area."
        breadcrumb="Admin"
      />
      <AdminOnboardingFilesView />
    </div>
  );
}
