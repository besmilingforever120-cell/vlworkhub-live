import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSession } from "../../../lib/session";
import { EmailSettingsPanel } from "../../../components/email-settings-panel";

export default async function EmailSettingsPage() {
  const user = await getPlatformSession();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  if (user.platformRole !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/5 p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Admin</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Email Settings</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              Configure the outbound SMTP account used for task notifications and system emails.
            </p>
          </div>
          <Link
            href="/admin/users"
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white"
          >
            ← Admin
          </Link>
        </div>
      </div>

      <EmailSettingsPanel />
    </main>
  );
}
