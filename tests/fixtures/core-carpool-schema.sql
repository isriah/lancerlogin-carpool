-- The schema Carpool's tests start from: LancerLogin Core's own tables that Carpool reads, or that its tables reference, and
-- the carpool_* tables that Core's adopted Carpool migrations produce (package.json lancerlogin.adoptedCoreMigrations).
-- Plugin tests apply this plugin's own migrations on top.
-- Dumped from a database migrated with every migration of LancerLogin Core v2.1.0-beta.5 (commit 86640f17),
-- through 0094_module_update_failures.sql. Tables: audit_log, carpool_assignments, carpool_geocoding_credentials, carpool_import_profiles, carpool_location_cache, carpool_location_resolution, carpool_people, carpool_plans, carpool_settings, carpool_unresolved, installations, meeting_weight_categories, meetings, members, organization_settings, users.
-- Core's own triggers are left out: they maintain Core bookkeeping tables that are not here.

CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('google', 'local', 'both')),
  telemetry_accepted_at TEXT,
  telemetry_install_id TEXT UNIQUE
, google_enabled INTEGER NOT NULL DEFAULT 0 CHECK (google_enabled IN (0, 1)), resend_enabled INTEGER NOT NULL DEFAULT 0 CHECK (resend_enabled IN (0, 1)), discord_enabled INTEGER NOT NULL DEFAULT 0 CHECK (discord_enabled IN (0, 1)), google_calendar_enabled INTEGER NOT NULL DEFAULT 0
CHECK (google_calendar_enabled IN (0, 1)));

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  email TEXT,
  local_username TEXT,
  password_hash TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL, member_id TEXT REFERENCES members(id) ON DELETE SET NULL, debug_mode INTEGER NOT NULL DEFAULT 0
  CHECK (debug_mode IN (0, 1)), session_epoch INTEGER NOT NULL DEFAULT 0 CHECK(typeof(session_epoch)='integer' AND session_epoch>=0),
  UNIQUE(installation_id, email),
  UNIQUE(installation_id, local_username),
  CHECK (email IS NOT NULL OR local_username IS NOT NULL)
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  discord_user_id TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL, attendance_required_from TEXT, inactive_periods_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(inactive_periods_json) AND json_type(inactive_periods_json) = 'array'),
  UNIQUE(installation_id, external_id)
);

CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
, is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)), series_id TEXT, recurrence_frequency TEXT CHECK (recurrence_frequency IN ('daily', 'weekly', 'biweekly', 'monthly')), recurrence_until TEXT, recurrence_sequence INTEGER, deleted_at TEXT, weight_category_id TEXT REFERENCES meeting_weight_categories(id), weight_category_name TEXT, attendance_weight REAL NOT NULL DEFAULT 1
CHECK (attendance_weight BETWEEN 0.1 AND 100), audience_mode TEXT NOT NULL DEFAULT 'all' CHECK (audience_mode IN ('all', 'labels')));

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE "organization_settings" (
  installation_id TEXT PRIMARY KEY REFERENCES installations(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL DEFAULT 'LancerLogin',
  subtitle TEXT,
  logo_data TEXT,
  primary_color TEXT NOT NULL DEFAULT '#7c3aed',
  secondary_color TEXT NOT NULL DEFAULT '#0f766e',
  appearance TEXT NOT NULL DEFAULT 'system' CHECK (appearance IN ('system', 'themed', 'light', 'dark')),
  time_zone TEXT NOT NULL
, late_scan_minutes INTEGER NOT NULL DEFAULT 30 CHECK (late_scan_minutes BETWEEN 0 AND 180), logo_backdrop TEXT NOT NULL DEFAULT 'auto' CHECK (logo_backdrop IN ('auto', 'light', 'dark', 'none')), discord_contest_window_hours INTEGER NOT NULL DEFAULT 24 CHECK (discord_contest_window_hours BETWEEN 1 AND 168), attendance_reporting_starts_on TEXT, discord_channel_manager_enabled INTEGER NOT NULL DEFAULT 0
CHECK (discord_channel_manager_enabled IN (0, 1)), anomaly_late_threshold_minutes INTEGER NOT NULL DEFAULT 10
CHECK (anomaly_late_threshold_minutes BETWEEN 0 AND 1440), anomaly_early_threshold_minutes INTEGER NOT NULL DEFAULT 10
CHECK (anomaly_early_threshold_minutes BETWEEN 0 AND 1440), discord_anomaly_reports_enabled INTEGER NOT NULL DEFAULT 0
CHECK (discord_anomaly_reports_enabled IN (0, 1)), discord_anomaly_report_channel_id TEXT, discord_anomaly_reports_enabled_at TEXT, attendance_recent_days INTEGER NOT NULL DEFAULT 30 CHECK (attendance_recent_days BETWEEN 1 AND 365), attendance_policy_activated_on TEXT, kiosk_authentication_method TEXT NOT NULL DEFAULT 'fingerprint'
CHECK(kiosk_authentication_method IN ('fingerprint', 'rfid', 'nfc', 'member_id', 'qr')), discord_block_recontests_after_rejection INTEGER NOT NULL DEFAULT 0 CHECK (discord_block_recontests_after_rejection IN (0, 1)), pin_lockout_enabled INTEGER NOT NULL DEFAULT 0 CHECK (pin_lockout_enabled IN (0, 1)), pin_lockout_attempts INTEGER NOT NULL DEFAULT 5 CHECK (pin_lockout_attempts BETWEEN 3 AND 20), pin_lockout_minutes INTEGER NOT NULL DEFAULT 15 CHECK (pin_lockout_minutes BETWEEN 1 AND 1440));

CREATE TABLE meeting_weight_categories (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(name)) BETWEEN 1 AND 80),
  weight REAL NOT NULL CHECK (weight BETWEEN 0.1 AND 100),
  minimum_duration_minutes INTEGER CHECK (minimum_duration_minutes IS NULL OR minimum_duration_minutes BETWEEN 1 AND 10080),
  position INTEGER NOT NULL CHECK (position >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (installation_id, name)
);

CREATE TABLE carpool_plans (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 150),
  destination TEXT NOT NULL DEFAULT '' CHECK(length(destination)<=300),
  event_reference TEXT CHECK(event_reference IS NULL OR length(event_reference) BETWEEN 1 AND 200),
  event_title_snapshot TEXT CHECK(event_title_snapshot IS NULL OR length(event_title_snapshot)<=150),
  event_starts_at_snapshot TEXT CHECK(event_starts_at_snapshot IS NULL OR datetime(event_starts_at_snapshot) IS NOT NULL),
  radius_miles REAL NOT NULL DEFAULT 12 CHECK(typeof(radius_miles) IN ('integer','real') AND radius_miles BETWEEN 0.5 AND 250),
  preferred_radius_miles REAL NOT NULL DEFAULT 4 CHECK(typeof(preferred_radius_miles) IN ('integer','real') AND preferred_radius_miles BETWEEN 0.5 AND radius_miles),
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision>=0 AND revision<9007199254740991),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, meeting_id TEXT, trip_scope TEXT NOT NULL DEFAULT 'both'
  CHECK(trip_scope IN ('both','outbound','return')), group_settings_json TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(group_settings_json) AND json_type(group_settings_json)='array' AND length(group_settings_json)<=2000000), last_rebuild_json TEXT
  CHECK(last_rebuild_json IS NULL OR (json_valid(last_rebuild_json) AND json_type(last_rebuild_json)='object' AND length(last_rebuild_json)<=6000000)), time_zone TEXT NOT NULL DEFAULT 'UTC'
  CHECK(length(time_zone)>0 AND length(time_zone)<=100), outbound_departure_at TEXT, return_departure_at TEXT,
  PRIMARY KEY(installation_id,id)
);

CREATE TABLE carpool_people (
  installation_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  id TEXT NOT NULL,
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 150),
  contact TEXT NOT NULL DEFAULT '' CHECK(length(contact)<=300),
  source_row INTEGER CHECK(source_row IS NULL OR (typeof(source_row)='integer' AND source_row>=1)),
  import_identity TEXT CHECK(import_identity IS NULL OR length(import_identity) BETWEEN 1 AND 500),
  import_snapshot_json TEXT CHECK(import_snapshot_json IS NULL OR (json_valid(import_snapshot_json) AND json_type(import_snapshot_json)='object')),
  outbound_status TEXT NOT NULL CHECK(outbound_status IN ('offer','arranged','needs-ride','transit','unknown')),
  outbound_address TEXT NOT NULL DEFAULT '' CHECK(length(outbound_address)<=500),
  outbound_lat REAL,
  outbound_lon REAL,
  outbound_seats INTEGER CHECK(outbound_seats IS NULL OR (typeof(outbound_seats)='integer' AND outbound_seats BETWEEN 0 AND 99)),
  return_status TEXT NOT NULL CHECK(return_status IN ('offer','arranged','needs-ride','transit','unknown')),
  return_address TEXT NOT NULL DEFAULT '' CHECK(length(return_address)<=500),
  return_lat REAL,
  return_lon REAL,
  return_seats INTEGER CHECK(return_seats IS NULL OR (typeof(return_seats)='integer' AND return_seats BETWEEN 0 AND 99)),
  return_same_as_outbound INTEGER NOT NULL DEFAULT 1 CHECK(return_same_as_outbound IN (0,1)),
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision>=0 AND revision<9007199254740991),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, outbound_location_source TEXT
  CHECK(outbound_location_source IS NULL OR outbound_location_source IN ('lookup','manual','no-match')), outbound_location_label TEXT
  CHECK(outbound_location_label IS NULL OR length(outbound_location_label)<=500), return_location_source TEXT
  CHECK(return_location_source IS NULL OR return_location_source IN ('lookup','manual','no-match')), return_location_label TEXT
  CHECK(return_location_label IS NULL OR length(return_location_label)<=500),
  PRIMARY KEY(installation_id,plan_id,id),
  FOREIGN KEY(installation_id,plan_id) REFERENCES carpool_plans(installation_id,id) ON DELETE CASCADE,
  CHECK((outbound_lat IS NULL)=(outbound_lon IS NULL)),
  CHECK((return_lat IS NULL)=(return_lon IS NULL)),
  CHECK(outbound_lat IS NULL OR (outbound_lat BETWEEN -90 AND 90 AND outbound_lon BETWEEN -180 AND 180)),
  CHECK(return_lat IS NULL OR (return_lat BETWEEN -90 AND 90 AND return_lon BETWEEN -180 AND 180)),
  CHECK(outbound_status='offer' OR outbound_seats IS NULL),
  CHECK(return_status='offer' OR return_seats IS NULL)
);

CREATE TABLE carpool_assignments (
  installation_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','return')),
  rider_id TEXT NOT NULL,
  vehicle_person_id TEXT NOT NULL,
  distance_miles REAL NOT NULL CHECK(typeof(distance_miles) IN ('integer','real') AND distance_miles>=0),
  locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
  manual INTEGER NOT NULL DEFAULT 0 CHECK(manual IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(installation_id,plan_id,direction,rider_id),
  FOREIGN KEY(installation_id,plan_id,rider_id) REFERENCES carpool_people(installation_id,plan_id,id) ON DELETE CASCADE,
  FOREIGN KEY(installation_id,plan_id,vehicle_person_id) REFERENCES carpool_people(installation_id,plan_id,id) ON DELETE CASCADE,
  CHECK(rider_id<>vehicle_person_id)
);

CREATE TABLE carpool_unresolved (
  installation_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','return')),
  rider_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('needs-review','seat-shortage','no-nearby-car','no-nearby-seat')),
  detail TEXT NOT NULL CHECK(length(detail) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL,
  PRIMARY KEY(installation_id,plan_id,direction,rider_id),
  FOREIGN KEY(installation_id,plan_id,rider_id) REFERENCES carpool_people(installation_id,plan_id,id) ON DELETE CASCADE
);

CREATE TABLE carpool_import_profiles (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  header_key TEXT NOT NULL CHECK(length(header_key) BETWEEN 1 AND 2000),
  mapping_json TEXT NOT NULL CHECK(json_valid(mapping_json) AND json_type(mapping_json)='object'),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(installation_id,header_key)
);

CREATE TABLE carpool_location_cache (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 50),
  normalized_address TEXT NOT NULL CHECK(length(normalized_address) BETWEEN 1 AND 500),
  original_address TEXT NOT NULL CHECK(length(original_address) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK(status IN ('success','no-match')),
  latitude REAL,
  longitude REAL,
  label TEXT CHECK(label IS NULL OR length(label)<=500),
  saved_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY(installation_id,cache_key),
  CHECK((latitude IS NULL)=(longitude IS NULL)),
  CHECK((status='success' AND latitude IS NOT NULL) OR (status='no-match' AND latitude IS NULL))
);

CREATE TABLE carpool_settings (
  installation_id TEXT PRIMARY KEY REFERENCES installations(id) ON DELETE CASCADE,
  radius_miles REAL NOT NULL DEFAULT 12 CHECK(radius_miles BETWEEN 0.5 AND 250),
  preferred_radius_miles REAL NOT NULL DEFAULT 4 CHECK(preferred_radius_miles BETWEEN 0.5 AND radius_miles),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE carpool_geocoding_credentials (
  installation_id TEXT PRIMARY KEY REFERENCES installations(id) ON DELETE CASCADE,
  ciphertext TEXT,
  iv TEXT,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  CHECK((ciphertext IS NULL AND iv IS NULL) OR (ciphertext IS NOT NULL AND iv IS NOT NULL))
);

CREATE TABLE carpool_location_resolution (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  input_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','complete','failed')),
  lease_token TEXT,
  lease_expires_at TEXT,
  error_code TEXT CHECK(error_code IS NULL OR error_code IN ('provider','conflict','interrupted')),
  PRIMARY KEY(installation_id,plan_id),
  FOREIGN KEY(installation_id,plan_id) REFERENCES carpool_plans(installation_id,id) ON DELETE CASCADE,
  CHECK((state='running')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);

CREATE INDEX idx_meetings_installation_starts ON meetings(installation_id, starts_at);

CREATE UNIQUE INDEX idx_one_user_per_member
  ON users(installation_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX idx_meetings_series
ON meetings(installation_id, series_id, starts_at);

CREATE INDEX idx_meetings_active_schedule
ON meetings(installation_id, deleted_at, starts_at);

CREATE INDEX idx_members_installation_required_from
ON members (installation_id, attendance_required_from);

CREATE INDEX idx_meetings_installation_reporting_period
ON meetings (installation_id, starts_at)
WHERE deleted_at IS NULL;

CREATE INDEX idx_members_installation_participation_start
ON members (installation_id, attendance_required_from);

CREATE UNIQUE INDEX idx_members_installation_discord_user
ON members (installation_id, discord_user_id)
WHERE discord_user_id IS NOT NULL;

CREATE INDEX idx_meeting_weight_categories_order
ON meeting_weight_categories (installation_id, active, position, name);

CREATE INDEX carpool_plan_catalog ON carpool_plans(installation_id,archived,updated_at,id);

CREATE INDEX carpool_people_plan ON carpool_people(installation_id,plan_id,display_name,id);

CREATE INDEX carpool_people_member ON carpool_people(installation_id,member_id,plan_id);

CREATE UNIQUE INDEX carpool_people_import_identity ON carpool_people(installation_id,plan_id,import_identity) WHERE import_identity IS NOT NULL;

CREATE INDEX carpool_assignment_vehicle ON carpool_assignments(installation_id,plan_id,direction,vehicle_person_id);

CREATE INDEX carpool_location_address ON carpool_location_cache(installation_id,provider,normalized_address);

CREATE INDEX carpool_plans_meeting_reference
  ON carpool_plans(installation_id,meeting_id,archived);
