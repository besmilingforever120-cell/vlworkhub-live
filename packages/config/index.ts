export const platformLinks = {
  root:
    process.env.NEXT_PUBLIC_MAIN_APP_URL ||
    process.env.NEXT_PUBLIC_ROOT_URL ||
    "http://www.vlworkhub.ca",
  care:
    process.env.NEXT_PUBLIC_CARE_APP_URL ||
    process.env.NEXT_PUBLIC_CARE_URL ||
    "http://care.vlworkhub.ca",
  hr:
    process.env.NEXT_PUBLIC_HR_APP_URL ||
    process.env.NEXT_PUBLIC_HR_URL ||
    "http://hr.vlworkhub.ca",
  ursafe:
    process.env.NEXT_PUBLIC_URSAFE_APP_URL ||
    process.env.NEXT_PUBLIC_URSAFE_URL ||
    "http://ursafe.vlworkhub.ca",
  api: process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.47:8080"
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
