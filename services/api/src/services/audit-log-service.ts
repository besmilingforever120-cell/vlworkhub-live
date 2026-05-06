import type { Request } from "express";
import { pool } from "../config/db";

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type AuditLogInput = {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

let ensureAuditLogTablePromise: Promise<void> | null = null;

function normalizeText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function sanitizeJson(value: unknown) {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeIpAddress(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const first = normalized.split(",")[0]?.trim() || "";
  if (!first) {
    return null;
  }

  if (first.startsWith("::ffff:")) {
    return first.slice("::ffff:".length);
  }

  return first;
}

function resolveIpAddressFromRequest(req?: Request) {
  if (!req) {
    return null;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = forwardedValue || req.ip || req.socket?.remoteAddress || null;
  return normalizeIpAddress(candidate);
}

function resolveUserAgentFromRequest(req?: Request) {
  if (!req) {
    return null;
  }

  const userAgent = req.headers["user-agent"];
  const value = Array.isArray(userAgent) ? userAgent[0] : userAgent;
  return normalizeText(value);
}

export function buildAuditLogInput(input: Omit<AuditLogInput, "ipAddress" | "userAgent">, req?: Request): AuditLogInput {
  return {
    ...input,
    ipAddress: resolveIpAddressFromRequest(req),
    userAgent: resolveUserAgentFromRequest(req)
  };
}

export async function ensureAuditLogTable(db: Queryable = pool) {
  if (!ensureAuditLogTablePromise) {
    ensureAuditLogTablePromise = (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS public.audit_log (
          id BIGSERIAL PRIMARY KEY,
          user_id UUID,
          user_email TEXT,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          old_value JSONB,
          new_value JSONB,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`
      );

      await db.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1
             FROM pg_constraint
             WHERE conname = 'audit_log_user_id_fkey'
           ) THEN
             ALTER TABLE public.audit_log
               ADD CONSTRAINT audit_log_user_id_fkey
               FOREIGN KEY (user_id)
               REFERENCES public.users(id)
               ON DELETE SET NULL;
           END IF;
         END
         $$;`
      );

      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id_created_at ON public.audit_log (user_id, created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_entity_created_at ON public.audit_log (entity_type, entity_id, created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON public.audit_log (action, created_at DESC)`);
    })().catch((error) => {
      ensureAuditLogTablePromise = null;
      throw error;
    });
  }

  return ensureAuditLogTablePromise;
}

export async function writeAuditLog(input: AuditLogInput, db: Queryable = pool) {
  await ensureAuditLogTable(db);

  const action = normalizeText(input.action);
  const entityType = normalizeText(input.entityType);

  if (!action || !entityType) {
    throw new Error("Audit log requires action and entityType");
  }

  const result = await db.query(
    `INSERT INTO public.audit_log (
       user_id,
       user_email,
       action,
       entity_type,
       entity_id,
       old_value,
       new_value,
       ip_address,
       user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::inet, $9)
     RETURNING id, created_at`,
    [
      normalizeText(input.userId),
      normalizeText(input.userEmail),
      action,
      entityType,
      normalizeText(input.entityId),
      JSON.stringify(sanitizeJson(input.oldValue)),
      JSON.stringify(sanitizeJson(input.newValue)),
      normalizeIpAddress(input.ipAddress),
      normalizeText(input.userAgent)
    ]
  );

  return {
    id: Number(result.rows[0]?.id || 0),
    createdAt: String(result.rows[0]?.created_at || "")
  };
}

export async function tryWriteAuditLog(input: AuditLogInput, db: Queryable = pool) {
  try {
    return await writeAuditLog(input, db);
  } catch (error) {
    console.error("Audit log write failed", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error
    });
    return null;
  }
}
