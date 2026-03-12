import Link from "next/link";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import type { NavItem } from "@vlworkhub/types";

export function Sidebar({ appName, rootHref, navItems }: { appName: string; rootHref: string; navItems: NavItem[] }) {
  return (
    <aside className="hidden w-72 border-r border-white/10 bg-slate-900/80 p-6 lg:block">
      <Link href={rootHref as any} className="mb-8 flex items-center gap-3 text-lg font-semibold">
        <span className="rounded-xl bg-cyan-400 px-3 py-2 text-slate-950">VL</span>
        <span>{appName}</span>
      </Link>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href as any}
            className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            <span>{item.label}</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        ))}
      </nav>
      <div className="mt-8 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
        <p className="font-medium">Unified Access</p>
        <p className="mt-2 text-cyan-100/80">Back to the shared VLWorkHub dashboard from any sub-application.</p>
        <Link href={rootHref as any} className="mt-4 inline-flex items-center gap-2 text-cyan-200">
          <LayoutDashboard className="h-4 w-4" />
          Back to VLWorkHub
        </Link>
      </div>
    </aside>
  );
}
