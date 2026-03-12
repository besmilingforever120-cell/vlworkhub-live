import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { platformLinks, appCards } from "@vlworkhub/config";
import { ApplicationCard } from "@vlworkhub/ui";

async function getCurrentUser() {
  const cookieHeader = cookies().toString();
  const response = await fetch(`${platformLinks.api}/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const data = await response.json();
  return data.user;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold">Welcome back, {user.fullName}</h1>
        <p className="mt-3 text-slate-300">Launch the applications assigned to organization #{user.organizationId}. Active role: {user.role}.</p>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {appCards.map((app) => (
          <ApplicationCard key={app.href} app={app} />
        ))}
      </div>
    </main>
  );
}
