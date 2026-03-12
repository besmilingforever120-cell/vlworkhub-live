import { UserCircle2 } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";

export function UserProfileMenu({ user }: { user?: SessionUser | null }) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 px-4 py-2">
      <UserCircle2 className="h-5 w-5 text-cyan-300" />
      <div className="text-sm">
        <p>{user?.fullName || "Signed in user"}</p>
        <p className="text-slate-400">{user?.role || "Employee"}</p>
      </div>
    </div>
  );
}
