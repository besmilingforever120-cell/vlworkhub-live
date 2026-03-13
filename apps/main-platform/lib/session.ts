import { cookies } from "next/headers";
import { platformLinks } from "@vlworkhub/config";

type PlatformSessionUser = {
  id: string;
  fullName: string;
  email: string;
  platformRole: "super_admin" | "user";
  apps: Array<"HR" | "CARE" | "URSAFE">;
};

type PlatformAppAccess = {
  app: "HR" | "CARE" | "URSAFE";
  enabled: boolean;
};

export async function getPlatformSession() {
  const cookieHeader = cookies().toString();
  const response = await fetch(`${platformLinks.api}/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const data = await response.json();
  return (data.user || null) as PlatformSessionUser | null;
}

export async function getPlatformAppAccess() {
  const cookieHeader = cookies().toString();
  const response = await fetch(`${platformLinks.api}/api/apps/my-access`, {
    headers: { cookie: cookieHeader },
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return [] as PlatformAppAccess[];
  }

  return (await response.json()) as PlatformAppAccess[];
}
