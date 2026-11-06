
CREATE TABLE IF NOT EXISTS users (
  anon_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS private_messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS pm_pair_time ON private_messages(sender_id, recipient_id, created_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  public_result TEXT,
  reporter_note TEXT,
  target_note TEXT,
  internal_note TEXT,
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
CREATE INDEX IF NOT EXISTS reports_status_time ON reports(status, created_at);
CREATE TABLE IF NOT EXISTS sanctions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  ip_hash TEXT,
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  report_id TEXT,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sanctions_user ON sanctions(user_id, active);
CREATE INDEX IF NOT EXISTS sanctions_ip ON sanctions(ip_hash, active);
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_id TEXT,
  title TEXT NOT NULL,
  result TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notices_user_time ON notices(user_id, created_at);
CREATE TABLE IF NOT EXISTS visitor_logs (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  anon_id TEXT,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS visitor_logs_time ON visitor_logs(created_at);
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  anon_id TEXT,
  ip_hash TEXT,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS security_events_time ON security_events(created_at);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  created_at INTEGER NOT NULL
);
