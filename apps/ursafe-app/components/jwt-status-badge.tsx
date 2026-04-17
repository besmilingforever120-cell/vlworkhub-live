"use client";

import { useEffect, useState } from "react";
import { getCurrentUser } from "../lib/ursafe-client";

export default function JwtStatusBadge() {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const user = await getCurrentUser();
        if (!mounted) return;
        setIsActive(Boolean(user?.id));
      } catch {
        if (!mounted) return;
        setIsActive(false);
      }
    }

    void checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  if (!isActive) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-emerald-700">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
      <span>Shared JWT session active</span>
    </div>
  );
}