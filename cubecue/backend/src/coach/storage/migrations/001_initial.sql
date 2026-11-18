CREATE TABLE solves (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, raw_hash TEXT NOT NULL,
 recording_json TEXT NOT NULL, initial_state_json TEXT NOT NULL,
 source TEXT NOT NULL, status TEXT NOT NULL
);
CREATE TABLE moves (
 solve_id TEXT NOT NULL REFERENCES solves(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, token TEXT NOT NULL, at_ms REAL NOT NULL,
 ack_ms REAL NOT NULL, before_hash TEXT NOT NULL, after_hash TEXT NOT NULL,
 confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
 PRIMARY KEY(solve_id, ordinal)
);
CREATE TABLE analyses (
 solve_id TEXT NOT NULL REFERENCES solves(id) ON DELETE CASCADE,
 version TEXT NOT NULL, created_at TEXT NOT NULL, result_json TEXT NOT NULL,
 PRIMARY KEY(solve_id, version)
);
CREATE TABLE practice_attempts (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, case_id TEXT NOT NULL,
 version TEXT NOT NULL, initial_state_json TEXT NOT NULL, notation TEXT NOT NULL,
 result_json TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX solves_created ON solves(created_at DESC, id);
CREATE INDEX practice_case ON practice_attempts(case_id, created_at);
