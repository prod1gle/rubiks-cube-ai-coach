"""Annotated dataset measurements; controlled fixtures never become physical evidence."""

import base64
from pathlib import Path
from statistics import mean

from coach.cube import CubeState
from coach.vision.tracking import observe


def evaluate(manifest, root: Path):
    kind = manifest.get("dataset_kind")
    if kind not in ("physical-webcam", "controlled-test"):
        raise ValueError("Declare dataset_kind physical-webcam or controlled-test.")
    results, times, latencies, all_suggestions = [], [], [], []
    for case in manifest["cases"]:
        state = CubeState.from_facelets(case["initial_facelets"])
        previous, last_suggestion, first_correct = None, None, None
        truth, emitted = case.get("actual_action"), []
        for image in case["frames"]:
            result = observe(
                state,
                case["calibration"],
                case["face"],
                image["image"]
                if "image" in image
                else base64.b64encode((root / image["file"]).read_bytes()).decode(),
                previous,
                image["at_ms"],
            )
            previous = result | {"at_ms": image["at_ms"]}
            times.append(result["processing_ms"])
            suggestion = None
            if result["status"] == "awaiting_confirmation" and len(result["matches"]) == 1:
                suggestion = result["matches"][0]["token"]
                correct = suggestion == truth if truth is not None else None
                if correct and first_correct is None:
                    first_correct = image["at_ms"]
                # Score distinct suggestion episodes. An early wrong episode is
                # retained even if a later frame is correct or abstains.
                if suggestion != last_suggestion:
                    emitted.append(
                        {"token": suggestion, "at_ms": image["at_ms"], "correct": correct}
                    )
            last_suggestion = suggestion
        latency = None
        if first_correct is not None and case.get("annotated_turn_complete_ms") is not None:
            latency = first_correct - case["annotated_turn_complete_ms"]
            if latency < 0:
                raise ValueError("Correct suggestion precedes annotated completion; review labels.")
            latencies.append(latency)
        all_suggestions.extend(emitted)
        results.append(
            {
                "id": case["id"],
                "actual_action": truth,
                "suggestions": emitted,
                "abstained": not emitted,
                "evidence_delay_ms": latency,
                "automatic_moves_logged": 0,
            }
        )
    scored = [r for r in all_suggestions if r["correct"] is not None]
    return {
        "dataset_kind": kind,
        "physical_measurement": kind == "physical-webcam",
        "cases": len(results),
        "frames": len(times),
        "suggestions": len(all_suggestions),
        "scored_suggestions": len(scored),
        "metric_unit": "Distinct suggestion episodes",
        "conditional_suggestion_accuracy": mean(r["correct"] for r in scored) if scored else None,
        "false_suggestions": sum(r["correct"] is False for r in all_suggestions),
        "abstentions": sum(r["abstained"] for r in results),
        "mean_processing_ms": mean(times) if times else None,
        "mean_evidence_delay_ms": mean(latencies) if latencies else None,
        "latency_annotation_samples": len(latencies),
        "results": results,
        "limits": [
            "Ground truth and physical provenance are operator supplied.",
            "Evidence delay excludes browser/network latency; uses annotated frame times.",
            "Zero automatic commits is a design property, not camera accuracy evidence.",
            "Suggestion accuracy is conditional on the restricted one-action model.",
        ],
    }
