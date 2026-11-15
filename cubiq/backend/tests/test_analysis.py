"""Recorded boundaries, shared goals, protected slots and honest count comparisons."""

import random

import pytest
from fastapi.testclient import TestClient

from coach.analysis import service
from coach.cfop.registry import WHITE_DOWN_FRAME as W
from coach.coaching.service import recommend
from coach.cube import VALID_FRAMES, CubeError, CubeState, parse_sequence
from coach.main import create_app

BACK = CubeState().apply("z2 B U' B'")
ACTUAL = "B U U U U U B'"
PARTIAL = CubeState().apply("R U R' L U2 L' B U B'").in_reference(W)


def verify(reply):
    start = CubeState.from_dict(reply["start"]["state"])
    for branch in [reply["actual"], *reply["alternatives"]]:
        after = start.apply(branch["notation"])
        assert after.to_dict() == branch["end"]["state"]
        assert service.meets(after, reply["goal"])
        assert branch["verified"] and branch["optimality"] == "unproven"
        assert branch["plan"]["input_hash"] == start.state_hash
        assert branch["metrics"]["htm"] == sum(s["htm"] for s in branch["plan"]["steps"])
        assert branch["metrics"]["rotations"] == sum(s["rotation"] for s in branch["plan"]["steps"])
        current = start
        for step in branch["plan"]["steps"]:
            assert step["before_hash"] == current.state_hash
            current = current.apply(step["token"])
            assert current.to_dict() == step["snapshot"]["state"]
        assert branch["same_position"] == (
            after.position_hash == reply["actual"]["end"]["position_hash"]
        )
        assert branch["same_state"] == (after.state_hash == reply["actual"]["end"]["state_hash"])


@pytest.mark.parametrize("frame", sorted(VALID_FRAMES))
def test_exact_reconstruction_keeps_all_grips_and_selected_boundaries(frame):
    initial = CubeState(frame=frame).apply("F R2")
    word = "x U R' y2 F2 D z' L B2"
    before, after, final, moves = service.reconstruct(initial, word, 2, 7)
    assert before == initial.apply("x U")
    assert after == initial.apply("x U R' y2 F2 D z'")
    assert final == initial.apply(word)
    assert len(moves) == 9


@pytest.mark.parametrize("objective", ["fewest", "cfop", "training"])
def test_rotation_friendly_solved_case_and_exact_counts(objective):
    reply = service.compare(BACK, ACTUAL, 0, 7, objective)
    verify(reply)
    assert reply["goal"]["kind"] == "solve"
    assert reply["actual"]["metrics"]["htm"] == 7
    assert reply["goal"]["protected_slots"] == ["FR", "FL", "BL"]
    if objective == "training":
        chosen = reply["alternatives"][0]
        assert chosen["notation"] == "y R U R'"
        assert chosen["difference"] == {
            "htm_saved": 4,
            "rotations_saved": -1,
            "comfort_points_saved": 6,
        }
    if objective == "cfop":
        assert reply["alternatives"][0]["notation"] == "B U B'"
        assert reply["alternatives"][0]["staged"]
    assert all(a["metrics"]["htm"] >= 0 for a in reply["alternatives"])
    assert "seconds saved are unknown" in " ".join(reply["annotations"])


def test_cross_plus_one_pair_preserves_fl_and_compares_the_same_target_slots():
    opening = recommend(PARTIAL)["candidates"][0]["notation"]
    word = opening + " U U U U"
    reply = service.compare(PARTIAL, word, 0, len(parse_sequence(word)), "cfop")
    verify(reply)
    assert reply["goal"]["kind"] == "f2l"
    assert reply["goal"]["protected_slots"] == ["FL"]
    assert reply["alternatives"]
    for branch in reply["alternatives"]:
        p = service.progress(CubeState.from_dict(branch["end"]["state"]))
        assert p["cross"] and p["pairs"]["FL"]
        assert all(p["pairs"][slot] for slot in reply["goal"]["slots"])
    assert any(not a["same_position"] for a in reply["alternatives"])


@pytest.mark.parametrize("word", ["R U x", "x R U z", "R R' y2", "U2 D F F' x'"])
def test_arbitrary_endpoint_bridge_matches_physical_state_despite_grip(word):
    reply = service.compare(CubeState(), word, 0, len(parse_sequence(word)), requested="position")
    verify(reply)
    assert reply["goal"]["kind"] == "position"
    assert all(c["same_position"] for c in reply["alternatives"])


@pytest.mark.parametrize(
    "word,expected", [("R R R R", ""), ("R2 R' U U'", "R"), ("x x' F2 F2", "")]
)
def test_simplification_is_engine_equivalent_in_all_frames(word, expected):
    assert service.simplify(word) == expected
    for frame in VALID_FRAMES:
        state = CubeState(frame=frame)
        assert state.apply(word) == state.apply(expected)


def test_1024_action_record_and_selected_128_action_segment():
    word = " ".join(["R", "R'"] * 512)
    before, after, final, moves = service.reconstruct(CubeState(), word, 896, 1024)
    assert before.is_solved and after.is_solved and final.is_solved and len(moves) == 1024
    reply = service.compare(CubeState(), word, 896, 1024)
    assert reply["alternatives"][0]["notation"] == ""
    verify(reply)


@pytest.mark.parametrize("start,end", [(0, 0), (1, 1), (2, 1), (0, 4), (-1, 2)])
def test_invalid_segment_never_invents_a_start(start, end):
    with pytest.raises(CubeError, match="Select a nonempty segment"):
        service.reconstruct(CubeState(), "R U F", start, end)


def test_record_limits_and_mismatched_final_hash_are_rejected():
    with pytest.raises(CubeError, match="128 actions"):
        service.reconstruct(CubeState(), "R " * 129, 0, 129)
    with pytest.raises(CubeError, match="1,024"):
        service.reconstruct(CubeState(), "R " * 1025, 0, 2)
    with pytest.raises(CubeError, match="supplied final hash"):
        service.reconstruct(CubeState(), "R", 0, 1, CubeState().state_hash)


def test_unmet_explicit_goal_rejects_and_regressing_auto_uses_endpoint():
    with pytest.raises(CubeError, match="does not satisfy"):
        service.compare(CubeState(), "R", 0, 1, requested="solve")
    reply = service.compare(PARTIAL, "R", 0, 1)
    assert reply["goal"]["kind"] == "position"
    verify(reply)


def test_practice_restores_original_start_and_accepts_different_valid_sequences():
    for attempt in ("B U B'", "y R U R'", "B U B' U U U U"):
        result = service.practice(BACK, ACTUAL, 0, 7, attempt)
        assert result["start_hash"] == BACK.state_hash
        assert result["success"] and result["protected_preserved"]
    wrong = service.practice(BACK, ACTUAL, 0, 7, "R")
    assert not wrong["success"]
    assert wrong["end"]["state"] == BACK.apply("R").to_dict()


@pytest.mark.parametrize("seed", range(6))
def test_random_cfop_segments_reach_same_goal_and_preserve_progress(seed):
    rng = random.Random(0x2D00 + seed)
    state = CubeState().apply(" ".join(rng.choice("URFDLB") for _ in range(20)))
    for _ in range(3):
        candidate = recommend(state)["candidates"][0]
        word = candidate["notation"] + " U U U U"
        reply = service.compare(state, word, 0, len(parse_sequence(word)), "cfop")
        verify(reply)
        state = state.apply(candidate["notation"])


def test_http_reconstruct_comparison_and_objective_based_practice():
    payload = {
        "facelets": BACK.to_facelets(),
        "sequence": ACTUAL,
        "start": 0,
        "end": 7,
        "objective": "training",
    }
    with TestClient(create_app()) as client:
        response = client.post("/api/cube/analysis", json=payload)
        assert response.status_code == 200
        reply = response.json()
        verify(reply)
        practice = client.post(
            "/api/cube/analysis/practice", json=payload | {"attempt": "y R U R'"}
        )
        assert practice.status_code == 200 and practice.json()["success"]
        for patch in (
            {"facelets": "U" * 54},
            {"sequence": "R ???"},
            {"end": 99},
            {"objective": "fastest"},
            {"goal": "solve", "sequence": "R", "end": 1},
        ):
            assert client.post("/api/cube/analysis", json=payload | patch).status_code == 422
