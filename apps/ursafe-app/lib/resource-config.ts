import type { NavItem } from "@vlworkhub/types";
import { platformLinks } from "@vlworkhub/config";

export const ursafeNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Mileage", href: "/mileage" },
  { label: "Incidents", href: "/incidents" },
  { label: "Checklists", href: "/checklists" },
  { label: "Emergency Contacts", href: "/emergency-contacts" },
  { label: "Live Tracking", href: "/live-tracking" }
];

export const ursafeMeta = {
  appName: "UR Safe",
  rootHref: `${platformLinks.root}/dashboard`
};
