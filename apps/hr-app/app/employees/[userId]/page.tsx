import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";
import { AdminEmployeeAudit } from "../../../components/admin-employee-audit";

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

export default async function EmployeeProfileAuditPage({
  params
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await getSession();

  if (!session) {
    redirect(`${platformLinks.root}/login`);
  }

  if (!userId) {
    notFound();
  }

  const platformRole = String(session.platformRole || session.role || "USER").toUpperCase();
  const isAdmin = platformRole === "SUPER_ADMIN" || platformRole === "ADMIN" || platformRole === "IT_ADMIN";

  return (
    <AdminEmployeeAudit
      userId={userId}
      backHref={"/employees"}
      backLabel={isAdmin ? "Back to Employees" : "Back"}
    />
  );
}
