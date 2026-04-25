import "dotenv/config";
import crypto from "node:crypto";

const MIN_SECRET_LENGTH = 32;
const MIN_PRODUCTION_ENTROPY_BITS = 160;
const MIN_HEX_SECRET_LENGTH = 64;

const WEAK_SECRET_PATTERNS = [
  /^(dev|test|staging|production)?[-_]?secret$/i,
  /^change[-_]?me$/i,
  /^default$/i,
  /^password$/i,
  /^jwt[-_]?secret$/i,
  /^dev[-_]?secret$/i,
  /^insecure/i
];

function toShannonEntropyBits(secret: string) {
  const counts = new Map<string, number>();
  for (const char of secret) {
    counts.set(char, (counts.get(char) || 0) + 1);
  }

  let entropyPerChar = 0;
  for (const count of counts.values()) {
    const p = count / secret.length;
    entropyPerChar -= p * Math.log2(p);
  }

  return entropyPerChar * secret.length;
}

function validateJwtSecret(secret: string) {
  const reasons: string[] = [];
  const normalizedSecret = secret.trim();

  if (!normalizedSecret) {
    reasons.push("JWT_SECRET is missing");
    return { valid: false, reasons };
  }

  if (normalizedSecret.length < MIN_SECRET_LENGTH) {
    reasons.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  if (/(.)\1{5,}/.test(normalizedSecret)) {
    reasons.push("JWT_SECRET contains long repeated character sequences");
  }

  const lower = normalizedSecret.toLowerCase();
  if (WEAK_SECRET_PATTERNS.some((pattern) => pattern.test(lower))) {
    reasons.push("JWT_SECRET matches a known weak/default pattern");
  }

  if (/(password|secret|changeme|default|qwerty|letmein|admin|welcome)/i.test(lower)) {
    reasons.push("JWT_SECRET includes common dictionary words used in weak secrets");
  }

  const isHexOnly = /^[a-f0-9]+$/i.test(normalizedSecret);
  if (isHexOnly && normalizedSecret.length < MIN_HEX_SECRET_LENGTH) {
    reasons.push(`Hex JWT_SECRET must be at least ${MIN_HEX_SECRET_LENGTH} characters`);
  }

  const entropyBits = toShannonEntropyBits(normalizedSecret);
  if (entropyBits < MIN_PRODUCTION_ENTROPY_BITS) {
    reasons.push(
      `JWT_SECRET appears low-entropy (${entropyBits.toFixed(1)} bits estimated; requires >= ${MIN_PRODUCTION_ENTROPY_BITS})`
    );
  }

  return {
    valid: reasons.length === 0,
    reasons
  };
}

function createDevelopmentJwtSecret() {
  return crypto.randomBytes(64).toString("hex");
}

function resolveJwtSecret(nodeEnv: string) {
  const configuredSecret = (process.env.JWT_SECRET || "").trim();
  const isProduction = nodeEnv === "production";

  if (!configuredSecret) {
    if (isProduction) {
      throw new Error("JWT_SECRET must be set in production");
    }

    console.warn(
      "[security] JWT_SECRET is not set. Generated an ephemeral development secret for this process only."
    );
    return createDevelopmentJwtSecret();
  }

  const validation = validateJwtSecret(configuredSecret);
  if (validation.valid) {
    return configuredSecret;
  }

  const validationMessage = validation.reasons.join("; ");
  if (isProduction) {
    throw new Error(`Invalid JWT_SECRET for production: ${validationMessage}`);
  }

  console.warn(
    `[security] Provided JWT_SECRET is weak for development (${validationMessage}). Generated ephemeral development secret instead.`
  );
  return createDevelopmentJwtSecret();
}

const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export const env = {
  nodeEnv,
  host: process.env.API_HOST || "0.0.0.0",
  port: Number(process.env.API_PORT || 8080),
  apiBaseUrl: process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "",
  jwtSecret: resolveJwtSecret(nodeEnv),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://192.168.1.47:3000,http://192.168.1.47:3001,http://192.168.1.47:3002,http://192.168.1.47:3003")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL,
  trustProxyHops: parsePositiveInt(process.env.TRUST_PROXY_HOPS, 0),
  authRateLimitWindowMinutes: parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15),
  authRateLimitMaxAttempts: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS, 10)
};
