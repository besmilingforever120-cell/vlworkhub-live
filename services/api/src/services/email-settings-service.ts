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
      email      TEXT         NOT NULL,
      password   TEXT         NOT NULL,
      provider   TEXT         NOT NULL CHECK (provider IN ('gmail', 'outlook')),
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS email_settings_single_row ON public.email_settings ((true))
  `);
}

export async function getStoredEmailSettings() {
  await ensureEmailSettingsTable();
  const result = await pool.query("SELECT id, email, provider, created_at, updated_at FROM public.email_settings LIMIT 1");
  return result.rows[0] ?? null;
}

export async function saveStoredEmailSettings(input: { email: string; password?: string; provider: EmailProvider }) {
  await ensureEmailSettingsTable();

  const existing = await pool.query("SELECT password FROM public.email_settings LIMIT 1");
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
    `INSERT INTO public.email_settings (email, password, provider, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT ((true))
     DO UPDATE SET
       email = EXCLUDED.email,
       password = EXCLUDED.password,
       provider = EXCLUDED.provider,
       updated_at = NOW()`,
    [input.email.trim(), encryptedPassword, input.provider]
  );
}

export async function getSmtpTransporter() {
  await ensureEmailSettingsTable();
  const result = await pool.query("SELECT * FROM public.email_settings LIMIT 1");
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

export async function sendConfiguredTestEmail() {
  await ensureEmailSettingsTable();
  const result = await pool.query("SELECT * FROM public.email_settings LIMIT 1");
  if (result.rowCount === 0) {
    throw new Error("No SMTP settings configured yet");
  }

  const row = result.rows[0];
  const transporter = await getSmtpTransporter();
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