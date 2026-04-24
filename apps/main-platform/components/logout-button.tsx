"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/5"
    >
      Logout
    </button>
  );
}
