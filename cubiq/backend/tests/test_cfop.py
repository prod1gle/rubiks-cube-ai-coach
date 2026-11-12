"""CFOP stage semantics, exhaustive projected coverage and full scramble regressions."""

import itertools
import json
import random
import subprocess
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from coach.cfop import service
from coach.cfop.pipeline import build_candidate, recognize, verify_candidate
from coach.cfop.registry import WHITE_DOWN_FRAME, recognize_oll, recognize_pll, registry
from coach.cfop.search import SLOTS, TURNS, cross_code, cross_table, macros, pair_table, solve_pair
from coach.cube import (
    VALID_FRAMES,
    CubeError,
    CubeState,
    compile_catalog_algorithm,
    inverse_sequence,
    parse_sequence,
    piece_coordinate_maps,
    reference_sequence,
)
from coach.main import create_app
from coach.solvers.two_phase import SolverError

REFERENCE = json.loads((Path(__file__).parent / "fixtures/cfop-reference.json").read_text())


def parity(values):
    return sum(a > b for i, a in enumerate(values) for b in values[i + 1 :]) % 2


def world(state):
    # z2 is its own inverse. This changes the search reference, not a recorded turn.
    return state.in_reference(WHITE_DOWN_FRAME)


def ll_state(cp, ep, co=(0, 0, 0, 0), eo=(0, 0, 0, 0)):
    return CubeState(
        tuple(cp) + tuple(range(4, 8)),
        tuple(co) + (0,) * 4,
        tuple(ep) + tuple(range(4, 12)),
        tuple(eo) + (0,) * 8,
    )


@pytest.mark.parametrize("row", REFERENCE["notation"], ids=lambda r: r["original"])
def test_catalog_compiler_against_independent_full_sticker_states(row):
    word = compile_catalog_algorithm(row["original"])
    assert all(not move.is_rotation for move in parse_sequence(word))
    assert CubeState().apply(word).to_facelets(canonical=True) == row["canonical_facelets"]


@pytest.mark.parametrize("text", ["R3", "[R,U]", "banana", "R; print(1)", "M4"])
def test_catalog_compiler_rejects_unrecognized_input(text):
    with pytest.raises(CubeError):
        compile_catalog_algorithm(text)


@pytest.mark.parametrize("row", REFERENCE["cases"], ids=lambda r: r["id"])
def test_standard_case_ids_agree_with_requested_reference_and_independent_engine(row):
    state = CubeState.from_facelets(row["facelets"])
    recognition = recognize_oll if row["id"].startswith("OLL") else recognize_pll
    for rotation in ("", "y", "y2", "y'"):
        view = state.in_reference(CubeState().apply(rotation).frame)
        match = recognition(view)
        assert match["case_id"] == row["id"]
        after = view.apply(match["setup"] + " " + match["algorithm"])
        assert after.layer_progress()["oll" if row["id"].startswith("OLL") else "pll"]


def test_all_216_oll_orientations_with_independent_legal_permutations():
    rng, seen, count = random.Random(0x2B011), set(), 0
    for corners in itertools.product(range(3), repeat=3):
        co = (*corners, (-sum(corners)) % 3)
        for edges in itertools.product(range(2), repeat=3):
            eo = (*edges, sum(edges) % 2)
            cp, ep = list(range(4)), list(range(4))
            rng.shuffle(cp)
            rng.shuffle(ep)
            if parity(cp) != parity(ep):
                ep[0], ep[1] = ep[1], ep[0]
            state = ll_state(cp, ep, co, eo)
            match = recognize_oll(state)
            seen.add(match["case_id"])
            after = state.apply(match["setup"] + " " + match["algorithm"])
            assert after.layer_progress()["oll"]
            count += 1
    assert count == 216 and len(seen) == 58 and "OLL-skip" in seen


def test_all_288_legal_pll_permutations_and_final_auf():
    seen, count = set(), 0
    for cp in itertools.permutations(range(4)):
        for ep in itertools.permutations(range(4)):
            if parity(cp) != parity(ep):
                continue
            state = ll_state(cp, ep)
            match = recognize_pll(state)
            seen.add(match["case_id"])
            after = state.apply(match["setup"] + " " + match["algorithm"])
            progress = after.layer_progress()
            assert progress["pll"] and progress["auf"] is not None
            assert after.apply(progress["auf"]).is_solved
            count += 1
    assert count == 288 and len(seen) == 22 and "PLL-skip" in seen


def test_registry_size_distinctness_and_named_orientation_families():
    cases, oll, pll = registry()
    assert len(cases) == 78 and len(oll) == 215 and len(pll) == 284
    for case in cases:
        if case.stage != "OLL":
            continue
        state = CubeState().apply(inverse_sequence(case.algorithm))
        number = int(case.id.split("-")[1])
        assert (not any(state.eo[:4])) == (21 <= number <= 27)
        assert (all(state.eo[:4])) == (number in {1, 2, 3, 4, 17, 18, 19, 20})


def test_precise_stage_gates_distinguish_orientation_permutation_and_auf():
    solved = CubeState()
    assert all(solved.layer_progress()[k] for k in ("cross", "f2l", "oll", "pll", "solved"))
    assert solved.layer_progress()["auf"] == ""
    aligned = solved.apply("U")
    assert aligned.layer_progress()["pll"] and not aligned.is_solved
    assert aligned.layer_progress()["auf"] == "U'"
    wrong_cross = solved.apply("D")  # solid D face, but edge side colors are wrong.
    assert not wrong_cross.layer_progress()["cross"]
    assert recognize_oll(wrong_cross) is None and recognize_pll(wrong_cross) is None
    oll_case = CubeState.from_facelets(REFERENCE["cases"][0]["facelets"])
    assert oll_case.layer_progress()["f2l"] and not oll_case.layer_progress()["oll"]
    assert recognize_pll(oll_case) is None
    assert not recognize(world(wrong_cross))["cross"]


@pytest.mark.parametrize("frame", sorted(VALID_FRAMES))
def test_white_down_reference_round_trip_and_user_grip_translation(frame):
    state = CubeState().apply("R U2 F' L D B2")
    state = CubeState(state.cp, state.co, state.ep, state.eo, frame)
    reference = state.in_reference(WHITE_DOWN_FRAME)
    word = "R U' L2 B D F'"
    result = state.apply(reference_sequence(word, WHITE_DOWN_FRAME, frame))
    assert result.in_reference(WHITE_DOWN_FRAME) == reference.apply(word)
    assert result.frame == frame


def test_search_projection_transitions_agree_with_full_engine_on_unrelated_cubies():
    rng = random.Random(0x2B)
    for _ in range(25):
        state = CubeState().apply(" ".join(rng.choice(TURNS) for _ in range(25)))
        for word in (*TURNS, *(macro.notation for macro in macros())):
            after = state.apply(word)
            corners, edges = piece_coordinate_maps(word)
            for kind, count, table in (("corner", 8, corners), ("edge", 12, edges)):
                for piece in range(count):
                    assert table[state.piece_coordinate(kind, piece)] == after.piece_coordinate(
                        kind, piece
                    )


def test_cross_complete_coordinate_graph_and_shallow_exact_distances():
    transitions, distances = cross_table()
    finite = distances[distances < 255]
    assert len(finite) == 190080 and finite.max() == 8
    root = cross_code(CubeState())
    visited, frontier = {root}, {root}
    for depth in range(4):
        assert all(distances[code] == depth for code in frontier)
        next_frontier = {int(value) for code in frontier for value in transitions[code]} - visited
        visited.update(next_frontier)
        frontier = next_frontier
    rng = np.random.default_rng(0x2BC)
    for code in rng.choice(np.flatnonzero(distances < 255), 500, replace=False):
        assert min(int(distances[n]) for n in transitions[code]) == int(distances[code]) - 1


def pair_state(slot, mask, code):
    """Complete an arbitrary projected pair coordinate into an unrelated legal full state."""
    c, e = code // 24, code % 24
    cp, ep, co, eo = [-1] * 8, [-1] * 12, [0] * 8, [0] * 12
    for i in range(4):
        ep[4 + i] = 4 + i
        if mask & (1 << i):
            cp[4 + i], ep[8 + i] = 4 + i, 8 + i
    assert cp[c // 3] == -1 and ep[e // 2] == -1
    cp[c // 3], ep[e // 2] = slot + 4, slot + 8
    co[c // 3], eo[e // 2] = c % 3, e % 2
    rng = random.Random(100000 * mask + 1000 * slot + code)
    free_c, free_e = (
        [i for i, v in enumerate(cp) if v == -1],
        [i for i, v in enumerate(ep) if v == -1],
    )
    rest_c, rest_e = [p for p in range(8) if p not in cp], [p for p in range(12) if p not in ep]
    rng.shuffle(rest_c)
    rng.shuffle(rest_e)
    for i, p in zip(free_c, rest_c, strict=True):
        cp[i] = p
    for i, p in zip(free_e, rest_e, strict=True):
        ep[i] = p
    if parity(cp) != parity(ep):
        a, b = free_c[:2]
        cp[a], cp[b] = cp[b], cp[a]
    for i in free_c[:-1]:
        co[i] = rng.randrange(3)
    co[free_c[-1]] = (-sum(co)) % 3
    for i in free_e[:-1]:
        eo[i] = rng.randrange(2)
    eo[free_e[-1]] = sum(eo) % 2
    return CubeState(tuple(cp), tuple(co), tuple(ep), tuple(eo))


@pytest.mark.parametrize(
    "slot,mask", [(s, m) for s in range(4) for m in range(16) if not m & (1 << s)]
)
def test_all_8256_f2l_pair_configurations_with_protected_slots(slot, mask):
    _, distances = pair_table(slot, mask)
    assert sum(d < 10000 for d in distances) == 6 * (8 - mask.bit_count()) ** 2
    for code, distance in enumerate(distances):
        if distance == 10000:
            continue
        state = pair_state(slot, mask, code)
        word, ids = solve_pair(state, slot, mask)
        assert len(word.split()) == distance <= 11
        assert len(ids) <= 5
        after = state.apply(word).layer_progress()
        assert after["cross"] and after["pairs"][SLOTS[slot]]
        assert all(after["pairs"][SLOTS[i]] for i in range(4) if mask & (1 << i))


@pytest.mark.parametrize("seed", range(200))
def test_full_cfop_on_seeded_25_turn_scrambles_without_generic_solver(seed, monkeypatch):
    monkeypatch.setattr("coach.solvers.two_phase.solve_cube", lambda _: pytest.fail("Not CFOP"))
    rng = random.Random(0xCF0F00 + seed)
    state = CubeState().apply(" ".join(rng.choice(TURNS) for _ in range(25)))
    frame = sorted(VALID_FRAMES)[seed % 24]
    state = CubeState(state.cp, state.co, state.ep, state.eo, frame)
    rows = build_candidate(state.in_reference(WHITE_DOWN_FRAME))
    word, stages = verify_candidate(state, rows)
    assert len(stages) == 8 and state.apply(word).is_solved
    assert state.apply(word).frame == frame
    assert len(word.split()) <= 8 + 4 * 11 + 16 + 22 + 1 < 128
    assert sum(s["move_count"] for s in stages) == len(word.split())
    assert len({s["slot"] for s in stages if s["kind"] == "f2l"}) == 4


@pytest.mark.parametrize("seed", range(30))
def test_uniform_legal_cubie_states_not_just_move_walks(seed):
    rng = random.Random(0xABC2B + seed)
    cp, ep = list(range(8)), list(range(12))
    rng.shuffle(cp)
    rng.shuffle(ep)
    if parity(cp) != parity(ep):
        ep[0], ep[1] = ep[1], ep[0]
    co, eo = [rng.randrange(3) for _ in range(7)], [rng.randrange(2) for _ in range(11)]
    co.append((-sum(co)) % 3)
    eo.append(sum(eo) % 2)
    state = CubeState(tuple(cp), tuple(co), tuple(ep), tuple(eo))
    word, _ = verify_candidate(state, build_candidate(state.in_reference(WHITE_DOWN_FRAME)))
    assert state.apply(word).is_solved


@pytest.mark.parametrize("sequence", ["", "R U2 F' L D B2", "x R U2 F' y L2 z' B"])
def test_real_http_worker_and_full_animation_plan(sequence):
    state = CubeState().apply(sequence)
    with TestClient(create_app()) as client:
        reply = client.post("/api/cube/cfop", json={"facelets": state.to_facelets()})
    assert reply.status_code == 200, reply.text
    result = reply.json()
    assert result["method"] == "cfop" and result["optimality"] == "unproven" and result["verified"]
    assert result["input_hash"] == state.state_hash and len(result["stages"]) == 8
    current = state
    assert result["plan"]["input_hash"] == current.state_hash
    for step in result["plan"]["steps"]:
        assert step["before_hash"] == current.state_hash
        current = current.apply(step["token"])
        assert step["snapshot"]["state"] == current.to_dict()
    assert current.is_solved and current.state_hash == result["result_hash"]
    assert result["move_count"] == sum(s["move_count"] for s in result["stages"])


def test_registry_and_recognition_endpoints_are_real_and_invalid_states_rejected(monkeypatch):
    with TestClient(create_app()) as client:
        data = client.get("/api/cube/cfop/registry").json()
        assert len(data["cases"]) == 78 and len(data["f2l_macros"]) == 27
        for state in (CubeState(), CubeState().apply("R")):
            reply = client.post("/api/cube/cfop/recognize", json={"state": state.to_dict()})
            assert reply.status_code == 200 and reply.json() == recognize(state)
        monkeypatch.setattr(
            service.subprocess, "run", lambda *a, **kw: pytest.fail("Invalid state launched worker")
        )
        for payload in (
            {},
            {"facelets": "U" * 54},
            {"state": CubeState().to_dict() | {"eo": [1] + [0] * 11}},
        ):
            assert client.post("/api/cube/cfop", json=payload).status_code == 422


@pytest.mark.parametrize(
    "tamper", ["order", "missing", "case", "notation", "cross", "macro", "auf"]
)
def test_bad_or_mislabeled_stage_candidates_never_escape(tamper):
    state = CubeState().apply("R U2 F' L D B2")
    rows = deepcopy(build_candidate(state.in_reference(WHITE_DOWN_FRAME)))
    if tamper == "order":
        rows[0], rows[1] = rows[1], rows[0]
    elif tamper == "missing":
        rows.pop()
    elif tamper == "case":
        rows[5]["case_id"] = "OLL-999"
    elif tamper == "notation":
        rows[5]["notation"] += " R"
    elif tamper == "cross":
        rows[0]["notation"] = "R R' " + rows[0]["notation"]
    elif tamper == "macro":
        rows[1]["macros"] = []
    else:
        rows[7]["case_id"] = "AUF-wrong"
    with pytest.raises((ValueError, KeyError)):
        verify_candidate(state, rows)


@pytest.mark.parametrize(
    "failure,code,status",
    [
        (subprocess.TimeoutExpired("cfop", 30), "cfop_timeout", 504),
        (OSError("missing"), "cfop_unavailable", 503),
        (SimpleNamespace(returncode=1, stdout=""), "cfop_worker", 503),
        (SimpleNamespace(returncode=0, stdout='{"stages": []}'), "cfop_verification", 502),
        (SimpleNamespace(returncode=0, stdout='{"stages": null}'), "cfop_verification", 502),
        (SimpleNamespace(returncode=0, stdout="not JSON"), "cfop_verification", 502),
    ],
)
def test_worker_errors_release_admission_slot_and_return_no_solution(
    monkeypatch, failure, code, status
):
    def run(*args, **kwargs):
        assert kwargs["timeout"] == 30 and args[0][-1] == "coach.cfop.worker"
        if isinstance(failure, Exception):
            raise failure
        return failure

    monkeypatch.setattr(service.subprocess, "run", run)
    with pytest.raises(SolverError) as error:
        service.solve_cfop(CubeState().apply("R"))
    assert error.value.code == code and error.value.status == status
    assert service._worker_slot.acquire(blocking=False)
    service._worker_slot.release()


def test_two_phase_and_cfop_share_only_a_bounded_admission_slot():
    assert service._worker_slot.acquire(blocking=False)
    try:
        with pytest.raises(SolverError, match="already running"):
            service.solve_cfop(CubeState())
    finally:
        service._worker_slot.release()
