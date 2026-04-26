const isProduction = process.env.NODE_ENV === "production";

const defaultLinks = {
  root: isProduction ? "http://www.vlworkhub.ca" : "http://192.168.1.47:3000",
  care: isProduction ? "http://care.vlworkhub.ca" : "http://192.168.1.47:3001",
  hr: isProduction ? "http://hr.vlworkhub.ca" : "http://192.168.1.47:3002",
  ursafe: isProduction ? "http://ursafe.vlworkhub.ca" : "http://192.168.1.47:3003"
};

export const platformLinks = {
  root:
    process.env.NEXT_PUBLIC_MAIN_APP_URL ||
    process.env.NEXT_PUBLIC_ROOT_URL ||
    defaultLinks.root,
  care:
    process.env.NEXT_PUBLIC_CARE_APP_URL ||
    process.env.NEXT_PUBLIC_CARE_URL ||
    defaultLinks.care,
  hr:
    process.env.NEXT_PUBLIC_HR_APP_URL ||
    process.env.NEXT_PUBLIC_HR_URL ||
    defaultLinks.hr,
  ursafe:
    process.env.NEXT_PUBLIC_URSAFE_APP_URL ||
    process.env.NEXT_PUBLIC_URSAFE_URL ||
    defaultLinks.ursafe,
  api: process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
};

export const appCards = [
  {
    appKey: "CARE",
    name: "Care System",
    description: "Client records, assignments, case notes, incidents, and documents.",
    href: platformLinks.care
  },
  {
    appKey: "HR",
    name: "HR System",
    description: "Employee directory, documents, onboarding, tasks, and training.",
    href: platformLinks.hr
  },
  {
    appKey: "URSAFE",
    name: "UR Safe",
    description: "Mileage, incidents, checklists, and emergency contacts.",
    href: platformLinks.ursafe
  }
] as const;
