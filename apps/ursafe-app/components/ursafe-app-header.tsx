"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Route } from "next";
import JwtStatusBadge from "./jwt-status-badge";

type HeaderTone = "neutral" | "primary" | "danger";
type HeaderAccent = "blue" | "indigo" | "slate" | "amber" | "rose" | "emerald";

const toneClasses: Record<HeaderTone, string> = {
  neutral: "border-gray-200 text-gray-700 hover:bg-gray-100",
  primary: "border-blue-200 text-blue-700 hover:bg-blue-50",
  danger: "border-rose-200 text-rose-600 hover:bg-rose-50"
};

const accentClasses: Record<HeaderAccent, string> = {
  blue: "text-blue-500",
  indigo: "text-indigo-500",
  slate: "text-slate-400",
  amber: "text-amber-500",
  rose: "text-rose-500",
  emerald: "text-emerald-600"
};

type HeaderActionButtonProps = {
  label: string;
  icon: string;
  tone?: HeaderTone;
  onClick?: () => void;
  href?: Route;
  disabled?: boolean;
};

export function HeaderActionButton({ label, icon, tone = "neutral", onClick, href, disabled }: HeaderActionButtonProps) {
  const classes = `group inline-flex h-8 max-w-8 items-center justify-center overflow-hidden rounded-full border transition-[max-width,background-color,border-color,box-shadow] duration-300 ease-out ${toneClasses[tone]} ${
    disabled ? "cursor-not-allowed opacity-60" : ""
  }`;

  const content = (
    <>
      <span className="flex h-8 w-8 items-center justify-center text-sm" aria-hidden="true">
        {icon}
      </span>
      <span className="ml-0 max-w-0 overflow-hidden pr-0 text-[11px] font-semibold tracking-wide text-current opacity-0 transition-[max-width,opacity,margin,padding] duration-200 group-hover:ml-1 group-hover:max-w-[10rem] group-hover:pr-3 group-hover:opacity-100">
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={label} title={label}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes} aria-label={label} title={label}>
      {content}
    </button>
  );
}

export default function UrsafeAppHeader(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accent?: HeaderAccent;
  badge?: string;
  badgeTone?: HeaderAccent;
  actions?: React.ReactNode;
  meta?: string;
}) {
  const accent = props.accent ?? "emerald";
  const badgeTone = props.badgeTone ?? "blue";
  const headerAccentClass = useMemo(() => accentClasses[accent], [accent]);
  const badgeAccentClass = useMemo(() => accentClasses[badgeTone], [badgeTone]);

  return (
    <header className="border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="space-y-1">
          {props.eyebrow ? <p className={`text-[10px] font-semibold uppercase tracking-[0.35em] ${headerAccentClass}`}>{props.eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{props.title}</h1>
            {props.badge ? (
              <span className={`rounded-full border border-current/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] ${badgeAccentClass}`}>
                {props.badge}
              </span>
            ) : null}
          </div>
          {props.subtitle ? <p className="text-xs text-gray-500 sm:text-sm">{props.subtitle}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <JwtStatusBadge />
          <div className="flex flex-wrap items-center justify-end gap-2">{props.actions}</div>
          {props.meta ? <p className="text-xs font-medium text-gray-500">{props.meta}</p> : null}
        </div>
      </div>
    </header>
  );
}
