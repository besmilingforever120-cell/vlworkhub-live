"use client";

export function LogoutButton() {
  async function handleLogout() {
    const apiBaseUrl = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
    let directLogoutSucceeded = false;

    if (apiBaseUrl) {
      const directResponse = await fetch(`${apiBaseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include"
      }).catch(() => null);
      directLogoutSucceeded = Boolean(directResponse?.ok);
    }

    if (!directLogoutSucceeded) {
      await fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => null);
    }
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
