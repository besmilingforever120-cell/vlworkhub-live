import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { pool } from "../config/db";

export type EmailProvider = "gmail" | "outlook";

export const SMTP_CONFIG: Record<EmailProvider, { host: string; port: number; secure: boolean }> = {
  gmail: { host: "smtp.gmail.com", port: 587, secure: false },
  outlook: { host: "smtp.office365.com", port: 587, secure: false }
};

function resolveEncryptionSecret() {
  const explicitSecret = String(process.env.EMAIL_SETTINGS_ENCRYPTION_KEY || "").trim();
  if (explicitSecret) {
    return explicitSecret;
  }

  const configuredJwtSecret = String(process.env.JWT_SECRET || "").trim();
  if (configuredJwtSecret) {
    return configuredJwtSecret;
  }

  // Keep development settings decryptable across restarts even when JWT_SECRET is ephemeral.
  if (env.nodeEnv !== "production") {
    return "vlworkhub-dev-email-settings-key";
  }

  throw new Error("EMAIL_SETTINGS_ENCRYPTION_KEY or JWT_SECRET must be configured");
}

const ENCRYPTION_KEY = crypto.createHash("sha256").update(`${resolveEncryptionSecret()}:email-settings`).digest();
const IV_LENGTH = 16;

function encryptPassword(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptPassword(stored: string): string {
  const [ivHex, encHex] = stored.split(":");
  if (!ivHex || !encHex || !/^[a-f0-9]+$/i.test(ivHex) || !/^[a-f0-9]+$/i.test(encHex)) {
    throw new Error("Stored SMTP password is unreadable");
  }

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function ensureEmailSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.email_settings (
      id         BIGSERIAL    PRIMARY KEY,
      organization_id UUID,
      email      TEXT         NOT NULL,
      password   TEXT         NOT NULL,
      provider   TEXT         NOT NULL CHECK (provider IN ('gmail', 'outlook')),
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE public.email_settings ADD COLUMN IF NOT EXISTS organization_id UUID`);
  await pool.query(
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'email_settings_organization_id_fkey'
       ) THEN
         ALTER TABLE public.email_settings
         ADD CONSTRAINT email_settings_organization_id_fkey
         FOREIGN KEY (organization_id)
         REFERENCES organizations(id)
         ON DELETE CASCADE;
       END IF;
     END
     $$;`
  );
  await pool.query(`DROP INDEX IF EXISTS email_settings_single_row`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS email_settings_org_unique ON public.email_settings (organization_id)
  `);

  // Migrate legacy single-row setup to all organizations if organization_id was not present.
  await pool.query(
    `WITH legacy AS (
       SELECT email, password, provider
       FROM public.email_settings
       WHERE organization_id IS NULL
       ORDER BY id ASC
       LIMIT 1
     )
     INSERT INTO public.email_settings (organization_id, email, password, provider, created_at, updated_at)
     SELECT o.id, legacy.email, legacy.password, legacy.provider, NOW(), NOW()
     FROM organizations o
     CROSS JOIN legacy
     ON CONFLICT (organization_id) DO NOTHING`
  );

  await pool.query(`DELETE FROM public.email_settings WHERE organization_id IS NULL`);
}

export async function getStoredEmailSettings(organizationId: string) {
  await ensureEmailSettingsTable();
  const result = await pool.query(
    `SELECT id, organization_id, email, provider, created_at, updated_at
     FROM public.email_settings
     WHERE organization_id = $1
     LIMIT 1`,
    [organizationId]
  );
  return result.rows[0] ?? null;
}

export async function saveStoredEmailSettings(input: { organizationId: string; email: string; password?: string; provider: EmailProvider }) {
  await ensureEmailSettingsTable();

  const existing = await pool.query(
    `SELECT password
     FROM public.email_settings
     WHERE organization_id = $1
     LIMIT 1`,
    [input.organizationId]
  );
  let encryptedPassword: string;

  if (!input.password || input.password.trim() === "") {
    if (existing.rowCount === 0) {
      throw new Error("Password is required for the first save");
    }

    const existingPassword = String(existing.rows[0].password || "");
    try {
      decryptPassword(existingPassword);
    } catch {
      throw new Error("Stored SMTP password cannot be decrypted. Enter the SMTP password again and save.");
    }

    encryptedPassword = existingPassword;
  } else {
    encryptedPassword = encryptPassword(input.password.trim());
  }

  await pool.query(
    `INSERT INTO public.email_settings (organization_id, email, password, provider, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (organization_id)
     DO UPDATE SET
       email = EXCLUDED.email,
       password = EXCLUDED.password,
       provider = EXCLUDED.provider,
       updated_at = NOW()`,
    [input.organizationId, input.email.trim(), encryptedPassword, input.provider]
  );
}

export async function getSmtpTransporter(organizationId: string) {
  await ensureEmailSettingsTable();
  const result = await pool.query(
    `SELECT *
     FROM public.email_settings
     WHERE organization_id = $1
     LIMIT 1`,
    [organizationId]
  );
  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  const provider = String(row.provider) as EmailProvider;
  const smtp = SMTP_CONFIG[provider];
  if (!smtp) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: String(row.email),
      pass: decryptPassword(String(row.password))
    }
  });
}

export async function sendConfiguredTestEmail(organizationId: string) {
  await ensureEmailSettingsTable();
  const result = await pool.query(
    `SELECT *
     FROM public.email_settings
     WHERE organization_id = $1
     LIMIT 1`,
    [organizationId]
  );
  if (result.rowCount === 0) {
    throw new Error("No SMTP settings configured yet");
  }

  const row = result.rows[0];
  const transporter = await getSmtpTransporter(organizationId);
  if (!transporter) {
    throw new Error("Unknown provider stored in settings");
  }

  await transporter.sendMail({
    from: String(row.email),
    to: String(row.email),
    subject: "VLWorkHub - SMTP Test",
    text: "This is a test email confirming your SMTP settings are working correctly."
  });
}