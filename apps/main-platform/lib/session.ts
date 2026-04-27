import { cookies } from "next/headers";
import { platformLinks } from "@vlworkhub/config";

type PlatformSessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  platformRole: "SUPER_ADMIN" | "ADMIN" | "USER";
  apps: Array<"HR" | "CARE" | "URSAFE">;
};

type PlatformAppAccess = {
  app: "HR" | "CARE" | "URSAFE";
  enabled: boolean;
};

export async function getPlatformSession() {
  const cookieStore = await cookies();

  const cookieHeader = cookieStore
    .getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  const response = await fetch(`${platformLinks.api}/auth/me`, {
    headers: {
      cookie: cookieHeader,
    },
    credentials: "include",
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const data = await response.json();
  return (data.user || null) as PlatformSessionUser | null;
}

export async function getPlatformAppAccess() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
  const response = await fetch(`${platformLinks.api}/api/apps/my-access`, {
    headers: { cookie: cookieHeader },
    credentials: "include",
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return [] as PlatformAppAccess[];
  }

  return (await response.json()) as PlatformAppAccess[];
}
