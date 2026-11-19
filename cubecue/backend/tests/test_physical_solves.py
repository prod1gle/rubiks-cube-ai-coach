"""Synthetic stopwatch records only; no seeded live practice data."""

from uuid import uuid4

from fastapi.testclient import TestClient

from coach.main import create_app


def record(**extra):
    return {
        "id": str(uuid4()),
        "source": "physical-stopwatch",
        "elapsed_ms": 12345.0,
        "inspection_ms": 15001.0,
        "started_mono_ms": 100.0,
        "status": "stopped",
        "timing_integrity": "valid",
        "integrity_notes": [],
        "scramble": "R U",
        **extra,
    }


def test_restart_immutability_separate_stats_and_delete(tmp_path):
    path = tmp_path / "physical.sqlite3"
    body = record()
    with TestClient(create_app(path)) as c:
        assert c.get("/api/physical-solves").json()["total"] == 0
        assert c.post("/api/physical-solves", json=body).status_code == 200
        assert c.post("/api/physical-solves", json=body).status_code == 200
        assert c.post("/api/physical-solves", json={**body, "elapsed_ms": 1}).status_code == 409
        c.post("/api/physical-solves", json=record(elapsed_ms=1, timing_integrity="uncertain"))
        c.post("/api/physical-solves", json=record(elapsed_ms=2, status="interrupted"))
        assert c.get("/api/solves").json()["total"] == 0
    with TestClient(create_app(path)) as c:
        data = c.get("/api/physical-solves").json()
        assert data["total"] == 3 and data["sample_count"] == 1
        assert data["personal_best_ms"] == data["mean_ms"] == 12345
        assert c.delete(f"/api/physical-solves/{body['id']}").status_code == 200
        assert c.delete(f"/api/physical-solves/{body['id']}").status_code == 404
        assert c.get("/api/physical-solves").json()["personal_best_ms"] is None


def test_rejects_nonfinite_values_fake_moves_and_wrong_source(tmp_path):
    with TestClient(create_app(tmp_path / "validation.sqlite3")) as c:
        for extra in (
            {"elapsed_ms": -1},
            {"elapsed_ms": 86400001},
            {"source": "manual-virtual"},
            {"events": []},
            {"initial_state": {}},
            {"elapsed_ms": "NaN"},
        ):
            assert c.post("/api/physical-solves", json=record(**extra)).status_code == 422
