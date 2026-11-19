"""Beginner examples and learner attempts use the authoritative engine."""

import pytest
from fastapi.testclient import TestClient

from coach.beginner.service import STAGES, check, lessons, progress
from coach.cube import CubeState
from coach.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as connection:
        yield connection


def test_catalog_is_ordered_and_every_example_is_connected_and_engine_verified(client):
    catalog = client.get("/api/beginner/catalog").json()
    assert catalog["version"] == "beginner-v1"
    ids = [item["id"] for item in catalog["lessons"]]
    assert ids == ["foundations", *(stage[0] for stage in STAGES)]
    previous = None
    for lesson_id in ids:
        item = client.get(f"/api/beginner/lessons/{lesson_id}").json()
        start = CubeState.from_dict(item["start"]["state"])
        end = start.apply(item["algorithm"])
        assert item["verified"] is True
        assert end.state_hash == item["end"]["state_hash"]
        assert item["plan"]["input_hash"] == start.state_hash
        assert item["plan"]["steps"][-1]["snapshot"]["state_hash"] == end.state_hash
        assert item["start_progress"] == progress(start)
        assert item["end_progress"] == progress(end)
        if lesson_id != "foundations":
            assert not progress(start)[item["goal"]]
            assert progress(end)[item["goal"]]
            if previous:
                assert start.state_hash == previous
            previous = end.state_hash
        if item["protect"]:
            assert progress(start)[item["protect"]]
            assert progress(end)[item["protect"]]
        reply = client.post(
            "/api/beginner/check",
            json={
                "lesson_id": lesson_id,
                "attempt": item["algorithm"],
                "expected_hash": end.state_hash,
            },
        )
        assert reply.status_code == 200
        assert reply.json()["success"] is True
    assert end.is_solved


def test_practice_accepts_equivalent_solutions_instead_of_exact_algorithm_spelling():
    item = lessons()["alignment"]
    start = CubeState.from_dict(item["start"]["state"])
    result = check("alignment", "U' U2", start.apply("U' U2").state_hash)
    assert result["success"] is True
    assert result["moves"] == 2


def test_incomplete_or_disruptive_attempts_never_pass():
    item = lessons()["middle"]
    start = CubeState.from_dict(item["start"]["state"])
    for attempt in ("", "R"):
        result = check("middle", attempt, start.apply(attempt).state_hash)
        assert result["success"] is False
    assert check("middle", "R", start.apply("R").state_hash)["protected_preserved"] is False


def test_foundations_requires_face_turn_practice_not_empty_or_rotation_only_input():
    start = CubeState.from_dict(lessons()["foundations"]["start"]["state"])
    for attempt in ("", "x", "y y'"):
        assert check("foundations", attempt, start.apply(attempt).state_hash)["success"] is False
    assert check("foundations", "R2 R2", start.state_hash)["success"] is True


def test_stale_state_and_bad_lesson_or_notation_return_actionable_errors(client):
    item = lessons()["alignment"]
    cases = [
        ({"lesson_id": "unknown", "attempt": "U", "expected_hash": "0" * 64}, "beginner_lesson"),
        ({"lesson_id": "alignment", "attempt": "Q", "expected_hash": "0" * 64}, "notation_token"),
        (
            {
                "lesson_id": "alignment",
                "attempt": "U",
                "expected_hash": item["start"]["state_hash"],
            },
            "beginner_stale",
        ),
    ]
    for payload, code in cases:
        response = client.post("/api/beginner/check", json=payload)
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == code
    assert client.get("/api/beginner/lessons/unknown").status_code == 422


@pytest.mark.parametrize("extra", [{"attempt": 4}, {"expected_hash": "short"}, {"extra": True}])
def test_practice_rejects_malformed_request_shapes(client, extra):
    response = client.post(
        "/api/beginner/check",
        json={
            "lesson_id": "alignment",
            "attempt": "U",
            "expected_hash": "0" * 64,
            **extra,
        },
    )
    assert response.status_code == 422
