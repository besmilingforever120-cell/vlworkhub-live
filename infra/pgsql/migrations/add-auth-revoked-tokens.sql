-- Migration: add server-side JWT revocation table
-- Run once against the vlworkhub database

CREATE TABLE IF NOT EXISTS public.auth_revoked_tokens (
  jti        TEXT         PRIMARY KEY,
  revoked_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_revoked_tokens_expires_at
  ON public.auth_revoked_tokens (expires_at);
