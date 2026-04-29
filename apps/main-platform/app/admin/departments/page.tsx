import Link from "next/link";
import { redirect } from "next/navigation";
import { DepartmentAdminPanel } from "../../../components/department-admin-panel";
import { getPlatformSession } from "../../../lib/session";

export default async function AdminDepartmentsPage() {
  const user = await getPlatformSession();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  if (user.platformRole !== "SUPER_ADMIN" && user.platformRole !== "IT_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Department Management</h1>
            <p className="mt-3 max-w-3xl text-slate-300">Create departments, assign managers, and prepare users for downstream HR hierarchy logic.</p>
          </div>
          <Link href="/dashboard" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white">Back to Dashboard</Link>
        </div>
      </div>
      <DepartmentAdminPanel />
    </main>
  );
}
