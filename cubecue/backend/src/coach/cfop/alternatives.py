"""State-bound, sourced CFOP alternatives. Recognition always comes from coach.cube.

The imported labels are provenance only. Algorithms are indexed by their inverse
engine states, then re-applied to the exact requested state before release.
"""

import json
from functools import lru_cache
from hashlib import sha256
from importlib.resources import files

from coach.cfop.registry import AUFS, oll_key, pll_key
from coach.cfop.search import SLOTS, pair_code
from coach.cube import (
    FACES,
    CubeState,
    compile_catalog_algorithm,
    format_sequence,
    inverse_sequence,
    parse_sequence,
    rotation_sequence,
)

VERSION = "alternatives-1"


def simplify(word):
    """Combine adjacent turns of the same face; no frontend move rules exist."""
    from coach.cube import Move

    result = []
    for move in parse_sequence(word):
        turns = move.turns
        if result and result[-1].face == move.face:
            turns = (result.pop().turns + turns) % 4
        if turns:
            result.append(Move(move.face, turns))
    return format_sequence(result)


def costs(word):
    # Local import keeps the registry independent of the coaching service.
    from coach.coaching.ergonomics import metrics

    return metrics(word)


def satisfied(state, stage, slot=None):
    p = state.in_reference(FACES).layer_progress()
    return p["cross"] and (p["pairs"][slot] if stage == "F2L" else p[stage.lower()])


@lru_cache(maxsize=1)
def index():
    data = json.loads(files("coach.cfop").joinpath("data/alternatives.json").read_text())
    if data["version"] != VERSION:
        raise ValueError("Unsupported alternate algorithm catalog")
    result = {"F2L": {}, "OLL": {}, "PLL": {}}
    for row in data["algorithms"]:
        stage = row["stage"]
        native = format_sequence(row["original"])
        # F2L source cases target the front-right slot. Derive all four slots
        # using physical y grips, retaining explicit regrips in playback.
        for grip in ("", "y", "y2", "y'") if stage == "F2L" else ("",):
            word = simplify(grip + " " + native)
            frame = CubeState().apply(word).frame
            word = simplify(word + " " + rotation_sequence(frame, FACES))
            compiled = simplify(compile_catalog_algorithm(word))
            initial = CubeState().apply(inverse_sequence(compiled))
            p = initial.layer_progress()
            if stage == "F2L":
                missing = [s for s in SLOTS if not p["pairs"][s]]
                if not p["cross"] or len(missing) != 1:
                    raise ValueError(f"Imported F2L algorithm does not isolate one pair: {row}")
                slot = missing[0]
            else:
                slot = None
                if not p["f2l"] or (stage == "PLL" and not p["oll"]):
                    raise ValueError(f"Imported last-layer algorithm breaks F2L/OLL: {row}")
            if not initial.apply(compiled).is_solved or not satisfied(
                initial.apply(word), stage, slot
            ):
                raise ValueError(f"Imported algorithm fails its own inverse state: {row}")
            for before in AUFS if stage == "PLL" else ("",):
                for after in AUFS:
                    seed = CubeState().apply(
                        before + " " + inverse_sequence(compiled) + " " + after
                    )
                    key = (
                        (slot, pair_code(seed, SLOTS.index(slot)))
                        if slot
                        else oll_key(seed)
                        if stage == "OLL"
                        else pll_key(seed)
                    )
                    setup = inverse_sequence(after)
                    choice = {
                        "original": row["original"],
                        "notation": simplify(setup + " " + word),
                        "setup": setup,
                        "source": row["source"],
                        "source_url": row["url"],
                        "source_case": row["source_case"],
                        "grip": grip,
                    }
                    result[stage].setdefault(key, []).append(choice)
    # Deduplicate symmetry collisions once, before evaluating live requests.
    for groups in result.values():
        for key, rows in groups.items():
            groups[key] = tuple({r["notation"]: r for r in rows}.values())
    return result


def candidates(state, stage, slot=None, baseline=None):
    """Up to four efficient choices in this logical reference grip.

    A source rotation changes the grip; append its inverse so every choice ends
    in the original grip. A changed OLL permutation is allowed, not mislabelled
    an identical full-cube endpoint. Completed F2L slots must survive at the end.
    """
    if stage not in ("F2L", "OLL", "PLL"):
        return []
    if state.frame != FACES:
        raise ValueError("Alternate matching requires a rebased reference state")
    before = state.layer_progress()
    if not before["cross"] or (stage in ("OLL", "PLL") and not before["f2l"]):
        return []
    if stage == "PLL" and not before["oll"]:
        return []
    if slot and before["pairs"][slot]:
        return []
    key = (
        (slot, pair_code(state, SLOTS.index(slot)))
        if stage == "F2L"
        else oll_key(state)
        if stage == "OLL"
        else pll_key(state)
    )
    rows = list(index()[stage].get(key, ()))
    if baseline:
        rows.insert(
            0,
            {
                "notation": baseline["notation"],
                "setup": baseline.get("setup", ""),
                "source": baseline["source"],
                "source_url": baseline["source_url"],
                "source_case": baseline.get("source_case", "Baseline"),
                "grip": "",
                "original": baseline["notation"],
                "baseline": True,
            },
        )
    verified = {}
    for row in rows:
        word = simplify(row["notation"])
        if not word:
            continue
        after = state.apply(word)
        progress = after.in_reference(FACES).layer_progress()
        if not satisfied(after, stage, slot) or any(
            value and not progress["pairs"][s] for s, value in before["pairs"].items()
        ):
            # Recognition via projected keys is a candidate filter only.
            continue
        if after.frame != state.frame:
            raise ValueError("Alternate algorithm did not restore its grip")
        item = row | {
            "id": sha256((stage + str(slot) + word).encode()).hexdigest()[:16],
            "notation": word,
            "reference_notation": simplify(compile_catalog_algorithm(word)),
            "metrics": costs(word),
            "verified": True,
            "catalog_version": VERSION,
            "result_hash": after.state_hash,
            "preserved_slots": [s for s, v in before["pairs"].items() if v],
        }
        if word not in verified or row.get("baseline"):
            verified[word] = item
    choices = sorted(
        verified.values(),
        key=lambda c: (
            c["metrics"]["htm"],
            c["metrics"]["comfort_score"],
            c["metrics"]["rotations"],
            c["notation"],
        ),
    )
    if not choices:
        return []
    best_htm = choices[0]["metrics"]["htm"]
    best_comfort = min(c["metrics"]["comfort_score"] for c in choices)
    eligible = [
        c
        for c in choices
        if c.get("baseline")
        or c["metrics"]["htm"] <= best_htm + 2
        or c["metrics"]["comfort_score"] <= best_comfort + 1
    ]
    # Keep the compatibility baseline, but never pad to four with duplicate words.
    base = next((c for c in eligible if c.get("baseline")), None)
    selected = [base] if base else []
    # Prefer distinct fixed-frame sequences; then permit a sourced ergonomic
    # regrip of an equivalent sequence (explicit rotations are still counted).
    for distinct_only in (True, False):
        for choice in eligible:
            if len(selected) == 4:
                break
            if choice in selected:
                continue
            if distinct_only and any(
                c["reference_notation"] == choice["reference_notation"] for c in selected
            ):
                continue
            selected.append(choice)
    return selected


def from_current_grip(state, stage, slot=None):
    """Native source notation from the physical white-down reference, grip restored."""
    from coach.cfop.registry import WHITE_DOWN_FRAME

    reference = state.in_reference(WHITE_DOWN_FRAME)
    prefix = rotation_sequence(state.frame, WHITE_DOWN_FRAME)
    result = []
    for choice in candidates(reference, stage, slot):
        middle = state.apply(prefix + " " + choice["notation"])
        word = simplify(
            prefix + " " + choice["notation"] + " " + rotation_sequence(middle.frame, state.frame)
        )
        final = state.apply(word)
        if not satisfied(final.in_reference(WHITE_DOWN_FRAME), stage, slot):
            raise ValueError("Alternate grip translation failed verification")
        result.append(
            choice
            | {
                "notation": word,
                "metrics": costs(word),
                "input_hash": state.state_hash,
                "result_hash": final.state_hash,
            }
        )
    return result
