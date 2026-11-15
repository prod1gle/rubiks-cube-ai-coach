"""Compare objectives from identical starts; no timing or global-best inventions."""

from hashlib import sha256
from time import perf_counter

from coach.cfop.registry import WHITE_DOWN_FRAME as W
from coach.cfop.search import SLOTS
from coach.coaching.ergonomics import metrics
from coach.coaching.service import recommend
from coach.cube import (
    CubeError,
    Move,
    format_sequence,
    inverse_sequence,
    parse_sequence,
    plan_sequence,
    reference_sequence,
    sequence_info,
)


def display(state):
    return state.snapshot() | {"sequence": sequence_info("")}


def progress(state):
    return state.in_reference(W).layer_progress()


def reconstruct(initial, sequence, start, end, expected_end_hash=None):
    moves = parse_sequence(sequence)
    if len(moves) > 1024:
        raise CubeError("record_limit", "Review at most 1,024 recorded actions.")
    if not 0 <= start < end <= len(moves):
        raise CubeError("segment_range", "Select a nonempty segment within the recorded actions.")
    if end - start > 128:
        raise CubeError("segment_limit", "Select at most 128 actions for side-by-side replay.")
    before = initial.apply(moves[:start])
    after = before.apply(moves[start:end])
    final = after.apply(moves[end:])
    if expected_end_hash and final.state_hash != expected_end_hash:
        raise CubeError(
            "record_mismatch", "The record does not reconstruct its supplied final hash."
        )
    return before, after, final, moves


def objective_goal(before, after, requested="auto"):
    a, b = progress(before), progress(after)
    kept = [s for s in SLOTS if a["cross"] and a["pairs"][s]]
    kind = requested
    if kind == "auto":
        if a["cross"] and (not b["cross"] or any(not b["pairs"][s] for s in kept)):
            kind = "position"
        elif b["solved"] and not a["solved"]:
            kind = "solve"
        elif b["pll"] and not a["pll"]:
            kind = "pll"
        elif b["oll"] and not a["oll"]:
            kind = "oll"
        elif b["cross"] and any(b["pairs"][s] and not a["pairs"][s] for s in SLOTS):
            kind = "f2l"
        elif b["cross"] and not a["cross"]:
            kind = "cross"
        else:
            kind = "position"
    slots = [s for s in SLOTS if b["pairs"][s]] if kind == "f2l" else []
    goal = {
        "kind": kind,
        "slots": slots,
        "protected_slots": kept if kind != "position" else [],
        "cross_required": kind != "position" and a["cross"],
        "target_position_hash": after.position_hash if kind == "position" else None,
        "description": {
            "position": "Reach the actual segment's exact physical position (grip may differ)",
            "cross": "Complete the white Cross",
            "f2l": "Complete the white Cross and F2L slots: " + ", ".join(slots),
            "oll": "Orient the last layer with the first two layers solved",
            "pll": "Permute the last layer, allowing final AUF",
            "solve": "Solve the complete cube",
        }[kind],
    }
    if kind == "f2l" and not slots:
        raise CubeError(
            "objective_unmet", "The actual endpoint has no solved F2L slots to compare."
        )
    if not meets(after, goal):
        raise CubeError(
            "objective_unmet",
            "The actual segment does not satisfy this objective with protected progress. "
            "Choose Auto or Exact physical endpoint, or select another segment.",
        )
    return goal


def meets(state, goal):
    p = progress(state)
    if goal["kind"] == "position":
        return state.position_hash == goal["target_position_hash"]
    if goal["cross_required"] and not p["cross"]:
        return False
    if any(not p["pairs"][s] for s in goal["protected_slots"]):
        return False
    if goal["kind"] == "f2l":
        return p["cross"] and all(p["pairs"][s] for s in goal["slots"])
    return p["solved" if goal["kind"] == "solve" else goal["kind"]]


def simplify(word):
    """Adjacent same-axis-token cancellation only; engine rechecks its endpoint."""
    result = []
    for move in parse_sequence(word):
        if result and result[-1].face == move.face:
            turns = (result.pop().turns + move.turns) % 4
            if turns:
                result.append(Move(move.face, turns))
        else:
            result.append(move)
    return format_sequence(result)


def staged_words(start, goal, ranking):
    """Bounded next-goal alternatives, continued only to the requested predicate."""
    if meets(start, goal):
        return [("", "Already satisfies the selected goal", True)]
    first = recommend(start, ranking=ranking)
    paths = []
    # Vary the opening pair/path/grip, then continue deterministically to this goal.
    for opening in first["candidates"][:16]:
        state, words = start.apply(opening["notation"]), [opening["notation"]]
        valid = True
        for _ in range(8):
            if meets(state, goal):
                break
            choices = recommend(state, ranking=ranking)["candidates"]
            if not choices:
                valid = False
                break
            wanted = [c for c in choices if c["slot"] in goal["slots"]]
            selected = (wanted or choices)[0]
            words.append(selected["notation"])
            state = state.apply(selected["notation"])
        word = " ".join(words)
        if valid and meets(state, goal) and len(parse_sequence(word)) <= 128:
            paths.append((word, "Protected CFOP continuation", True))
    return paths


def context(initial, sequence, start, end, requested, expected_end_hash=None):
    before, after, final, moves = reconstruct(initial, sequence, start, end, expected_end_hash)
    goal = objective_goal(before, after, requested)
    return before, after, final, moves, goal


def compare(initial, sequence, start, end, objective="fewest", requested="auto", expected=None):
    started = perf_counter()
    before, after, final, moves, goal = context(initial, sequence, start, end, requested, expected)
    actual_word = format_sequence(moves[start:end])
    warnings, pool = [], []
    reduced = simplify(actual_word)
    if reduced != actual_word:
        pool.append((reduced, "Adjacent-turn simplification", False))
    if goal["kind"] == "position":
        # A verified bridge works for arbitrary intermediate endpoints. It may be
        # longer than actual; never present it as a CFOP path or guaranteed saving.
        if before.position_hash == after.position_hash:
            pool.append(("", "Same physical position already reached", False))
        else:
            left, right = recommend(before, mode="short"), recommend(after, mode="short")
            warnings.extend(left["warnings"] + right["warnings"])
            a = left["candidates"][0]["notation"] if left["candidates"] else ""
            b = right["candidates"][0]["notation"] if right["candidates"] else ""
            b = reference_sequence(b, after.frame, before.frame)
            bridge = simplify(a + " " + inverse_sequence(b))
            pool.append((bridge, "Verified bridge through solved", False))
    else:
        pool.extend(staged_words(before, goal, "ergonomic" if objective == "training" else "htm"))
        if objective == "fewest":
            short = recommend(before, mode="short")
            warnings.extend(short["warnings"])
            pool.extend((c["notation"], c["source"], False) for c in short["candidates"])

    def branch(word, source, staged=False):
        word = format_sequence(word)
        state = before.apply(word)
        if not meets(state, goal):
            raise CubeError("comparison_verification", "An alternative failed its selected goal.")
        kept = [s for s in goal["protected_slots"] if progress(state)["pairs"][s]]
        return {
            "id": sha256(word.encode()).hexdigest()[:16],
            "notation": word,
            "source": source,
            "staged": staged,
            "metrics": metrics(word),
            "end": display(state),
            "plan": plan_sequence(before, word),
            "goal_verified": True,
            "protected_slots": kept,
            "same_position": state.position_hash == after.position_hash,
            "same_state": state.state_hash == after.state_hash,
            "verified": True,
            "optimality": "unproven",
        }

    actual = branch(actual_word, "Recorded actual segment")
    unique = {}
    for word, source, staged in pool:
        word = format_sequence(word)
        if word != actual_word and len(parse_sequence(word)) <= 128:
            candidate = branch(word, source, staged)
            if word not in unique or (staged and not unique[word]["staged"]):
                unique[word] = candidate

    def key(c):
        m = c["metrics"]
        preference = int(not c["staged"]) if objective in ("cfop", "training") else 0
        cost = m["comfort_score"] if objective == "training" else m["htm"]
        return preference, cost, m["htm"], m["rotations"], c["notation"]

    alternatives = sorted(unique.values(), key=key)[:6]
    if not alternatives:
        warnings.append("No distinct alternative was found in this bounded candidate pool.")
    annotations = [
        "Both branches begin at the identical canonical state and grip.",
        "Counts use emitted outer-turn HTM; cube rotations are separate zero-HTM actions.",
        "Animation is a simulation. Physical execution time and seconds saved are unknown.",
        "Different stage-goal endpoints cannot reuse the remaining recorded moves unchecked.",
    ]
    if goal["kind"] == "position":
        annotations.append("No new CFOP goal was inferred; comparing exact physical endpoints.")
    for c in alternatives:
        c["difference"] = {
            "htm_saved": actual["metrics"]["htm"] - c["metrics"]["htm"],
            "rotations_saved": actual["metrics"]["rotations"] - c["metrics"]["rotations"],
            "comfort_points_saved": round(
                actual["metrics"]["comfort_score"] - c["metrics"]["comfort_score"], 2
            ),
        }
    return {
        "record": {
            "initial_hash": initial.state_hash,
            "final_hash": final.state_hash,
            "notation": format_sequence(moves),
            "actions": len(moves),
            "start": start,
            "end": end,
        },
        "start": display(before),
        "goal": goal,
        "objective": objective,
        "actual": actual,
        "alternatives": alternatives,
        "recommended_id": alternatives[0]["id"] if alternatives else None,
        "annotations": annotations,
        "warnings": list(dict.fromkeys(warnings)),
        "elapsed_ms": round((perf_counter() - started) * 1000, 3),
        "scope": "Best among generated verified candidates; global optimality unproven.",
        "training_policy": "comfort-1 fixed coded ergonomics; no learned personalization",
    }


def practice(initial, sequence, start, end, attempt, requested="auto", expected=None):
    before, _, _, _, goal = context(initial, sequence, start, end, requested, expected)
    plan = plan_sequence(before, attempt)
    state = before.apply(attempt)
    return {
        "start_hash": before.state_hash,
        "end": display(state),
        "goal": goal,
        "success": meets(state, goal),
        "metrics": metrics(attempt),
        "plan": plan,
        "protected_preserved": all(progress(state)["pairs"][s] for s in goal["protected_slots"]),
    }
