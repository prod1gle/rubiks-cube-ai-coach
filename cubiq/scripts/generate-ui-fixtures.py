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

from coach.cfop.registry import WHITE_DOWN_FRAME as W
from coach.coaching.service import recommend
from coach.cube import inverse_sequence

def display(state):
    return state.snapshot() | {"sequence": sequence_info("")}

physical = solved.apply(inverse_sequence("B U B'")).in_reference(W)
back = CubeState(physical.cp, physical.co, physical.ep, physical.eo, W)
partial = solved.apply("R U R' L U2 L' B U B'").in_reference(W)
first = plan_sequence(back, "y")
manual = plan_sequence(back, "U")
back_hint = recommend(back)
coaching = {
    "back": {
        "snapshot": display(back), "hint": back_hint,
        "firstPlan": first, "afterFirstHint": recommend(back.apply("y"), continuation={"start_state": back.to_dict(), "candidate_id": back_hint["recommended_id"], "consumed": 1}),
        "secondPlan": plan_sequence(back.apply("y"), "R"),
        "afterSecondHint": recommend(back.apply("y R"), continuation={"start_state": back.to_dict(), "candidate_id": back_hint["recommended_id"], "consumed": 2}),
        "manualPlan": manual, "afterManualHint": recommend(back.apply("U")),
        "fullPlan": plan_sequence(back, back_hint["candidates"][0]["notation"]),
        "afterFullHint": recommend(back.apply(back_hint["candidates"][0]["notation"])),
        "htmHint": recommend(back, ranking="htm"), "shortHint": recommend(back, mode="short"),
    },
    "partial": {"snapshot": display(partial), "hint": recommend(partial)},
    "solved": recommend(solved),
}
for group in (coaching["back"], coaching["partial"]):
    for key, value in group.items():
        if isinstance(value, dict) and "elapsed_ms" in value:
            value["elapsed_ms"] = 12.0
coaching["solved"]["elapsed_ms"] = 12.0
Path("cubiq/src/test/cube-coaching.json").write_text(json.dumps(coaching, separators=(",", ":")) + "\n")
