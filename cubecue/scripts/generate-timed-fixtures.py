"""SYNTHETIC TEST DATA ONLY: invented timestamps around real engine transitions.

Never imported by runtime application code, never claimed as measured practice.
"""
import json
from pathlib import Path

from coach.analysis.service import display, compare
from coach.cube import CubeState, parse_sequence, plan_sequence
from coach.recordings.analytics import analyze

initial = CubeState().apply("z2 B U' B'")
state, events = initial, []
word = "y R U R'"
for move, at in zip(parse_sequence(word), [100, 500, 2000, 2500], strict=True):
    before = state.state_hash
    state = state.apply((move,))
    events.append({"token": str(move), "at_ms": at, "ack_ms": at + 100,
                   "before_hash": before, "after_hash": state.state_hash})
raw = {"schema_version": 1, "source": "manual-virtual", "clock_source": "performance.now",
       "clock_id": "SYNTHETIC-TEST-CLOCK", "started_mono_ms": 10000,
       "initial_state": initial.to_dict(), "events": events,
       "pauses": [{"start_ms": 1000, "end_ms": 1500}], "elapsed_ms": 2500,
       "inspection_ms": 12000, "status": "complete", "timing_integrity": "valid",
       "integrity_notes": [], "expected_end_hash": state.state_hash}
uncertain = raw | {"timing_integrity": "uncertain", "integrity_notes": ["SYNTHETIC interrupted-clock test"]}
r = CubeState().apply("R")
value = {"test_data": True, "description": "Synthetic timestamps, engine-derived states. Not a measured solve.",
         "recording": raw, "analytics": analyze(raw), "uncertain": analyze(uncertain),
         "comparison": compare(initial, word, 0, 4, "cfop"), "initial": display(initial), "r": display(r), "inverseR": plan_sequence(r, "R'"),
         "plans": [plan_sequence(initial.apply(" ".join(word.split()[:i])), token) for i, token in enumerate(word.split())],
         "checkpoint1": display(initial.apply("y"))}
Path("cubecue/src/test/timed-recording.json").write_text(json.dumps(value, separators=(",", ":")) + "\n")
