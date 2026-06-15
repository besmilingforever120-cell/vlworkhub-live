import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";
import { HrPortalHeader } from "../../../../components/hr-portal-header";
import { AdminEmployeeAudit } from "../../../../components/admin-employee-audit";

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

export default async function AdminEmployeeAuditPage({
  params
}: {
  params: Promise<{ userId: string }>;
}) {
  const user = await getSession();

  if (!user) {
    redirect(`${platformLinks.root}/login`);
  }

  const platformRole = String(user.platformRole || user.role || "USER").toUpperCase();
  if (platformRole !== "SUPER_ADMIN" && platformRole !== "ADMIN" && platformRole !== "IT_ADMIN") {
    redirect("/dashboard");
  }

  const { userId } = await params;

  return (
    <div>
      <HrPortalHeader
        title="Employee HR Audit"
        description="View the selected employee's HR document assignments, tasks, training, and surveys from a single audit view."
        breadcrumb="Admin"
      />
      <AdminEmployeeAudit userId={userId} />
    </div>
  );
}
