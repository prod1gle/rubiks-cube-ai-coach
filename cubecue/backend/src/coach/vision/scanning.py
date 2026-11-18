"""Bounded OpenCV sampling with center-based local-lighting calibration."""

import base64
import binascii
from io import BytesIO
from math import exp

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from coach.analysis.service import display
from coach.cube import CubeError, CubeState

VERSION = "guided-lab-1"
FACES = "URFDLB"
# Looking directly at each face, not at a mirrored selfie preview.
ORIENTATIONS = {
    "U": ("B", "R"),
    "R": ("U", "B"),
    "F": ("U", "R"),
    "D": ("F", "R"),
    "L": ("U", "F"),
    "B": ("U", "L"),
}


def decode_frame(encoded):
    if encoded.startswith("data:"):
        prefix, _, encoded = encoded.partition(",")
        if prefix not in ("data:image/jpeg;base64", "data:image/png;base64"):
            raise CubeError("frame_format", "Capture a JPEG or PNG frame.")
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 1_500_000:
            raise ValueError("large")
        with Image.open(BytesIO(raw)) as header:
            if header.format not in ("JPEG", "PNG") or not (
                96 <= header.width <= 1280 and 96 <= header.height <= 1280
            ):
                raise ValueError("dimensions")
        frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("decode")
    except (
        cv2.error,
        ValueError,
        binascii.Error,
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
    ) as e:
        raise CubeError(
            "frame_decode", "Use a sharp JPEG/PNG frame, 96–1280 pixels per side and under 1.5 MB."
        ) from e
    return frame


def sample_frame(encoded):
    frame = decode_frame(encoded)
    height, width = frame.shape[:2]
    if abs(width - height) > 2:
        raise CubeError(
            "frame_alignment", "Capture the square guide view without stretching the camera image."
        )
    # The outer guide occupies 72% of the square preview. Sample only sticker
    # interiors, never the grid seams. Fixed alignment is explicit in the UI.
    face = frame[
        round(height * 0.14) : round(height * 0.86), round(width * 0.14) : round(width * 0.86)
    ]
    return sample_face(face)


def sample_face(face):
    lab = cv2.cvtColor(face, cv2.COLOR_BGR2LAB)
    h, w = face.shape[:2]
    samples = []
    for row in range(3):
        for col in range(3):
            y, x = (row + 0.5) * h / 3, (col + 0.5) * w / 3
            ry, rx = max(2, round(h * 0.065)), max(2, round(w * 0.065))
            patch = lab[round(y) - ry : round(y) + ry, round(x) - rx : round(x) + rx]
            pixels = patch.reshape(-1, 3).astype(float)
            center = np.median(pixels, axis=0)
            spread = float(np.median(np.linalg.norm(pixels - center, axis=1)))
            rgb = face[round(y) - ry : round(y) + ry, round(x) - rx : round(x) + rx]
            clipped = float(np.mean(np.all(rgb > 250, axis=2) | np.all(rgb < 15, axis=2)))
            quality = float(exp(-spread / 18) * (1 - 0.8 * clipped))
            samples.append(
                {
                    "lab": center.tolist(),
                    "quality": quality,
                    "spread": spread,
                    "clipped_fraction": clipped,
                    "rgb": np.median(rgb.reshape(-1, 3), axis=0)[::-1].tolist(),
                }
            )
    return {
        "version": VERSION,
        "samples": samples,
        "quality": min(s["quality"] for s in samples),
        "scope": (
            "Fixed-grid sticker interior sampling; alignment and face orientation "
            "are supplied by the user."
        ),
    }


def classify(observations):
    if set(observations) != set(FACES) or any(
        len(v["samples"]) != 9 for v in observations.values()
    ):
        raise CubeError(
            "scan_faces", "Capture exactly nine stickers on each U, R, F, D, L, B face."
        )
    centers = np.array([observations[f]["samples"][4]["lab"] for f in FACES], float)
    if any(observations[f]["samples"][4]["quality"] < 0.5 for f in FACES):
        raise CubeError(
            "calibration_quality",
            (
                "A center sample is dark, clipped or inconsistent. "
                "Improve diffuse lighting and recapture its face."
            ),
        )
    separation = np.linalg.norm(centers[:, None] - centers[None, :], axis=2)
    np.fill_diagonal(separation, np.inf)
    if separation.min() < 18:
        a, b = np.unravel_index(np.argmin(separation), separation.shape)
        raise CubeError(
            "calibration_overlap",
            (
                f"Centers {FACES[a]} and {FACES[b]} are too similar. "
                "Check the correct center colors, reduce glare, and recapture both faces."
            ),
        )
    result, letters = [], []
    for face in FACES:
        for i, sample in enumerate(observations[face]["samples"]):
            distance = np.linalg.norm(centers - np.asarray(sample["lab"]), axis=1)
            order = np.argsort(distance)
            nearest, second = float(distance[order[0]]), float(distance[order[1]])
            margin = max(0, 1 - nearest / max(second, 1e-6))
            confidence = float(sample["quality"] * margin * exp(-nearest / 45))
            color = FACES[order[0]]
            letters.append(color)
            result.append(
                {
                    "face": face,
                    "index": i,
                    "color": color,
                    "confidence": confidence,
                    "quality": sample["quality"],
                    "distance": nearest,
                    "needs_review": confidence < 0.6,
                }
            )
    return {
        "version": VERSION,
        "facelets": "".join(letters),
        "observations": result,
        "calibration": {f: centers[i].tolist() for i, f in enumerate(FACES)},
        "confidence_kind": (
            "Heuristic quality × nearest/second margin × color residual; "
            "not a calibrated probability."
        ),
        "minimum_confidence": min(r["confidence"] for r in result),
    }


def validate_scan(facelets):
    if len(facelets) != 54 or any(facelets[i * 9 + 4] != f for i, f in enumerate(FACES)):
        raise CubeError(
            "scan_centers",
            (
                "Use U white, R red, F green, D yellow, L orange, B blue centers. "
                "Recapture any face with the wrong center."
            ),
        )
    try:
        state = CubeState.from_facelets(facelets)
    except CubeError as e:
        raise CubeError(
            e.code,
            str(e)
            + (
                " Review sticker colors and each face's top/right orientation; "
                "recapture suspect faces. Never force a scan to fit a guessed state."
            ),
        ) from e
    return {"snapshot": display(state), "verified": True, "version": VERSION}
