"""State-bound hints, ergonomic alternatives, grip changes and protected partial solves."""

import random

import pytest
from fastapi.testclient import TestClient

from coach.cfop.registry import WHITE_DOWN_FRAME as W
from coach.cfop.search import SLOTS, TURNS, pair_table
from coach.coaching import service
from coach.coaching.ergonomics import metrics, weighted_pair_table
from coach.cube import (
    FACES,
    VALID_FRAMES,
    CubeState,
    inverse_sequence,
    plan_sequence,
    rotation_sequence,
)
from coach.main import create_app
from coach.solvers.runtime import SolverError


def world(reference, frame=FACES):
    physical = reference.in_reference(W)
    return CubeState(physical.cp, physical.co, physical.ep, physical.eo, frame)


PARTIAL = world(CubeState().apply("R U R' L U2 L' B U B'"))
BACK = world(CubeState().apply(inverse_sequence("B U B'")), W)


def verify_hints(state, reply):
    assert reply["input_hash"] == state.state_hash
    assert reply["personalization"]["status"] == "not_implemented"
    assert reply["elapsed_ms"] >= 0
    if state.is_solved:
        assert reply["status"] == "solved" and not reply["candidates"]
        return
    assert reply["status"] == "ready" and reply["candidates"]
    assert reply["recommended_id"] == reply["candidates"][0]["id"]
    before = state.in_reference(W).layer_progress()
    slots = {c["id"]: {s["color"] for s in c["stickers"]} for c in state.snapshot()["cubies"]}
    for candidate in reply["candidates"]:
        assert candidate["input_hash"] == state.state_hash
        assert candidate["verified"] and candidate["optimality"] == "unproven"
        assert candidate["first_move"] == candidate["notation"].split()[0]
        assert candidate["metrics"] | metrics(candidate["notation"]) == candidate["metrics"]
        for piece in candidate["pieces"]:
            assert slots[piece["slot_id"]] == set(piece["colors"])
        assert candidate["highlight_ids"] == [p["slot_id"] for p in candidate["pieces"]]
        after = state.apply(candidate["notation"])
        assert after.state_hash == candidate["result_hash"]
        p = after.in_reference(W).layer_progress()
        assert p == candidate["ending_progress"]
        goal = candidate["goal"]
        if goal == "f2l":
            assert p["cross"] and p["pairs"][candidate["slot"]]
            assert len(candidate["pieces"]) == 2
            assert all(p["pairs"][s] for s in SLOTS if before["pairs"][s])
        else:
            assert p["solved" if goal in ("auf", "solve") else goal]
        plan = plan_sequence(state, candidate["notation"])
        assert plan["steps"][-1]["snapshot"]["state"] == after.to_dict()


def test_completed_cross_and_one_solved_pair_get_all_remaining_pair_alternatives():
    reply = service.recommend(PARTIAL)
    assert reply["progress"]["cross"]
    assert reply["progress"]["pairs"] == {"FR": False, "FL": True, "BL": False, "BR": False}
    assert {c["slot"] for c in reply["candidates"]} == {"FR", "BL", "BR"}
    for slot in ("FR", "BL", "BR"):
        choices = [c for c in reply["candidates"] if c["slot"] == slot]
        assert len(choices) >= 2
        assert len({tuple(c["macro_ids"]) for c in choices}) >= 2
        assert all(c["metrics"]["preserved_slots"] == ["FL"] for c in choices)
    verify_hints(PARTIAL, reply)


def test_coded_ergonomics_prefers_a_real_rotation_over_awkward_back_turns():
    ergonomic = service.recommend(BACK)
    minimum = service.recommend(BACK, ranking="htm")
    a, b = ergonomic["candidates"][0], minimum["candidates"][0]
    assert a["notation"] == "y R U R'"
    assert b["notation"] == "B U B'"
    assert a["metrics"]["htm"] == b["metrics"]["htm"] == 3
    assert a["metrics"]["rotations"] == 1 and a["metrics"]["comfort_score"] == 5
    assert b["metrics"]["rotations"] == 0 and b["metrics"]["comfort_score"] == 7
    assert any(c["metrics"]["rotations"] == 0 for c in ergonomic["candidates"])
    verify_hints(BACK, ergonomic)
    verify_hints(BACK, minimum)


@pytest.mark.parametrize("frame", sorted(VALID_FRAMES))
def test_all_grips_and_current_view_highlights_are_exact(frame):
    state = CubeState(PARTIAL.cp, PARTIAL.co, PARTIAL.ep, PARTIAL.eo, frame)
    verify_hints(state, service.recommend(state))
    stationary = service.recommend(state, allow_rotations=False)
    for c in stationary["candidates"]:
        assert c["metrics"]["rotations"] == 0
        assert state.apply(c["notation"]).frame == frame
    verify_hints(state, stationary)


def test_rotation_paths_are_orientation_only_and_reach_all_24_grips():
    for source in VALID_FRAMES:
        for target in VALID_FRAMES:
            state = CubeState(PARTIAL.cp, PARTIAL.co, PARTIAL.ep, PARTIAL.eo, source)
            word = rotation_sequence(source, target)
            after = state.apply(word)
            assert after.frame == target and after.position_hash == state.position_hash
            assert len(word.split()) <= 2


@pytest.mark.parametrize(
    "slot,mask", [(s, m) for s in range(4) for m in range(16) if not m & (1 << s)]
)
def test_weighted_graph_retains_every_protected_pair_configuration(slot, mask):
    allowed, weights, d = weighted_pair_table(slot, mask, W, "ergonomic")
    _, baseline = pair_table(slot, mask)
    assert all((a < 10**9) == (b < 10000) for a, b in zip(d, baseline, strict=True))
    assert all(weight > 0 for weight in weights)
    for code, distance in enumerate(d):
        if distance in (0, 10**9):
            continue
        assert any(
            d[m.apply_pair(code)] + w == distance for m, w in zip(allowed, weights, strict=True)
        )


@pytest.mark.parametrize("seed", range(12))
def test_repeated_cfop_continuations_reach_solved_on_scrambles(seed, monkeypatch):
    monkeypatch.setattr(service, "solve_cube", lambda _: pytest.fail("CFOP called two-phase"))
    rng = random.Random(0x2C00 + seed)
    state = CubeState().apply(" ".join(rng.choice(TURNS) for _ in range(25)))
    seen = set()
    for _ in range(9):
        if state.is_solved:
            break
        assert state.state_hash not in seen
        seen.add(state.state_hash)
        reply = service.recommend(state)
        verify_hints(state, reply)
        state = state.apply(reply["candidates"][0]["notation"])
    assert state.is_solved


@pytest.mark.parametrize(
    "state", [CubeState(), CubeState().apply("R"), CubeState().apply("R U"), PARTIAL]
)
def test_shortest_available_returns_shortest_computed_verified_continuation(state):
    reply = service.recommend(state, mode="short")
    verify_hints(state, reply)
    if not state.is_solved:
        assert reply["candidates"][0]["metrics"]["htm"] == min(
            c["metrics"]["htm"] for c in reply["candidates"]
        )
        assert all(c["goal"] == "solve" for c in reply["candidates"])
        assert "unproven" in reply["comparison_scope"]


def test_unavailable_native_solver_returns_only_verified_available_candidates(monkeypatch):
    service.short_words.cache_clear()

    def unavailable(_):
        raise SolverError("solver_busy", "Busy")

    monkeypatch.setattr(service, "solve_cube", unavailable)
    reply = service.recommend(PARTIAL, mode="short")
    assert reply["warnings"] and reply["candidates"][0]["source"] == "CFOP"
    verify_hints(PARTIAL, reply)
    service.short_words.cache_clear()


def test_injected_wrong_complete_solution_never_becomes_a_hint(monkeypatch):
    service.short_words.cache_clear()
    monkeypatch.setattr(service, "solve_cube", lambda _: {"notation": "R"})
    with pytest.raises(SolverError, match="rejected a coaching candidate"):
        service.recommend(PARTIAL, mode="short")
    service.short_words.cache_clear()


def test_http_single_rotation_then_recalculate_and_manual_alternative_move():
    with TestClient(create_app()) as client:
        hint = client.post("/api/cube/next", json={"state": BACK.to_dict()}).json()
        first = hint["candidates"][0]["first_move"]
        assert first == "y"
        moved = client.post(
            "/api/cube/apply", json={"state": BACK.to_dict(), "sequence": first}
        ).json()
        assert (
            moved["position_hash"] == BACK.position_hash and moved["state_hash"] != BACK.state_hash
        )
        next_hint = client.post("/api/cube/next", json={"state": moved["state"]}).json()
        assert next_hint["input_hash"] == moved["state_hash"]
        assert next_hint["candidates"][0]["metrics"]["rotations"] == 0
        alternative = client.post(
            "/api/cube/apply", json={"state": moved["state"], "sequence": "U"}
        ).json()
        fresh = client.post("/api/cube/next", json={"state": alternative["state"]}).json()
        assert fresh["input_hash"] == alternative["state_hash"] != next_hint["input_hash"]
        verify_hints(CubeState.from_dict(alternative["state"]), fresh)


def test_single_moves_finish_the_selected_insertion_instead_of_undoing_it():
    chosen = service.recommend(BACK)["candidates"][0]
    tokens = chosen["notation"].split()
    state = BACK
    for consumed, token in enumerate(tokens, 1):
        state = state.apply(token)
        context = {
            "start_state": BACK.to_dict(),
            "candidate_id": chosen["id"],
            "consumed": consumed,
        }
        reply = service.recommend(state, continuation=context)
        if consumed < len(tokens):
            candidate = reply["candidates"][0]
            assert candidate["notation"] == " ".join(tokens[consumed:])
            assert state.apply(candidate["notation"]).is_solved
            if consumed == 2:
                assert not reply["progress"]["cross"]  # Honest transient progress.
                assert candidate["first_move"] == "U"  # Not the undo R'.
        else:
            assert reply["status"] == "solved"


def test_context_for_a_different_manual_move_is_rejected():
    chosen = service.recommend(BACK)["candidates"][0]
    context = {"start_state": BACK.to_dict(), "candidate_id": chosen["id"], "consumed": 1}
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/cube/next", json={"state": BACK.apply("U").to_dict(), "continuation": context}
        )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "hint_context"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"facelets": "U" * 54},
        {"state": BACK.to_dict(), "mode": "AI"},
        {"state": BACK.to_dict(), "ranking": "learned"},
        {"state": BACK.to_dict(), "allow_rotations": "yes"},
    ],
)
def test_invalid_state_or_unimplemented_coaching_options_fail_clearly(payload):
    with TestClient(create_app()) as client:
        assert client.post("/api/cube/next", json=payload).status_code == 422
