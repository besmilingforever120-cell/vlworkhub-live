CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_app_access (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  status TEXT,
  program TEXT,
  primary_contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id BIGINT,
  staff_id BIGINT,
  note_text TEXT,
  visibility TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incidents (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  severity TEXT,
  reported_by TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  owner_name TEXT,
  storage_path TEXT,
  due_date DATE,
  requires_signature TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_signatures (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id BIGINT NOT NULL,
  signer_name TEXT,
  status TEXT,
  signed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  department TEXT,
  job_title TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_user_roles (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (''admin'',''manager'',''employee'')),
  department_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  audience TEXT,
  publish_date DATE,
  start_date DATE,
  end_date DATE,
  priority TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assigned_to TEXT,
  due_date DATE,
  status TEXT,
  priority TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_user_states (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL,
  user_name TEXT,
  status TEXT,
  completed_on TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  audience TEXT,
  delivery_mode TEXT,
  content_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_assignments (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  training_id BIGINT NOT NULL,
  assignee_name TEXT,
  due_date DATE,
  survey_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_completions (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assignment_id BIGINT NOT NULL,
  user_name TEXT,
  progress_percent INTEGER,
  completed_on TIMESTAMPTZ,
  last_position_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS surveys (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  due_date DATE,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_assignments (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT,
  survey_id BIGINT NOT NULL,
  assignee_name TEXT,
  due_date DATE,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_completions (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assignment_id BIGINT NOT NULL,
  user_name TEXT,
  completed_on TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mileage (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_date DATE,
  employee_name TEXT,
  vehicle_id TEXT,
  distance_km NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plate_number TEXT,
  status TEXT,
  assigned_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relation TEXT,
  phone TEXT,
  employee_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_checklists (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT,
  completed_by TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ursafe_user_profiles (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  department TEXT,
  manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  phone_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ursafe_trips (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  category TEXT NOT NULL,
  start_location JSONB,
  end_location JSONB,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  distance_miles NUMERIC(10,2) NOT NULL DEFAULT 0,
  route JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  vehicle_info TEXT,
  purpose TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ursafe_shifts (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  last_check_in TIMESTAMPTZ,
  check_in_count INTEGER NOT NULL DEFAULT 0,
  start_location JSONB,
  end_location JSONB,
  current_location JSONB,
  client_name TEXT,
  client_address TEXT,
  expected_duration INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ursafe_check_ins (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shift_id BIGINT NOT NULL REFERENCES ursafe_shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  location JSONB,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ursafe_emergencies (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id BIGINT REFERENCES ursafe_shifts(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  location JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ursafe_active_sessions (
  id BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online',
  device_name TEXT,
  platform TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  location JSONB,
  last_known_activity TEXT,
  battery_level INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO organizations (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'VLWorkHub Demo Org')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO users (id, organization_id, name, email, password_hash, first_name, last_name, enabled, status, role)
VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Platform Admin', 'admin@vlworkhub.ca', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'Platform', 'Admin', TRUE, 'active', 'super_admin'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Casey Morgan', 'manager@vlworkhub.ca', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'Casey', 'Morgan', TRUE, 'active', 'user'),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Jordan Lee', 'employee@vlworkhub.ca', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'Jordan', 'Lee', TRUE, 'active', 'user')
ON CONFLICT (email) DO UPDATE
SET organization_id = EXCLUDED.organization_id,
    password_hash = EXCLUDED.password_hash,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    status = EXCLUDED.status;

INSERT INTO user_roles (user_id, role)
SELECT user_id, role_value
FROM (
  VALUES
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Admin'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'HR'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'Manager'),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'Employee')
) AS roles(user_id, role_value)
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur WHERE ur.user_id = roles.user_id AND ur.role = roles.role_value
);

INSERT INTO user_app_access (user_id, app)
SELECT user_id, app_value
FROM (
  VALUES
    ('22222222-2222-2222-2222-222222222222'::uuid, 'main-platform'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'care'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'hr'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'ursafe'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'main-platform'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'ursafe'),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'main-platform'),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'ursafe')
) AS apps(user_id, app_value)
WHERE NOT EXISTS (
  SELECT 1 FROM user_app_access uaa WHERE uaa.user_id = apps.user_id AND uaa.app = apps.app_value
);

INSERT INTO ursafe_user_profiles (organization_id, user_id, department, manager_user_id, is_active, must_change_password, phone_number)
VALUES
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Field Operations', NULL, TRUE, FALSE, '604-555-0100'),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Community Support', '33333333-3333-3333-3333-333333333333', TRUE, FALSE, '604-555-0101')
ON CONFLICT (user_id) DO UPDATE
SET department = EXCLUDED.department,
    manager_user_id = EXCLUDED.manager_user_id,
    is_active = EXCLUDED.is_active,
    must_change_password = EXCLUDED.must_change_password,
    phone_number = EXCLUDED.phone_number;

INSERT INTO emergency_contacts (organization_id, full_name, relation, phone, employee_name)
SELECT '11111111-1111-1111-1111-111111111111', contact_name, relation, phone, employee_name
FROM (
  VALUES
    ('Dana Rivera', 'Spouse', '604-555-0192', 'Jordan Lee'),
    ('Mina Patel', 'Parent', '604-555-0111', 'Jordan Lee')
) AS contacts(contact_name, relation, phone, employee_name)
WHERE NOT EXISTS (
  SELECT 1 FROM emergency_contacts ec WHERE ec.organization_id = '11111111-1111-1111-1111-111111111111' AND ec.full_name = contacts.contact_name AND ec.employee_name = contacts.employee_name
);

INSERT INTO safety_checklists (organization_id, title, location, completed_by, status)
SELECT '11111111-1111-1111-1111-111111111111', title, location, completed_by, status
FROM (
  VALUES
    ('Shift opening checklist', 'North Vancouver', 'Jordan Lee', 'Completed'),
    ('Late-night client departure check', 'Burnaby', 'Jordan Lee', 'Action Required')
) AS checklists(title, location, completed_by, status)
WHERE NOT EXISTS (
  SELECT 1 FROM safety_checklists sc WHERE sc.organization_id = '11111111-1111-1111-1111-111111111111' AND sc.title = checklists.title AND sc.completed_by = checklists.completed_by
);

INSERT INTO ursafe_trips (organization_id, user_id, status, category, start_location, end_location, start_time, end_time, distance_miles, route, notes, vehicle_info, purpose)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'pending_approval',
  'business',
  '{"latitude":49.2768,"longitude":-123.1305,"timestamp":"2026-03-12T16:15:00.000Z","address":"Downtown Vancouver"}'::jsonb,
  '{"latitude":49.2636,"longitude":-123.1386,"timestamp":"2026-03-12T17:05:00.000Z","address":"Kitsilano"}'::jsonb,
  '2026-03-12T16:15:00.000Z',
  '2026-03-12T17:05:00.000Z',
  7.8,
  '[{"latitude":49.2768,"longitude":-123.1305,"timestamp":"2026-03-12T16:15:00.000Z"},{"latitude":49.2701,"longitude":-123.1345,"timestamp":"2026-03-12T16:38:00.000Z"},{"latitude":49.2636,"longitude":-123.1386,"timestamp":"2026-03-12T17:05:00.000Z"}]'::jsonb,
  'Client support visit and pharmacy pickup.',
  'Toyota RAV4',
  'Client support visit'
WHERE NOT EXISTS (
  SELECT 1 FROM ursafe_trips ut WHERE ut.organization_id = '11111111-1111-1111-1111-111111111111' AND ut.user_id = '44444444-4444-4444-4444-444444444444' AND ut.start_time = '2026-03-12T16:15:00.000Z'
);

INSERT INTO ursafe_shifts (organization_id, user_id, start_time, status, last_check_in, check_in_count, start_location, current_location, client_name, client_address, expected_duration, notes)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  '2026-03-12T18:00:00.000Z',
  'active',
  '2026-03-12T20:00:00.000Z',
  2,
  '{"latitude":49.2440,"longitude":-122.9810,"timestamp":"2026-03-12T18:00:00.000Z","address":"New Westminster"}'::jsonb,
  '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:05:00.000Z","address":"New Westminster client home"}'::jsonb,
  'Individual 14',
  'Royal Ave, New Westminster',
  180,
  'Evening check-in support'
WHERE NOT EXISTS (
  SELECT 1 FROM ursafe_shifts us WHERE us.organization_id = '11111111-1111-1111-1111-111111111111' AND us.user_id = '44444444-4444-4444-4444-444444444444' AND us.start_time = '2026-03-12T18:00:00.000Z'
);
INSERT INTO ursafe_check_ins (organization_id, shift_id, user_id, timestamp, location, status, notes)
SELECT
  '11111111-1111-1111-1111-111111111111',
  us.id,
  '44444444-4444-4444-4444-444444444444',
  '2026-03-12T19:00:00.000Z',
  '{"latitude":49.2460,"longitude":-122.9840,"timestamp":"2026-03-12T19:00:00.000Z","address":"New Westminster"}'::jsonb,
  'safe',
  'Initial check-in'
FROM ursafe_shifts us
WHERE us.organization_id = '11111111-1111-1111-1111-111111111111'
  AND us.user_id = '44444444-4444-4444-4444-444444444444'
  AND us.start_time = '2026-03-12T18:00:00.000Z'
  AND NOT EXISTS (
    SELECT 1 FROM ursafe_check_ins ci WHERE ci.shift_id = us.id AND ci.timestamp = '2026-03-12T19:00:00.000Z'
  );

INSERT INTO ursafe_check_ins (organization_id, shift_id, user_id, timestamp, location, status, notes)
SELECT
  '11111111-1111-1111-1111-111111111111',
  us.id,
  '44444444-4444-4444-4444-444444444444',
  '2026-03-12T20:00:00.000Z',
  '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:00:00.000Z","address":"Client home"}'::jsonb,
  'concern',
  'Client agitation escalating'
FROM ursafe_shifts us
WHERE us.organization_id = '11111111-1111-1111-1111-111111111111'
  AND us.user_id = '44444444-4444-4444-4444-444444444444'
  AND us.start_time = '2026-03-12T18:00:00.000Z'
  AND NOT EXISTS (
    SELECT 1 FROM ursafe_check_ins ci WHERE ci.shift_id = us.id AND ci.timestamp = '2026-03-12T20:00:00.000Z'
  );

INSERT INTO ursafe_emergencies (organization_id, user_id, shift_id, type, location, timestamp, resolved, notes)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  us.id,
  'sos',
  '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:06:00.000Z","address":"Client home"}'::jsonb,
  '2026-03-12T20:06:00.000Z',
  FALSE,
  '{"notes":"Employee requested immediate supervisor support"}'
FROM ursafe_shifts us
WHERE us.organization_id = '11111111-1111-1111-1111-111111111111'
  AND us.user_id = '44444444-4444-4444-4444-444444444444'
  AND us.start_time = '2026-03-12T18:00:00.000Z'
  AND NOT EXISTS (
    SELECT 1 FROM ursafe_emergencies ue WHERE ue.shift_id = us.id AND ue.timestamp = '2026-03-12T20:06:00.000Z'
  );

INSERT INTO ursafe_active_sessions (organization_id, user_id, status, device_name, platform, started_at, last_seen_at, location, last_known_activity, battery_level, notes)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'online',
  'iPhone 15',
  'ios',
  '2026-03-12T17:45:00.000Z',
  '2026-03-12T20:08:00.000Z',
  '{"latitude":49.2480,"longitude":-122.9870,"timestamp":"2026-03-12T20:08:00.000Z","address":"Client home"}'::jsonb,
  'foreground',
  54,
  '{"connectionStatus":"online"}'
WHERE NOT EXISTS (
  SELECT 1 FROM ursafe_active_sessions uas WHERE uas.organization_id = '11111111-1111-1111-1111-111111111111' AND uas.user_id = '44444444-4444-4444-4444-444444444444'
);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS status TEXT;

INSERT INTO staff (organization_id, full_name, role, email, phone, department, manager_name, status)
SELECT *
FROM (
  VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, 'Jamie Lee', 'Life Skills Worker', 'jamie.lee@vlcare.ca', '250-555-0100', 'Community Inclusion', 'Casey Morgan', 'Active'),
    ('11111111-1111-1111-1111-111111111111'::uuid, 'Marcus Chen', 'Residential Coordinator', 'marcus.chen@vlcare.ca', '250-555-0101', 'Community Housing', 'Alex Morgan', 'Archived'),
    ('11111111-1111-1111-1111-111111111111'::uuid, 'Priya Shah', 'Program Supervisor', 'priya.shah@vlcare.ca', '250-555-0102', 'Supported Employment', 'Platform Admin', 'Active')
) AS staff_seed(organization_id, full_name, role, email, phone, department, manager_name, status)
WHERE NOT EXISTS (
  SELECT 1 FROM staff s WHERE s.organization_id = staff_seed.organization_id AND s.email = staff_seed.email
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS department TEXT;


INSERT INTO hr_user_roles (organization_id, user_id, role, department_id)
SELECT org_id, user_id, role_value, department_value
FROM (
  VALUES
    (''11111111-1111-1111-1111-111111111111''::uuid, ''22222222-2222-2222-2222-222222222222''::uuid, ''admin'', ''people''),
    (''11111111-1111-1111-1111-111111111111''::uuid, ''33333333-3333-3333-3333-333333333333''::uuid, ''manager'', ''operations''),
    (''11111111-1111-1111-1111-111111111111''::uuid, ''44444444-4444-4444-4444-444444444444''::uuid, ''employee'', ''operations'')
) AS hr_roles(org_id, user_id, role_value, department_value)
WHERE NOT EXISTS (
  SELECT 1 FROM hr_user_roles hur WHERE hur.organization_id = hr_roles.org_id AND hur.user_id = hr_roles.user_id
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE user_app_access ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE users SET name = COALESCE(name, TRIM(first_name || ' ' || last_name));
UPDATE users SET enabled = CASE WHEN status = 'active' THEN TRUE ELSE FALSE END WHERE enabled IS DISTINCT FROM CASE WHEN status = 'active' THEN TRUE ELSE FALSE END;
UPDATE users SET role = CASE WHEN email = 'admin@vlworkhub.ca' THEN 'super_admin' ELSE COALESCE(role, 'user') END WHERE role IS NULL OR role NOT IN ('super_admin','user');
UPDATE user_app_access SET app = UPPER(app) WHERE app IN ('main-platform','care','hr','ursafe','HR','CARE','URSAFE');

