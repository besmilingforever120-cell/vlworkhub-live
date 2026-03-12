export const careDashboardReference = {
  systemLabel: "ShareVision Style Dashboard",
  organizationName: "Vernon & District Association for Community Living",
  quickStartItems: [
    { label: "Home", icon: "🏠", href: "/dashboard" },
    { label: "Managers", icon: "📇", href: "/staff" },
    { label: "Site Administrator", icon: "🗄️", href: "/staff" },
    { label: "Reports", icon: "📊", href: "/incidents" },
    { label: "Training", icon: "🎓", href: "/documents" },
    { label: "Individuals", icon: "🧑‍🤝‍🧑", href: "/clients" },
    { label: "Health & Safety", icon: "🛡️", href: "/incidents" },
    { label: "Programs", icon: "📋", href: "/clients" },
    { label: "Community Housing", icon: "🏘️", href: "/clients" },
    { label: "Maintenance", icon: "🛠️", href: "/documents" }
  ],
  announcements: [
    {
      id: 2,
      category: "Operations",
      title: "Policy update: overnight incident workflow now requires dual sign-off.",
      timestamp: "10:42"
    }
  ],
  events: [
    { date: "2026-03-12", title: "2:30 PM - Community transport planning" },
    { date: "2026-03-14", title: "9:00 AM - Incident review board" },
    { date: "2026-03-18", title: "4:00 PM - Funding report submission" }
  ],
  spotlight: {
    title: "Care Spotlight",
    description: "Team members can pin success stories, client milestones, and community highlights directly to the home screen."
  },
  rotatingAlerts: [
    "3 records waiting for immediate incident sign-off.",
    "Two certifications expire within 5 days.",
    "Calendar sync completed with 12 updates.",
    "Medication audit queue exceeds target by 4."
  ]
};
