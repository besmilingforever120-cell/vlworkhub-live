import { HrPortalHeader } from "../../components/hr-portal-header";

export default function AdminPage() {
  return (
    <div>
      <HrPortalHeader
        title="HR Administration"
        description="Administrative workspace for workforce operations, content governance, and compliance oversight."
        breadcrumb="Admin"
      />
      <div className="grid gap-6 md:grid-cols-3">
        {[
          ["Workforce", "Track hiring, onboarding progress, and active employee counts."],
          ["Content", "Monitor announcements, document freshness, and task completion."],
          ["Compliance", "Review mandatory training completion and overdue items."]
        ].map(([title, description]) => (
          <section key={title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
