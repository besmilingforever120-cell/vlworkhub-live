import { Bell } from "lucide-react";
import type { SessionUser } from "@vlworkhub/types";
import { NotificationCenter } from "./notification-center";
import { UserProfileMenu } from "./user-profile-menu";

export function TopNavigation({ appName, user }: { appName: string; user?: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">VLWorkHub</p>
          <h1 className="text-xl font-semibold">{appName}</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="rounded-full border border-white/10 p-2 text-slate-300 hover:bg-white/5">
            <Bell className="h-4 w-4" />
          </button>
          <NotificationCenter />
          <UserProfileMenu user={user} />
        </div>
      </div>
    </header>
  );
}
