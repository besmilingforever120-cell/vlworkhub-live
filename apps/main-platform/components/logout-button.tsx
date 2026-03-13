"use client";

import { useRouter } from "next/navigation";
import { platformLinks } from "@vlworkhub/config";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch(`${platformLinks.api}/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
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
