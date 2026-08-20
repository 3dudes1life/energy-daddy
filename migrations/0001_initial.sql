PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'site',
  status TEXT NOT NULL DEFAULT 'planned',
  last_seen_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS telemetry_15m (
  interval_start TEXT NOT NULL,
  interval_end TEXT NOT NULL,
  source_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  energy_wh REAL NOT NULL DEFAULT 0,
  power_avg_w REAL,
  quality TEXT NOT NULL DEFAULT 'measured',
  scope TEXT NOT NULL DEFAULT 'site',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(interval_start,source_id,metric,scope)
);
CREATE INDEX IF NOT EXISTS idx_telemetry_metric_time ON telemetry_15m(metric,interval_start);
CREATE INDEX IF NOT EXISTS idx_telemetry_source_time ON telemetry_15m(source_id,interval_start);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  range_start TEXT,
  range_end TEXT,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'staged',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS forecasts (
  generated_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  horizon TEXT NOT NULL,
  value REAL,
  low REAL,
  high REAL,
  confidence REAL,
  model_version TEXT NOT NULL,
  explanation TEXT,
  PRIMARY KEY(generated_at,kind,horizon)
);
INSERT OR IGNORE INTO sources(id,provider,kind,scope,status,metadata_json) VALUES
('sdge-meter','SDG&E','utility_meter','site','planned','{"cadence":"15m","role":"settlement"}'),
('tesla-site','Tesla','battery_site','site','planned','{"cadence":"5m","role":"live"}'),
('solaredge-site','SolarEdge','solar','inverter','planned','{"role":"production"}'),
('emporia-ev','Emporia','circuit','ev_charger','loaded','{"role":"load_attribution"}');
