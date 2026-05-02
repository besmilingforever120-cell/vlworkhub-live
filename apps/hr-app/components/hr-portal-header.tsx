"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function HrPortalHeader({
  title,
  description,
  breadcrumb,
  showBreadcrumb = true
}: {
  title: string;
  description: string;
  breadcrumb: string;
  showBreadcrumb?: boolean;
}) {
  const [today, setToday] = useState("");

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

  return (
    <section className="hr-page-header">
      <div>
        {showBreadcrumb ? <div className="hr-page-header__eyebrow"><span>{breadcrumb}</span></div> : null}
        <h1 className="hr-page-header__title">{title}</h1>
        <p className="hr-page-header__description">{description}</p>
      </div>
      <div className="hr-page-header__meta">
        <div className="hr-page-summary">
          <div className="hr-role-indicator">
            <ShieldCheck className="h-4 w-4" />
            Shared JWT session active
          </div>
          <span style={{ display: "inline-block", minWidth: "10.5rem" }}>{today}</span>
        </div>
      </div>
    </section>
  );
}
