"use client";

import { usePathname } from "next/navigation";
import { UrsafeSidebar } from "./ursafe-sidebar";

const SIDEBAR_ROUTES = [
  "/dashboard",
  "/live-tracking",
  "/active-users",
  "/trips",
  "/safety-monitoring",
  "/safety-monitoring/history",
  "/shift-history",
  "/settings"
];

export function UrsafeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = pathname ? SIDEBAR_ROUTES.some((route) => pathname.startsWith(route)) : false;

  if (!showSidebar) {
    return <div className="min-h-screen bg-gray-100 text-slate-900">{children}</div>;
  }

  return (
    <div className="flex min-h-screen bg-gray-100 text-slate-900">
      <UrsafeSidebar />
      <main className="min-h-screen flex-1 overflow-y-auto bg-gray-100">{children}</main>
    </div>
  );
}
