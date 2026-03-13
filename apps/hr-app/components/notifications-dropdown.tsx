"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BookOpen, ClipboardList, FileSignature, SquareCheckBig } from "lucide-react";
import { getApiErrorMessage, getNotifications, type HrNotification, type HrNotificationSummary } from "../lib/hr-client";

const typeMeta = {
  task: { label: "Tasks", icon: SquareCheckBig },
  training: { label: "Training", icon: BookOpen },
  survey: { label: "Surveys", icon: ClipboardList },
  document: { label: "Documents", icon: FileSignature }
} as const;

export function NotificationsDropdown() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HrNotificationSummary>({ count: 0, items: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setError("");
        const result = await getNotifications();
        setData(result);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      }
    }

    void load();
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }

    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const grouped = useMemo(() => {
    return data.items.reduce<Record<string, HrNotification[]>>((acc, item) => {
      acc[item.type] = [...(acc[item.type] || []), item];
      return acc;
    }, {});
  }, [data.items]);

  return (
    <div className="hr-notifications" ref={panelRef}>
      <button type="button" className="hr-header__icon" aria-label="Notifications" onClick={() => setOpen((current) => !current)}>
        <Bell className="h-5 w-5" />
        {data.count > 0 ? <span className="hr-header__badge">{data.count}</span> : null}
      </button>

      {open ? (
        <div className="hr-notifications__panel">
          <div className="hr-notifications__header">
            <strong>Notifications</strong>
            <span>{data.count} item{data.count === 1 ? "" : "s"}</span>
          </div>
          {error ? <div className="hr-notifications__empty">{error}</div> : null}
          {!error && !data.items.length ? <div className="hr-notifications__empty">No new assignments.</div> : null}
          {!error && data.items.length ? (
            <div className="hr-notifications__list">
              {(Object.keys(grouped) as Array<keyof typeof typeMeta>).map((type) => {
                const items = grouped[type] || [];
                if (!items.length) return null;
                const Icon = typeMeta[type].icon;
                return (
                  <section key={type} className="hr-notifications__group">
                    <div className="hr-notifications__group-title"><Icon className="h-4 w-4" />{typeMeta[type].label}</div>
                    {items.map((item, index) => (
                      <Link key={`${type}-${index}-${item.title}`} href={item.link as any} className="hr-notifications__item" onClick={() => setOpen(false)}>
                        <span>{item.title}</span>
                      </Link>
                    ))}
                  </section>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
