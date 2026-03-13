import Link from "next/link";
import { redirect } from "next/navigation";
import { SuperAdminPanel } from "../../../components/super-admin-panel";
import { getPlatformSession } from "../../../lib/session";

export default async function AdminUsersPage() {
  const user = await getPlatformSession();

  if (!user) {
    redirect("/login");
  }

  if (user.platformRole !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">User Management</h1>
            <p className="mt-3 max-w-3xl text-slate-300">Create users, update account status, and manage access to Care, HR, and URSafe.</p>
          </div>
          <Link href="/dashboard" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white">Back to Dashboard</Link>
        </div>
      </div>
      <SuperAdminPanel />
    </main>
  );
}
