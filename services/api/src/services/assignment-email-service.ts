/**
 * assignment-email-service.ts
 *
 * Sends best-effort notification emails when tasks, surveys, trainings,
 * announcements, or documents are assigned to users.
 * All errors are swallowed so a missing/broken SMTP config never breaks
 * the normal API response.
 */

import { pool } from "../config/db";
import { env } from "../config/env";
import { getSmtpTransporter } from "./email-settings-service";

export type AssignmentEmailType = "task" | "survey" | "training" | "announcement" | "document";

export type AssignmentEmailParams = {
  organizationId: string;
  type: AssignmentEmailType;
  title: string;
  dueDate?: string | null;
  assignedBy?: string | null;
  loginUrl?: string | null;
  // --- resolution strategies (one or more can be supplied) ---
  userId?: string | null;          // single user UUID
  userIds?: string[];              // multiple user UUIDs (documents)
  departmentId?: string | null;    // single department UUID
  departmentIds?: string[];        // multiple department UUIDs (documents)
  departmentName?: string | null;  // department by name (tasks/announcements)
  departmentNames?: string[];      // departments by name (tasks)
  allStaff?: boolean;              // everyone in the org
  assigneeNames?: string[];        // user full-names (training)
};

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function getSenderEmail(organizationId: string): Promise<string | null> {
  // Email settings are org-agnostic (single row) but keep org param for future
  void organizationId;
  const result = await pool.query("SELECT email FROM email_settings LIMIT 1");
  return result.rowCount ? String(result.rows[0].email) : null;
}

async function getAllStaffEmails(organizationId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT email FROM users
     WHERE organization_id = $1 AND status = 'active'
       AND email IS NOT NULL AND email <> ''`,
    [organizationId]
  );
  return result.rows.map((r) => String(r.email)).filter(Boolean);
}

async function getUserEmailById(organizationId: string, userId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT email FROM users
     WHERE id = $1 AND organization_id = $2 AND status = 'active'
       AND email IS NOT NULL AND email <> ''
     LIMIT 1`,
    [userId, organizationId]
  );
  return result.rows.map((r) => String(r.email)).filter(Boolean);
}

async function getUserEmailsByIds(organizationId: string, userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const result = await pool.query(
    `SELECT email FROM users
     WHERE organization_id = $1 AND status = 'active'
       AND id = ANY($2::uuid[]) AND email IS NOT NULL AND email <> ''`,
    [organizationId, userIds]
  );
  return result.rows.map((r) => String(r.email)).filter(Boolean);
}

async function getUserEmailsByDepartmentId(organizationId: string, departmentId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT email FROM users
     WHERE organization_id = $1 AND department_id = $2 AND status = 'active'
       AND email IS NOT NULL AND email <> ''`,
    [organizationId, departmentId]
  );
  return result.rows.map((r) => String(r.email)).filter(Boolean);
}

async function getUserEmailsByDepartmentIds(organizationId: string, departmentIds: string[]): Promise<string[]> {
  if (!departmentIds.length) return [];
  const result = await pool.query(
    `SELECT DISTINCT u.email FROM users u
     WHERE u.organization_id = $1 AND u.department_id = ANY($2::uuid[])
       AND u.status = 'active' AND u.email IS NOT NULL AND u.email <> ''`,
    [organizationId, departmentIds]
  );
  return result.rows.map((r) => String(r.email)).filter(Boolean);
}

async function getUserEmailsByDepartmentName(organizationId: string, departmentName: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT u.email FROM users u
     INNER JOIN departments d ON d.id = u.department_id
     WHERE u.organization_id = $1 AND d.name = $2 AND u.status = 'active'
       AND u.email IS NOT NULL AND u.email <> ''`,
    [organizationId, departmentName]
  );
  return result.rows.map((r) => String(r.email)).filter(Boolean);
}

async function getUserEmailsByNames(organizationId: string, names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const result = await pool.query(
    `SELECT email FROM users
     WHERE organization_id = $1 AND status = 'active'
       AND email IS NOT NULL AND email <> ''
       AND TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) = ANY($2::text[])`,
    [organizationId, names]
  );
  return result.rows.map((r) => String(r.email)).filter(Boolean);
}

function dedupe(emails: string[]): string[] {
  return Array.from(new Set(emails.filter(Boolean)));
}

// ─── Resolve recipients ───────────────────────────────────────────────────────

async function resolveEmails(params: AssignmentEmailParams): Promise<string[]> {
  const org = params.organizationId;

  // All-staff takes full priority
  if (params.allStaff) {
    return getAllStaffEmails(org);
  }

  const emails: string[] = [];

  if (params.userId) {
    emails.push(...await getUserEmailById(org, params.userId));
  }

  if (params.userIds?.length) {
    emails.push(...await getUserEmailsByIds(org, params.userIds));
  }

  if (params.departmentId) {
    emails.push(...await getUserEmailsByDepartmentId(org, params.departmentId));
  }

  if (params.departmentIds?.length) {
    emails.push(...await getUserEmailsByDepartmentIds(org, params.departmentIds));
  }

  if (params.departmentName) {
    emails.push(...await getUserEmailsByDepartmentName(org, params.departmentName));
  }

  if (params.departmentNames?.length) {
    for (const name of params.departmentNames) {
      emails.push(...await getUserEmailsByDepartmentName(org, name));
    }
  }

  // Individual names (used by training assignments)
  if (params.assigneeNames?.length) {
    emails.push(...await getUserEmailsByNames(org, params.assigneeNames));
  }

  return dedupe(emails);
}

// ─── Email body ───────────────────────────────────────────────────────────────

function buildEmailBody(params: AssignmentEmailParams): { subject: string; text: string } {
  const label = {
    task: "Task",
    survey: "Survey",
    training: "Training",
    announcement: "Announcement",
    document: "Document",
  }[params.type];

  const dueLine = params.dueDate ? `Due date: ${params.dueDate}` : null;
  const assignedByLine = params.assignedBy ? `Assigned by: ${params.assignedBy}` : null;
  const baseLoginUrl = (params.loginUrl || env.mainPlatformUrl).replace(/\/$/, "");
  const fullLoginUrl = `${baseLoginUrl}/login`;
  const subject = `${label} Assigned: ${params.title}`;
  const text = [
    "You have a new assignment in VLWorkHub.",
    "",
    `Assignment type: ${label}`,
    `Assignment title: ${params.title}`,
    assignedByLine,
    dueLine,
    "",
    `Login URL: ${fullLoginUrl}`,
    "Instruction: Log in and complete this assignment as soon as possible.",
    "",
    "This is an automated notification from VLWorkHub."
  ].filter(Boolean).join("\n");

  return { subject, text };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire-and-forget email notifications for an assignment.
 * Errors are caught and logged — never thrown to the caller.
 */
export async function sendAssignmentNotifications(params: AssignmentEmailParams): Promise<void> {
  try {
    const transporter = await getSmtpTransporter();
    if (!transporter) {
      console.log("[AssignmentEmail] No SMTP transporter configured, skipping.");
      return;
    }

    const senderEmail = await getSenderEmail(params.organizationId);
    if (!senderEmail) {
      console.log("[AssignmentEmail] No sender email configured, skipping.");
      return;
    }

    const emails = await resolveEmails(params);
    console.log(`[AssignmentEmail] Resolved ${emails.length} recipient(s) for "${params.title}" (${params.type}):`, emails);
    if (!emails.length) return;

    const { subject, text } = buildEmailBody(params);

    for (const to of emails) {
      try {
        await transporter.sendMail({ from: senderEmail, to, subject, text });
        console.log(`[AssignmentEmail] Sent to ${to}`);
      } catch (sendErr) {
        console.warn(`[AssignmentEmail] Failed to send to ${to}:`, sendErr);
      }
    }
  } catch (err) {
    console.warn("[AssignmentEmail] Notification skipped due to error:", err);
  }
}
