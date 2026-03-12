"use client";

import { Sidebar } from "./sidebar";
import { TopNavigation } from "./top-navigation";
import type { NavItem, SessionUser } from "@vlworkhub/types";

export function AppShell({
  appName,
  rootHref,
  navItems,
  children,
  user
}: {
  appName: string;
  rootHref: string;
  navItems: NavItem[];
  children: React.ReactNode;
  user?: SessionUser | null;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar appName={appName} rootHref={rootHref} navItems={navItems} />
        <div className="flex-1">
          <TopNavigation appName={appName} user={user} />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
