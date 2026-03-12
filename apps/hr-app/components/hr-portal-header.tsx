"use client";

import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";

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
    <section className="hr-page-header">
      <div>
        <div className="hr-page-header__eyebrow">
          <span>HR Portal</span>
          <ChevronRight className="h-4 w-4" />
          <span>{breadcrumb}</span>
        </div>
        <h1 className="hr-page-header__title">{title}</h1>
        <p className="hr-page-header__description">{description}</p>
      </div>
      <div className="hr-page-header__meta">
        <div className="hr-page-summary">
          <div className="hr-role-indicator">
            <ShieldCheck className="h-4 w-4" />
            Shared JWT session active
          </div>
          <span>{today}</span>
        </div>
        <Link href="/dashboard" className="hr-card__action">
          Open dashboard overview
        </Link>
      </div>
    </section>
  );
}
