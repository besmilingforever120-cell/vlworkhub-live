import "dotenv/config";

function resolveJwtSecret() {
  const configuredSecret = (process.env.JWT_SECRET || "").trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }

  console.warn("[security] JWT_SECRET is not set. Using temporary development fallback secret.");
  return "dev-insecure-change-me";
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.API_HOST || "0.0.0.0",
  port: Number(process.env.API_PORT || 8080),
  apiBaseUrl: process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "",
  jwtSecret: resolveJwtSecret(),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL
};
