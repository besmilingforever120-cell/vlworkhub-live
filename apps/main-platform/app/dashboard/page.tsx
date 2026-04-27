import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { appCards } from "@vlworkhub/config";
import { ApplicationCard } from "@vlworkhub/ui";
import { LogoutButton } from "../../components/logout-button";
import { getPlatformSession, getPlatformAppAccess } from "../../lib/session";

export default async function DashboardPage() {
  const [user, access] = await Promise.all([getPlatformSession(), getPlatformAppAccess()]);

  if (!user) {
    redirect("/login");
  }

  const enabledApps = new Set((access || []).filter((item) => item.enabled).map((item) => item.app));
  const visibleApps = appCards.filter((app) => enabledApps.has(app.appKey));
  const dashboardCards = user.platformRole === "SUPER_ADMIN"
    ? [...visibleApps, { appKey: "ADMIN", name: "Admin", description: "Create users, update status, and assign app access.", href: "/admin" }]
    : visibleApps;
  const headerStore = await headers();
  const hostHeader = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const protoHeader = headerStore.get("x-forwarded-proto") || "http";
  const hostname = hostHeader.split(":")[0];
  const isProductionHost = /(^|\.)vlworkhub\.ca$/i.test(hostname);
  const appPorts: Record<string, number> = {
    CARE: 3001,
    HR: 3002,
    URSAFE: 3003
  };
  const resolvedCards = dashboardCards.map((app) =>
    appPorts[app.appKey] && !isProductionHost && hostname
      ? { ...app, href: `${protoHeader}://${hostname}:${appPorts[app.appKey]}` }
      : app
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Dashboard</p>
            <h1 className="mt-3 text-3xl font-semibold">Welcome back, {user.fullName}</h1>
            <p className="mt-3 text-slate-300">Launch the applications assigned to your VLWorkHub account. Platform role: {user.platformRole}.</p>
            {user.platformRole === "SUPER_ADMIN" ? <Link href="/admin" className="mt-6 inline-flex rounded-2xl bg-cyan-400 px-5 py-3 font-medium text-slate-950">Open Admin</Link> : null}
          </div>
          <LogoutButton />
        </div>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-4">
        {resolvedCards.map((app) => (
          <ApplicationCard key={app.href} app={app} />
        ))}
      </div>
    </main>
  );
}
