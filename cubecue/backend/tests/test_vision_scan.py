"""Controlled synthetic images exercise real OpenCV; not camera accuracy data."""

import base64
from copy import deepcopy

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from coach.cube import CubeError, CubeState
from coach.main import create_app
from coach.vision.scanning import classify, decode_frame, sample_frame, validate_scan

RGB = {
    "U": (235, 235, 230),
    "R": (210, 35, 40),
    "F": (35, 170, 65),
    "D": (225, 210, 40),
    "L": (240, 115, 25),
    "B": (35, 75, 210),
}


def frame(colors, noise=0, seed=0):
    """Exactly the browser's 72% unmirrored square guide, JPEG encoded."""
    image = np.full((640, 640, 3), 25, np.uint8)
    lo, hi = round(640 * 0.14), round(640 * 0.86)
    face = np.full((hi - lo, hi - lo, 3), 20, np.uint8)
    for i, color in enumerate(colors):
        r, c = divmod(i, 3)
        x0, x1 = round(c * len(face) / 3) + 4, round((c + 1) * len(face) / 3) - 4
        y0, y1 = round(r * len(face) / 3) + 4, round((r + 1) * len(face) / 3) - 4
        face[y0:y1, x0:x1] = RGB[color][::-1]
    image[lo:hi, lo:hi] = face
    if noise:
        image = np.clip(
            image.astype(float) + np.random.default_rng(seed).normal(0, noise, image.shape), 0, 255
        ).astype(np.uint8)
    success, data = cv2.imencode(".jpg", image)
    assert success
    return base64.b64encode(data).decode()


def observations(state, noise=0):
    facelets = state.to_facelets(canonical=True)
    return {
        f: sample_frame(frame(facelets[i * 9 : (i + 1) * 9], noise, i))
        for i, f in enumerate("URFDLB")
    }


@pytest.mark.parametrize("word", ["", "R U R' F2 D L2", "R2 B2 U' F L D2 R", "U2 L F' B D R2 F2"])
@pytest.mark.parametrize("noise", [0, 3, 8])
def test_controlled_grid_roundtrip(word, noise):
    state = CubeState().apply(word)
    result = classify(observations(state, noise))
    assert result["facelets"] == state.to_facelets(canonical=True)
    assert len(result["observations"]) == 54
    assert all(0 <= x["confidence"] <= 1 for x in result["observations"])
    assert validate_scan(result["facelets"])["snapshot"]["position_hash"] == state.position_hash


def test_calibration_rejects_duplicate_and_low_quality_centers():
    obs = observations(CubeState())
    obs["R"]["samples"][4] = deepcopy(obs["L"]["samples"][4])
    with pytest.raises(CubeError, match="too similar"):
        classify(obs)
    obs = observations(CubeState())
    obs["U"]["samples"][4]["quality"] = 0.1
    with pytest.raises(CubeError, match="center sample"):
        classify(obs)


def test_ambiguous_sample_requires_review_not_invented_confidence():
    obs = observations(CubeState())
    a = np.array(obs["R"]["samples"][4]["lab"])
    b = np.array(obs["L"]["samples"][4]["lab"])
    obs["U"]["samples"][0]["lab"] = ((a + b) / 2).tolist()
    result = classify(obs)
    assert result["observations"][0]["needs_review"]
    assert result["observations"][0]["confidence"] < 0.1


@pytest.mark.parametrize(
    "bad", ["garbage", "data:text/plain;base64,AAAA", base64.b64encode(b"not an image").decode()]
)
def test_bad_frames_rejected(bad):
    with pytest.raises(CubeError):
        decode_frame(bad)


def test_dimensions_and_cropping_rejected():
    for shape in [(1500, 1500, 3), (20, 20, 3), (200, 400, 3)]:
        _, data = cv2.imencode(".png", np.zeros(shape, np.uint8))
        with pytest.raises(CubeError):
            sample_frame(base64.b64encode(data).decode())


def test_invalid_states_actionable():
    letters = list(CubeState().to_facelets())
    letters[5], letters[10] = letters[10], letters[5]  # single flipped edge
    with pytest.raises(CubeError, match="Review sticker colors"):
        validate_scan("".join(letters))
    letters = list(CubeState().to_facelets())
    letters[0] = "R"
    with pytest.raises(CubeError, match="Review sticker colors"):
        validate_scan("".join(letters))
    with pytest.raises(CubeError, match="centers"):
        validate_scan(CubeState().apply("x").to_facelets())


def test_api_full_scan_and_manual_correction(tmp_path):
    with TestClient(create_app(tmp_path / "scan.sqlite3")) as client:
        guide = client.get("/api/vision/guide").json()
        assert guide["orientations"]["B"] == {"top": "U", "right": "L"}
        assert not guide["mirrored"] and not guide["continuous_tracking"]
        sampled = client.post("/api/vision/sample", json={"image": frame("U" * 9)})
        assert sampled.status_code == 200 and len(sampled.json()["samples"]) == 9
        expected = CubeState().apply("F R U2 B' L2")
        assembled = client.post("/api/vision/assemble", json={"faces": observations(expected)})
        assert assembled.status_code == 200, assembled.text
        proposed = assembled.json()["facelets"]
        bad = ("R" if proposed[0] != "R" else "U") + proposed[1:]
        assert client.post("/api/vision/validate", json={"facelets": bad}).status_code == 422
        validated = client.post("/api/vision/validate", json={"facelets": proposed})
        assert validated.status_code == 200 and validated.json()["verified"]
        assert validated.json()["snapshot"]["position_hash"] == expected.position_hash
        obs = observations(expected)
        obs["U"]["samples"][0]["lab"][0] = float("inf")
        # JSON cannot represent infinity; finite schema checked via a large number.
        obs["U"]["samples"][0]["lab"][0] = 1000
        assert client.post("/api/vision/assemble", json={"faces": obs}).status_code == 422
        assert client.get("/api/solves").json()["total"] == 0
