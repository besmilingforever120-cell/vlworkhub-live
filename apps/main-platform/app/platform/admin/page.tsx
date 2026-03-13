import { redirect } from "next/navigation";
import { SuperAdminPanel } from "../../../components/super-admin-panel";
import { getPlatformSession } from "../../../lib/session";

export default async function PlatformAdminPage() {
  const user = await getPlatformSession();

  if (!user) {
    redirect("/login");
  }

  if (user.platformRole !== "super_admin") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Super Admin</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Platform Administration</h1>
        <p className="mt-3 max-w-3xl text-slate-300">Manage global VLWorkHub users, enable or disable app access, and control which applications each user can enter.</p>
      </div>
      <SuperAdminPanel />
    </main>
  );
}
