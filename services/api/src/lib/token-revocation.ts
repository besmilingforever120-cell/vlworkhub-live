import { pool } from "../config/db";

let ensureRevocationSchemaPromise: Promise<void> | null = null;

function ensureRevocationSchema() {
  if (!ensureRevocationSchemaPromise) {
    ensureRevocationSchemaPromise = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS public.auth_revoked_tokens (
          jti TEXT PRIMARY KEY,
          revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        )`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_auth_revoked_tokens_expires_at
         ON public.auth_revoked_tokens (expires_at)`
      );
    })().catch((error) => {
      ensureRevocationSchemaPromise = null;
      throw error;
    });
  }

  return ensureRevocationSchemaPromise;
}

export async function revokeTokenByJti(jti: string, expUnixSeconds: number) {
  if (!jti || !Number.isFinite(expUnixSeconds) || expUnixSeconds <= 0) {
    return;
  }

  await ensureRevocationSchema();
  await pool.query(
    `INSERT INTO public.auth_revoked_tokens (jti, expires_at)
     VALUES ($1, to_timestamp($2))
     ON CONFLICT (jti)
     DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [jti, expUnixSeconds]
  );
}

export async function isTokenRevoked(jti: string) {
  if (!jti) {
    return false;
  }

  await ensureRevocationSchema();
  const result = await pool.query<{ jti: string }>(
    `SELECT jti
     FROM public.auth_revoked_tokens
     WHERE jti = $1 AND expires_at > NOW()
     LIMIT 1`,
    [jti]
  );

  return result.rows.length > 0;
}
