"""SYNTHETIC TEST RECORDINGS ONLY: injected clocks, never measured practice data."""

import copy
import random

import pytest
from fastapi.testclient import TestClient

from coach.cfop.pipeline import build_candidate, verify_candidate
from coach.cfop.registry import WHITE_DOWN_FRAME as W
from coach.cube import VALID_FRAMES, CubeError, CubeState, parse_sequence
from coach.main import create_app
from coach.recordings.analytics import analyze, input_gaps, tps_series


def recording(initial, word, times=None, elapsed=None, status="complete", pauses=None):
    moves = parse_sequence(word)
    times = times if times is not None else [500 * (i + 1) for i in range(len(moves))]
    state, events = initial, []
    for move, at in zip(moves, times, strict=True):
        before = state.state_hash
        state = state.apply((move,))
        events.append(
            {
                "token": str(move),
                "at_ms": at,
                "ack_ms": at + 100,
                "before_hash": before,
                "after_hash": state.state_hash,
            }
        )
    return {
        "schema_version": 1,
        "source": "manual-virtual",
        "clock_source": "performance.now",
        "clock_id": "SYNTHETIC-TEST-CLOCK",
        "started_mono_ms": 10000,
        "initial_state": initial.to_dict(),
        "events": events,
        "pauses": pauses or [],
        "elapsed_ms": elapsed if elapsed is not None else times[-1] if times else 0,
        "inspection_ms": 12000,
        "status": status,
        "timing_integrity": "valid",
        "integrity_notes": [],
        "expected_end_hash": state.state_hash,
    }


BACK = CubeState().apply("z2 B U' B'")


def test_known_arithmetic_rotations_pauses_bins_and_stage_time():
    raw = recording(
        BACK, "y R U R'", [100, 500, 2000, 2500], pauses=[{"start_ms": 1000, "end_ms": 1500}]
    )
    result = analyze(raw)
    s = result["summary"]
    assert s["elapsed_ms"] == 2500 and s["active_ms"] == 2000
    assert s["htm"] == 3 and s["rotations"] == 1
    assert s["tps"] == 1.2 and s["active_tps"] == 1.5 and s["moving_tps"] is None
    assert s["explicit_pause_ms"] == 500 and s["input_gap_ms"] == 0
    assert [b["htm"] for b in result["tps_series"]] == [1, 0, 2]
    assert [b["tps"] for b in result["tps_series"]] == [1, 0, 4]
    stage = result["stages"][0]
    assert stage["label"] == "F2L BR" and stage["start"] == 0 and stage["end"] == 4
    assert stage["duration_ms"] == 2500 and stage["active_ms"] == 2000
    assert all(
        m["status"] == "skipped_at_prerequisite"
        for m in result["milestones"]
        if m["kind"] in ("oll", "pll", "auf")
    )
    assert any(not e["attained"] for e in result["predicate_events"])
    assert len({g["id"] for g in result["stages"]}) == len(result["stages"])


def test_input_gaps_are_not_physical_turn_pauses_and_exclude_explicit_pauses():
    events = [{"at_ms": 2000, "htm": 1}, {"at_ms": 6000, "htm": 1}]
    gaps = input_gaps(events, 8000, [{"start_ms": 3000, "end_ms": 5000}])
    assert [(g["start_ms"], g["end_ms"]) for g in gaps] == [
        (0, 2000),
        (2000, 3000),
        (5000, 6000),
        (6000, 8000),
    ]
    assert sum(g["duration_ms"] for g in gaps) == 6000
    assert gaps[0]["kind"] == "initial" and gaps[-1]["kind"] == "final"


def test_simultaneous_goals_are_combined_without_individual_pair_durations():
    raw = recording(CubeState().apply("R"), "R'", [1200])
    result = analyze(raw)
    assert len(result["stages"]) == 1
    group = result["stages"][0]
    assert group["ambiguous"] and group["duration_ms"] == 1200
    assert set(group["goals"]) == {"cross", "f2l-FR", "f2l-FL", "f2l-BL", "f2l-BR"}
    assert all(m["status"] == "combined" for m in result["milestones"][:5])
    assert all("duration_ms" not in m for m in result["milestones"])


def test_auf_only_initial_skips_and_zero_invented_stage_work():
    raw = recording(CubeState().apply("z2 U"), "U'", [250])
    result = analyze(raw)
    assert [s["label"] for s in result["stages"]] == ["Final AUF"]
    assert sum(m["status"] == "initially_satisfied" for m in result["milestones"]) == 7
    assert result["stages"][0]["htm"] == 1


@pytest.mark.parametrize("integrity,status", [("uncertain", "complete"), ("valid", "interrupted")])
def test_uncertain_or_interrupted_timing_withholds_rates_and_durations(integrity, status):
    raw = recording(BACK, "y R U R'", [100, 500, 2000, 2500])
    raw["timing_integrity"], raw["status"] = integrity, status
    result = analyze(raw)
    assert result["summary"]["htm"] == 3
    assert result["final"]["is_solved"]
    for key in (
        "elapsed_ms",
        "active_ms",
        "tps",
        "active_tps",
        "moving_tps",
        "input_gap_ms",
        "inspection_ms",
    ):
        assert result["summary"][key] is None
    assert result["tps_series"] == [] and result["input_gaps"] is None
    assert all(s["duration_ms"] is None for s in result["stages"])
    assert all(c["at_ms"] is None for c in result["checkpoints"])


def test_zero_duration_is_valid_but_tps_is_unavailable():
    result = analyze(recording(CubeState().apply("R"), "R'", [0]))
    assert result["summary"]["elapsed_ms"] == 0
    assert result["summary"]["tps"] is None and result["tps_series"] == []


def test_rotation_only_partial_record_counts_zero_htm_and_unclassified_time():
    result = analyze(recording(BACK, "x y2 z'", [100, 300, 500], 1000, "stopped"))
    assert result["summary"]["htm"] == 0 and result["summary"]["rotations"] == 3
    assert result["summary"]["tps"] == 0
    assert result["stages"] == [] and result["summary"]["unclassified_ms"] == 1000


@pytest.mark.parametrize("frame", sorted(VALID_FRAMES))
def test_all_viewer_grips_reconstruct_exact_states_and_progress(frame):
    initial = CubeState(BACK.cp, BACK.co, BACK.ep, BACK.eo, frame)
    word, _ = verify_candidate(initial, build_candidate(initial.in_reference(W)))
    raw = recording(initial, word)
    result = analyze(raw)
    assert result["final"]["is_solved"]
    assert result["final"]["state"]["frame"] == frame
    state = initial
    for checkpoint, event in zip(result["checkpoints"][1:], raw["events"], strict=True):
        state = state.apply(event["token"])
        assert checkpoint["state_hash"] == state.state_hash


@pytest.mark.parametrize("seed", range(6))
def test_full_synthetic_cfop_records_have_contiguous_non_overlapping_checkpoints(seed):
    rng = random.Random(0x3000 + seed)
    initial = CubeState().apply(" ".join(rng.choice("URFDLB") for _ in range(25)))
    word, _ = verify_candidate(initial, build_candidate(initial.in_reference(W)))
    result = analyze(recording(initial, word))
    assert result["final"]["is_solved"]
    end = 0
    for stage in result["stages"]:
        assert stage["start"] == end
        start = CubeState.from_dict(result["checkpoints"][stage["start"]]["state"])
        after = start.apply(stage["notation"])
        assert after.state_hash == stage["end_hash"]
        assert start.apply(stage["efficiency"]["simplified_notation"]) == after
        p = after.in_reference(W).layer_progress()
        for goal in stage["goals"]:
            assert (
                p["pairs"][goal[4:]]
                if goal.startswith("f2l-")
                else p["solved" if goal == "auf" else goal]
            )
        end = stage["end"]
    assert end == len(result["events"])
    assert sum(s["duration_ms"] for s in result["stages"]) == result["summary"]["elapsed_ms"]
    assert sum(s["htm"] for s in result["stages"]) == result["summary"]["htm"]
    assert len(result["milestones"]) == 8


def test_adjacent_efficiency_is_endpoint_verified_and_not_global_optimality():
    result = analyze(recording(BACK, "B U U U U U B'"))
    assert result["summary"]["htm"] == 7 and result["summary"]["simplified_htm"] == 3
    assert result["stages"][0]["efficiency"]["removable_adjacent_htm"] == 4
    assert result["stages"][0]["efficiency"]["exact_endpoint_verified"]


def test_bins_are_bounded_and_final_exact_boundary_event_is_not_lost():
    assert sum(b["htm"] for b in tps_series([{"at_ms": 1000, "htm": 1}], 1000)) == 1
    assert len(tps_series([{"at_ms": 86400000, "htm": 1}], 86400000)) <= 600


@pytest.mark.parametrize(
    "mutation",
    [
        "time_backwards",
        "ack_before_input",
        "bad_before",
        "bad_after",
        "bad_final",
        "batch",
        "false_solved",
        "late_stop",
        "past_solved",
        "paused_move",
        "overlap_pause",
    ],
)
def test_invalid_recording_is_rejected_clearly(mutation):
    raw = recording(BACK, "B U B'", [500, 1000, 1500])
    if mutation == "time_backwards":
        raw["events"][1]["at_ms"] = 100
    elif mutation == "ack_before_input":
        raw["events"][0]["ack_ms"] = 0
    elif mutation == "bad_before":
        raw["events"][0]["before_hash"] = "f" * 64
    elif mutation == "bad_after":
        raw["events"][0]["after_hash"] = "f" * 64
    elif mutation == "bad_final":
        raw["expected_end_hash"] = "f" * 64
    elif mutation == "batch":
        raw["events"][0]["token"] = "B U"
    elif mutation == "false_solved":
        raw = recording(BACK, "R")
    elif mutation == "late_stop":
        raw["elapsed_ms"] += 100
    elif mutation == "past_solved":
        raw = recording(BACK, "B U B' U U U U")
    elif mutation == "paused_move":
        raw["pauses"] = [{"start_ms": 400, "end_ms": 600}]
    elif mutation == "overlap_pause":
        raw["pauses"] = [{"start_ms": 0, "end_ms": 700}, {"start_ms": 600, "end_ms": 800}]
    with pytest.raises(CubeError):
        analyze(raw)


def test_http_schema_finiteness_and_real_analytics_endpoint():
    raw = recording(BACK, "y R U R'", [100, 500, 2000, 2500])
    with TestClient(create_app()) as client:
        result = client.post("/api/cube/recordings/analyze", json=raw)
        assert result.status_code == 200 and result.json()["summary"]["tps"] == 1.2
        for patch in (
            {"clock_source": "animation"},
            {"source": "webcam"},
            {"elapsed_ms": -1},
            {"schema_version": 2},
        ):
            assert client.post("/api/cube/recordings/analyze", json=raw | patch).status_code == 422
        assert (
            client.post(
                "/api/cube/recordings/analyze",
                content='{"elapsed_ms":NaN}',
                headers={"Content-Type": "application/json"},
            ).status_code
            == 422
        )
        bad = copy.deepcopy(raw)
        bad["events"][0]["at_ms"] = "100"
        assert client.post("/api/cube/recordings/analyze", json=bad).status_code == 422


def test_unrepresentably_small_duration_never_emits_nonfinite_rates():
    result = analyze(recording(CubeState().apply("R"), "R'", [1e-320]))
    assert result["summary"]["tps"] is None
    assert result["summary"]["active_tps"] is None
    assert result["tps_series"] == []
