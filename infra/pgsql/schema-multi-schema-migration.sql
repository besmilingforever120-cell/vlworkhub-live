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

CREATE TABLE IF NOT EXISTS ursafe.active_sessions (
	id BIGSERIAL PRIMARY KEY,
	organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	latitude NUMERIC(10, 7),
	longitude NUMERIC(10, 7),
	device TEXT,
	status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'idle', 'lost')),
	last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	tracking_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	notes TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ursafe_active_sessions_org_last_seen
	ON ursafe.active_sessions (organization_id, last_seen DESC);

DO $$
BEGIN
	IF to_regclass('ursafe.ursafe_active_sessions') IS NOT NULL THEN
		INSERT INTO ursafe.active_sessions (
			organization_id,
			user_id,
			latitude,
			longitude,
			device,
			status,
			last_seen,
			tracking_since,
			notes
		)
		SELECT
			organization_id,
			user_id,
			CASE
				WHEN location IS NOT NULL AND location ? 'latitude' THEN NULLIF(location ->> 'latitude', '')::NUMERIC(10, 7)
				ELSE NULL
			END AS latitude,
			CASE
				WHEN location IS NOT NULL AND location ? 'longitude' THEN NULLIF(location ->> 'longitude', '')::NUMERIC(10, 7)
				ELSE NULL
			END AS longitude,
			device_name AS device,
			CASE
				WHEN status IN ('online', 'idle', 'lost') THEN status
				WHEN status = 'stale' THEN 'lost'
				ELSE 'online'
			END AS status,
			COALESCE(last_seen_at, NOW()) AS last_seen,
			COALESCE(started_at, last_seen_at, NOW()) AS tracking_since,
			notes
		FROM ursafe.ursafe_active_sessions
		ON CONFLICT (organization_id, user_id)
		DO UPDATE SET
			latitude = EXCLUDED.latitude,
			longitude = EXCLUDED.longitude,
			device = EXCLUDED.device,
			status = EXCLUDED.status,
			last_seen = EXCLUDED.last_seen,
			tracking_since = EXCLUDED.tracking_since,
			notes = EXCLUDED.notes;
	END IF;
END $$;

COMMIT;
