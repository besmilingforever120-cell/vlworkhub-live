import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { AppLink } from "@vlworkhub/types";

export function ApplicationCard({ app }: { app: AppLink }) {
  return (
    <Link
      href={app.href as any}
      className="group rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{app.name}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">{app.description}</p>
        </div>
        <ArrowUpRight className="h-5 w-5 text-cyan-300 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
      </div>
    </Link>
  );
}
