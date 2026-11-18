CREATE TABLE camera_sessions (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, initial_state_json TEXT NOT NULL,
 calibration_json TEXT NOT NULL, version TEXT NOT NULL
);
CREATE TABLE camera_events (
 session_id TEXT NOT NULL REFERENCES camera_sessions(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, kind TEXT NOT NULL, clock_id TEXT NOT NULL,
 observed_at_ms REAL NOT NULL, payload_json TEXT NOT NULL,
 PRIMARY KEY(session_id, ordinal)
);
CREATE INDEX camera_created ON camera_sessions(created_at DESC, id);
