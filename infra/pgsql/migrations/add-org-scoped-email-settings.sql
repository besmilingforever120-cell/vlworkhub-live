ALTER TABLE public.email_settings
  ADD COLUMN IF NOT EXISTS organization_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_settings_organization_id_fkey'
  ) THEN
    ALTER TABLE public.email_settings
    ADD CONSTRAINT email_settings_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE;
  END IF;
END
$$;

WITH legacy AS (
  SELECT email, password, provider
  FROM public.email_settings
  WHERE organization_id IS NULL
  ORDER BY id ASC
  LIMIT 1
)
INSERT INTO public.email_settings (organization_id, email, password, provider, created_at, updated_at)
SELECT o.id, legacy.email, legacy.password, legacy.provider, NOW(), NOW()
FROM organizations o
CROSS JOIN legacy
ON CONFLICT (organization_id) DO NOTHING;

DELETE FROM public.email_settings
WHERE organization_id IS NULL;

DROP INDEX IF EXISTS email_settings_single_row;

CREATE UNIQUE INDEX IF NOT EXISTS email_settings_org_unique
ON public.email_settings (organization_id);