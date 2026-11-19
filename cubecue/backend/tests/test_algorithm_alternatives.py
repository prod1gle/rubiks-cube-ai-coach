"""Deterministic engine checks; imported cases are fixtures, not practice records."""

import json
from collections import Counter
from copy import deepcopy
from importlib.resources import files

import pytest

from coach.cfop import alternatives
from coach.cfop.alternatives import candidates, from_current_grip, index
from coach.cfop.pipeline import build_candidate, verify_candidate
from coach.cfop.registry import AUFS, WHITE_DOWN_FRAME, registry
from coach.cfop.search import SLOTS, pair_code
from coach.coaching.service import recommend
from coach.cube import VALID_FRAMES, CubeState, inverse_sequence, sequence_info
from coach.training.catalog import case_state, catalog, check_attempt


def test_pinned_source_collection_and_coverage():
    data = json.loads(files("coach.cfop").joinpath("data/alternatives.json").read_text())
    assert Counter(r["stage"] for r in data["algorithms"]) == {"F2L": 164, "OLL": 252, "PLL": 90}
    assert len({r["source_case"] for r in data["algorithms"] if r["stage"] == "F2L"}) == 41
    assert len(index()["OLL"]) == 215 and len(index()["PLL"]) == 284
    assert len(index()["F2L"]) > 500  # Includes all four target slots and U setups.
    assert "81272971cc1e212a32645badf3292ea7153d8746" in data["source"]
    assert "MIT" in data["license"]


@pytest.mark.parametrize("row", catalog(), ids=lambda r: r["id"])
def test_each_case_has_one_to_four_verified_choices_from_the_identical_start(row):
    case = case_state(row["id"])
    state = CubeState.from_dict(case["start"]["state"])
    choices = case["algorithms"]
    assert 1 <= len(choices) <= 4
    assert choices[0]["id"] == case["default_algorithm_id"]
    assert len({c["id"] for c in choices}) == len(choices)
    assert len({c["notation"] for c in choices}) == len(choices)
    for choice in choices:
        assert choice["verified"] and choice["input_hash"] == state.state_hash
        assert choice["source_url"].startswith("https://")
        final = state.apply(choice["notation"])
        assert final.state_hash == choice["result_hash"] and final.frame == state.frame
        assert sequence_info(choice["notation"])["htm"] == choice["metrics"]["htm"]
        _, attempt = check_attempt(row["id"], choice["notation"])
        assert attempt["success"] and attempt["preserved"]
        assert attempt["algorithm_id"] == choice["id"]
        assert attempt["algorithm_catalog_version"] == "alternatives-1"


@pytest.mark.parametrize("case", registry()[0], ids=lambda c: c.id)
def test_all_last_layer_classes_and_auf_setups_have_sourced_alternatives(case):
    initial = CubeState().apply(inverse_sequence(case.algorithm))
    for auf in AUFS:
        state = initial.apply(auf)
        choices = candidates(state, case.stage)
        assert 1 <= len(choices) <= 4
        for choice in choices:
            final = state.apply(choice["notation"])
            p = final.layer_progress()
            assert p["f2l"] and p[case.stage.lower()]
            assert final.frame == state.frame
            if case.stage == "PLL":
                assert final.apply(p["auf"]).is_solved


@pytest.mark.parametrize("frame", sorted(VALID_FRAMES))
@pytest.mark.parametrize("identifier", ["F2L-FR-30", "OLL-1", "PLL-T"])
def test_native_algorithms_regrip_correctly_from_all_24_viewer_orientations(frame, identifier):
    original = CubeState.from_dict(case_state(identifier)["start"]["state"])
    state = CubeState(original.cp, original.co, original.ep, original.eo, frame)
    stage = identifier.split("-")[0]
    choices = from_current_grip(state, stage, "FR" if stage == "F2L" else None)
    assert choices
    for choice in choices:
        final = state.apply(choice["notation"])
        assert choice["input_hash"] == state.state_hash
        assert choice["result_hash"] == final.state_hash and final.frame == state.frame
        p = final.in_reference(WHITE_DOWN_FRAME).layer_progress()
        assert p["f2l"] if stage == "F2L" else p[stage.lower()]


def test_matching_a_pair_projection_does_not_bypass_full_state_verification(monkeypatch):
    state = CubeState.from_dict(case_state("F2L-FR-30")["start"]["state"]).in_reference(
        WHITE_DOWN_FRAME
    )
    key = ("FR", pair_code(state, SLOTS.index("FR")))
    monkeypatch.setattr(alternatives, "index", lambda: {"F2L": {key: [{"notation": "R"}]}})
    assert candidates(state, "F2L", "FR") == []


def test_cfop_stage_choices_and_provenance_are_verified_before_release():
    initial = CubeState.from_dict(case_state("OLL-1")["start"]["state"])
    rows = build_candidate(initial.in_reference(WHITE_DOWN_FRAME))
    _, stages = verify_candidate(initial, rows)
    current = initial
    found = False
    for stage in stages:
        for choice in stage["alternatives"]:
            assert choice["input_hash"] == current.state_hash
            after = (
                current.apply(choice["notation"]).in_reference(WHITE_DOWN_FRAME).layer_progress()
            )
            assert after["f2l"] and after[stage["kind"]]
            assert sequence_info(choice["notation"])["htm"] == choice["metrics"]["htm"]
            found = True
        current = current.apply(stage["notation"])
    assert current.is_solved and found
    bad = deepcopy(rows)
    bad[5]["algorithm_id"] = "unverified-algorithm"
    with pytest.raises(ValueError, match="provenance"):
        verify_candidate(initial, bad)


def test_live_and_retrospective_coaching_share_the_sourced_pool():
    state = CubeState.from_dict(case_state("OLL-1")["start"]["state"])
    reply = recommend(state, allow_rotations=False)
    assert any(c.get("algorithm_id") for c in reply["candidates"])
    for c in reply["candidates"]:
        final = state.apply(c["notation"]).in_reference(WHITE_DOWN_FRAME).layer_progress()
        assert final["f2l"] and final["oll"]
        assert c["metrics"]["rotations"] == 0
    from coach.analysis.service import staged_words

    goal = {"kind": "oll", "slots": [], "protected_slots": list(SLOTS), "cross_required": True}
    assert staged_words(state, goal, "htm")


def test_selected_alternative_identity_and_version_persist_across_restart(tmp_path):
    from uuid import uuid4

    from fastapi.testclient import TestClient

    from coach.main import create_app
    from coach.storage.database import Database

    path = tmp_path / "alternate-practice.sqlite3"
    identifier = str(uuid4())
    with TestClient(create_app(path)) as client:
        case = client.get("/api/training/F2L-FR-30").json()
        selected = case["algorithms"][1]
        reply = client.post(
            "/api/practice",
            json={
                "id": identifier,
                "case_id": case["id"],
                "notation": selected["notation"],
            },
        )
        assert reply.status_code == 200
        assert reply.json()["success"] and reply.json()["algorithm_id"] == selected["id"]
    reopened = Database(path)
    with reopened.connect() as db:
        row = db.execute("SELECT * FROM practice_attempts WHERE id=?", (identifier,)).fetchone()
        result = json.loads(row["result_json"])
        assert result["algorithm_id"] == selected["id"]
        assert result["algorithm_catalog_version"] == "alternatives-1"
        assert row["version"] == case["version"]
        assert json.loads(row["initial_state_json"]) == case["start"]["state"]


def test_http_cfop_response_retains_state_bound_algorithm_choices(tmp_path):
    from fastapi.testclient import TestClient

    from coach.main import create_app

    initial = CubeState.from_dict(case_state("OLL-1")["start"]["state"])
    with TestClient(create_app(tmp_path / "http-choices.sqlite3")) as client:
        reply = client.post("/api/cube/cfop", json={"state": initial.to_dict()})
    assert reply.status_code == 200, reply.text
    state = initial
    seen = False
    for stage in reply.json()["stages"]:
        for choice in stage["alternatives"]:
            assert choice["input_hash"] == state.state_hash == stage["before_hash"]
            end = state.apply(choice["notation"]).in_reference(WHITE_DOWN_FRAME)
            assert end.layer_progress()[stage["kind"]]
            assert sequence_info(choice["notation"]) == choice["metrics"]
            seen = True
        state = state.apply(stage["notation"])
    assert seen and state.is_solved
