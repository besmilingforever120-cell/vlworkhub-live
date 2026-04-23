-- Migration: add email_settings table
-- Run once against the vlworkhub database

CREATE TABLE IF NOT EXISTS email_settings (
  id          BIGSERIAL    PRIMARY KEY,
  email       TEXT         NOT NULL,
  -- password is AES-256-CBC encrypted (pgcrypto) before storage
  password    TEXT         NOT NULL,
  provider    TEXT         NOT NULL CHECK (provider IN ('gmail', 'outlook')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Only one row should ever exist (global SMTP config)
CREATE UNIQUE INDEX IF NOT EXISTS email_settings_single_row ON email_settings ((true));
