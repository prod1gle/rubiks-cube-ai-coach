"""Exercise actual FastAPI requests against the real authoritative engine."""

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from coach.cube import SOLVED_FACELETS, CubeState
from coach.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as connection:
        yield connection


def test_initial_snapshot_and_facelets_are_derived_from_the_engine(client):
    response = client.get("/api/cube")
    assert response.status_code == 200
    data = response.json()
    assert data["state"] == CubeState().to_dict()
    assert data["facelets"] == SOLVED_FACELETS
    assert data["is_solved"] is True
    assert data["sequence"]["htm"] == 0
    assert data["engine_version"] == "cube-v1"
    assert "".join(face["stickers"] for face in data["faces"]) == data["facelets"]


def test_state_application_inversion_and_rotations_across_http(client):
    initial = client.get("/api/cube").json()
    response = client.post(
        "/api/cube/apply",
        json={
            "state": initial["state"],
            "sequence": "x (R U2 F') y'",
        },
    )
    assert response.status_code == 200
    changed = response.json()
    expected = CubeState().apply("x R U2 F' y'")
    assert changed["state"] == expected.to_dict()
    assert changed["facelets"] == expected.to_facelets()
    assert changed["sequence"]["htm"] == 3
    assert changed["sequence"]["rotations"] == 2
    restored = client.post(
        "/api/cube/apply",
        json={
            "state": changed["state"],
            "sequence": changed["sequence"]["inverse"],
        },
    )
    assert restored.status_code == 200
    assert restored.json()["state_hash"] == initial["state_hash"]
    assert client.get("/api/cube").json() == initial  # No global state was mutated.


def test_view_facelet_and_serialized_imports_are_identical(client):
    state = CubeState().apply("F U R2 x' z")
    from_stickers = client.post("/api/cube/validate", json={"facelets": state.to_facelets()})
    from_cubies = client.post("/api/cube/validate", json={"state": state.to_dict()})
    assert from_stickers.status_code == from_cubies.status_code == 200
    assert from_stickers.json() == from_cubies.json()
    assert from_stickers.json()["state_hash"] == state.state_hash


@pytest.mark.parametrize(
    "payload,code",
    [
        ({}, "state_input"),
        ({"state": CubeState().to_dict(), "facelets": SOLVED_FACELETS}, "state_input"),
        ({"facelets": "X" * 54}, "facelet_color"),
        ({"facelets": "U" * 54}, "color_counts"),
        ({"facelets": "U"}, "facelet_length"),
        ({"state": CubeState().to_dict() | {"eo": [1] + [0] * 11}}, "edge_orientation"),
        ({"state": CubeState().to_dict() | {"co": [1] + [0] * 7}}, "corner_orientation"),
        ({"state": CubeState().to_dict() | {"cp": [1, 0, 2, 3, 4, 5, 6, 7]}}, "permutation_parity"),
        ({"state": CubeState().to_dict() | {"frame": "UUUUUU"}}, "center_orientation"),
    ],
)
def test_invalid_imports_return_actionable_422_errors(client, payload, code):
    response = client.post("/api/cube/validate", json=payload)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code
    assert response.json()["detail"]["message"]


def test_invalid_sequence_is_atomic_and_does_not_change_supplied_state(client):
    state = CubeState().apply("F L").to_dict()
    original = deepcopy(state)
    response = client.post("/api/cube/apply", json={"state": state, "sequence": "R U Q"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "notation_token"
    assert response.json()["detail"]["position"] == 4
    assert state == original
    assert client.post("/api/cube/validate", json={"state": state}).status_code == 200


def test_rotation_only_api_request_does_not_move_cubies_or_add_htm(client):
    initial = client.get("/api/cube").json()
    changed = client.post(
        "/api/cube/apply",
        json={
            "state": initial["state"],
            "sequence": "x y2 z'",
        },
    ).json()
    assert changed["is_solved"] is True
    assert changed["position_hash"] == initial["position_hash"]
    assert changed["state_hash"] != initial["state_hash"]
    assert changed["sequence"]["htm"] == 0
    assert changed["sequence"]["rotations"] == 3


def test_notation_endpoint_has_no_implicit_cancellations(client):
    response = client.post("/api/cube/sequence", json={"sequence": "R R' x2 U2’"})
    assert response.status_code == 200
    assert response.json() == {
        "normalized": "R R' x2 U2",
        "inverse": "U2 x2 R R'",
        "htm": 3,
        "metric": "HTM-outer-v1",
        "face_turns": 3,
        "rotations": 1,
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"facelets": 123},
        {"facelets": SOLVED_FACELETS, "extra": 1},
        {"facelets": " " * 10_001},
        {"state": []},
    ],
)
def test_malformed_request_shapes_are_rejected_by_the_api(client, payload):
    assert client.post("/api/cube/validate", json=payload).status_code == 422


def test_post_cors_preflight_is_allowed_only_for_local_frontend(client):
    headers = {
        "Origin": "http://127.0.0.1:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    response = client.options("/api/cube/apply", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == headers["Origin"]
    headers["Origin"] = "https://untrusted.example"
    assert client.options("/api/cube/apply", headers=headers).status_code == 400


def test_openapi_documents_cube_endpoints(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert all(
        path in paths
        for path in (
            "/api/cube",
            "/api/cube/apply",
            "/api/cube/validate",
            "/api/cube/sequence",
        )
    )
