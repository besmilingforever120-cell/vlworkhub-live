const isDevelopment = process.env.NODE_ENV !== "production";

export const platformLinks = {
  root:
    process.env.NEXT_PUBLIC_ROOT_URL ||
    (isDevelopment ? "http://localhost:3000" : "http://www.vlworkhub.ca"),
  care:
    process.env.NEXT_PUBLIC_CARE_URL ||
    (isDevelopment ? "http://localhost:3001" : "http://care.vlworkhub.ca"),
  hr:
    process.env.NEXT_PUBLIC_HR_URL ||
    (isDevelopment ? "http://localhost:3002" : "http://hr.vlworkhub.ca"),
  ursafe:
    process.env.NEXT_PUBLIC_URSAFE_URL ||
    (isDevelopment ? "http://localhost:3003" : "http://ursafe.vlworkhub.ca"),
  api: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
};

export const appCards = [
  {
    name: "Care System",
    description: "Client records, assignments, case notes, incidents, and documents.",
    href: platformLinks.care
  },
  {
    name: "HR System",
    description: "Employee directory, documents, onboarding, tasks, and training.",
    href: platformLinks.hr
  },
  {
    name: "UR Safe",
    description: "Mileage, incidents, checklists, and emergency contacts.",
    href: platformLinks.ursafe
  }
];
