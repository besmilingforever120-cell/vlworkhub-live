function normalizeUrl(value: string | undefined) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function requireUrl(name: string, aliases: string[] = [], candidates: Array<string | undefined> = []) {
  for (const candidate of candidates) {
    const value = normalizeUrl(candidate);
    if (value) return value;
  }

  throw new Error(
    `[config] Missing required URL environment variable: ${name}.` +
    (aliases.length ? ` Accepted aliases: ${aliases.join(", ")}` : "")
  );
}

const rootUrl = requireUrl(
  "MAIN_PLATFORM_URL",
  ["NEXT_PUBLIC_MAIN_APP_URL", "NEXT_PUBLIC_ROOT_URL"],
  [process.env.MAIN_PLATFORM_URL, process.env.NEXT_PUBLIC_MAIN_APP_URL, process.env.NEXT_PUBLIC_ROOT_URL]
);
const careUrl = requireUrl(
  "CARE_APP_URL",
  ["NEXT_PUBLIC_CARE_APP_URL", "NEXT_PUBLIC_CARE_URL"],
  [process.env.CARE_APP_URL, process.env.NEXT_PUBLIC_CARE_APP_URL, process.env.NEXT_PUBLIC_CARE_URL]
);
const hrUrl = requireUrl(
  "HR_APP_URL",
  ["NEXT_PUBLIC_HR_APP_URL", "NEXT_PUBLIC_HR_URL"],
  [process.env.HR_APP_URL, process.env.NEXT_PUBLIC_HR_APP_URL, process.env.NEXT_PUBLIC_HR_URL]
);
const ursafeUrl = requireUrl(
  "URSAFE_APP_URL",
  ["NEXT_PUBLIC_URSAFE_APP_URL", "NEXT_PUBLIC_URSAFE_URL"],
  [process.env.URSAFE_APP_URL, process.env.NEXT_PUBLIC_URSAFE_APP_URL, process.env.NEXT_PUBLIC_URSAFE_URL]
);
const apiBaseUrl = requireUrl(
  "API_BASE_URL",
  ["NEXT_PUBLIC_API_URL"],
  [process.env.API_BASE_URL, process.env.NEXT_PUBLIC_API_URL]
);
const apiInternalUrl = normalizeUrl(process.env.API_INTERNAL_URL);
const prefersInternalApi = typeof window === "undefined" && Boolean(apiInternalUrl);

export const platformLinks = {
  root: rootUrl,
  care: careUrl,
  hr: hrUrl,
  ursafe: ursafeUrl,
  api: prefersInternalApi ? apiInternalUrl : apiBaseUrl
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
