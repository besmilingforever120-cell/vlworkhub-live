"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import type { SessionUser, UrsafeSettings } from "@vlworkhub/types";
import { getCurrentUser, getUrsafeSettings } from "../lib/ursafe-client";

type SidebarItem = {
  label: string;
  href: Route;
  icon: string;
  superAdminOnly?: boolean;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  { label: "Live Tracker", href: "/live-tracking", icon: "🛰️" },
  { label: "Active Users", href: "/active-users", icon: "🧭" },
  { label: "Trips", href: "/trips", icon: "🚗" },
  { label: "Safety Monitoring", href: "/safety-monitoring", icon: "🛡️" },
  { label: "Shift History", href: "/shift-history", icon: "🕒" },
  { label: "Settings", href: "/settings", icon: "⚙️", superAdminOnly: true }
];

function isSuperAdmin(user: SessionUser | null) {
  const roles = new Set([user?.role, user?.platformRole, ...(user?.roles ?? [])].filter(Boolean).map((value) => String(value).toUpperCase()));
  return roles.has("SUPER_ADMIN");
}

export function UrsafeSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [logoData, setLogoData] = useState<string | null>(null);

  useEffect(() => {
    async function loadSidebarData() {
      try {
        const [session, settings] = await Promise.all([
          getCurrentUser().catch(() => null),
          getUrsafeSettings().catch(() => null as UrsafeSettings | null)
        ]);
        setUser(session);
        setLogoData(settings?.logoData ?? null);
      } catch {
        setUser(null);
        setLogoData(null);
      }
    }

    void loadSidebarData();
  }, []);

  const visibleItems = useMemo(() => {
    const superAdmin = isSuperAdmin(user);
    return SIDEBAR_ITEMS.filter((item) => !item.superAdminOnly || superAdmin);
  }, [user]);

  const mainAppUrl = (process.env.MAIN_PLATFORM_URL || process.env.NEXT_PUBLIC_MAIN_APP_URL || process.env.NEXT_PUBLIC_ROOT_URL || "")
    .trim()
    .replace(/\/+$/, "");

  const handleBackToPlatform = () => {
    if (!mainAppUrl) {
      return;
    }
    window.location.href = mainAppUrl;
  };

  return (
    <aside className={`flex h-screen flex-col border-r border-gray-100 bg-white text-slate-900 shadow-xl transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
        <div
          role={collapsed ? "button" : undefined}
          tabIndex={collapsed ? 0 : -1}
          onClick={() => collapsed && setCollapsed(false)}
          onKeyDown={(event) => {
            if (collapsed && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              setCollapsed(false);
            }
          }}
          className={`flex flex-1 items-center gap-4 ${collapsed ? "cursor-pointer justify-center" : ""}`}
        >
          <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
            {logoData ? <img src={logoData} alt="Organization logo" className="h-full w-full object-cover" /> : <span className="text-2xl">🛡️</span>}
          </div>
          {!collapsed ? (
            <div className="flex flex-col text-left">
              <p className="text-base font-semibold text-gray-900">URSafe Safety Centre</p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-lg border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-50"
          onClick={() => setCollapsed((previous) => !previous)}
        >
          {collapsed ? ">" : "<"}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className="block">
              <span
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50"
                }`}
                title={item.label}
              >
                <span className="text-lg" aria-hidden="true">
                  {item.icon}
                </span>
                {!collapsed ? <span>{item.label}</span> : null}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 px-4 py-4 text-xs text-gray-500">
        <button
          type="button"
          onClick={handleBackToPlatform}
          disabled={!mainAppUrl}
          className="mb-3 inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          title={mainAppUrl ? "Return to main platform" : "Set MAIN_PLATFORM_URL to enable"}
        >
          Back to VLWorkHub
        </button>
        {!collapsed ? <p className="leading-tight">Stay alert: monitor the Live Tracker first when you log in to ensure every active employee is safe.</p> : null}
      </div>
    </aside>
  );
}
