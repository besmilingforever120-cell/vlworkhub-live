BEGIN;

-- Create module schemas.
CREATE SCHEMA IF NOT EXISTS hr;
CREATE SCHEMA IF NOT EXISTS care;
CREATE SCHEMA IF NOT EXISTS ursafe;

-- Keep shared core tables in public: users, departments, organizations.
DO $$
BEGIN
	IF to_regclass('public.departments') IS NOT NULL THEN
		ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS department_type TEXT;
		UPDATE public.departments SET department_type = 'Program' WHERE department_type IS NULL;
		ALTER TABLE public.departments ALTER COLUMN department_type SET DEFAULT 'Program';
		ALTER TABLE public.departments ALTER COLUMN department_type SET NOT NULL;

		IF NOT EXISTS (
			SELECT 1
			FROM pg_constraint
			WHERE conname = 'departments_department_type_check'
		) THEN
			ALTER TABLE public.departments
				ADD CONSTRAINT departments_department_type_check
				CHECK (department_type IN ('Community housing', 'Program'));
		END IF;
	END IF;
END $$;

-- Move Care module tables.
ALTER TABLE IF EXISTS public.clients SET SCHEMA care;
ALTER TABLE IF EXISTS public.staff SET SCHEMA care;
ALTER TABLE IF EXISTS public.notes SET SCHEMA care;
ALTER TABLE IF EXISTS public.incidents SET SCHEMA care;

-- Move HR module tables.
ALTER TABLE IF EXISTS public.employees SET SCHEMA hr;
ALTER TABLE IF EXISTS public.hr_user_roles SET SCHEMA hr;
ALTER TABLE IF EXISTS public.announcements SET SCHEMA hr;
ALTER TABLE IF EXISTS public.tasks SET SCHEMA hr;
ALTER TABLE IF EXISTS public.task_assignments SET SCHEMA hr;
ALTER TABLE IF EXISTS public.task_completion SET SCHEMA hr;
ALTER TABLE IF EXISTS public.task_user_states SET SCHEMA hr;
ALTER TABLE IF EXISTS public.training SET SCHEMA hr;
ALTER TABLE IF EXISTS public.training_assignments SET SCHEMA hr;
ALTER TABLE IF EXISTS public.training_completions SET SCHEMA hr;
ALTER TABLE IF EXISTS public.surveys SET SCHEMA hr;
ALTER TABLE IF EXISTS public.survey_assignments SET SCHEMA hr;
ALTER TABLE IF EXISTS public.survey_completions SET SCHEMA hr;
ALTER TABLE IF EXISTS public.documents SET SCHEMA hr;
ALTER TABLE IF EXISTS public.document_assignments SET SCHEMA hr;
ALTER TABLE IF EXISTS public.document_signatures SET SCHEMA hr;
ALTER TABLE IF EXISTS public.hr_onboarding_uploads SET SCHEMA hr;
ALTER TABLE IF EXISTS public.hr_onboarding_expiry_tasks SET SCHEMA hr;

-- Ensure announcements supports event media/link fields.
ALTER TABLE IF EXISTS hr.announcements ADD COLUMN IF NOT EXISTS event_image_url TEXT;
ALTER TABLE IF EXISTS hr.announcements ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE IF EXISTS hr.announcements ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE IF EXISTS hr.announcements ADD COLUMN IF NOT EXISTS event_link_url TEXT;

-- Move URSafe module tables.
ALTER TABLE IF EXISTS public.mileage SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.vehicles SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.emergency_contacts SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.safety_checklists SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.ursafe_user_profiles SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.ursafe_trips SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.ursafe_shifts SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.ursafe_check_ins SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.ursafe_emergencies SET SCHEMA ursafe;
ALTER TABLE IF EXISTS public.ursafe_active_sessions SET SCHEMA ursafe;

COMMIT;
