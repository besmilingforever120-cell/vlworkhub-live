import Link from "next/link";

export function ShellHero({
  eyebrow,
  title,
  description,
  ctaHref,
  ctaLabel,
  badge
}: {
  eyebrow: string;
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
  badge?: string;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/8 via-white/4 to-cyan-400/10 p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">{eyebrow}</p>
          <h1 className="mt-4 text-3xl font-semibold text-white">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          {badge ? (
            <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-200">
              {badge}
            </div>
          ) : null}
          {ctaHref && ctaLabel ? (
            <Link href={ctaHref as any} className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:text-cyan-200">
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function MetricCard({ label, value, helper, tone = "slate" }: { label: string; value: string; helper: string; tone?: "slate" | "emerald" | "amber" | "rose" | "blue" }) {
  const tones = {
    slate: "border-white/10 bg-white/5 text-white",
    emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    rose: "border-rose-400/30 bg-rose-400/10 text-rose-100",
    blue: "border-sky-400/30 bg-sky-400/10 text-sky-100"
  } as const;

  return (
    <div className={`rounded-3xl border p-5 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-[0.35em] text-white/60">{label}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
      <p className="mt-2 text-sm text-white/70">{helper}</p>
    </div>
  );
}

export function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {description ? <p className="mt-2 text-sm text-slate-300">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{message}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/40 px-6 py-10 text-center">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}

