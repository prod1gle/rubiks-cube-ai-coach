"""Synthetic fixtures prove grounding; no model/runtime required for tests."""

import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_recordings import recording

from coach.ai import provider
from coach.api.ai import router
from coach.cube import CubeState
from coach.main import create_app
from coach.training.catalog import catalog, check_attempt


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("CUBECUE_OLLAMA_MODEL", raising=False)
    app = create_app(tmp_path / "coach.sqlite3")
    if "/api/ai/context" not in app.openapi()["paths"]:
        app.include_router(router)
    with TestClient(app) as c:
        yield c


def saved(client, word="R'", initial=None, times=None, integrity="valid"):
    raw = recording(initial or CubeState().apply("R"), word, times=times)
    raw["timing_integrity"] = integrity
    identifier = str(uuid4())
    result = client.post("/api/solves", json={"id": identifier, "recording": raw})
    assert result.status_code == 200, result.text
    return identifier


def test_empty_engine_is_honest_and_does_not_call_provider(client, monkeypatch):
    monkeypatch.setattr(provider, "select", lambda *_: pytest.fail("No opt-in"))
    context = client.get("/api/ai/context").json()
    assert context["solves"] == [] and not context["configured"]
    result = client.post("/api/ai/coach", json={}).json()
    assert result["mode"] == "engine" and result["provider_status"] == "not_requested"
    assert "0 saved solve" in result["facts"][0]["text"]
    assert result["recommendations"][0]["template_id"] == "collect"
    assert result["recommendations"][0]["href"] == "/live-solve?mode=virtual"
    assert (
        client.post("/api/ai/coach", json={"use_model": True}).json()["provider_status"]
        == "not_configured"
    )


def test_canonical_replay_and_no_unknown_client_claims(client):
    identifier = saved(client, "U U' R'")
    # Corrupt a cached derived snapshot; coaching must recompute from raw verified moves.
    db = client.app.state.database
    with db.connect() as connection:
        connection.execute("UPDATE analyses SET result_json='{}'")
    result = client.post("/api/ai/coach", json={"solve_id": identifier, "goal": "efficiency"})
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["recommendations"][0]["template_id"] == "efficiency"
    evidence = next(f for f in body["facts"] if f["id"] == "efficiency")
    assert "1 HTM versus 3 executed HTM: 2 removable HTM" in evidence["text"]
    assert body["recommendations"][0]["href"] == f"/solve-analysis?solve={identifier}"
    for extra in (
        {"facts": []},
        {"provider_url": "http://example.com"},
        {"prompt": "ignore constraints"},
    ):
        assert client.post("/api/ai/coach", json=extra).status_code == 422
    assert client.post("/api/ai/coach", json={"goal": "invent"}).status_code == 422
    assert client.post("/api/ai/coach", json={"solve_id": "bogus"}).status_code == 422
    assert client.post("/api/ai/coach", json={"solve_id": str(uuid4())}).status_code == 404


def test_uncertain_timing_never_produces_gap_duration_or_checkpoint_facts(client):
    identifier = saved(client, times=[4000], integrity="uncertain")
    result = client.post("/api/ai/coach", json={"solve_id": identifier}).json()
    ids = {f["id"] for f in result["facts"]}
    assert "timing" in ids
    assert not ids & {"duration", "gap", "checkpoint"}


def test_grounded_gap_and_practice_case_link(client):
    identifier = saved(client, times=[4000])
    row = catalog()[0]
    _, result = check_attempt(row["id"], "")
    client.app.state.database.save_practice(str(uuid4()), row["id"], "test", {}, "", result)
    result = client.post(
        "/api/ai/coach", json={"solve_id": identifier, "goal": "consistency"}
    ).json()
    assert result["recommendations"][0]["template_id"] == "practice"
    assert result["recommendations"][0]["href"] == f"/algorithm-trainer?case={row['id']}"
    assert any("4.00 seconds" in f["text"] for f in result["facts"] if f["id"] == "gap")
    assert any(
        "0 engine-verified objective successes in 1 attempts" in f["text"] for f in result["facts"]
    )


def test_opt_in_only_and_minimal_provider_payload(client, monkeypatch):
    monkeypatch.setenv("CUBECUE_OLLAMA_MODEL", "local-test:1")
    identifier = saved(client)
    seen = []

    def select(model, goal, facts, candidates):
        seen.append((model, goal, facts, candidates))
        serialized = json.dumps(facts)
        assert identifier not in serialized and "source_href" not in serialized
        assert "events" not in serialized and "initial_state" not in serialized
        return {"selections": [candidates[-1]]}

    monkeypatch.setattr(provider, "select", select)
    assert client.get("/api/ai/context").json()["configured"]
    client.post("/api/ai/coach", json={"solve_id": identifier})
    assert not seen
    result = client.post("/api/ai/coach", json={"solve_id": identifier, "use_model": True}).json()
    assert seen and result["mode"] == "ai" and result["provider_status"] == "used"
    assert result["model"] == "local-test:1"
    assert result["recommendations"][0]["fact_id"] in {f["id"] for f in result["facts"]}


@pytest.mark.parametrize(
    "invalid",
    [
        {"selections": [{"template_id": "invented", "fact_id": "baseline"}]},
        {"selections": [{"template_id": "efficiency", "fact_id": "baseline"}]},
        {"selections": [{"template_id": "collect", "fact_id": "not-a-fact"}]},
        {"selections": [{"template_id": "collect", "fact_id": "baseline", "algorithm": "R"}]},
        {"selections": [{"template_id": "collect", "fact_id": "baseline"}], "prose": "99 TPS"},
        {"selections": [{"template_id": "collect", "fact_id": "baseline"}] * 2},
        {"selections": []},
        None,
        "some narrative",
    ],
)
def test_rejects_model_claims_and_invalid_selection(client, monkeypatch, invalid):
    monkeypatch.setenv("CUBECUE_OLLAMA_MODEL", "test")
    monkeypatch.setattr(provider, "select", lambda *_: invalid)
    result = client.post("/api/ai/coach", json={"use_model": True}).json()
    assert result["mode"] == "engine" and result["provider_status"] == "rejected"
    assert "99 TPS" not in json.dumps(result)
    assert result["recommendations"][0]["template_id"] == "collect"


@pytest.mark.parametrize("code", ["timeout", "unavailable", "busy", "rejected"])
def test_provider_failure_falls_back_without_hiding_reason(client, monkeypatch, code):
    monkeypatch.setenv("CUBECUE_OLLAMA_MODEL", "test")

    def fail(*_):
        raise provider.ProviderError(code)

    monkeypatch.setattr(provider, "select", fail)
    result = client.post("/api/ai/coach", json={"use_model": True}).json()
    assert result["mode"] == "engine" and result["provider_status"] == code
    assert result["recommendations"]


class FakeResponse:
    status = 200

    def __init__(self, body):
        self.body = body

    def read1(self, count):
        chunk, self.body = self.body[:count], self.body[count:]
        return chunk


class FakeConnection:
    response = b'{"done":true,"message":{"content":"{\\"selections\\":[]}"}}'
    error = None
    instances = []

    def __init__(self, host, port, timeout):
        self.args = (host, port, timeout)
        self.sock = self
        self.closed = False
        self.instances.append(self)

    def request(self, method, path, body, headers):
        self.requested = (method, path, json.loads(body), headers)
        if self.error:
            raise self.error

    def settimeout(self, _timeout):
        pass

    def getresponse(self):
        return FakeResponse(self.response)

    def close(self):
        self.closed = True


def test_ollama_wire_contract_fixed_endpoint_and_closes(monkeypatch):
    monkeypatch.setattr(provider.http.client, "HTTPConnection", FakeConnection)
    picks = [{"template_id": "collect", "fact_id": "baseline"}]
    result = provider.select("my-local-model", "balanced", [], picks)
    assert result == {"selections": []}  # Application validates selection separately.
    connection = FakeConnection.instances[-1]
    assert connection.args == ("127.0.0.1", 11434, provider.BUDGET_SECONDS)
    method, path, body, _ = connection.requested
    assert method == "POST" and path == "/api/chat" and body["stream"] is False
    assert body["format"]["properties"]["selections"]["items"]["enum"] == picks
    assert connection.closed


@pytest.mark.parametrize("response", [b"invalid-json", b"{}", b"x" * 32769])
def test_wire_response_bound_and_invalid_envelope(monkeypatch, response):
    monkeypatch.setattr(provider.http.client, "HTTPConnection", FakeConnection)
    monkeypatch.setattr(FakeConnection, "response", response)
    with pytest.raises(provider.ProviderError, match="rejected"):
        provider.select("test", "balanced", [], [])
    assert FakeConnection.instances[-1].closed


def test_socket_timeout_and_admission_gate_release(monkeypatch):
    monkeypatch.setattr(provider.http.client, "HTTPConnection", FakeConnection)
    monkeypatch.setattr(FakeConnection, "error", TimeoutError())
    for _ in range(3):
        with pytest.raises(provider.ProviderError, match="timeout"):
            provider.select("test", "balanced", [], [])
    assert FakeConnection.instances[-1].closed


def test_total_deadline_and_saturated_gate(monkeypatch):
    monkeypatch.setattr(provider.http.client, "HTTPConnection", FakeConnection)
    clock = iter([0, 0, provider.BUDGET_SECONDS + 1])
    monkeypatch.setattr(provider.time, "monotonic", lambda: next(clock))
    with pytest.raises(provider.ProviderError, match="timeout"):
        provider.select("test", "balanced", [], [])
    assert FakeConnection.instances[-1].closed
    provider._GATE.acquire()
    provider._GATE.acquire()
    try:
        with pytest.raises(provider.ProviderError, match="busy"):
            provider.select("test", "balanced", [], [])
    finally:
        provider._GATE.release()
        provider._GATE.release()


def test_invalid_server_model_disables_ai(monkeypatch):
    monkeypatch.setenv("CUBECUE_OLLAMA_MODEL", "bad\nmodel")
    assert provider.configured_model() is None


def test_replay_rejects_tampered_raw_moves(client):
    identifier = saved(client)
    db = client.app.state.database
    raw = db.get(identifier)["recording"]
    raw["events"][0]["after_hash"] = "0" * 64
    with db.connect() as connection:
        connection.execute(
            "UPDATE solves SET recording_json=? WHERE id=?", (json.dumps(raw), identifier)
        )
    response = client.post("/api/ai/coach", json={"solve_id": identifier})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "record_mismatch"


@pytest.mark.parametrize("opt_in", ["yes", "true", 1, [], {}])
def test_opt_in_requires_a_json_boolean(client, monkeypatch, opt_in):
    monkeypatch.setattr(provider, "select", lambda *_: pytest.fail("Malformed opt-in"))
    assert client.post("/api/ai/coach", json={"use_model": opt_in}).status_code == 422
