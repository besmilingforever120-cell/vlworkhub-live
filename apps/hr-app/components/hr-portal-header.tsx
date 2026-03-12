"use client";

import Link from "next/link";
import { ChevronRight, Home, ShieldCheck } from "lucide-react";

export function HrPortalHeader({
  title,
  description,
  breadcrumb
}: {
  title: string;
  description: string;
  breadcrumb: string;
}) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric"
  });

  return (
    <section className="mb-8 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/8 via-white/4 to-cyan-400/10 p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Home className="h-4 w-4" />
            <span>HR Portal</span>
            <ChevronRight className="h-4 w-4" />
            <span>{breadcrumb}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-white">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
        </div>
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-5 py-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-cyan-300">
            <ShieldCheck className="h-4 w-4" />
            Shared JWT session active
          </div>
          <p>{today}</p>
          <Link href="/" className="text-cyan-200">
            Open dashboard overview
          </Link>
        </div>
      </div>
    </section>
  );
}
