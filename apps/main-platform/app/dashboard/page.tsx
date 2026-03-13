import Link from "next/link";
import { redirect } from "next/navigation";
import { appCards } from "@vlworkhub/config";
import { ApplicationCard } from "@vlworkhub/ui";
import { getPlatformSession, getPlatformAppAccess } from "../../lib/session";

export default async function DashboardPage() {
  const [user, access] = await Promise.all([getPlatformSession(), getPlatformAppAccess()]);

  if (!user) {
    redirect("/login");
  }

  const enabledApps = new Set((access || []).filter((item) => item.enabled).map((item) => item.app));
  const visibleApps = appCards.filter((app) => enabledApps.has(app.appKey));

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold">Welcome back, {user.fullName}</h1>
        <p className="mt-3 text-slate-300">Launch the applications assigned to your VLWorkHub account. Platform role: {user.platformRole}.</p>
        {user.platformRole === "super_admin" ? <Link href="/platform/admin" className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-slate-950">Open Super Admin</Link> : null}
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {visibleApps.map((app) => (
          <ApplicationCard key={app.href} app={app} />
        ))}
      </div>
    </main>
  );
}
