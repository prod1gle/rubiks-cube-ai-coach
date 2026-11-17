"""Pure analytics over exact states and client monotonic timestamps, never animation."""

from math import ceil, isfinite

from coach.analysis.service import display, progress, simplify
from coach.cfop.search import SLOTS, cross_code, cross_table
from coach.cube import CubeError, CubeState, parse_sequence, sequence_info

VERSION = "manual-checkpoints-1"


def rate(moves, duration):
    if duration <= 0:
        return None
    value = moves * 1000 / duration
    return value if isfinite(value) else None


def overlap(start, end, pauses):
    return sum(max(0, min(end, p["end_ms"]) - max(start, p["start_ms"])) for p in pauses)


def input_gaps(events, elapsed, pauses, threshold=1000):
    """Full observed no-input gaps, excluding explicit practice pauses."""
    points = [0, *[e["at_ms"] for e in events], elapsed]
    result = []
    for index, (a, b) in enumerate(zip(points, points[1:], strict=False)):
        parts = [(a, b)]
        for p in pauses:
            split = []
            for lo, hi in parts:
                if p["end_ms"] <= lo or p["start_ms"] >= hi:
                    split.append((lo, hi))
                else:
                    if lo < p["start_ms"]:
                        split.append((lo, p["start_ms"]))
                    if p["end_ms"] < hi:
                        split.append((p["end_ms"], hi))
            parts = split
        for lo, hi in parts:
            if hi - lo >= threshold:
                result.append(
                    {
                        "start_ms": lo,
                        "end_ms": hi,
                        "duration_ms": hi - lo,
                        "kind": "initial"
                        if index == 0
                        else "final"
                        if index == len(events)
                        else "between_inputs",
                    }
                )
    return result


def tps_series(events, elapsed):
    if elapsed <= 0:
        return []
    width = max(1000, ceil(elapsed / 600))
    counts = [0] * max(1, ceil(elapsed / width))
    for event in events:
        counts[min(int(event["at_ms"] // width), len(counts) - 1)] += event["htm"]
    result = [
        {
            "start_ms": i * width,
            "end_ms": min((i + 1) * width, elapsed),
            "htm": n,
            "tps": rate(n, min((i + 1) * width, elapsed) - i * width),
        }
        for i, n in enumerate(counts)
    ]
    return result if all(b["tps"] is not None for b in result) else []


def stage_checkpoints(states, events, pauses, timed):
    """Ordered prerequisite checkpoints. Combined F2L goals have no invented order."""
    values = [progress(s) for s in states]
    times = [0, *[e["at_ms"] for e in events]]
    groups, milestones = [], []
    cross = next((i for i, p in enumerate(values) if p["cross"]), None)
    completed = set()

    def milestone(identifier, kind, index, status, group_id=None):
        milestones.append(
            {
                "id": identifier,
                "kind": kind,
                "index": index,
                "at_ms": times[index] if timed and index is not None else None,
                "status": status,
                "group_id": group_id,
            }
        )

    def group(start, end, goals, label, ambiguous=False):
        word = " ".join(e["token"] for e in events[start:end])
        reduced = simplify(word)
        if states[start].apply(reduced) != states[end]:
            raise CubeError(
                "analytics_verification", "Simplified stage failed exact-state verification."
            )
        info, fewer = sequence_info(word), sequence_info(reduced)
        duration = times[end] - times[start] if timed else None
        identifier = f"checkpoint-{end}"
        minimum = None
        if goals == ["cross"]:
            _, distances = cross_table()
            minimum = int(distances[cross_code(states[start].in_reference("DLFURB"))])
        row = {
            "id": identifier,
            "label": label,
            "goals": goals,
            "start": start,
            "end": end,
            "start_hash": states[start].state_hash,
            "end_hash": states[end].state_hash,
            "start_ms": times[start] if timed else None,
            "end_ms": times[end] if timed else None,
            "duration_ms": duration,
            "active_ms": duration - overlap(times[start], times[end], pauses) if timed else None,
            "htm": info["htm"],
            "rotations": info["rotations"],
            "notation": word,
            "ambiguous": ambiguous,
            "attribution": "inferred state checkpoint, not recognition time",
            "efficiency": {
                "actual_htm": info["htm"],
                "simplified_htm": fewer["htm"],
                "removable_adjacent_htm": info["htm"] - fewer["htm"],
                "simplified_notation": reduced,
                "exact_endpoint_verified": True,
                "cross_min_htm": minimum,
            },
        }
        groups.append(row)
        return identifier

    if cross is None:
        milestone("cross", "cross", None, "pending")
        cursor = 0
    else:
        combined = [s for s in SLOTS if values[cross]["pairs"][s]]
        goals = ["cross", *[f"f2l-{s}" for s in combined]]
        gid = (
            group(
                0,
                cross,
                goals,
                "Cross" + (" + F2L " + ", ".join(combined) if combined else ""),
                bool(combined),
            )
            if cross
            else None
        )
        milestone(
            "cross",
            "cross",
            cross,
            "initially_satisfied" if cross == 0 else "combined" if combined else "performed",
            gid,
        )
        for s in combined:
            milestone(
                f"f2l-{s}", "f2l", cross, "initially_satisfied" if cross == 0 else "combined", gid
            )
            completed.add(s)
        cursor = cross
        for index in range(cross + 1, len(states)):
            p = values[index]
            if not p["cross"] or any(not p["pairs"][s] for s in completed):
                continue
            new = [s for s in SLOTS if s not in completed and p["pairs"][s]]
            if not new:
                continue
            gid = group(
                cursor, index, [f"f2l-{s}" for s in new], "F2L " + " + ".join(new), len(new) > 1
            )
            for s in new:
                milestone(
                    f"f2l-{s}", "f2l", index, "combined" if len(new) > 1 else "performed", gid
                )
            completed.update(new)
            cursor = index
            if len(completed) == 4:
                break
    for s in SLOTS:
        if s not in completed:
            milestone(f"f2l-{s}", "f2l", None, "pending")
    ready = cross is not None and len(completed) == 4
    for key, title in (("oll", "OLL"), ("pll", "PLL"), ("solved", "Final AUF")):
        identifier = "auf" if key == "solved" else key
        index = (
            next((i for i in range(cursor, len(states)) if values[i][key]), None) if ready else None
        )
        if index is None:
            milestone(identifier, identifier, None, "pending")
            ready = False
        elif index == cursor:
            milestone(
                identifier,
                identifier,
                index,
                "initially_satisfied" if index == 0 else "skipped_at_prerequisite",
            )
        else:
            gid = group(cursor, index, [identifier], title)
            milestone(identifier, identifier, index, "performed", gid)
            cursor = index
    # Raw transitions disclose transient predicate loss without pretending it is
    # a human stage restart. Pair events are independent of Cross eligibility.
    changes = []

    def flat(p):
        return {
            "cross": p["cross"],
            **{f"f2l-{s}": p["pairs"][s] for s in SLOTS},
            "oll": p["oll"],
            "pll": p["pll"],
            "auf": p["solved"],
        }

    for i in range(1, len(states)):
        a, b = flat(values[i - 1]), flat(values[i])
        for key in a:
            if a[key] != b[key]:
                changes.append(
                    {
                        "id": key,
                        "index": i,
                        "attained": b[key],
                        "at_ms": times[i] if timed else None,
                    }
                )
    return groups, milestones, changes, values


def analyze(record):
    state = CubeState.from_dict(record["initial_state"])
    if len(record["events"]) > 1024:
        raise CubeError("record_limit", "Analyze at most 1,024 accepted manual moves.")
    elapsed, pauses = record["elapsed_ms"], record["pauses"]
    if not isfinite(elapsed) or elapsed < 0:
        raise CubeError("timing", "Elapsed duration must be finite and nonnegative.")
    previous = 0
    for p in pauses:
        if not 0 <= p["start_ms"] <= p["end_ms"] <= elapsed or p["start_ms"] < previous:
            raise CubeError(
                "timing", "Practice pause intervals must be ordered, disjoint and within the run."
            )
        previous = p["end_ms"]
    states, events, previous = [state], [], 0
    for index, event in enumerate(record["events"]):
        moves = parse_sequence(event["token"])
        if len(moves) != 1:
            raise CubeError(
                "timed_token", "Each timed input must be exactly one face turn or grip rotation."
            )
        at = event["at_ms"]
        if not previous <= at <= elapsed or not isfinite(event["ack_ms"]) or event["ack_ms"] < at:
            raise CubeError(
                "timing",
                "Input times must be monotonic and within the run; acknowledgement follows input.",
            )
        if any(p["start_ms"] < at < p["end_ms"] for p in pauses):
            raise CubeError("timing", "A move cannot be entered during an explicit practice pause.")
        if event["before_hash"] != state.state_hash:
            raise CubeError(
                "record_mismatch", "A move's starting hash does not match the reconstructed record."
            )
        state = state.apply(moves)
        if event["after_hash"] != state.state_hash:
            raise CubeError(
                "record_mismatch", "A move's ending hash does not match the canonical engine."
            )
        if states[0].is_solved and record["status"] == "complete":
            raise CubeError("completion", "A timed solve must start from an unsolved state.")
        if state.is_solved and index < len(record["events"]) - 1 and record["status"] == "complete":
            raise CubeError(
                "completion", "A completed run must stop at its first validated solved state."
            )
        info = sequence_info(moves)
        events.append(
            event
            | {"token": info["normalized"], "htm": info["htm"], "rotation": bool(info["rotations"])}
        )
        states.append(state)
        previous = at
    if record["status"] == "complete" and (
        not events or not state.is_solved or elapsed != events[-1]["at_ms"]
    ):
        raise CubeError(
            "completion",
            "Completion requires a validated solved endpoint and the final input's timestamp.",
        )
    if record.get("expected_end_hash") != state.state_hash:
        raise CubeError(
            "record_mismatch", "The final recording hash does not match the reconstructed state."
        )
    timed = record["timing_integrity"] == "valid" and record["status"] != "interrupted"
    htm, rotations = sum(e["htm"] for e in events), sum(e["rotation"] for e in events)
    active = elapsed - overlap(0, elapsed, pauses)
    groups, milestones, changes, values = stage_checkpoints(states, events, pauses, timed)
    simplified = simplify(" ".join(e["token"] for e in events))
    if states[0].apply(simplified) != state:
        raise CubeError(
            "analytics_verification", "Simplified record failed exact endpoint verification."
        )
    gaps = input_gaps(events, elapsed, pauses) if timed else None
    notes = [
        "Manual virtual input timestamps; not physical turning or competition timing.",
        "Stage durations are inferred checkpoint intervals, not recognition/decision times.",
        "Combined goals share one duration; individual pair order/durations are unavailable.",
        "Moving TPS unavailable: manual input has no measured turn start/end intervals.",
        "Predicate losses remain visible; they do not imply human stage restarts.",
        *record["integrity_notes"],
    ]
    if not timed:
        notes.append(
            "Timing uncertain/interrupted: durations, TPS and input-gap statistics unavailable."
        )
    return {
        "schema_version": 1,
        "analytics_version": VERSION,
        "source": record["source"],
        "status": record["status"],
        "timing_available": timed,
        "initial": display(states[0]),
        "final": display(state),
        "sequence": " ".join(e["token"] for e in events),
        "events": events,
        "summary": {
            "elapsed_ms": elapsed if timed else None,
            "observed_elapsed_ms": elapsed,
            "active_ms": active if timed else None,
            "unclassified_ms": elapsed - (groups[-1]["end_ms"] if groups else 0) if timed else None,
            "explicit_pause_ms": overlap(0, elapsed, pauses) if timed else None,
            "htm": htm,
            "rotations": rotations,
            "tps": rate(htm, elapsed) if timed else None,
            "active_tps": rate(htm, active) if timed else None,
            "moving_tps": None,
            "input_gap_ms": sum(g["duration_ms"] for g in gaps) if timed else None,
            "inspection_ms": record["inspection_ms"] if timed else None,
            "inspection_overrun": record["inspection_ms"] > 15000 if timed else None,
            "simplified_htm": sequence_info(simplified)["htm"],
            "metric": "HTM-outer-v1",
        },
        "stages": groups,
        "milestones": milestones,
        "predicate_events": changes,
        "checkpoints": [
            {
                "index": i,
                "at_ms": ([0] + [e["at_ms"] for e in events])[i] if timed else None,
                "state": s.to_dict(),
                "state_hash": s.state_hash,
                "progress": values[i],
            }
            for i, s in enumerate(states)
        ],
        "input_gaps": gaps,
        "pauses": pauses,
        "tps_series": tps_series(events, elapsed) if timed else [],
        "notes": notes,
    }
