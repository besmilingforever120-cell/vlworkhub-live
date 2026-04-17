"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@vlworkhub/types";
import { EmptyState, ErrorBanner, SectionCard, ShellHero } from "../../components/ursafe-ui";
import {
  getApiErrorMessage,
  getCurrentUser,
  getUrsafeSettings,
  saveUrsafeSettings
} from "../../lib/ursafe-client";

export default function SettingsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ratePerKm: "0.68",
    smtpEmail: "",
    smtpPassword: "",
    logoData: ""
  });

  const canManageSettings = useMemo(
    () => user?.roles.some((role) => role === "Admin" || role === "IT") ?? false,
    [user]
  );

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [session, settings] = await Promise.all([getCurrentUser(), getUrsafeSettings()]);
      setUser(session);
      setForm({
        ratePerKm: String(settings.ratePerKm ?? 0.68),
        smtpEmail: settings.smtpEmail ?? "",
        smtpPassword: settings.smtpPassword ?? "",
        logoData: settings.logoData ?? ""
      });
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      await saveUrsafeSettings({
        ratePerKm: Number(form.ratePerKm || 0.68),
        smtpEmail: form.smtpEmail.trim(),
        smtpPassword: form.smtpPassword,
        logoData: form.logoData || null
      });
      await load();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((current) => ({ ...current, logoData: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <ShellHero
          eyebrow="Settings"
          title="URSafe configuration"
          description="Loading reimbursement, branding, and notification settings."
          badge="Loading"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ShellHero
        eyebrow="Settings"
        title="URSafe configuration"
        description="Manage reimbursement defaults, outbound notification credentials, and branding within the shared platform shell."
        badge={canManageSettings ? "Admin access" : "Read only"}
      />

      {error ? <ErrorBanner message={error} /> : null}

      {!canManageSettings ? (
        <EmptyState
          title="Settings are restricted"
          description="Only Admin or IT roles can update URSafe configuration. All other roles keep read-only access to the app."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.05fr,1fr]">
          <SectionCard title="Branding" description="Upload a logo that URSafe can use across the shell and outbound content.">
            <div className="space-y-4">
              <div className="flex h-40 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-slate-950/60">
                {form.logoData ? (
                  <img src={form.logoData} alt="Organization logo preview" className="h-full max-h-36 w-auto rounded-2xl object-contain" />
                ) : (
                  <span className="text-sm text-slate-400">No logo uploaded</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-300">
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                Upload Logo
              </label>
              {form.logoData ? (
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, logoData: "" }))}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-rose-300 hover:text-rose-200"
                >
                  Remove Logo
                </button>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="Core settings" description="This keeps the legacy settings surface available without reintroducing the old standalone auth flow.">
            <div className="space-y-5">
              <label className="block text-sm text-slate-200">
                Mileage rate per kilometre
                <input
                  value={form.ratePerKm}
                  onChange={(event) => setForm((current) => ({ ...current, ratePerKm: event.target.value }))}
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                />
              </label>

              <label className="block text-sm text-slate-200">
                SMTP email
                <input
                  value={form.smtpEmail}
                  onChange={(event) => setForm((current) => ({ ...current, smtpEmail: event.target.value }))}
                  type="email"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                  placeholder="noreply@company.com"
                />
              </label>

              <label className="block text-sm text-slate-200">
                SMTP password
                <input
                  value={form.smtpPassword}
                  onChange={(event) => setForm((current) => ({ ...current, smtpPassword: event.target.value }))}
                  type="password"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
                  placeholder="Stored with the shared API"
                />
              </label>

              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Use an Office 365 app password if the mailbox enforces MFA. These settings are saved through the shared monorepo API.
              </div>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
              >
                {saving ? "Saving settings..." : "Save Settings"}
              </button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
