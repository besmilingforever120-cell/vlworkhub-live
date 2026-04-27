type EnvMap = Record<string, string | undefined>;

const env: EnvMap =
  typeof globalThis !== "undefined" && "process" in globalThis
    ? ((globalThis as { process?: { env?: EnvMap } }).process?.env ?? {})
    : {};

const isProduction = env.NODE_ENV === "production";

const defaultLinks = {
  root: isProduction ? "http://www.vlworkhub.ca" : "http://192.168.1.47:3000",
  care: isProduction ? "http://care.vlworkhub.ca" : "http://192.168.1.47:3001",
  hr: isProduction ? "http://hr.vlworkhub.ca" : "http://192.168.1.47:3002",
  ursafe: isProduction ? "http://ursafe.vlworkhub.ca" : "http://192.168.1.47:3003"
};

export const platformLinks = {
  root:
    isProduction
      ? env.NEXT_PUBLIC_MAIN_APP_URL || env.NEXT_PUBLIC_ROOT_URL || defaultLinks.root
      : defaultLinks.root,
  care:
    isProduction
      ? env.NEXT_PUBLIC_CARE_APP_URL || env.NEXT_PUBLIC_CARE_URL || defaultLinks.care
      : defaultLinks.care,
  hr:
    isProduction
      ? env.NEXT_PUBLIC_HR_APP_URL || env.NEXT_PUBLIC_HR_URL || defaultLinks.hr
      : defaultLinks.hr,
  ursafe:
    isProduction
      ? env.NEXT_PUBLIC_URSAFE_APP_URL || env.NEXT_PUBLIC_URSAFE_URL || defaultLinks.ursafe
      : defaultLinks.ursafe,
  api: env.API_INTERNAL_URL ||
    (isProduction
      ? env.NEXT_PUBLIC_API_URL || "https://api.vlworkhub.ca"
      : "http://192.168.1.47:8080")
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
