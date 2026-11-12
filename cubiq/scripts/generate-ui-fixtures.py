"""Capture actual engine API data for frontend transport/sequencer tests, not an oracle.

Run from repository root with cubiq/backend/.venv/bin/python.
"""
import json
from pathlib import Path

from coach.cube import CubeState, plan_sequence, sequence_info
from coach.solvers.two_phase import solve_cube
from coach.cfop.service import solve_cfop

solved = CubeState()
sequence = "R U R' U'"
snapshots = {
    "solved": solved.snapshot() | {"sequence": sequence_info("")},
    "moved": solved.apply(sequence).snapshot() | {"sequence": sequence_info(sequence)},
    "cfopScrambled": solved.apply("x R U2 F' L D B2").snapshot() | {"sequence": sequence_info("x R U2 F' L D B2")},
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

# These are actual verified adapter responses for UI transport tests. Elapsed
# time is deliberately normalized only in test data, never in the application.
solutions = {"r": solve_cube(solved.apply("R")), "solved": solve_cube(solved)}
for solution in solutions.values():
    solution["elapsed_ms"] = 123.0
Path("cubiq/src/test/cube-solutions.json").write_text(json.dumps(solutions, separators=(",", ":")) + "\n")

cfop = {"r": solve_cfop(solved.apply("R")), "scrambled": solve_cfop(solved.apply("x R U2 F' L D B2")), "solved": solve_cfop(solved)}
for result in cfop.values():
    result["elapsed_ms"] = 234.0
Path("cubiq/src/test/cube-cfop.json").write_text(json.dumps(cfop, separators=(",", ":")) + "\n")
