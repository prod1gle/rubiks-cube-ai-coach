"""Only synthetic fixtures; no runtime performance samples are seeded."""

from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_recordings import recording

from coach.cube import CubeState
from coach.main import create_app
from coach.storage.database import Database
from coach.training.catalog import case_state, catalog, check_attempt


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.sqlite3")) as c:
        yield c


def payload():
    return {"id": str(uuid4()), "recording": recording(CubeState().apply("R"), "R'")}


def test_restart_and_reanalysis(tmp_path):
    path = tmp_path / "persistent.sqlite3"
    body = payload()
    with TestClient(create_app(path)) as c:
        saved = c.post("/api/solves", json=body)
        assert saved.status_code == 200, saved.text
        first = saved.json()
        assert c.post("/api/solves", json=body).json() == first
    with TestClient(create_app(path)) as c:
        fetched = c.get(f"/api/solves/{body['id']}").json()
        assert fetched == first
        again = c.post(f"/api/solves/{body['id']}/reanalyze").json()
        assert again["analysis"] == first["analysis"]
        assert len(again["versions"]) == 1
        assert c.get("/api/solves").json()["total"] == 1
    db = Database(path)
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM schema_migrations").fetchone()[0] == 1
        assert conn.execute("SELECT confidence FROM moves").fetchone()[0] is None


def test_immutability_legality_and_delete(client):
    body = payload()
    assert client.post("/api/solves", json=body).status_code == 200
    changed = deepcopy(body)
    changed["recording"]["inspection_ms"] = 1
    assert client.post("/api/solves", json=changed).status_code == 409
    invalid = payload()
    invalid["recording"]["events"][0]["after_hash"] = "0" * 64
    assert client.post("/api/solves", json=invalid).status_code == 422
    assert client.get("/api/solves").json()["total"] == 1
    assert client.delete(f"/api/solves/{body['id']}").status_code == 200
    assert client.get(f"/api/solves/{body['id']}").status_code == 404
    db = client.app.state.database
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM moves").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM analyses").fetchone()[0] == 0


def test_versions_retained(client, monkeypatch):
    from coach.recordings import analytics

    body = payload()
    first = client.post("/api/solves", json=body).json()
    monkeypatch.setattr(analytics, "VERSION", "test-new-analytics")
    result = client.post(f"/api/solves/{body['id']}/reanalyze").json()
    assert len(result["versions"]) == 2
    assert first["analysis_version"] in result["versions"]
    assert result["recording"] == body["recording"]
    assert result["analysis"]["analytics_version"] == "test-new-analytics"


def test_dashboard_genuine_eligible_data(client):
    empty = client.get("/api/dashboard").json()
    assert empty["personal_best_ms"] is None and empty["trends"] == []
    a = payload()
    client.post("/api/solves", json=a)
    b = payload()
    b["recording"]["timing_integrity"] = "uncertain"
    client.post("/api/solves", json=b)
    stopped = payload()
    stopped["recording"]["status"] = "stopped"
    client.post("/api/solves", json=stopped)
    stats = client.get("/api/dashboard").json()
    assert stats["total_records"] == 3
    assert stats["completed_solves"] == 2 and stats["timed_sample_count"] == 1
    assert stats["personal_best_ms"] == 500 and stats["average_tps"] == 2
    assert stats["average_htm"] == 1 and len(stats["trends"]) == 2


@pytest.mark.parametrize("row", catalog(), ids=lambda r: r["id"])
def test_every_training_case_recognized_and_verified(row):
    case = case_state(row["id"])
    assert case["verified"]
    _, success = check_attempt(row["id"], row["algorithm"])
    assert success["success"] and success["preserved"]
    _, empty = check_attempt(row["id"], "")
    assert not empty["success"]


def test_practice_persistence_and_no_trusted_success(client):
    row = catalog()[0]
    body = {"id": str(uuid4()), "case_id": row["id"], "notation": row["algorithm"]}
    response = client.post("/api/practice", json=body)
    assert response.status_code == 200, response.text
    assert response.json()["success"] and response.json()["timing"] is None
    assert client.post("/api/practice", json=body).json() == response.json()
    assert client.get("/api/dashboard").json()["practice_attempts"] == 1
    assert client.post("/api/practice", json=body | {"notation": ""}).status_code == 409
    assert client.post("/api/practice", json=body | {"success": True}).status_code == 422
    assert client.get("/api/training/unknown").status_code == 404
    assert len(client.get("/api/training").json()["cases"]) == 102


def test_pagination_and_identifiers(client):
    assert client.get("/api/solves?limit=101").status_code == 422
    assert client.get("/api/solves?offset=-1").status_code == 422
    assert client.get("/api/solves/not-an-id").status_code == 422
    assert client.get("/api/solves?offset=100").json() == {"total": 0, "items": []}


def test_retrospective_attempt_saved(client):
    initial = CubeState().apply("R")
    body = {
        "id": str(uuid4()),
        "input": {
            "state": initial.to_dict(),
            "sequence": "R'",
            "start": 0,
            "end": 1,
            "goal": "solve",
            "attempt": "R'",
        },
    }
    result = client.post("/api/practice/segment", json=body)
    assert result.status_code == 200, result.text
    assert result.json()["success"]
    assert client.get("/api/dashboard").json()["practice_attempts"] == 1
    assert (
        client.post("/api/practice/segment", json={"id": body["id"], "input": {}}).status_code
        == 422
    )


def test_concurrent_conflicting_practice_writes(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from fastapi import HTTPException

    db = Database(tmp_path / "concurrent.sqlite3")
    identifier = str(uuid4())
    barrier = Barrier(2)

    def save(word):
        barrier.wait()
        try:
            db.save_practice(identifier, "case", "version", {}, word, {"success": True})
            return 200
        except HTTPException as e:
            return e.status_code

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(save, ["R", "U"])) == [200, 409]
