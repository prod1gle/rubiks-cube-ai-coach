CREATE TABLE physical_solves (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, recording_json TEXT NOT NULL
);
CREATE INDEX physical_created ON physical_solves(created_at DESC, id);
