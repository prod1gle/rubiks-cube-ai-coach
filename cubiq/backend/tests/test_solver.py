"""Real-library solutions are checked with the independent canonical engine."""

import json
import random
import subprocess
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from coach.cube import VALID_FRAMES, CubeState, htm_count, parse_sequence
from coach.main import create_app
from coach.solvers import two_phase


def assert_solution(state, result):
    assert result["verified"] is True
    assert result["optimality"] == "unproven"
    assert result["method"] == "kociemba-two-phase"
    assert result["metric"] == "HTM-outer-v1"
    assert result["move_count"] == htm_count(result["notation"])
    assert 0 <= result["move_count"] <= two_phase.MAX_DEPTH
    assert result["elapsed_ms"] >= 0
    assert result["input_hash"] == state.state_hash
    final = state.apply(result["notation"])
    assert final.is_solved and final.frame == state.frame
    assert final.state_hash == result["result_hash"]
    assert all(not move.is_rotation for move in parse_sequence(result["notation"]))
    current = state
    plan = result["plan"]
    assert plan["input_hash"] == state.state_hash
    assert plan["sequence"]["normalized"] == result["notation"]
    assert len(plan["steps"]) == result["move_count"]
    for step in plan["steps"]:
        assert step["before_hash"] == current.state_hash
        current = current.apply(step["token"])
        assert step["snapshot"]["state"] == current.to_dict()
    assert current == final


@pytest.mark.parametrize(
    "sequence",
    [
        "R",
        "U2",
        "F'",
        "R U R' U'",
        "R U2 F' L D B2",
        "R2 L2 U2 D2 F2 B2",
        "F R U R' U' F'",
        "x R U2 F' y L2 z' B",
    ],
)
def test_known_scrambles_through_real_http_and_worker(sequence):
    state = CubeState().apply(sequence)
    original = deepcopy(state.to_dict())
    with TestClient(create_app()) as client:
        reply = client.post("/api/cube/solve", json={"state": original})
    assert reply.status_code == 200, reply.text
    assert original == state.to_dict()
    assert_solution(state, reply.json())


@pytest.mark.parametrize("seed", range(24))
def test_seeded_random_twenty_five_turn_scrambles(seed):
    rng = random.Random(20261112 + seed)
    sequence = " ".join(rng.choice("URFDLB") + rng.choice(("", "'", "2")) for _ in range(25))
    state = CubeState().apply(sequence)
    assert_solution(state, two_phase.solve_cube(state))


@pytest.mark.parametrize("frame", sorted(VALID_FRAMES))
def test_all_grips_use_real_solver_canonical_facelets_and_preserve_frame(frame):
    base = CubeState().apply("B U2 F' L2 R D'")
    state = CubeState(base.cp, base.co, base.ep, base.eo, frame)
    # Send viewed facelets, not only internal arrays, through the actual import boundary.
    with TestClient(create_app()) as client:
        reply = client.post("/api/cube/solve", json={"facelets": state.to_facelets()})
    assert reply.status_code == 200, reply.text
    assert_solution(state, reply.json())


@pytest.mark.parametrize("frame", ["URFDLB", "FRDBLU", "LUFRDB"])
def test_already_solved_avoids_library_and_does_not_claim_search_proof(monkeypatch, frame):
    def forbidden(_):
        pytest.fail("Solved positions must not launch a search")

    monkeypatch.setattr(two_phase, "_candidate", forbidden)
    state = CubeState(frame=frame)
    result = two_phase.solve_cube(state)
    assert result["status"] == "already_solved"
    assert result["notation"] == "" and result["move_count"] == 0
    assert_solution(state, result)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"facelets": "U" * 54},
        {"facelets": "bad"},
        {"state": CubeState().to_dict() | {"eo": [1] + [0] * 11}},
        {"state": CubeState().to_dict() | {"co": [1] + [0] * 7}},
        {"state": CubeState().to_dict() | {"cp": [1, 0, 2, 3, 4, 5, 6, 7]}},
        {"state": CubeState().to_dict(), "facelets": CubeState().to_facelets()},
    ],
)
def test_invalid_states_never_reach_solver(monkeypatch, payload):
    monkeypatch.setattr(
        two_phase, "_candidate", lambda _: pytest.fail("Invalid state reached solver")
    )
    with TestClient(create_app()) as client:
        reply = client.post("/api/cube/solve", json=payload)
    assert reply.status_code == 422
    assert "detail" in reply.json()


@pytest.mark.parametrize("candidate", ["", "R", "Q", "x R'", "R' " * 25])
def test_wrong_malformed_or_out_of_budget_candidates_never_escape(monkeypatch, candidate):
    monkeypatch.setattr(two_phase, "_candidate", lambda _: candidate)
    with TestClient(create_app()) as client:
        reply = client.post("/api/cube/solve", json={"state": CubeState().apply("R").to_dict()})
    assert reply.status_code == 502
    assert reply.json()["detail"]["code"] == "solver_verification"
    assert "notation" not in reply.json()


@pytest.mark.parametrize(
    "stdout,returncode,code",
    [
        ('{"candidate": null}', 0, "solver_no_result"),
        ('{"candidate": 1}', 0, "solver_protocol"),
        ('{"candidate": []}', 0, "solver_protocol"),
        ('{"candidate": "' + "R" * 257 + '"}', 0, "solver_protocol"),
        ("{}", 0, "solver_protocol"),
        ("[]", 0, "solver_protocol"),
        ("not json", 0, "solver_protocol"),
        ("", 1, "solver_unavailable"),
    ],
)
def test_worker_protocol_failures(monkeypatch, stdout, returncode, code):
    monkeypatch.setattr(
        two_phase.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(stdout=stdout, returncode=returncode),
    )
    with pytest.raises(two_phase.SolverError) as error:
        two_phase.solve_cube(CubeState().apply("R"))
    assert error.value.code == code
    # Failure always releases the single search slot.
    assert two_phase._worker_slot.acquire(blocking=False)
    two_phase._worker_slot.release()


@pytest.mark.parametrize(
    "failure,status,code",
    [
        (subprocess.TimeoutExpired("worker", 30), 504, "solver_timeout"),
        (OSError("missing interpreter"), 503, "solver_unavailable"),
    ],
)
def test_killable_worker_budget_and_unavailable_errors(monkeypatch, failure, status, code):
    def fail(*args, **kwargs):
        assert kwargs["timeout"] == 30
        assert not kwargs.get("shell")
        assert json.loads(kwargs["input"])["facelets"] == CubeState().apply("R").to_facelets(
            canonical=True
        )
        assert "rubik-solver-py-0.1.1" in kwargs["env"]["RUBIK_SOLVER_CACHE_DIR"]
        raise failure

    monkeypatch.setattr(two_phase.subprocess, "run", fail)
    with TestClient(create_app()) as client:
        reply = client.post("/api/cube/solve", json={"state": CubeState().apply("R").to_dict()})
    assert reply.status_code == status
    assert reply.json()["detail"]["code"] == code


def test_busy_solver_is_bounded_and_health_remains_available():
    assert two_phase._worker_slot.acquire(blocking=False)
    try:
        with TestClient(create_app()) as client:
            reply = client.post("/api/cube/solve", json={"state": CubeState().apply("R").to_dict()})
            assert reply.status_code == 503 and reply.json()["detail"]["code"] == "solver_busy"
            assert client.get("/health").status_code == 200
    finally:
        two_phase._worker_slot.release()
