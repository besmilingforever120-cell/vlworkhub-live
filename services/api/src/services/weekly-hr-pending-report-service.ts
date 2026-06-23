import { env } from "../config/env";
import { pool } from "../config/db";
import { buildEmployeeAuditPayload } from "../controllers/hr-documents-controller";
import { getSmtpTransporter, getStoredEmailSettings } from "./email-settings-service";

const WEEKLY_REPORT_TIMEZONE = "America/Vancouver";
const WEEKLY_REPORT_CRON_EXPRESSION = "0 3 * * 1";
const WEEKLY_REPORT_SUBJECT = "Your Weekly VLWorkHub HR Report";
const FALLBACK_PUBLIC_HR_URL = "https://hr.vlworkhub.ca";
const POLL_INTERVAL_MS = 60 * 1000;
const WEEKLY_REPORT_JOB_NAME = "weekly_hr_pending_report";

/*
Manual recovery model for hr.scheduled_job_runs:
1. Inspect the standard weekly run row by job_name/run_key and review status plus sent/skipped/failed counters.
2. A stranded `started` row must be investigated before any retry because partial recipient sends may already have occurred.
3. If operations approve retiring that run, mark it `abandoned` manually; do not delete it and do not reuse the same run key.
4. Any approved retry must use a new manual run key such as `YYYY-MM-DD-manual-1` so the audit trail remains intact.
5. The Monday scheduler only ever claims the standard `YYYY-MM-DD` run key and never auto-generates manual retry keys.
*/

let weeklyReportSchedulerTimer: NodeJS.Timeout | null = null;
let weeklyReportRunInProgress = false;

type EligibleRecipient = {
  userId: string;
  organizationId: string;
  organizationName: string;
  displayName: string;
  email: string;
};

type PendingCounts = {
  documents: number;
  tasks: number;
  trainings: number;
  surveys: number;
};

type BatchSummary = {
  sent: number;
  skipped: number;
  failed: number;
};

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function maskEmailAddress(value: string) {
  const email = asString(value);
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) {
    return "***";
  }
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);
  return `${localPart[0]}***@${domainPart}`;
}

function toSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function isPrivateOrUnsafeHostname(hostname: string) {
  const normalized = asString(hostname).toLowerCase();
  if (!normalized) return true;
  if (normalized === "localhost") return true;
  if (normalized.endsWith(".local")) return true;
  if (normalized.startsWith("127.")) return true;
  if (normalized.startsWith("10.")) return true;
  if (normalized.startsWith("192.168.")) return true;
  if (normalized.startsWith("172.")) {
    const secondOctet = Number(normalized.split(".")[1] || "0");
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }
  return false;
}

function resolvePublicHrPortalUrl() {
  const configured = asString(env.hrAppUrl).replace(/\/+$/, "");
  if (!configured) {
    return FALLBACK_PUBLIC_HR_URL;
  }

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:") {
      return FALLBACK_PUBLIC_HR_URL;
    }

    if (isPrivateOrUnsafeHostname(parsed.hostname)) {
      return FALLBACK_PUBLIC_HR_URL;
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return FALLBACK_PUBLIC_HR_URL;
  }
}

function getVancouverTimeParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEKLY_REPORT_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const valueByType = new Map<string, string>();
  for (const part of parts) {
    valueByType.set(part.type, part.value);
  }

  return {
    weekday: String(valueByType.get("weekday") || ""),
    year: String(valueByType.get("year") || ""),
    month: String(valueByType.get("month") || ""),
    day: String(valueByType.get("day") || ""),
    hour: String(valueByType.get("hour") || ""),
    minute: String(valueByType.get("minute") || "")
  };
}

function buildWeeklyRunKey(date: Date) {
  const parts = getVancouverTimeParts(date);
  if (parts.weekday !== "Mon") {
    return null;
  }
  if (parts.hour !== "03") {
    return null;
  }
  if (!parts.year || !parts.month || !parts.day) {
    return null;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function countPendingTasksForRecipient(recipient: EligibleRecipient) {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT t.id)::int AS count
     FROM hr.tasks t
     LEFT JOIN public.users target_user
       ON target_user.id = $2
      AND target_user.organization_id = t.organization_id
     LEFT JOIN public.departments target_department
       ON target_department.id = target_user.department_id
      AND target_department.organization_id = t.organization_id
     WHERE t.organization_id = $1
       AND COALESCE(t.archived, false) = false
       AND EXISTS (
         SELECT 1
         FROM hr.task_assignments ta
         WHERE ta.task_id = t.id
           AND (
             ta.user_id = $2::text
             OR UPPER(BTRIM(COALESCE(ta.department, ''))) = 'ALL STAFF'
             OR (
               COALESCE(target_department.name, '') <> ''
               AND UPPER(BTRIM(COALESCE(ta.department, ''))) = UPPER(BTRIM(target_department.name))
             )
           )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM hr.task_completion tc
         WHERE tc.task_id = t.id
           AND tc.user_id = $2
           AND UPPER(COALESCE(tc.status, '')) = 'COMPLETED'
       )`,
    [recipient.organizationId, recipient.userId]
  );

  return Number(result.rows[0]?.count || 0);
}

async function countPendingTrainingForRecipient(recipient: EligibleRecipient) {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT ta.id)::int AS count
     FROM hr.training_assignments ta
     INNER JOIN hr.training_assignment_users tau
       ON tau.organization_id = ta.organization_id
      AND tau.assignment_id = ta.id
      AND tau.user_id = $2
     WHERE ta.organization_id = $1
       AND LOWER(COALESCE(ta.status, '')) <> 'archived'
       AND NOT EXISTS (
         SELECT 1
         FROM hr.training_completions tc
         WHERE tc.organization_id = ta.organization_id
           AND tc.assignment_id = ta.id
           AND tc.user_id = $2
           AND (
             COALESCE(tc.progress_percent, 0) >= 100
             OR tc.completed_on IS NOT NULL
           )
       )`,
    [recipient.organizationId, recipient.userId]
  );

  return Number(result.rows[0]?.count || 0);
}

async function listEligibleRecipients() {
  const result = await pool.query(
    `SELECT
       u.id::text AS user_id,
       u.organization_id::text AS organization_id,
       COALESCE(o.name, '') AS organization_name,
       TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS display_name,
       COALESCE(u.email, '') AS email
     FROM public.users u
     INNER JOIN public.organizations o ON o.id = u.organization_id
     WHERE u.status = 'active'
       AND COALESCE(o.is_active, TRUE) = TRUE
       AND COALESCE(TRIM(u.email), '') <> ''
       AND (
         NOT EXISTS (
           SELECT 1
           FROM public.organization_app_access oaa_any
           WHERE oaa_any.organization_id = u.organization_id
         )
         OR EXISTS (
           SELECT 1
           FROM public.user_app_access uaa
           INNER JOIN public.organization_app_access oaa
             ON oaa.organization_id = u.organization_id
            AND UPPER(oaa.app) = UPPER(uaa.app)
           WHERE uaa.user_id = u.id
             AND UPPER(uaa.app) = 'HR'
         )
       )
     ORDER BY u.organization_id ASC, u.first_name ASC, u.last_name ASC, u.email ASC`
  );

  return result.rows
    .map((row) => ({
      userId: String(row.user_id),
      organizationId: String(row.organization_id),
      organizationName: String(row.organization_name || ""),
      displayName: asString(row.display_name) || String(row.email || row.user_id),
      email: asString(row.email)
    }))
    .filter((row) => isValidEmailAddress(row.email)) as EligibleRecipient[];
}

async function getPendingCountsForRecipient(recipient: EligibleRecipient): Promise<PendingCounts> {
  const payload = await buildEmployeeAuditPayload({
    organizationId: recipient.organizationId,
    targetUserId: recipient.userId,
    employee: {
      userId: recipient.userId,
      displayName: recipient.displayName,
      email: recipient.email,
      departmentId: null,
      departmentName: null,
      hrRole: "EMPLOYEE",
      reportsToUserId: null,
      reportsToName: ""
    }
  });

  const [taskCount, trainingCount] = await Promise.all([
    countPendingTasksForRecipient(recipient),
    countPendingTrainingForRecipient(recipient)
  ]);

  return {
    documents: payload.documents.pending.length,
    tasks: taskCount,
    trainings: trainingCount,
    surveys: payload.surveys.pending.length
  };
}

export function buildWeeklyHrReportEmail(params: {
  displayName: string;
  portalUrl: string;
  counts: PendingCounts;
}) {
  const safeDisplayName = escapeHtml(params.displayName);
  const safePortalUrl = escapeHtml(params.portalUrl);
  const safeDocuments = escapeHtml(String(params.counts.documents));
  const safeTasks = escapeHtml(String(params.counts.tasks));
  const safeTrainings = escapeHtml(String(params.counts.trainings));
  const safeSurveys = escapeHtml(String(params.counts.surveys));

  const text = [
    `Hello ${params.displayName},`,
    "",
    "Here is your weekly HR Portal summary:",
    "",
    `Documents: ${params.counts.documents}`,
    `Tasks: ${params.counts.tasks}`,
    `Trainings: ${params.counts.trainings}`,
    `Surveys: ${params.counts.surveys}`,
    "",
    "Open the HR Portal:",
    params.portalUrl,
    "",
    "Venture Living",
    "VLWorkHub HR Portal"
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#eef3f7;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#eef3f7;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#ffffff;border-collapse:collapse;border:1px solid #d7e1ea;">
            <tr>
              <td style="background-color:#112a46;color:#ffffff;padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:22px;line-height:1.2;font-weight:700;">VLWorkHub</div>
                <div style="margin-top:6px;font-size:13px;line-height:1.4;color:#9adfee;">Venture Living</div>
              </td>
            </tr>
            <tr>
              <td style="padding:3px;background-color:#18b7c9;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#1f2d3d;">
                <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:#112a46;">Your weekly HR Portal summary</h1>
                <p style="margin:0 0 10px 0;font-size:15px;line-height:1.6;">Hello ${safeDisplayName},</p>
                <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;">Here is your weekly HR Portal summary.</p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #d7e1ea;background-color:#f8fbfd;">
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid #d7e1ea;font-size:14px;font-weight:700;color:#112a46;">Documents</td>
                    <td style="padding:14px 16px;border-bottom:1px solid #d7e1ea;text-align:right;font-size:28px;font-weight:700;color:#0d6f8e;">${safeDocuments}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid #d7e1ea;font-size:14px;font-weight:700;color:#112a46;">Tasks</td>
                    <td style="padding:14px 16px;border-bottom:1px solid #d7e1ea;text-align:right;font-size:28px;font-weight:700;color:#0d6f8e;">${safeTasks}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid #d7e1ea;font-size:14px;font-weight:700;color:#112a46;">Trainings</td>
                    <td style="padding:14px 16px;border-bottom:1px solid #d7e1ea;text-align:right;font-size:28px;font-weight:700;color:#0d6f8e;">${safeTrainings}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#112a46;">Surveys</td>
                    <td style="padding:14px 16px;text-align:right;font-size:28px;font-weight:700;color:#0d6f8e;">${safeSurveys}</td>
                  </tr>
                </table>

                <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#1f2d3d;">Please sign in to VLWorkHub to review and complete any pending items.</p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
                  <tr>
                    <td align="center" bgcolor="#18b7c9" style="border-radius:4px;">
                      <a href="${safePortalUrl}" style="display:inline-block;padding:12px 20px;font-size:14px;line-height:1.2;font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#0b2239;text-decoration:none;">Open HR Portal</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background-color:#f5f8fb;border-top:1px solid #d7e1ea;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#4a5d73;">
                Venture Living<br />
                VLWorkHub HR Portal
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: WEEKLY_REPORT_SUBJECT,
    text,
    html
  };
}

async function runWeeklyHrPendingReportBatch(): Promise<BatchSummary> {
  const portalUrl = resolvePublicHrPortalUrl();
  console.log("[WeeklyHRReport] Batch started", {
    timezone: WEEKLY_REPORT_TIMEZONE,
    schedule: WEEKLY_REPORT_CRON_EXPRESSION
  });

  const recipients = await listEligibleRecipients();
  const recipientsByOrganization = new Map<string, EligibleRecipient[]>();
  for (const recipient of recipients) {
    if (!recipientsByOrganization.has(recipient.organizationId)) {
      recipientsByOrganization.set(recipient.organizationId, []);
    }
    recipientsByOrganization.get(recipient.organizationId)?.push(recipient);
  }

  let totalSent = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const [organizationId, orgRecipients] of recipientsByOrganization.entries()) {
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    let senderEmail: string | null = null;
    let transporter: Awaited<ReturnType<typeof getSmtpTransporter>> = null;

    try {
      const [storedSettings, smtpTransporter] = await Promise.all([
        getStoredEmailSettings(organizationId),
        getSmtpTransporter(organizationId)
      ]);
      senderEmail = storedSettings?.email ? String(storedSettings.email) : null;
      transporter = smtpTransporter;
    } catch (smtpError) {
      skipped = orgRecipients.length;
      totalSkipped += skipped;
      console.warn("[WeeklyHRReport] Organization skipped due to SMTP lookup error", {
        organizationId,
        recipients: orgRecipients.length,
        skipped,
        error: toSafeErrorMessage(smtpError)
      });
      continue;
    }

    if (!transporter || !senderEmail || !isValidEmailAddress(senderEmail)) {
      skipped = orgRecipients.length;
      totalSkipped += skipped;
      console.warn("[WeeklyHRReport] Organization skipped due to missing/invalid SMTP settings", {
        organizationId,
        recipients: orgRecipients.length,
        skipped
      });
      continue;
    }

    for (const recipient of orgRecipients) {
      try {
        const counts = await getPendingCountsForRecipient(recipient);
        const content = buildWeeklyHrReportEmail({
          displayName: recipient.displayName,
          portalUrl,
          counts
        });

        await transporter.sendMail({
          from: senderEmail,
          to: recipient.email,
          subject: content.subject,
          text: content.text,
          html: content.html
        });

        sent += 1;
        totalSent += 1;
      } catch (recipientError) {
        failed += 1;
        totalFailed += 1;
        console.warn("[WeeklyHRReport] Recipient send failed", {
          organizationId,
          userId: recipient.userId,
          email: maskEmailAddress(recipient.email),
          error: toSafeErrorMessage(recipientError)
        });
      }
    }

    console.log("[WeeklyHRReport] Organization summary", {
      organizationId,
      eligibleRecipients: orgRecipients.length,
      sent,
      skipped,
      failed
    });
  }

  console.log("[WeeklyHRReport] Batch completed", {
    organizationsProcessed: recipientsByOrganization.size,
    eligibleRecipients: recipients.length,
    sent: totalSent,
    skipped: totalSkipped,
    failed: totalFailed
  });

  return {
    sent: totalSent,
    skipped: totalSkipped,
    failed: totalFailed
  };
}

async function tryClaimWeeklyRun(runKey: string) {
  const claimResult = await pool.query(
    `INSERT INTO hr.scheduled_job_runs (job_name, run_key, status, started_at)
     VALUES ($1, $2, 'started', NOW())
     ON CONFLICT (job_name, run_key) DO NOTHING
     RETURNING id::text AS id`,
    [WEEKLY_REPORT_JOB_NAME, runKey]
  );

  return claimResult.rows[0]?.id ? String(claimResult.rows[0].id) : null;
}

async function markWeeklyRunCompleted(runId: string, summary: BatchSummary) {
  await pool.query(
    `UPDATE hr.scheduled_job_runs
     SET status = 'completed',
         completed_at = NOW(),
         sent_count = $2,
         skipped_count = $3,
         failed_count = $4,
         error_message = NULL
     WHERE id = $1`,
    [runId, summary.sent, summary.skipped, summary.failed]
  );
}

async function markWeeklyRunFailed(runId: string, summary: BatchSummary, error: unknown) {
  await pool.query(
    `UPDATE hr.scheduled_job_runs
     SET status = 'failed',
         completed_at = NOW(),
         sent_count = $2,
         skipped_count = $3,
         failed_count = $4,
         error_message = $5
     WHERE id = $1`,
    [runId, summary.sent, summary.skipped, summary.failed, toSafeErrorMessage(error)]
  );
}

async function maybeRunWeeklyHrPendingReportJob() {
  const runKey = buildWeeklyRunKey(new Date());
  if (!runKey) {
    return;
  }

  if (weeklyReportRunInProgress) {
    return;
  }

  const runId = await tryClaimWeeklyRun(runKey);
  if (!runId) {
    return;
  }

  weeklyReportRunInProgress = true;
  let summary: BatchSummary = { sent: 0, skipped: 0, failed: 0 };
  try {
    summary = await runWeeklyHrPendingReportBatch();
    await markWeeklyRunCompleted(runId, summary);
  } catch (error) {
    try {
      await markWeeklyRunFailed(runId, summary, error);
    } catch (markError) {
      console.error("[WeeklyHRReport] Failed to persist failed-run metadata", {
        runKey,
        runId,
        error: toSafeErrorMessage(markError)
      });
    }

    console.error("[WeeklyHRReport] Batch failed", {
      runKey,
      runId,
      error: toSafeErrorMessage(error)
    });
  } finally {
    weeklyReportRunInProgress = false;
  }
}

export function startWeeklyHrPendingReportScheduler() {
  if (weeklyReportSchedulerTimer) {
    return;
  }

  weeklyReportSchedulerTimer = setInterval(() => {
    void maybeRunWeeklyHrPendingReportJob();
  }, POLL_INTERVAL_MS);
  weeklyReportSchedulerTimer.unref?.();

  console.log("[WeeklyHRReport] Scheduler started", {
    schedule: WEEKLY_REPORT_CRON_EXPRESSION,
    timezone: WEEKLY_REPORT_TIMEZONE,
    pollIntervalMs: POLL_INTERVAL_MS,
    hrPortalUrl: resolvePublicHrPortalUrl()
  });
}