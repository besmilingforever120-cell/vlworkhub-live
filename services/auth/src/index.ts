import jwt from "jsonwebtoken";

export interface AuthPayload {
  user_id: string;
  organization_id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  roles: Array<"Admin" | "Manager" | "Employee" | "HR" | "IT">;
  apps: Array<"HR" | "CARE" | "URSAFE">;
  email: string;
  full_name: string;
  platform_role: "SUPER_ADMIN" | "ADMIN" | "USER";
}

const TOKEN_NAME = "vlwh_session";

export function signAuthToken(payload: AuthPayload, secret: string) {
  return jwt.sign(payload, secret, { expiresIn: "12h" });
}

export function verifyAuthToken(token: string, secret: string) {
  return jwt.verify(token, secret) as AuthPayload;
}

export function getCookieName() {
  return TOKEN_NAME;
}

export function buildCookie(token: string, domain?: string) {
  const parts = [
    `${TOKEN_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : ""
  ].filter(Boolean);

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  return parts.join("; ");
}

export function clearCookie(domain?: string) {
  const parts = [
    `${TOKEN_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : ""
  ].filter(Boolean);

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  return parts.join("; ");
}
