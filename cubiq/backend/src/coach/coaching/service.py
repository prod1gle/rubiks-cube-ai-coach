"""Verified, state-bound Next Best Move with honest candidate-pool rankings."""

from functools import lru_cache
from hashlib import sha256
from time import perf_counter

from coach.cfop.pipeline import build_candidate, recognize, verify_candidate
from coach.cfop.registry import WHITE_DOWN_FRAME, recognize_oll, recognize_pll
from coach.cfop.search import SLOTS, TURNS, cross_code, cross_table, solve_cross
from coach.coaching.ergonomics import (
    FACE_PENALTIES,
    PROFILE_VERSION,
    ROTATION_COST,
    grips,
    metrics,
    pair_paths,
)
from coach.cube import (
    CORNER_NAMES,
    EDGE_NAMES,
    FACES,
    CubeError,
    CubeState,
    format_sequence,
    parse_sequence,
    plan_sequence,
    reference_sequence,
)
from coach.solvers.runtime import SolverError
from coach.solvers.two_phase import solve_cube

COLOR_NAMES = {"U": "white", "R": "red", "F": "green", "D": "yellow", "L": "orange", "B": "blue"}


def piece_text(pieces):
    return " and ".join(
        "-".join(COLOR_NAMES[color] for color in p["colors"]) + " " + p["kind"] for p in pieces
    )


@lru_cache(maxsize=64)
def short_words(state: CubeState):
    # A small exact enumeration avoids a needlessly long two-phase answer to
    # trivial states. We conservatively keep every outward optimality label unproven.
    for first in TURNS:
        after = state.apply(first)
        if after.is_solved:
            return (("shallow-search", first),), ()
    for first in TURNS:
        after = state.apply(first)
        for second in TURNS:
            if first[0] != second[0] and after.apply(second).is_solved:
                return (("shallow-search", first + " " + second),), ()
    cfop, _ = verify_candidate(state, build_candidate(state.in_reference(WHITE_DOWN_FRAME)))
    candidates, warnings = [("CFOP", cfop)], []
    try:
        candidates.append(("two-phase", solve_cube(state)["notation"]))
    except SolverError as error:
        warnings.append(
            f"Two-phase candidate unavailable ({error.code}); "
            "using the verified candidates available."
        )
    return tuple(candidates), tuple(warnings)


def _targets(state, goal, slot):
    if goal == "f2l":
        i = SLOTS.index(slot)
        return state.reference_piece_views(WHITE_DOWN_FRAME, (i + 4,), (i + 8,))
    if goal == "cross":
        return state.reference_piece_views(WHITE_DOWN_FRAME, (), range(4, 8))
    return state.reference_piece_views(WHITE_DOWN_FRAME, range(4), range(4))


def recommend(
    state: CubeState, mode="cfop", ranking="ergonomic", allow_rotations=True, continuation=None
) -> dict:
    started = perf_counter()
    if mode not in ("short", "cfop") or ranking not in ("htm", "ergonomic"):
        raise ValueError("Unknown coaching mode or ranking")
    if continuation and not state.is_solved:
        start = CubeState.from_dict(continuation["start_state"])
        original = recommend(start, mode, ranking, allow_rotations)
        chosen = next(
            (c for c in original["candidates"] if c["id"] == continuation["candidate_id"]), None
        )
        if chosen is None:
            raise CubeError(
                "hint_context",
                "The original candidate is no longer available. Replan from the current state.",
            )
        tokens = parse_sequence(chosen["notation"])
        consumed = continuation["consumed"]
        if (
            type(consumed) is not int
            or not 0 <= consumed <= len(tokens)
            or start.apply(tokens[:consumed]) != state
        ):
            raise CubeError(
                "hint_context",
                "The hint prefix does not match the exact current state. "
                "Replan from the current state.",
            )
        if consumed < len(tokens):
            remaining = format_sequence(tokens[consumed:])
            after = state.apply(remaining)
            if after.state_hash != chosen["result_hash"]:
                raise SolverError(
                    "hint_verification", "The remaining hint failed endpoint verification.", 502
                )
            corners = [
                CORNER_NAMES.index(p["name"]) for p in chosen["pieces"] if p["kind"] == "corner"
            ]
            edges = [EDGE_NAMES.index(p["name"]) for p in chosen["pieces"] if p["kind"] == "edge"]
            pieces = state.reference_piece_views(FACES, corners, edges)
            m = metrics(remaining) | {
                key: chosen["metrics"][key]
                for key in ("preserved_slots", "lost_slots", "cross_preserved")
            }
            candidate = chosen | {
                "input_hash": state.state_hash,
                "notation": remaining,
                "first_move": str(tokens[consumed]),
                "metrics": m,
                "pieces": pieces,
                "highlight_ids": [p["slot_id"] for p in pieces],
                "hints": chosen["hints"]
                | {
                    "guided": (
                        "Continue the selected verified sequence. Progress can be temporarily "
                        "disturbed inside an insertion; its endpoint restores the recorded goal "
                        "and protected slots."
                    )
                },
            }
            return original | {
                "input_hash": state.state_hash,
                "progress": recognize(state),
                "candidates": [candidate],
                "recommended_id": candidate["id"],
                "evaluated_candidates": 1,
                "continuation": continuation,
                "comparison_scope": "Continuing your selected, verified sequence; "
                "not a new global-best claim.",
                "elapsed_ms": round((perf_counter() - started) * 1000, 3),
            }
    progress = recognize(state)
    reference = state.in_reference(WHITE_DOWN_FRAME)
    before = reference.layer_progress()
    protected = [s for s in SLOTS if before["pairs"][s]]
    candidates, warnings, seen = [], [], set()

    def add(goal, slot, source, reference_word, frame, prefix="", macro_ids=()):
        body = reference_sequence(reference_word, WHITE_DOWN_FRAME, frame)
        word = format_sequence(prefix + " " + body)
        if not word or (goal, slot, word) in seen:
            return
        seen.add((goal, slot, word))
        after = state.apply(word)
        final = after.in_reference(WHITE_DOWN_FRAME).layer_progress()
        if goal == "f2l":
            valid = (
                final["cross"]
                and final["pairs"][slot]
                and all(final["pairs"][s] for s in protected)
            )
        else:
            valid = final["solved" if goal in ("solve", "auf") else goal]
        if not valid or (
            goal in ("oll", "pll", "auf") and not all(final["pairs"][s] for s in protected)
        ):
            raise SolverError(
                "hint_verification",
                "The engine rejected a coaching candidate. No moves were applied.",
                502,
            )
        if goal == "auf" and not after.is_solved:
            raise SolverError("hint_verification", "Final alignment did not solve the cube.", 502)
        if goal == "solve":
            first = parse_sequence(word)[0]
            affected = set(plan_sequence(state, str(first))["steps"][0]["animation"]["affected"])
            pieces = state.reference_piece_views(FACES, range(8), range(12))
            pieces = [piece for piece in pieces if piece["slot_id"] in affected]
        else:
            pieces = _targets(state, goal, slot)
        m = metrics(word)
        kept = [s for s in protected if final["pairs"][s]]
        lost = [s for s in protected if not final["pairs"][s]]
        m |= {
            "preserved_slots": kept,
            "lost_slots": lost,
            "cross_preserved": not before["cross"] or final["cross"],
        }
        title = (
            f"F2L {slot}"
            if goal == "f2l"
            else {
                "cross": "White Cross",
                "oll": "Orient last layer",
                "pll": "Permute last layer",
                "auf": "Final alignment",
                "solve": "Complete solution",
            }[goal]
        )
        subtle = (
            f"Find the {piece_text(pieces)}."
            if goal == "f2l"
            else {
                "cross": (
                    "Find the four white edge pieces and match their side colors to the centers."
                ),
                "oll": (
                    "Inspect the yellow corners and edges. The first two layers are already solved."
                ),
                "pll": (
                    "The yellow face is oriented. Inspect which last-layer pieces need "
                    "to change places."
                ),
                "auf": "The last layer only needs its final alignment with the side centers.",
                "solve": "Inspect the outlined pieces in the opening turn's layer.",
            }.get(goal, "")
        )
        guided = {
            "f2l": (
                "Use upper-layer setups and slot insertions/extractions to solve this pair. "
                "Keep the white Cross and completed slots intact at insertion boundaries."
            ),
            "cross": (
                "Place the white edges in their home slots with matching side "
                "colors. This is a shortest fixed-white-Cross path; the remaining "
                "solve is not optimized by that fact."
            ),
            "oll": (
                "Match the complete yellow orientation pattern, use its recognized "
                "OLL case, and preserve the first two layers."
            ),
            "pll": (
                "Use the recognized PLL case with its setup. Final U alignment is "
                "handled separately."
            ),
            "auf": (
                "Align the completed last layer with the side centers; no pair "
                "extraction is needed."
            ),
            "solve": (
                "Follow a verified complete continuation. It can temporarily "
                "disturb CFOP progress. Compare the computed complete solutions "
                "by HTM; global optimality is unproven."
            ),
        }[goal]
        if m["rotations"]:
            guided += (
                " Deliberately reorient the cube to use the selected working grip; "
                "camera orbit is separate."
            )
        identity = sha256((goal + str(slot) + word).encode()).hexdigest()[:16]
        candidates.append(
            {
                "id": identity,
                "input_hash": state.state_hash,
                "result_hash": after.state_hash,
                "goal": goal,
                "slot": slot,
                "title": title,
                "source": source,
                "notation": word,
                "first_move": str(parse_sequence(word)[0]),
                "metrics": m,
                "pieces": pieces,
                "highlight_ids": [p["slot_id"] for p in pieces],
                "hints": {"subtle": subtle, "guided": guided},
                "verified": True,
                "optimality": "unproven",
                "macro_ids": list(macro_ids),
                "ending_progress": final,
            }
        )

    if not state.is_solved and mode == "short":
        words, notes = short_words(state)
        warnings.extend(notes)
        if notes:
            # Retry transient unavailable/busy sources on a later request.
            short_words.cache_clear()
        for source, word in words:
            # Full-solve generators already use the viewer's grip; convert once
            # into the reference so the same verified candidate boundary is used.
            ref_word = reference_sequence(word, state.frame, WHITE_DOWN_FRAME)
            add("solve", None, source, ref_word, state.frame)
    elif not state.is_solved:
        options = grips(state, allow_rotations)
        if not before["cross"]:
            transitions, distance = cross_table()
            code = cross_code(reference)
            words = [solve_cross(reference)]
            for i, turn in enumerate(TURNS):
                if int(distance[transitions[code, i]]) + 1 == int(distance[code]):
                    words.append(turn + " " + solve_cross(reference.apply(turn)))
            for word in dict.fromkeys(words):
                for frame, prefix in options:
                    add("cross", None, "exact Cross projection", word, frame, prefix)
        elif not before["f2l"]:
            mask = sum(1 << i for i, slot in enumerate(SLOTS) if before["pairs"][slot])
            for i, slot in enumerate(SLOTS):
                if not before["pairs"][slot]:
                    for frame, prefix in options:
                        for word, ids in pair_paths(reference, i, mask, frame, ranking):
                            add("f2l", slot, "protected pair search", word, frame, prefix, ids)
        else:
            if not before["oll"]:
                goal, match = "oll", recognize_oll(reference)
                word = match["setup"] + " " + match["algorithm"]
                source = match["case_id"]
            elif not before["pll"]:
                goal, match = "pll", recognize_pll(reference)
                word = match["setup"] + " " + match["algorithm"]
                source = match["case_id"]
            else:
                goal, word, source = "auf", before["auf"], "AUF"
            for frame, prefix in options:
                add(goal, None, source, word, frame, prefix)

    def key(candidate):
        m = candidate["metrics"]
        if mode == "short" or ranking == "htm":
            return (
                len(m["lost_slots"]),
                m["htm"],
                m["rotations"],
                m["comfort_score"],
                candidate["notation"],
            )
        return (
            len(m["lost_slots"]),
            m["comfort_score"],
            m["htm"],
            m["rotations"],
            candidate["notation"],
        )

    candidates.sort(key=key)
    evaluated = len(candidates)
    # Keep alternatives for every remaining pair, not only the cheapest pair.
    groups, displayed = {}, []
    for candidate in candidates:
        group = candidate["slot"] or candidate["goal"]
        groups.setdefault(group, []).append(candidate)
    for options in groups.values():
        chosen = options[:1]
        if options[0]["slot"]:
            different = next((c for c in options if c["macro_ids"] != chosen[0]["macro_ids"]), None)
            if different:
                chosen.append(different)
        stationary = next((c for c in options if c["metrics"]["rotations"] == 0), None)
        if stationary and stationary not in chosen:
            chosen.append(stationary)
        for candidate in options:
            if len(chosen) >= (4 if options[0]["slot"] else 5):
                break
            if candidate not in chosen:
                chosen.append(candidate)
        displayed.extend(chosen)
    displayed.sort(key=key)
    return {
        "status": "solved" if state.is_solved else "ready",
        "input_hash": state.state_hash,
        "mode": mode,
        "ranking": "htm" if mode == "short" else ranking,
        "allow_rotations": allow_rotations if mode == "cfop" else False,
        "progress": progress,
        "candidates": displayed,
        "recommended_id": displayed[0]["id"] if displayed else None,
        "evaluated_candidates": evaluated,
        "elapsed_ms": round((perf_counter() - started) * 1000, 3),
        "comparison_scope": (
            "Best among generated, engine-verified candidates; global best "
            "move and optimality unproven."
        ),
        "ranking_policy": {
            "version": PROFILE_VERSION,
            "base_htm": 1,
            "rotation_cost": ROTATION_COST / 100,
            "face_penalties": {f: p / 100 for f, p in FACE_PENALTIES.items()},
            "preservation": (
                "Reject pair candidates that lose the Cross or a completed slot at "
                "insertion boundaries; otherwise rank endpoint slot loss first."
            ),
            "units": "Coded heuristic points, not seconds or learned probabilities",
        },
        "warnings": warnings,
        "personalization": {
            "status": "not_implemented",
            "reason": (
                "Fixed coded weights. Real practice capture and personalized "
                "training are future work."
            ),
        },
    }
