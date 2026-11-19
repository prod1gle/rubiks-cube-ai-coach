"""Operator-timed physical practice, kept separate from canonical move recordings."""

import json

from fastapi import HTTPException

from coach.storage.database import encode, now


def save(database, record):
    raw = encode(record)
    with database.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute(
            "SELECT recording_json FROM physical_solves WHERE id=?", (record["id"],)
        ).fetchone()
        if existing and existing[0] != raw:
            raise HTTPException(409, "Physical recording ID already contains different data.")
        db.execute(
            "INSERT OR IGNORE INTO physical_solves VALUES(?,?,?)", (record["id"], now(), raw)
        )
    return {"saved": record["id"]}


def listing(database):
    with database.connect() as db:
        rows = db.execute(
            "SELECT * FROM physical_solves ORDER BY created_at DESC,id LIMIT 200"
        ).fetchall()
        total = db.execute("SELECT count(*) FROM physical_solves").fetchone()[0]
    items = [{**json.loads(r["recording_json"]), "created_at": r["created_at"]} for r in rows]
    eligible = [
        r["elapsed_ms"]
        for r in items
        if r["timing_integrity"] == "valid" and r["status"] == "stopped" and r["elapsed_ms"] > 0
    ]
    return {
        "items": items,
        "total": total,
        "personal_best_ms": min(eligible, default=None),
        "mean_ms": sum(eligible) / len(eligible) if eligible else None,
        "sample_count": len(eligible),
        "scope": (
            "Latest 200 operator-timed physical practice records. "
            "Valid uninterrupted stopped runs only; solvedness unverified. "
            "No competition averages or move analysis."
        ),
    }
