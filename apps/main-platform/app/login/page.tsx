import { LoginForm } from "@vlworkhub/ui";

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Shared Authentication</p>
        <h1 className="mt-6 text-4xl font-semibold leading-tight">Single sign-on access across VLWorkHub applications.</h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">
          Login once at the platform level and continue into Care, HR, and UR Safe through a shared JWT session scoped to your organization.
        </p>
      </section>
      <LoginForm />
    </main>
  );
}
