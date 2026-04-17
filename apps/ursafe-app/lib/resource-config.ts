import type { NavItem } from "@vlworkhub/types";
import { platformLinks } from "@vlworkhub/config";

export const ursafeNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Trips", href: "/trips" },
  { label: "Safety Monitoring", href: "/safety-monitoring" },
  { label: "Shift History", href: "/shift-history" },
  { label: "Live Tracking", href: "/live-tracking" },
  { label: "Active Users", href: "/active-users" },
  { label: "Settings", href: "/settings" }
];

export const ursafeMeta = {
  appName: "UR Safe",
  rootHref: `${platformLinks.root}/dashboard`
};
