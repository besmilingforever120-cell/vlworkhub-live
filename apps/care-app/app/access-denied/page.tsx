export default function AccessDeniedPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-10">
        <p className="text-sm uppercase tracking-[0.35em] text-rose-300">Access Denied</p>
        <h1 className="mt-4 text-4xl font-semibold">You do not have permission to use the Care application.</h1>
        <p className="mt-4 text-slate-300">Your VLWorkHub account is authenticated, but Care access has not been enabled by a Super Admin.</p>
      </div>
    </main>
  );
}
