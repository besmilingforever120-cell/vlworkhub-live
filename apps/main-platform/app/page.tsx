import Link from "next/link";
import { appCards } from "@vlworkhub/config";
import { ApplicationCard } from "@vlworkhub/ui";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.15),_transparent_25%)]" />
      <section className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Enterprise Operations Platform</p>
          <h1 className="mt-6 text-5xl font-semibold leading-tight text-white">One secure workspace for care delivery, HR operations, and safety reporting.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            VLWorkHub replaces ShareVision, SharePoint HR, and UR Safe with an integrated multi-app platform using shared authentication and consistent navigation.
          </p>
          <div className="mt-10 flex gap-4">
            <Link href="/login" className="rounded-2xl bg-cyan-400 px-6 py-3 font-medium text-slate-950">Sign in</Link>
            <Link href="/applications" className="rounded-2xl border border-white/10 px-6 py-3 font-medium text-white">View applications</Link>
          </div>
        </div>
        <div className="mt-20 grid gap-6 md:grid-cols-3">
          {appCards.map((app) => (
            <ApplicationCard key={app.href} app={app} />
          ))}
        </div>
      </section>
    </main>
  );
}
