"""Check the public health contract and local development origin policy."""

import pytest
from fastapi.testclient import TestClient

from coach.main import LOCAL_ORIGINS, create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.mark.parametrize("path", ["/health", "/api/health"])
def test_health_contract(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "cubiq-api",
        "version": "0.1.0",
        "milestone": "2B",
    }


@pytest.mark.parametrize("origin", LOCAL_ORIGINS)
def test_local_origin_preflight(client, origin):
    response = client.options(
        "/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in response.headers


def test_untrusted_origin_is_not_allowed(client):
    origin = "https://untrusted.example"
    response = client.options(
        "/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_simple_local_request_has_cors_header(client):
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_future_session_and_solve_routes_remain_unavailable(client):
    assert client.get("/api/solves").status_code == 404
    assert client.get("/api/states").status_code == 404
