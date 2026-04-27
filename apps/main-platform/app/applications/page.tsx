import { appCards } from "@vlworkhub/config";
import { ApplicationCard } from "@vlworkhub/ui";
import { headers } from "next/headers";
import { getPlatformAppAccess, getPlatformSession } from "../../lib/session";

export default async function ApplicationsPage() {
  const [user, access] = await Promise.all([getPlatformSession(), getPlatformAppAccess()]);
  const enabledApps = new Set((access || []).filter((item) => item.enabled).map((item) => item.app));
  const visibleApps = user ? appCards.filter((app) => enabledApps.has(app.appKey)) : [];
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
  const resolvedApps = visibleApps.map((app) =>
    appPorts[app.appKey] && !isProductionHost && hostname
      ? { ...app, href: `${protoHeader}://${hostname}:${appPorts[app.appKey]}` }
      : app
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Applications</h1>
      <p className="mt-3 max-w-3xl text-slate-300">Applications available to your account through the shared VLWorkHub session.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {resolvedApps.map((app) => (
          <ApplicationCard key={app.href} app={app} />
        ))}
      </div>
    </main>
  );
}
