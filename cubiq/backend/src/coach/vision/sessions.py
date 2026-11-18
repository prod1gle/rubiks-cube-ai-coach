"""Append-only camera evidence and explicitly confirmed canonical transitions."""

import hashlib
import json
from uuid import uuid4

from fastapi import HTTPException

from coach.analysis.service import display, progress
from coach.cube import CubeError, CubeState, sequence_info
from coach.recordings.analytics import stage_checkpoints
from coach.storage.database import encode, now
from coach.vision.scanning import FACES, ORIENTATIONS
from coach.vision.tracking import VERSION, calibrated_samples, observe


def load(db, identifier):
    row = db.execute("SELECT * FROM camera_sessions WHERE id=?", (identifier,)).fetchone()
    if row is None:
        raise HTTPException(404, "Camera session not found.")
    events = [
        {
            "index": r["ordinal"],
            "kind": r["kind"],
            "clock_id": r["clock_id"],
            "at_ms": r["observed_at_ms"],
            "data": json.loads(r["payload_json"]),
        }
        for r in db.execute(
            "SELECT * FROM camera_events WHERE session_id=? ORDER BY ordinal", (identifier,)
        )
    ]
    state = CubeState.from_dict(json.loads(row["initial_state_json"]))
    uncertain, stopped = False, False
    for event in events:
        data = event["data"]
        if event["kind"] == "confirmed":
            if state.state_hash != data["before_hash"]:
                raise CubeError("camera_record", "Camera history failed canonical reconstruction.")
            state = state.apply(data["notation"])
            if state.state_hash != data["after_hash"]:
                raise CubeError("camera_record", "Camera history ending hash is inconsistent.")
        elif event["kind"] in ("gap", "observation"):
            uncertain |= event["kind"] == "gap" or data.get("status") == "suspended"
        elif event["kind"] == "resync":
            state = CubeState.from_dict(data["state"])
            uncertain = False
        elif event["kind"] == "stop":
            stopped = True
    return row, events, state, uncertain, stopped


def view_from(row, events, state, uncertain, stopped):
    latest = next((e for e in reversed(events) if e["kind"] == "observation"), None)
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "revision": len(events),
        "version": row["version"],
        "snapshot": display(state),
        "needs_sync": uncertain,
        "stopped": stopped,
        "latest_observation": latest,
        "events": events[-100:],
        "timing_integrity": "uncertain",
        "physical_tps": None,
        "calibration": next(
            (
                e["data"]["calibration"]
                for e in reversed(events)
                if e["kind"] == "resync" and e["data"].get("calibration")
            ),
            json.loads(row["calibration_json"]),
        ),
        "orientation_guide": {
            f: {
                "center": state.frame[i],
                "top": state.frame[FACES.index(ORIENTATIONS[f][0])],
                "right": state.frame[FACES.index(ORIENTATIONS[f][1])],
            }
            for i, f in enumerate(FACES)
        },
        "note": (
            "Confirmed canonical moves only. Physical move completeness and "
            "exact turn timing are unverified."
        ),
    }


def create(database, initial, calibration):
    calibrated_samples([], calibration)
    with database.connect() as db:
        identifier = str(uuid4())
        db.execute(
            "INSERT INTO camera_sessions VALUES(?,?,?,?,?)",
            (identifier, now(), encode(initial.to_dict()), encode(calibration), VERSION),
        )
        return view_from(*load(db, identifier))


def view(database, identifier):
    with database.connect() as db:
        return view_from(*load(db, identifier))


def listing(database):
    with database.connect() as db:
        ids = [
            r[0]
            for r in db.execute(
                "SELECT id FROM camera_sessions ORDER BY created_at DESC,id LIMIT 100"
            )
        ]
    return {
        "items": [
            {k: v[k] for k in ("id", "created_at", "revision", "needs_sync", "stopped")}
            for identifier in ids
            if (v := view(database, identifier))
        ]
    }


def append(db, identifier, events, kind, clock_id, at_ms, data):
    db.execute(
        "INSERT INTO camera_events VALUES(?,?,?,?,?,?)",
        (identifier, len(events), kind, clock_id, at_ms, encode(data)),
    )
    events.append(
        {"index": len(events), "kind": kind, "clock_id": clock_id, "at_ms": at_ms, "data": data}
    )


def change(database, identifier, revision, clock_id, at_ms, action, body):
    with database.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row, events, state, uncertain, stopped = load(db, identifier)
        if revision != len(events):
            raise HTTPException(409, "Session changed. Reload the latest state before retrying.")
        if stopped:
            raise HTTPException(409, "This camera session has ended. Start a new session.")
        required = 2 if action == "resync" else 1
        if action != "stop" and len(events) + required > 4096:
            raise HTTPException(
                409, "Session evidence limit reached. End this session and start another."
            )
        same_clock = not events or events[-1]["clock_id"] == clock_id
        if same_clock and events and at_ms < events[-1]["at_ms"]:
            raise CubeError(
                "camera_time", "Observation timestamps must be monotonic within one browser clock."
            )
        if not same_clock and action not in ("resync", "gap", "stop"):
            raise HTTPException(
                409, "Browser clock changed. Confirm alignment or rescan before resuming."
            )
        if action == "observe":
            previous = events[-1] if events and events[-1]["kind"] == "observation" else None
            previous_data = (
                {**previous["data"], "at_ms": previous["at_ms"]}
                if previous and previous["clock_id"] == clock_id
                else None
            )
            result = observe(
                state,
                next(
                    (
                        e["data"]["calibration"]
                        for e in reversed(events)
                        if e["kind"] == "resync" and e["data"].get("calibration")
                    ),
                    json.loads(row["calibration_json"]),
                ),
                body.face,
                body.image,
                previous_data,
                at_ms,
            )
            result["image_sha256"] = hashlib.sha256(body.image.encode()).hexdigest()
            append(db, identifier, events, "observation", clock_id, at_ms, result)
        elif action == "confirm":
            if uncertain:
                raise HTTPException(
                    409, "Logging suspended. Explicitly restore alignment or rescan first."
                )
            if not events or events[-1]["kind"] != "observation":
                raise HTTPException(409, "Capture fresh evidence before confirming a move.")
            evidence = events[-1]
            result = evidence["data"]
            if (
                evidence["index"] != body.observation_index
                or result["input_hash"] != state.state_hash
            ):
                raise HTTPException(409, "Evidence is stale. Capture the current view again.")
            if at_ms - evidence["at_ms"] > 30000:
                raise HTTPException(
                    409, "Observation expired. Capture fresh evidence before confirming."
                )
            if result["stable_frames"] < 3 or result["status"] not in (
                "awaiting_confirmation",
                "visible_unchanged",
            ):
                raise HTTPException(
                    409, "Insufficient stable evidence; use explicit recovery or rescan."
                )
            if not body.token or body.token not in [m["token"] for m in result["matches"]]:
                raise CubeError(
                    "camera_candidate",
                    "Confirm one of the legal candidates supported by this observation.",
                )
            if not body.confirmed_single_action:
                raise CubeError(
                    "camera_confirmation",
                    "Confirm that exactly this action occurred, with no other or hidden turns.",
                )
            after = state.apply(body.token)
            append(
                db,
                identifier,
                events,
                "confirmed",
                clock_id,
                at_ms,
                {
                    "notation": body.token,
                    "before_hash": state.state_hash,
                    "after_hash": after.state_hash,
                    "observation_index": evidence["index"],
                    "observed_at_ms": evidence["at_ms"],
                    "physical_turn_at_ms": None,
                    "confidence": min(result["confidence"]),
                    "source": "camera-assisted-manual-confirmation",
                    "automatic": False,
                },
            )
        elif action == "gap":
            append(db, identifier, events, "gap", clock_id, at_ms, {"reason": body.reason})
        elif action == "resync":
            if not body.confirmed_alignment:
                raise CubeError(
                    "camera_confirmation",
                    "Check the physical cube matches the displayed state before resuming.",
                )
            if body.facelets is not None:
                from coach.vision.scanning import validate_scan

                replacement = CubeState.from_dict(validate_scan(body.facelets)["snapshot"]["state"])
                if body.calibration is None:
                    raise CubeError(
                        "calibration", "A fresh rescan requires its fresh six-center calibration."
                    )
                calibrated_samples([], body.calibration)
            else:
                replacement = state.apply(body.manual_sequence)
            # Always record the uncertain boundary. No missing moves are invented.
            append(
                db,
                identifier,
                events,
                "gap",
                clock_id,
                at_ms,
                {"reason": "Explicit recovery; physical continuity/timing uncertain."},
            )
            append(
                db,
                identifier,
                events,
                "resync",
                clock_id,
                at_ms,
                {
                    "state": replacement.to_dict(),
                    "calibration": body.calibration if body.facelets is not None else None,
                    "before_hash": state.state_hash,
                    "method": "guided-rescan" if body.facelets is not None else "manual-alignment",
                    "manual_sequence": body.manual_sequence if body.facelets is None else None,
                    "note": "Operator confirmed alignment; unknown turns are not reconstructed.",
                },
            )
        elif action == "stop":
            append(
                db,
                identifier,
                events,
                "stop",
                clock_id,
                at_ms,
                {"reason": "Operator ended capture."},
            )
        else:
            raise HTTPException(404, "Unknown camera action.")
        return view_from(*load(db, identifier))


def report(database, identifier):
    with database.connect() as db:
        row, events, state, uncertain, stopped = load(db, identifier)
    initial = CubeState.from_dict(json.loads(row["initial_state_json"]))
    current, segments, moves, checkpoints, start = initial, [], [], [], initial
    known_events, states = [], [initial]

    def close():
        if moves:
            stages = stage_checkpoints(states, known_events, [], False)[0]
            segments.append(
                {
                    "initial": display(start),
                    "notation": " ".join(moves),
                    "final_hash": current.state_hash,
                    "actions": len(moves),
                    "metrics": sequence_info(" ".join(moves)),
                    "stages": stages,
                }
            )

    for event in events:
        if event["kind"] == "confirmed":
            before = progress(current)
            current = current.apply(event["data"]["notation"])
            moves.append(event["data"]["notation"])
            info = sequence_info(event["data"]["notation"])
            known_events.append(
                {
                    "at_ms": event["data"]["observed_at_ms"],
                    "htm": info["htm"],
                    "rotation": bool(info["rotations"]),
                }
            )
            states.append(current)
            after = progress(current)
            goals = [
                k for k in ("cross", "f2l", "oll", "pll", "solved") if after[k] and not before[k]
            ]
            goals += ["F2L-" + k for k, v in after["pairs"].items() if v and not before["pairs"][k]]
            checkpoints.append(
                {
                    "event": event["index"],
                    "goals": goals,
                    "snapshot": display(current),
                    "observed_at_ms": event["data"]["observed_at_ms"],
                    "stage_duration_ms": None,
                }
            )
        elif event["kind"] in ("gap", "resync") or (
            event["kind"] == "observation" and event["data"]["status"] == "suspended"
        ):
            close()
            moves = []
            if event["kind"] == "resync":
                current = CubeState.from_dict(event["data"]["state"])
            start = current
            known_events, states = [], [current]
    close()
    return {
        "id": identifier,
        "version": VERSION,
        "initial": display(initial),
        "final": display(state),
        "segments": segments,
        "checkpoints": checkpoints,
        "needs_sync": uncertain,
        "stopped": stopped,
        "confirmed_htm": sum(s["metrics"]["htm"] for s in segments),
        "gap_count": sum(
            e["kind"] == "gap"
            or (e["kind"] == "observation" and e["data"]["status"] == "suspended")
            for e in events
        ),
        "physical_total_moves": None,
        "physical_tps": None,
        "stage_durations": None,
        "processing_ms": [e["data"]["processing_ms"] for e in events if e["kind"] == "observation"],
        "notes": [
            "Physical timing and move completeness are uncertain; no PB/TPS eligibility.",
            "Retrospective comparisons apply only within confirmed contiguous segments.",
            "Capture/processing timestamps are not measured physical turn timestamps.",
        ],
    }
