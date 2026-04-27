import { redirect } from "next/navigation";
import { ChangePasswordForm } from "../../components/change-password-form";
import { getPlatformSession } from "../../lib/session";

export default async function ChangePasswordPage() {
  const user = await getPlatformSession();

  if (!user) {
    redirect("/login");
  }

  if (!user.mustChangePassword) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Security Required</p>
        <h1 className="mt-6 text-4xl font-semibold leading-tight">Change your temporary password before continuing.</h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">
          Your account was provisioned with a temporary password. Set a strong new password now to access the dashboard and connected apps.
        </p>
      </section>
      <ChangePasswordForm />
    </main>
  );
}
