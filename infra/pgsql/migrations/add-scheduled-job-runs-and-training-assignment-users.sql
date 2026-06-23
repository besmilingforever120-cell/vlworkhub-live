BEGIN;

CREATE SCHEMA IF NOT EXISTS hr;

CREATE TABLE IF NOT EXISTS hr.scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  run_key TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  CONSTRAINT scheduled_job_runs_job_name_run_key_key UNIQUE (job_name, run_key)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_started_at
ON hr.scheduled_job_runs (started_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid
    WHERE nsp.nspname = 'hr'
      AND rel.relname = 'training_assignments'
      AND con.contype IN ('p', 'u')
      AND array_length(con.conkey, 1) = 1
      AND att.attnum = con.conkey[1]
      AND att.attname = 'id'
  ) THEN
    ALTER TABLE hr.training_assignments
      ADD CONSTRAINT training_assignments_id_key UNIQUE (id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS hr.training_assignment_users (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  assignment_id BIGINT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT training_assignment_users_org_assignment_user_key UNIQUE (organization_id, assignment_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'hr'
      AND rel.relname = 'training_assignment_users'
      AND con.conname = 'training_assignment_users_organization_id_fkey'
  ) THEN
    ALTER TABLE hr.training_assignment_users
      ADD CONSTRAINT training_assignment_users_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'hr'
      AND rel.relname = 'training_assignment_users'
      AND con.conname = 'training_assignment_users_assignment_id_fkey'
  ) THEN
    ALTER TABLE hr.training_assignment_users
      ADD CONSTRAINT training_assignment_users_assignment_id_fkey
      FOREIGN KEY (assignment_id)
      REFERENCES hr.training_assignments(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'hr'
      AND rel.relname = 'training_assignment_users'
      AND con.conname = 'training_assignment_users_user_id_fkey'
  ) THEN
    ALTER TABLE hr.training_assignment_users
      ADD CONSTRAINT training_assignment_users_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_training_assignment_users_assignment
ON hr.training_assignment_users (assignment_id);

CREATE INDEX IF NOT EXISTS idx_training_assignment_users_user
ON hr.training_assignment_users (user_id);

ALTER TABLE hr.training_completions
  ADD COLUMN IF NOT EXISTS user_id UUID;

CREATE INDEX IF NOT EXISTS idx_training_completions_user_id
ON hr.training_completions (user_id);

CREATE INDEX IF NOT EXISTS idx_training_completions_assignment_user
ON hr.training_completions (assignment_id, user_id);

-- Legacy assignee_name stores comma-delimited tokens. Names or department labels
-- containing commas cannot be represented safely and are not heuristically repaired here.
WITH tokenized AS (
  SELECT
    ta.organization_id,
    ta.id AS assignment_id,
    BTRIM(token_value) AS token
  FROM hr.training_assignments ta
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(ta.assignee_name, ''), ',') AS token_value
),
active_users AS (
  SELECT
    u.organization_id,
    u.id AS user_id,
    BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
    COALESCE(d.name, '') AS department_name
  FROM public.users u
  LEFT JOIN public.departments d ON d.id = u.department_id
  WHERE u.status = 'active'
),
unique_active_names AS (
  SELECT
    au.organization_id,
    au.full_name,
    MIN(au.user_id::text)::uuid AS user_id,
    COUNT(*) AS row_count
  FROM active_users au
  WHERE au.full_name <> ''
  GROUP BY au.organization_id, au.full_name
),
resolved AS (
  SELECT DISTINCT
    tok.organization_id,
    tok.assignment_id,
    au.user_id
  FROM tokenized tok
  INNER JOIN active_users au ON au.organization_id = tok.organization_id
  WHERE tok.token <> ''
    AND (
      tok.token = 'All Staff'
      OR (
        tok.token ILIKE 'Department:%'
        AND BTRIM(split_part(tok.token, ':', 2)) = au.department_name
      )
    )

  UNION

  SELECT
    tok.organization_id,
    tok.assignment_id,
    names.user_id
  FROM tokenized tok
  INNER JOIN unique_active_names names
    ON names.organization_id = tok.organization_id
   AND names.full_name = tok.token
   AND names.row_count = 1
  WHERE tok.token <> ''
    AND tok.token <> 'All Staff'
    AND tok.token NOT ILIKE 'Department:%'
)
INSERT INTO hr.training_assignment_users (organization_id, assignment_id, user_id)
SELECT organization_id, assignment_id, user_id
FROM resolved
ON CONFLICT (organization_id, assignment_id, user_id) DO NOTHING;

WITH unique_active_names AS (
  SELECT
    u.organization_id,
    BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS full_name,
    MIN(u.id::text)::uuid AS user_id,
    COUNT(*) AS row_count
  FROM public.users u
  WHERE u.status = 'active'
  GROUP BY u.organization_id, BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
)
UPDATE hr.training_completions tc
SET user_id = names.user_id
FROM unique_active_names names
WHERE tc.user_id IS NULL
  AND names.row_count = 1
  AND names.full_name <> ''
  AND tc.organization_id = names.organization_id
  AND BTRIM(COALESCE(tc.user_name, '')) = names.full_name;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'hr'
      AND rel.relname = 'training_completions'
      AND con.conname = 'training_completions_user_id_fkey'
  ) THEN
    ALTER TABLE hr.training_completions
      ADD CONSTRAINT training_completions_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

COMMIT;