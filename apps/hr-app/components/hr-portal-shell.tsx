"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Briefcase,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  SquareCheckBig,
  Users,
  UserPlus
} from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import { platformLinks } from "@vlworkhub/config";
import { getCurrentUser } from "../lib/hr-client";
import { NotificationsDropdown } from "./notifications-dropdown";

type ShellItem = {
  label: string;
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const navItems: ShellItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Announcements", href: "/announcements", icon: Megaphone },
  { label: "Onboarding", href: "/onboarding", icon: UserPlus },
  { label: "Tasks", href: "/tasks", icon: SquareCheckBig },
  { label: "Training", href: "/training", icon: BookOpen },
  { label: "Surveys", href: "/surveys", icon: ClipboardList },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Employees", href: "/employees", icon: Users },
  { label: "Admin", href: "/admin", icon: Briefcase, adminOnly: true }
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/announcements": "Announcements",
  "/onboarding": "Onboarding",
  "/tasks": "Tasks",
  "/training": "Training",
  "/surveys": "Surveys",
  "/documents": "Documents",
  "/employees": "Employees",
  "/admin": "Admin"
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase() || "HR";
}

export function HrPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [today, setToday] = useState("");

  useEffect(() => {
    async function loadShell() {
      try {
        const session = await getCurrentUser();
        setUser(session);
      } catch {
        setUser(null);
      }
    }

    void loadShell();
  }, []);

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    );
  }, []);

  const visibleNav = useMemo(() => {
    const platformRole = String(user?.platformRole || user?.role || "USER").toUpperCase();
    return navItems.filter((item) => !item.adminOnly || platformRole === "SUPER_ADMIN" || platformRole === "ADMIN" || platformRole === "IT_ADMIN");
  }, [user]);

  const breadcrumb = pageTitles[pathname] || "Dashboard";

  return (
    <div className={`hr-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className="hr-sidebar">
        <button
          type="button"
          className="hr-sidebar__collapse"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <div className="hr-sidebar__brand">
          <div className="hr-sidebar__brand-mark">HR</div>
          <div className="hr-sidebar__brand-text">
            <strong>HR Portal</strong>
            <span>VLWorkHub</span>
          </div>
        </div>

        <nav className="hr-sidebar__nav">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`hr-sidebar__link ${active ? "is-active" : ""}`}>
                <Icon className="h-5 w-5" />
                <span className="hr-sidebar__label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hr-sidebar__footer">
          <a href={`${platformLinks.root}/dashboard`} className="hr-sidebar__footer-link">
            <Shield className="h-5 w-5" />
            <span className="hr-sidebar__label">Back to VLWorkHub</span>
          </a>
          <p className="hr-sidebar__footer-copy">Shared session and PostgreSQL-backed API</p>
        </div>
      </aside>

      <div className="hr-main">
        <header className="hr-header">
          <div className="hr-header__title">
            <span>HR Portal</span>
            <ChevronRight className="h-4 w-4" />
            <span>{breadcrumb}</span>
          </div>

          <div className="hr-header__actions">
            <NotificationsDropdown />
            <span className="hr-header__date" style={{ display: "inline-block", minWidth: "10.5rem" }}>
              {today}
            </span>
            <div className="hr-header__user">
              <div className="hr-header__avatar">{initialsFromName(user?.fullName || "HR User")}</div>
              <span className="hr-header__name">{user?.fullName || "Loading user"}</span>
            </div>
          </div>
        </header>

        <main className="hr-content">{children}</main>
      </div>
    </div>
  );
}
