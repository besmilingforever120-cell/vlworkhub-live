-- Migration: harden onboarding expiry task dedupe linkage
-- Purpose:
-- 1) repair stale task_id references that point to missing hr.tasks rows
-- 2) add FK so future task deletions automatically nullify task_id
--
-- Safe to run multiple times.

-- Step 1: clear orphan task references
UPDATE hr.hr_onboarding_expiry_tasks et
SET task_id = NULL
WHERE task_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM hr.tasks t
    WHERE t.id = et.task_id
  );

-- Step 2: add FK if missing (NOT VALID avoids long blocking validation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'hr'
      AND r.relname = 'hr_onboarding_expiry_tasks'
      AND c.conname = 'fk_hr_onboarding_expiry_tasks_task_id'
  ) THEN
    ALTER TABLE hr.hr_onboarding_expiry_tasks
      ADD CONSTRAINT fk_hr_onboarding_expiry_tasks_task_id
      FOREIGN KEY (task_id)
      REFERENCES hr.tasks(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;
