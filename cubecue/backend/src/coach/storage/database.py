"""Small transactional repository, using a fresh connection for every operation."""

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from importlib.resources import files
from pathlib import Path

from fastapi import HTTPException

from coach.cfop.registry import VERSION as CATALOG_VERSION
from coach.cube import ENGINE_VERSION
from coach.recordings import analytics


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def now():
    return datetime.now(UTC).isoformat()


def analysis_version():
    return f"{ENGINE_VERSION}/{CATALOG_VERSION}/{analytics.VERSION}"


class Database:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY)")
            # BEGIN IMMEDIATE serializes competing app starts. DDL and migration
            # marker commit together; never use executescript's implicit commit.
            db.execute("BEGIN IMMEDIATE")
            for item in sorted(files("coach.storage").joinpath("migrations").iterdir()):
                version = int(item.name.split("_")[0])
                if not db.execute(
                    "SELECT 1 FROM schema_migrations WHERE version=?", (version,)
                ).fetchone():
                    for statement in item.read_text().split(";"):
                        if statement.strip():
                            db.execute(statement)
                    db.execute("INSERT INTO schema_migrations VALUES(?)", (version,))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def save_solve(self, identifier, record):
        result = analytics.analyze(record)
        raw = encode(record)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT raw_hash FROM solves WHERE id=?", (identifier,)
            ).fetchone()
            if existing and existing[0] != digest:
                raise HTTPException(
                    409, "This recording ID already contains different immutable data."
                )
            if not existing:
                db.execute(
                    "INSERT INTO solves VALUES(?,?,?,?,?,?,?)",
                    (
                        identifier,
                        now(),
                        digest,
                        raw,
                        encode(record["initial_state"]),
                        record["source"],
                        record["status"],
                    ),
                )
                db.executemany(
                    "INSERT INTO moves VALUES(?,?,?,?,?,?,?,?)",
                    [
                        (
                            identifier,
                            i,
                            e["token"],
                            e["at_ms"],
                            e["ack_ms"],
                            e["before_hash"],
                            e["after_hash"],
                            None,
                        )
                        for i, e in enumerate(record["events"])
                    ],
                )
            self._analysis(db, identifier, result)
        return self.get(identifier)

    def _analysis(self, db, identifier, result):
        db.execute(
            "INSERT OR IGNORE INTO analyses VALUES(?,?,?,?)",
            (
                identifier,
                analysis_version(),
                now(),
                encode(result),
            ),
        )

    def get(self, identifier, reanalyze=False):
        with self.connect() as db:
            row = db.execute("SELECT * FROM solves WHERE id=?", (identifier,)).fetchone()
            if row is None:
                raise HTTPException(404, "Solve not found.")
            raw = json.loads(row["recording_json"])
            if reanalyze:
                self._analysis(db, identifier, analytics.analyze(raw))
            runs = db.execute(
                "SELECT version,result_json FROM analyses WHERE solve_id=? "
                "ORDER BY created_at DESC,version",
                (identifier,),
            ).fetchall()
        selected = next((r for r in runs if r["version"] == analysis_version()), runs[0])
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "recording": raw,
            "analysis": json.loads(selected["result_json"]),
            "analysis_version": selected["version"],
            "current_version": analysis_version(),
            "versions": [r["version"] for r in runs],
        }

    def list(self, limit=100, offset=0):
        with self.connect() as db:
            ids = db.execute(
                "SELECT id FROM solves ORDER BY created_at DESC,id LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            total = db.execute("SELECT count(*) FROM solves").fetchone()[0]
        rows = [self.get(row[0]) for row in ids]
        return {
            "total": total,
            "items": [
                {k: r[k] for k in ("id", "created_at", "analysis_version")}
                | {
                    "status": r["recording"]["status"],
                    "source": r["recording"]["source"],
                    "summary": r["analysis"]["summary"],
                }
                for r in rows
            ],
        }

    def delete(self, identifier):
        with self.connect() as db:
            if not db.execute("DELETE FROM solves WHERE id=?", (identifier,)).rowcount:
                raise HTTPException(404, "Solve not found.")
        return {"deleted": identifier}

    def dashboard(self):
        # All completed manual runs contribute move counts; only valid positive
        # timing contributes PB/TPS. Stopped, uncertain, and camera data excluded.
        with self.connect() as db:
            ids = db.execute(
                "SELECT id FROM solves WHERE status='complete' AND source='manual-virtual' "
                "ORDER BY created_at,id"
            ).fetchall()
            total = db.execute("SELECT count(*) FROM solves").fetchone()[0]
            attempts = db.execute("SELECT count(*) FROM practice_attempts").fetchone()[0]
        rows = [self.get(i[0]) for i in ids]
        valid = [
            r
            for r in rows
            if r["analysis"]["summary"]["elapsed_ms"]
            and r["analysis"]["summary"]["tps"] is not None
        ]

        def avg(values):
            return sum(values) / len(values) if values else None

        return {
            "total_records": total,
            "completed_solves": len(rows),
            "timed_sample_count": len(valid),
            "practice_attempts": attempts,
            "personal_best_ms": min(
                (r["analysis"]["summary"]["elapsed_ms"] for r in valid), default=None
            ),
            "average_tps": avg([r["analysis"]["summary"]["tps"] for r in valid]),
            "average_htm": avg([r["analysis"]["summary"]["htm"] for r in rows]),
            "trends": [
                {
                    "id": r["id"],
                    "created_at": r["created_at"],
                    **{k: r["analysis"]["summary"][k] for k in ("elapsed_ms", "htm", "tps")},
                }
                for r in rows
            ],
            "scope": (
                "Completed manual virtual solves; valid timing only for PB/TPS. "
                "Arithmetic per-solve means; no competition averages."
            ),
        }

    def save_practice(self, identifier, case_id, version, initial, notation, result):
        data = (case_id, version, encode(initial), notation, encode(result), "manual-virtual")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT case_id,version,initial_state_json,notation,result_json,source "
                "FROM practice_attempts WHERE id=?",
                (identifier,),
            ).fetchone()
            if existing and tuple(existing) != data:
                raise HTTPException(409, "Attempt ID already used for different data.")
            db.execute(
                "INSERT OR IGNORE INTO practice_attempts VALUES(?,?,?,?,?,?,?,?)",
                (identifier, now(), *data),
            )
        return {"id": identifier, **result}
