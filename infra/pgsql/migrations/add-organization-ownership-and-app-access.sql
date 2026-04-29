ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_assigned_admin_id_fkey'
  ) THEN
    ALTER TABLE organizations
    ADD CONSTRAINT organizations_assigned_admin_id_fkey
    FOREIGN KEY (assigned_admin_id)
    REFERENCES users(id)
    ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS organization_app_access (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  app TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, app)
);