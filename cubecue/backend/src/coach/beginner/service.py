"""A connected worked example, not an arbitrary-state beginner solver.

Each case is constructed backwards from its verified target. No handwritten
facelet arrays, move tables, state mutation, or full-cube solver are involved.
"""

from functools import lru_cache

from coach.cube import CubeError, CubeState, plan_sequence, sequence_info

VERSION = "beginner-v1"
FRAME = CubeState().apply("z2").frame
# White down, green front. Stages are intentionally elementary, not speed solutions.
STAGES = (
    ("cross", "White cross", "F2", "cross", None),
    ("corners", "White corners", "R U R' U'", "first_layer", "cross"),
    ("middle", "Middle edges", "U R U' R' U' F' U F", "f2l", "first_layer"),
    ("yellow-cross", "Yellow cross", "F R U R' U' F'", "yellow_cross", "f2l"),
    ("yellow-face", "Yellow face", "R U R' U R U2 R'", "oll", "yellow_cross"),
    (
        "yellow-corners",
        "Place yellow corners",
        "R U R' U' R' F R2 U' R' U' R U R' F'",
        "corners_placed",
        "oll",
    ),
    ("yellow-edges", "Place yellow edges", "R U' R U R U R U' R' U' R2", "pll", "corners_placed"),
    ("alignment", "The final turn", "U", "solved", "pll"),
)


def progress(state: CubeState) -> dict[str, bool]:
    reference = state.in_reference(FRAME)
    p = reference.layer_progress()
    first = p["cross"] and all(reference.cp[i] == i and reference.co[i] == 0 for i in range(4, 8))
    yellow_cross = p["f2l"] and not any(reference.eo[:4])
    # Corner placement may be correct relative to the sides after a final U adjustment.
    corners = p["oll"] and any(
        all(reference.apply(word).cp[i] == i for i in range(4)) for word in ("", "U", "U2", "U'")
    )
    return {
        "cross": p["cross"],
        "first_layer": first,
        "f2l": p["f2l"],
        "yellow_cross": yellow_cross,
        "oll": p["oll"],
        "corners_placed": corners,
        "pll": p["pll"],
        "solved": state.is_solved,
    }


def snapshot(state):
    return state.snapshot() | {"sequence": sequence_info("")}


@lru_cache(maxsize=1)
def lessons() -> dict[str, dict]:
    end = CubeState().apply("z2")
    result = {}
    for lesson_id, title, algorithm, goal, protect in reversed(STAGES):
        start = end.apply(sequence_info(algorithm)["inverse"])
        if progress(start)[goal] or not progress(end)[goal]:
            raise RuntimeError(f"Beginner stage {lesson_id} does not demonstrate its objective")
        if protect and not (progress(start)[protect] and progress(end)[protect]):
            raise RuntimeError(f"Beginner stage {lesson_id} breaks its prerequisite")
        result[lesson_id] = {
            "id": lesson_id,
            "title": title,
            "goal": goal,
            "protect": protect,
            "algorithm": algorithm,
            "start": snapshot(start),
            "end": snapshot(end),
            "plan": plan_sequence(start, algorithm),
            "verified": True,
            "version": VERSION,
            "start_progress": progress(start),
            "end_progress": progress(end),
        }
        end = start
    start = CubeState().apply("z2")
    result["foundations"] = {
        "id": "foundations",
        "title": "Meet your cube",
        "goal": "position",
        "protect": None,
        "algorithm": "R R'",
        "start": snapshot(start),
        "end": snapshot(start),
        "plan": plan_sequence(start, "R R'"),
        "verified": True,
        "version": VERSION,
        "start_progress": progress(start),
        "end_progress": progress(start),
    }
    return {key: result[key] for key in ("foundations", *(s[0] for s in STAGES))}


def lesson(lesson_id: str) -> dict:
    if lesson_id not in lessons():
        raise CubeError("beginner_lesson", "Choose a lesson from the beginner course.")
    return lessons()[lesson_id]


def check(lesson_id: str, attempt: str, expected_hash: str) -> dict:
    item = lesson(lesson_id)
    start = CubeState.from_dict(item["start"]["state"])
    plan = plan_sequence(start, attempt)
    end = start.apply(attempt)
    if expected_hash != end.state_hash:
        raise CubeError("beginner_stale", "Your cube changed before verification. Check again.")
    p = progress(end)
    protected = item["protect"] is None or p[item["protect"]]
    goal = (
        (end.position_hash == start.position_hash)
        if item["goal"] == "position"
        else p[item["goal"]]
    )
    return {
        "lesson_id": lesson_id,
        "input_hash": start.state_hash,
        "end_hash": end.state_hash,
        "goal": item["goal"],
        "objective_met": goal,
        "protected_preserved": protected,
        "success": plan["sequence"]["htm"] > 0 and goal and protected,
        "progress": p,
        "moves": plan["sequence"]["htm"],
        "verified": True,
    }
