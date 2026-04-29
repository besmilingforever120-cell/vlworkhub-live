-- Migration: add per-user login failure tracking and lockout fields
-- Run once against the vlworkhub database

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.users
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
