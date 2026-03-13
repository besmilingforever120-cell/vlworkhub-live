import { appCards } from "@vlworkhub/config";
import { ApplicationCard } from "@vlworkhub/ui";
import { getPlatformAppAccess, getPlatformSession } from "../../lib/session";

export default async function ApplicationsPage() {
  const [user, access] = await Promise.all([getPlatformSession(), getPlatformAppAccess()]);
  const enabledApps = new Set((access || []).filter((item) => item.enabled).map((item) => item.app));
  const visibleApps = user ? appCards.filter((app) => enabledApps.has(app.appKey)) : [];

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Applications</h1>
      <p className="mt-3 max-w-3xl text-slate-300">Applications available to your account through the shared VLWorkHub session.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {visibleApps.map((app) => (
          <ApplicationCard key={app.href} app={app} />
        ))}
      </div>
    </main>
  );
}
