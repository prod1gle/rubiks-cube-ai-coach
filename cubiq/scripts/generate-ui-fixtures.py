"""Capture actual engine API data for frontend transport/sequencer tests, not an oracle.

Run from repository root with cubiq/backend/.venv/bin/python.
"""
import json
from pathlib import Path

from coach.cube import CubeState, plan_sequence, sequence_info

solved = CubeState()
sequence = "R U R' U'"
snapshots = {
    "solved": solved.snapshot() | {"sequence": sequence_info("")},
    "moved": solved.apply(sequence).snapshot() | {"sequence": sequence_info(sequence)},
    "rotated": solved.apply("x").snapshot() | {"sequence": sequence_info("x")},
    "restored": solved.snapshot() | {"sequence": sequence_info(sequence_info(sequence)["inverse"])},
}
plans = {
    "r": plan_sequence(solved, "R"),
    "u": plan_sequence(solved, "U"),
    "uAfterR": plan_sequence(solved.apply("R"), "U"),
    "fAfterR": plan_sequence(solved.apply("R"), "F"),
    "inverseR": plan_sequence(solved, "R'"),
    "doubleR": plan_sequence(solved, "R2"),
    "rotation": plan_sequence(solved, "x"),
    "algorithm": plan_sequence(solved, sequence),
    "scramble": plan_sequence(solved, "R U2 F B2 L D' R2 F2 U B L2 D F' R U' L B' D2 R' F"),
}
for name, value in (("cube-fixtures", snapshots), ("cube-plans", plans)):
    Path(f"cubiq/src/test/{name}.json").write_text(json.dumps(value, separators=(",", ":")) + "\n")
