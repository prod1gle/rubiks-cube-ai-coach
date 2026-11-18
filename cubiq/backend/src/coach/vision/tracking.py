"""Conservative, observable single-face assistance. No automatic move commits."""

from math import atan2, degrees
from time import perf_counter

import cv2
import numpy as np

from coach.cube import CubeError, CubeState
from coach.vision.scanning import FACES, decode_frame, sample_face

VERSION = "camera-assist-1"
CANDIDATES = (
    "",
    *(f + s for f in FACES for s in ("", "'", "2")),
    *(f + s for f in "xyz" for s in ("", "'", "2")),
)


def face_pose(frame):
    """Estimate a sticker-envelope plane. Intrinsics are approximate, not calibrated.

    No color-only method can recover the in-plane cube axes on every face;
    face identity/roll convention still needs the user's orientation lock.
    """
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = ((hsv[:, :, 2] > 60) & ((hsv[:, :, 1] > 55) | (hsv[:, :, 2] > 150))).astype(
        np.uint8
    ) * 255
    # Limit distractors outside the same central region as guided scanning.
    roi = np.zeros_like(mask)
    roi[round(h * 0.12) : round(h * 0.88), round(w * 0.12) : round(w * 0.88)] = 255
    mask &= roi
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    stickers = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if not 0.008 * h * w < area < 0.12 * h * w:
            continue
        polygon = cv2.approxPolyDP(contour, 0.04 * cv2.arcLength(contour, True), True)
        if len(polygon) == 4 and cv2.isContourConvex(polygon):
            stickers.append((area, polygon))
    if len(stickers) != 9:
        return (
            None,
            (
                "Nine sticker regions are not visible. Uncover the face, slow "
                "down, and realign the grid."
            ),
        )
    areas = [s[0] for s in stickers]
    if min(areas) / max(areas) < 0.35:
        return (
            None,
            "Sticker geometry is inconsistent or heavily tilted. Hold one face toward the camera.",
        )
    hull = cv2.convexHull(np.concatenate([s[1] for s in stickers]))
    outline = cv2.approxPolyDP(hull, 0.04 * cv2.arcLength(hull, True), True)
    if len(outline) != 4:
        return None, "Face outline is ambiguous. Remove hands and background distractions."
    points = outline.reshape(4, 2).astype(np.float32)
    sums, differences = points.sum(axis=1), np.diff(points, axis=1).ravel()
    quad = np.array(
        [
            points[sums.argmin()],
            points[differences.argmin()],
            points[sums.argmax()],
            points[differences.argmax()],
        ],
        np.float32,
    )
    if len(np.unique(quad, axis=0)) != 4:
        return None, "Face corners are ambiguous. Realign to the guide."
    roll = degrees(atan2(float(quad[1, 1] - quad[0, 1]), float(quad[1, 0] - quad[0, 0])))
    transform = cv2.getPerspectiveTransform(
        quad, np.array([[0, 0], [599, 0], [599, 599], [0, 599]], np.float32)
    )
    warped = cv2.warpPerspective(frame, transform, (600, 600))
    blur = float(cv2.Laplacian(cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
    intrinsic = np.array([[max(h, w), 0, w / 2], [0, max(h, w), h / 2], [0, 0, 1]], dtype=float)
    objects = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], dtype=float)
    ok, rvec, tvec = cv2.solvePnP(
        objects, quad.astype(float), intrinsic, None, flags=cv2.SOLVEPNP_ITERATIVE
    )
    if not ok or not np.isfinite(rvec).all() or not np.isfinite(tvec).all():
        return None, "Plane pose could not be estimated. Realign and retry."
    projection, _ = cv2.projectPoints(objects, rvec, tvec, intrinsic, None)
    error = float(np.sqrt(np.mean((projection.reshape(4, 2) - quad) ** 2)))
    return {
        "quad": (quad / np.array([w, h])).tolist(),
        "roll_degrees": roll,
        "rvec": rvec.ravel().tolist(),
        "tvec_face_units": tvec.ravel().tolist(),
        "reprojection_rmse_px": error,
        "blur_score": blur,
        "intrinsics": (
            "Approximate focal=max(width,height), zero distortion; not camera calibrated."
        ),
        "orientation_source": (
            "User-locked face and adjacent-center directions; axes not "
            "inferred from hidden stickers."
        ),
        "warped": warped,
    }, None


def calibrated_samples(samples, calibration):
    if set(calibration) != set(FACES) or any(len(v) != 3 for v in calibration.values()):
        raise CubeError(
            "calibration", "A reviewed six-center calibration is required. Rescan the cube."
        )
    centers = np.array([calibration[f] for f in FACES], float)
    if centers.shape != (6, 3) or not np.isfinite(centers).all():
        raise CubeError("calibration", "Calibration must contain six finite Lab centers.")
    distances = np.linalg.norm(centers[:, None] - centers[None, :], axis=2)
    np.fill_diagonal(distances, np.inf)
    if distances.min() < 18:
        raise CubeError("calibration", "Calibration colors overlap. Run guided scanning again.")
    labels, confidence = [], []
    for sample in samples:
        d = np.linalg.norm(centers - np.array(sample["lab"]), axis=1)
        order = np.argsort(d)
        margin = max(0.0, 1 - float(d[order[0]]) / max(float(d[order[1]]), 1e-6))
        confidence.append(float(sample["quality"] * margin * np.exp(-float(d[order[0]]) / 45)))
        labels.append(FACES[order[0]])
    return "".join(labels), confidence


def match_candidates(state, face, visible, confidence):
    if face not in FACES or len(face) != 1 or len(visible) != 9 or len(confidence) != 9:
        raise CubeError("observation", "Choose one visible face with nine classified stickers.")
    if min(confidence) < 0.6:
        return []
    start = FACES.index(face) * 9
    return [
        {"token": token, "after_hash": after.state_hash}
        for token in CANDIDATES
        if (after := state.apply(token)).to_facelets()[start : start + 9] == visible
    ]


def observe(state: CubeState, calibration, face, image, previous=None, at_ms=0):
    started = perf_counter()
    frame = decode_frame(image)
    pose, reason = face_pose(frame)
    result = {
        "version": VERSION,
        "input_hash": state.state_hash,
        "face": face,
        "automatic_commit": False,
        "timing_integrity": "uncertain",
        "matches": [],
        "stable_frames": 0,
        "visible": None,
        "confidence": [],
        "pose": None,
        "requires_confirmation": True,
        "scope": (
            "Single-face, one-action hypotheses only. Hidden turns or "
            "multiple fast turns cannot be excluded."
        ),
    }
    if pose is None:
        result.update(status="suspended", reason=reason)
    else:
        samples = sample_face(pose.pop("warped"))["samples"]
        visible, confidence = calibrated_samples(samples, calibration)
        result.update(visible=visible, confidence=confidence, pose=pose)
        if (
            abs(pose["roll_degrees"]) > 15
            or pose["reprojection_rmse_px"] > 6
            or pose["blur_score"] < 35
        ):
            result.update(
                status="suspended",
                reason=(
                    "Pose or sharpness is uncertain. Stop turns and restore the "
                    "locked face orientation."
                ),
            )
        elif min(confidence) < 0.6:
            result.update(
                status="suspended",
                reason=(
                    "Sticker confidence is low (occlusion, glare, blur or changed "
                    "lighting). Logging suspended."
                ),
            )
        else:
            matches = match_candidates(state, face, visible, confidence)
            same = (
                previous
                and previous.get("visible") == visible
                and previous.get("face") == face
                and previous.get("input_hash") == state.state_hash
                and 0 <= at_ms - previous["at_ms"] <= 1500
            )
            stable = min(3, previous.get("stable_frames", 0) + 1) if same else 1
            result.update(matches=matches, stable_frames=stable)
            if not matches:
                result.update(
                    status="suspended",
                    reason=(
                        "No legal single action matches this view. Multiple/unseen moves "
                        "or orientation drift require confirmation or rescan."
                    ),
                )
            elif stable < 3:
                result.update(
                    status="settling",
                    reason=(
                        "Hold still for three consistent observations before choosing a candidate."
                    ),
                )
            elif any(m["token"] == "" for m in matches):
                result.update(
                    status="visible_unchanged",
                    reason=(
                        "Visible stickers match. Hidden turns remain unobservable; no moves logged."
                    ),
                )
            else:
                result.update(
                    status="awaiting_confirmation",
                    reason=(
                        "Stable legal candidate(s), conditional on a single observed "
                        "action. Confirm exactly what occurred; nothing is auto-logged."
                    ),
                )
    result["processing_ms"] = (perf_counter() - started) * 1000
    return result
