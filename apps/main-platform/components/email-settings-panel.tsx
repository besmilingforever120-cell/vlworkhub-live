"use client";

import { useEffect, useState } from "react";
import { platformLinks } from "@vlworkhub/config";

type Provider = "gmail" | "outlook";

type EmailSettingsState = {
  email: string;
  password: string;
  provider: Provider;
};

function emptyForm(): EmailSettingsState {
  return { email: "", password: "", provider: "gmail" };
}

export function EmailSettingsPanel() {
  const [form, setForm]         = useState<EmailSettingsState>(emptyForm());
  const [loaded, setLoaded]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [notice, setNotice]     = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // ─── Load existing settings ───────────────────────────────────────────────
  useEffect(() => {
    fetch(`${platformLinks.api}/admin/email-settings`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.settings) {
          setForm({
            email:    data.settings.email    ?? "",
            password: "",           // never pre-filled
            provider: (data.settings.provider as Provider) ?? "gmail"
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function flash(type: "success" | "error", msg: string) {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 5000);
  }

  // ─── Save settings ────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`${platformLinks.api}/admin/email-settings`, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        flash("error", data?.error ?? "Failed to save settings");
      } else {
        flash("success", "SMTP settings saved successfully.");
        setForm((f) => ({ ...f, password: "" })); // clear password field after save
      }
    } catch {
      flash("error", "Network error – could not reach the API.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Send test email ──────────────────────────────────────────────────────
  async function handleTest() {
    setTesting(true);
    setNotice(null);
    try {
      const res = await fetch(`${platformLinks.api}/admin/test-email`, {
        method:      "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) {
        flash("error", data?.error ?? "Test email failed.");
      } else {
        flash("success", "Test email sent! Check your inbox.");
      }
    } catch {
      flash("error", "Network error – could not reach the API.");
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notice banner */}
      {notice && (
        <div
          className={`rounded-xl px-5 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-red-500/20 text-red-300"
          }`}
        >
          {notice.msg}
        </div>
      )}

      {/* Settings form */}
      <form onSubmit={handleSave} className="rounded-[2rem] border border-white/10 bg-white/5 p-8 space-y-6">
        <h2 className="text-lg font-semibold text-white">SMTP Configuration</h2>

        {/* Provider */}
        <div className="space-y-1">
          <label className="block text-sm text-slate-300">Provider</label>
          <select
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as Provider }))}
            required
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="gmail">Gmail (smtp.gmail.com : 587)</option>
            <option value="outlook">Outlook / Microsoft 365 (smtp.office365.com : 587)</option>
          </select>
        </div>

        {/* Email */}
        <div className="space-y-1">
          <label className="block text-sm text-slate-300">Email address</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
            required
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        {/* Password */}
        <div className="space-y-1">
          <label className="block text-sm text-slate-300">
            Password{" "}
            <span className="text-slate-500 text-xs">(leave blank to keep existing)</span>
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="••••••••"
            autoComplete="new-password"
            className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>

        {/* Save */}
        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-cyan-400 transition-colors"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>

      {/* Test email */}
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Send Test Email</h2>
          <p className="mt-1 text-sm text-slate-400">
            Sends a test message to the configured address using the saved SMTP settings.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="shrink-0 rounded-2xl border border-cyan-400/40 px-6 py-2.5 text-sm font-medium text-cyan-300 disabled:opacity-50 hover:bg-cyan-500/10 transition-colors"
        >
          {testing ? "Sending…" : "Send Test Email"}
        </button>
      </div>

      {/* Info card */}
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <h2 className="text-lg font-semibold text-white mb-3">SMTP Details</h2>
        <table className="w-full text-sm text-slate-300">
          <thead>
            <tr className="text-left text-slate-500 uppercase text-xs tracking-wider">
              <th className="pb-2 pr-8">Provider</th>
              <th className="pb-2 pr-8">Host</th>
              <th className="pb-2 pr-8">Port</th>
              <th className="pb-2">TLS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <tr>
              <td className="py-2 pr-8">Gmail</td>
              <td className="py-2 pr-8 font-mono text-xs">smtp.gmail.com</td>
              <td className="py-2 pr-8">587</td>
              <td className="py-2">STARTTLS</td>
            </tr>
            <tr>
              <td className="py-2 pr-8">Outlook / M365</td>
              <td className="py-2 pr-8 font-mono text-xs">smtp.office365.com</td>
              <td className="py-2 pr-8">587</td>
              <td className="py-2">STARTTLS</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
