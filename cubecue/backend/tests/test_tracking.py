"""Synthetic/controlled evidence; never represented as physical-camera accuracy."""

from copy import deepcopy
from uuid import uuid4

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from test_vision_scan import frame, observations

from coach.cube import CubeState
from coach.main import create_app
from coach.vision.scanning import classify
from coach.vision.tracking import CANDIDATES, face_pose, match_candidates, observe


@pytest.mark.parametrize("token", CANDIDATES)
@pytest.mark.parametrize("face", "URFDLB")
def test_actual_legal_transition_is_in_candidate_set(token, face):
    state = CubeState().apply("R U F2 D L B")
    after = state.apply(token)
    start = "URFDLB".index(face) * 9
    result = match_candidates(state, face, after.to_facelets()[start : start + 9], [1] * 9)
    assert token in [r["token"] for r in result]
    assert all(state.apply(r["token"]).state_hash == r["after_hash"] for r in result)


def test_hidden_turns_are_ambiguous_and_low_confidence_abstains():
    state = CubeState()
    result = match_candidates(state, "F", "F" * 9, [1] * 9)
    assert "" in [r["token"] for r in result]
    assert any(r["token"] in ("B", "B2", "B'") for r in result)
    assert match_candidates(state, "F", "F" * 9, [0.2] * 9) == []


def test_temporal_stability_pose_and_occlusion():
    state = CubeState().apply("R U F2 D L B")
    calibration = classify(observations(state))["calibration"]
    image = frame(state.apply("R").to_facelets()[18:27])
    previous = None
    for at in (100.0, 600.0, 1100.0):
        result = observe(state, calibration, "F", image, previous, at)
        previous = result | {"at_ms": at}
        assert result["automatic_commit"] is False
        assert result["processing_ms"] >= 0
    assert result["status"] == "awaiting_confirmation"
    assert result["stable_frames"] == 3
    assert [m["token"] for m in result["matches"]] == ["R"]
    assert result["pose"]["reprojection_rmse_px"] < 1
    assert observe(state, calibration, "F", image, previous, 5000.0)["stable_frames"] == 1
    import base64

    raw = cv2.imdecode(np.frombuffer(base64.b64decode(image), np.uint8), cv2.IMREAD_COLOR)
    raw[85:250, 85:250] = 20  # one covered sticker
    _, encoded = cv2.imencode(".jpg", raw)
    occluded = observe(state, calibration, "F", base64.b64encode(encoded).decode())
    assert occluded["status"] == "suspended" and not occluded["matches"]
    pose, reason = face_pose(np.full((640, 640, 3), 80, np.uint8))
    assert pose is None and reason


@pytest.fixture
def context(tmp_path):
    path = tmp_path / "tracking.sqlite3"
    initial = CubeState().apply("R U F2 D L B")
    calibration = classify(observations(initial))["calibration"]
    with TestClient(create_app(path)) as client:
        response = client.post(
            "/api/tracking",
            json={
                "state": initial.to_dict(),
                "calibration": calibration,
                "confirmed_alignment": True,
            },
        )
        assert response.status_code == 200, response.text
        yield client, response.json(), initial, calibration, path


def event(session, clock, at, **extra):
    return {"revision": session["revision"], "clock_id": clock, "at_ms": at, **extra}


def test_observations_never_commit_confirm_once_and_preserve_restart(context):
    client, s, initial, calibration, path = context
    clock = str(uuid4())
    image = frame(initial.apply("R").to_facelets()[18:27])
    for at in (100.0, 600.0, 1100.0):
        response = client.post(
            f"/api/tracking/{s['id']}/observe", json=event(s, clock, at, face="F", image=image)
        )
        assert response.status_code == 200, response.text
        s = response.json()
        assert s["snapshot"]["state_hash"] == initial.state_hash
    payload = event(s, clock, 1200.0, observation_index=2, token="R", confirmed_single_action=True)
    response = client.post(f"/api/tracking/{s['id']}/confirm", json=payload)
    assert response.status_code == 200, response.text
    accepted = response.json()
    assert accepted["snapshot"]["state_hash"] == initial.apply("R").state_hash
    assert client.post(f"/api/tracking/{s['id']}/confirm", json=payload).status_code == 409
    report = client.get(f"/api/tracking/{s['id']}/analysis").json()
    assert report["confirmed_htm"] == 1 and report["physical_tps"] is None
    assert len(report["segments"]) == 1 and report["segments"][0]["notation"] == "R"
    assert len(report["processing_ms"]) == 3
    assert client.get("/api/dashboard").json()["completed_solves"] == 0
    with TestClient(create_app(path)) as restarted:
        assert restarted.get(f"/api/tracking/{s['id']}").json() == accepted
        wrong_clock = event(accepted, str(uuid4()), 2000.0, face="F", image=image)
        assert (
            restarted.post(f"/api/tracking/{s['id']}/observe", json=wrong_clock).status_code == 409
        )


def test_gap_recovery_rescan_and_monotonic_times(context):
    client, s, initial, calibration, _ = context
    clock = str(uuid4())
    gap = client.post(
        f"/api/tracking/{s['id']}/gap", json=event(s, clock, 100.0, reason="Hand occlusion")
    ).json()
    assert gap["needs_sync"] and gap["snapshot"]["state_hash"] == initial.state_hash
    assert (
        client.post(
            f"/api/tracking/{s['id']}/confirm",
            json=event(
                gap, clock, 101.0, observation_index=0, token="R", confirmed_single_action=True
            ),
        ).status_code
        == 409
    )
    fresh = CubeState().apply("F2 L2 U")
    restored = client.post(
        f"/api/tracking/{s['id']}/resync",
        json=event(
            gap,
            clock,
            200.0,
            facelets=fresh.to_facelets(),
            calibration=calibration,
            confirmed_alignment=True,
        ),
    ).json()
    assert not restored["needs_sync"] and restored["snapshot"]["state_hash"] == fresh.state_hash
    report = client.get(f"/api/tracking/{s['id']}/analysis").json()
    assert report["confirmed_htm"] == 0 and report["segments"] == [] and report["gap_count"] == 2
    assert report["physical_total_moves"] is None
    assert (
        client.post(
            f"/api/tracking/{s['id']}/gap",
            json=event(restored, clock, 150.0, reason="Time went backwards"),
        ).status_code
        == 422
    )
    assert client.get("/api/tracking").json()["items"][0]["id"] == s["id"]
    stopped = client.post(
        f"/api/tracking/{s['id']}/stop", json=event(restored, clock, 300.0)
    ).json()
    assert stopped["stopped"]
    assert (
        client.post(
            f"/api/tracking/{s['id']}/gap", json=event(stopped, clock, 400.0, reason="late")
        ).status_code
        == 409
    )


def test_calibration_and_operator_confirmation_required(context):
    client, s, initial, calibration, _ = context
    assert (
        client.post(
            "/api/tracking",
            json={
                "state": initial.to_dict(),
                "calibration": calibration,
                "confirmed_alignment": False,
            },
        ).status_code
        == 422
    )
    bad = deepcopy(calibration)
    bad["U"] = [1.0]
    assert (
        client.post(
            "/api/tracking",
            json={"state": initial.to_dict(), "calibration": bad, "confirmed_alignment": True},
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/tracking/{s['id']}/resync",
            json=event(s, str(uuid4()), 0.0, manual_sequence="R", confirmed_alignment=False),
        ).status_code
        == 422
    )


def stable_observation(client, s, initial, clock, token, origin):
    image = frame(initial.apply(token).to_facelets()[18:27])
    for offset in (0.0, 500.0, 1000.0):
        response = client.post(
            f"/api/tracking/{s['id']}/observe",
            json=event(s, clock, origin + offset, face="F", image=image),
        )
        assert response.status_code == 200, response.text
        s = response.json()
    return s


def confirm(client, s, clock, token, at):
    return client.post(
        f"/api/tracking/{s['id']}/confirm",
        json=event(
            s,
            clock,
            at,
            observation_index=s["revision"] - 1,
            token=token,
            confirmed_single_action=True,
        ),
    )


def test_two_segments_never_reconstruct_across_a_rescan(context):
    client, s, initial, calibration, _ = context
    clock = str(uuid4())
    s = stable_observation(client, s, initial, clock, "R", 100.0)
    s = confirm(client, s, clock, "R", 1200.0).json()
    fresh = CubeState().apply("F2 U L D B R")
    response = client.post(
        f"/api/tracking/{s['id']}/resync",
        json=event(
            s,
            clock,
            1500.0,
            facelets=fresh.to_facelets(),
            calibration=calibration,
            confirmed_alignment=True,
        ),
    )
    assert response.status_code == 200, response.text
    s = response.json()
    s = stable_observation(client, s, fresh, clock, "R", 2000.0)
    s = confirm(client, s, clock, "R", 3100.0).json()
    report = client.get(f"/api/tracking/{s['id']}/analysis").json()
    assert len(report["segments"]) == 2
    for segment, start in zip(report["segments"], [initial, fresh], strict=True):
        assert segment["initial"]["state_hash"] == start.state_hash
        assert segment["final_hash"] == start.apply("R").state_hash
        assert segment["notation"] == "R"
        assert all(stage["duration_ms"] is None for stage in segment["stages"])


def test_expired_stale_and_unconfirmed_evidence_rejected(context):
    client, s, initial, _, _ = context
    clock = str(uuid4())
    s = stable_observation(client, s, initial, clock, "R", 100.0)
    assert confirm(client, s, clock, "R", 40000.0).status_code == 409
    bad = event(s, clock, 1200.0, observation_index=0, token="R", confirmed_single_action=True)
    assert client.post(f"/api/tracking/{s['id']}/confirm", json=bad).status_code == 409
    bad["observation_index"] = s["revision"] - 1
    bad["confirmed_single_action"] = False
    assert client.post(f"/api/tracking/{s['id']}/confirm", json=bad).status_code == 422
    bad["confirmed_single_action"] = True
    bad["token"] = "B2"
    assert client.post(f"/api/tracking/{s['id']}/confirm", json=bad).status_code == 422
    assert (
        client.get(f"/api/tracking/{s['id']}").json()["snapshot"]["state_hash"]
        == initial.state_hash
    )


def test_event_limit_reserves_recovery_and_always_allows_stop(context):
    client, s, _, _, _ = context
    clock = str(uuid4())
    with client.app.state.database.connect() as db:
        db.executemany(
            "INSERT INTO camera_events VALUES(?,?,?,?,?,?)",
            [
                (s["id"], i, "gap", clock, float(i), '{"reason":"CONTROLLED TEST"}')
                for i in range(4095)
            ],
        )
    s = client.get(f"/api/tracking/{s['id']}").json()
    response = client.post(
        f"/api/tracking/{s['id']}/resync", json=event(s, clock, 5000.0, confirmed_alignment=True)
    )
    assert response.status_code == 409
    stopped = client.post(f"/api/tracking/{s['id']}/stop", json=event(s, clock, 5000.0))
    assert stopped.status_code == 200 and stopped.json()["stopped"]


def test_evaluation_retains_early_false_suggestion_and_first_correct_latency(tmp_path, monkeypatch):
    from coach.vision import evaluation

    (tmp_path / "frame.jpg").write_bytes(b"EXPLICIT SYNTHETIC TEST; decoder replaced")
    replies = iter(
        [
            {"status": "awaiting_confirmation", "matches": [{"token": "U"}], "processing_ms": 1.0},
            {"status": "awaiting_confirmation", "matches": [{"token": "R"}], "processing_ms": 2.0},
            {"status": "suspended", "matches": [], "processing_ms": 3.0},
        ]
    )
    monkeypatch.setattr(evaluation, "observe", lambda *args: next(replies))
    manifest = {
        "dataset_kind": "controlled-test",
        "cases": [
            {
                "id": "synthetic",
                "initial_facelets": CubeState().to_facelets(),
                "calibration": {},
                "face": "F",
                "actual_action": "R",
                "annotated_turn_complete_ms": 50.0,
                "frames": [{"file": "frame.jpg", "at_ms": v} for v in [100.0, 200.0, 300.0]],
            }
        ],
    }
    report = evaluation.evaluate(manifest, tmp_path)
    assert report["physical_measurement"] is False
    assert report["false_suggestions"] == 1
    assert report["conditional_suggestion_accuracy"] == 0.5
    assert report["mean_evidence_delay_ms"] == 150.0
    assert report["mean_processing_ms"] == 2.0
    assert report["results"][0]["automatic_moves_logged"] == 0


def test_controlled_inline_export_evaluation_is_not_physical_evidence(tmp_path):
    from coach.vision.evaluation import evaluate

    state = CubeState().apply("R U F2 D L B")
    calibration = classify(observations(state))["calibration"]
    image = frame(state.apply("R").to_facelets()[18:27])
    manifest = {
        "dataset_kind": "controlled-test",
        "cases": [
            {
                "id": "explicit-controlled-input",
                "initial_facelets": state.to_facelets(),
                "calibration": calibration,
                "face": "F",
                "actual_action": "R",
                "annotated_turn_complete_ms": 50.0,
                "frames": [{"image": image, "at_ms": t} for t in (100.0, 600.0, 1100.0)],
            }
        ],
    }
    result = evaluate(manifest, tmp_path)
    assert not result["physical_measurement"]
    assert result["conditional_suggestion_accuracy"] == 1
    assert result["mean_evidence_delay_ms"] == 1050
    assert result["false_suggestions"] == 0
    manifest["cases"][0]["annotated_turn_complete_ms"] = 1200.0
    with pytest.raises(ValueError, match="precedes annotated"):
        evaluate(manifest, tmp_path)
