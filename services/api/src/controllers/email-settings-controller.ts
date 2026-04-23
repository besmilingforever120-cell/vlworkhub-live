import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  ensureEmailSettingsTable,
  getStoredEmailSettings,
  saveStoredEmailSettings,
  sendConfiguredTestEmail
} from "../services/email-settings-service";

function requireSuperAdmin(req: AuthenticatedRequest, res: Response): boolean {
  const role = req.user?.platform_role ?? req.user?.role;
  if (role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden: SUPER_ADMIN only" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /admin/email-settings
// ---------------------------------------------------------------------------
export async function getEmailSettings(req: AuthenticatedRequest, res: Response) {
  if (!requireSuperAdmin(req, res)) return;

  await ensureEmailSettingsTable();
  const row = await getStoredEmailSettings();

  if (!row) {
    return res.json({ settings: null });
  }

  return res.json({
    settings: {
      id:         row.id,
      email:      row.email,
      password:   "", // never expose the stored secret
      provider:   row.provider,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  });
}

// ---------------------------------------------------------------------------
// POST /admin/email-settings
// ---------------------------------------------------------------------------
export async function saveEmailSettings(req: AuthenticatedRequest, res: Response) {
  if (!requireSuperAdmin(req, res)) return;

  const { email, password, provider } = req.body as {
    email?: string;
    password?: string;
    provider?: string;
  };

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (!provider || !["gmail", "outlook"].includes(provider)) {
    return res.status(400).json({ error: "Provider must be 'gmail' or 'outlook'" });
  }

  try {
    await saveStoredEmailSettings({ email, password, provider: provider as "gmail" | "outlook" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: message });
  }

  return res.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST /admin/test-email
// ---------------------------------------------------------------------------
export async function sendTestEmail(req: AuthenticatedRequest, res: Response) {
  if (!requireSuperAdmin(req, res)) return;

  try {
    await sendConfiguredTestEmail();
    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Failed to send test email: ${message}` });
  }
}
