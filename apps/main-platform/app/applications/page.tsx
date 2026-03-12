import { appCards } from "@vlworkhub/config";
import { ApplicationCard } from "@vlworkhub/ui";

export default function ApplicationsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Applications</h1>
      <p className="mt-3 max-w-3xl text-slate-300">Independent applications with shared authentication and a consistent design language.</p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {appCards.map((app) => (
          <ApplicationCard key={app.href} app={app} />
        ))}
      </div>
    </main>
  );
}
