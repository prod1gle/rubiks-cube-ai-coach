"""Versioned, explicitly coded costs and progress-preserving F2L alternatives."""

from functools import lru_cache
from heapq import heappop, heappush

from coach.cfop.registry import WHITE_DOWN_FRAME
from coach.cfop.search import macros, pair_code
from coach.cube import (
    CubeState,
    parse_sequence,
    reference_sequence,
    rotation_sequence,
    sequence_info,
)

PROFILE_VERSION = "comfort-1"
# Integer hundredths avoid floating-point search/tie errors. These are heuristics,
# not measured seconds or a learned right/left-hand preference model.
FACE_PENALTIES = {"U": 0, "R": 0, "F": 35, "D": 100, "L": 15, "B": 200}
ROTATION_COST = 200


def metrics(word: str) -> dict:
    info = sequence_info(word)
    moves = parse_sequence(word)
    faces = {face: sum(m.face == face for m in moves) for face in FACE_PENALTIES}
    score = info["htm"] * 100 + info["rotations"] * ROTATION_COST
    score += sum(faces[face] * cost for face, cost in FACE_PENALTIES.items())
    return {
        "htm": info["htm"],
        "rotations": info["rotations"],
        "face_turns": faces,
        "comfort_score": score / 100,
        "metric": info["metric"],
    }


def grips(state: CubeState, allow_rotations: bool):
    frames = [state.frame]
    if allow_rotations:
        frames.extend(
            CubeState(frame=WHITE_DOWN_FRAME).apply(word).frame for word in ("", "y", "y2", "y'")
        )
    return tuple((frame, rotation_sequence(state.frame, frame)) for frame in dict.fromkeys(frames))


@lru_cache(maxsize=160)
def weighted_pair_table(slot: int, protected: int, frame: str, ranking: str):
    allowed = tuple(m for m in macros() if m.preserved & protected == protected)
    weights = tuple(
        int(
            round(
                metrics(reference_sequence(m.notation, WHITE_DOWN_FRAME, frame))["comfort_score"]
                * 100
            )
        )
        if ranking == "ergonomic"
        else m.cost * 100
        for m in allowed
    )
    root = pair_code(CubeState(), slot)
    distance = [10**9] * 576
    distance[root] = 0
    pending = [(0, root)]
    while pending:
        cost, code = heappop(pending)
        if distance[code] != cost:
            continue
        for macro, weight in zip(allowed, weights, strict=True):
            after = macro.apply_pair(code)
            new = cost + weight
            if new < distance[after]:
                distance[after] = new
                heappush(pending, (new, after))
    return allowed, weights, tuple(distance)


def pair_paths(state: CubeState, slot: int, protected: int, frame: str, ranking: str):
    """Best weighted path plus bounded first-macro deviations, without coordinate loops."""
    allowed, weights, distance = weighted_pair_table(slot, protected, frame, ranking)
    start = pair_code(state, slot)

    def descend(code, used, seen):
        while distance[code]:
            found = next(
                (
                    m
                    for m, w in zip(allowed, weights, strict=True)
                    if distance[m.apply_pair(code)] + w == distance[code]
                ),
                None,
            )
            if found is None:
                return None
            code = found.apply_pair(code)
            if code in seen:
                return None
            seen.add(code)
            used.append(found)
        return used

    paths = [descend(start, [], {start})]
    for first in allowed:
        after = first.apply_pair(start)
        if after == start:
            continue
        paths.append(descend(after, [first], {start, after}))
    distinct = {}
    for path in paths:
        if path is None:
            continue
        word = " ".join(m.notation for m in path)
        if not word or len(word.split()) > 48:
            continue
        # Verify full states at each macro boundary, not just the projected pair.
        current = state
        for macro in path:
            current = current.apply(macro.notation)
            p = current.layer_progress()
            if not p["cross"] or any(
                not p["pairs"][s]
                for i, s in enumerate(("FR", "FL", "BL", "BR"))
                if protected & (1 << i)
            ):
                raise ValueError("Coaching macro disturbed protected progress")
        if not current.layer_progress()["pairs"][("FR", "FL", "BL", "BR")[slot]]:
            raise ValueError("Coaching path failed its pair goal")
        distinct[word] = [m.id for m in path]
    # Select actual cheapest distinct words after translating into this grip.
    return sorted(
        distinct.items(),
        key=lambda item: (
            metrics(reference_sequence(item[0], WHITE_DOWN_FRAME, frame))["comfort_score"]
            if ranking == "ergonomic"
            else len(item[0].split()),
            item[0],
        ),
    )[:3]
