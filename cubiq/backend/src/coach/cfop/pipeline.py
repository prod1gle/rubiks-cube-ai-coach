"""Genuine Cross → four protected pairs → OLL → PLL → AUF planning."""

from coach.cfop.registry import WHITE_DOWN_FRAME, recognize_oll, recognize_pll
from coach.cfop.search import SLOTS, pair_code, pair_table, solve_cross, solve_pair
from coach.cube import CubeState, format_sequence, parse_sequence, reference_sequence


def recognize(state: CubeState) -> dict:
    reference = state.in_reference(WHITE_DOWN_FRAME)
    progress = reference.layer_progress()
    return progress | {
        "reference_frame": WHITE_DOWN_FRAME,
        "cross_color": "U",
        "last_layer_color": "D",
        "front_color": "F",
        "oll_case": recognize_oll(reference),
        "pll_case": recognize_pll(reference),
        "pair_cases": {
            slot: f"F2L-{slot}-{pair_code(reference, i):03d}" for i, slot in enumerate(SLOTS)
        },
    }


def build_candidate(state: CubeState) -> list[dict]:
    """Input is already rebased to white-down reference; no full-cube solver import."""
    rows = []

    def append(stage_id, kind, word, **extra):
        nonlocal state
        word = format_sequence(word)
        rows.append({"id": stage_id, "kind": kind, "notation": word, **extra})
        state = state.apply(word)

    append(
        "cross",
        "cross",
        "" if state.layer_progress()["cross"] else solve_cross(state),
        case_id="Cross-search",
        macros=[],
    )
    recorded = set()
    while len(recorded) < 4:
        progress = state.layer_progress()
        # Account explicitly for initial and incidental solved pairs.
        for slot in SLOTS:
            if slot not in recorded and progress["pairs"][slot]:
                append(f"f2l-{slot}", "f2l", "", slot=slot, case_id=f"F2L-{slot}-skip", macros=[])
                recorded.add(slot)
        if len(recorded) == 4:
            break
        mask = sum(1 << i for i, slot in enumerate(SLOTS) if progress["pairs"][slot])
        choices = []
        for i, slot in enumerate(SLOTS):
            if slot not in recorded:
                _, distance = pair_table(i, mask)
                choices.append((distance[pair_code(state, i)], i))
        _, i = min(choices)
        slot, coordinate = SLOTS[i], pair_code(state, i)
        word, macro_ids = solve_pair(state, i, mask)
        append(
            f"f2l-{slot}",
            "f2l",
            word,
            slot=slot,
            case_id=f"F2L-{slot}-{coordinate:03d}",
            macros=macro_ids,
        )
        recorded.add(slot)
    for kind, recognition in (("oll", recognize_oll), ("pll", recognize_pll)):
        match = recognition(state)
        if match is None:
            raise ValueError(f"{kind.upper()} precondition was not achieved")
        append(kind, kind, match["setup"] + " " + match["algorithm"], **match, macros=[])
    auf = state.layer_progress()["auf"]
    if auf is None:
        raise ValueError("PLL did not solve up to AUF")
    append("auf", "auf", auf, case_id="AUF-" + (auf or "skip"), macros=[])
    if not state.is_solved:
        raise ValueError("CFOP did not finish solved")
    return rows


def verify_candidate(initial: CubeState, rows: list[dict]) -> tuple[str, list[dict]]:
    """Recheck complete stage semantics, registry IDs and macro provenance before release."""
    from coach.cfop.search import TURNS, cross_code, cross_table, macros, pair_code

    if not isinstance(rows, list) or len(rows) != 8:
        raise ValueError("CFOP requires Cross, four pairs, OLL, PLL and AUF")
    expected = ["cross", *["f2l"] * 4, "oll", "pll", "auf"]
    state = initial
    reference = state.in_reference(WHITE_DOWN_FRAME)
    result, words, slots, offset = [], [], set(), 0
    macro_map = {macro.id: macro for macro in macros()}
    for row, kind in zip(rows, expected, strict=True):
        if not isinstance(row, dict) or row.get("kind") != kind:
            raise ValueError("CFOP stage order mismatch")
        word = format_sequence(row["notation"])
        if any(move.is_rotation for move in parse_sequence(word)):
            raise ValueError("CFOP stages require fixed-reference outer turns")
        before = reference.layer_progress()
        protected = [slot for slot in SLOTS if before["pairs"][slot]]
        if kind == "cross":
            if row["case_id"] != "Cross-search":
                raise ValueError("Invalid Cross case identifier")
            transitions, distances = cross_table()
            code = cross_code(reference)
            if len(parse_sequence(word)) != int(distances[code]):
                raise ValueError("Cross stage must follow a shortest fixed-cross path")
            for token in word.split():
                after_code = int(transitions[code, TURNS.index(token)])
                if int(distances[after_code]) + 1 != int(distances[code]):
                    raise ValueError("Cross path does not descend its exact distance")
                code = after_code
        if kind == "f2l":
            slot = row["slot"]
            if (
                slot not in SLOTS
                or slot in slots
                or row["id"] != f"f2l-{slot}"
                or not before["cross"]
            ):
                raise ValueError("Invalid F2L slot or precondition")
            slots.add(slot)
            expected_case = (
                f"F2L-{slot}-skip"
                if before["pairs"][slot]
                else f"F2L-{slot}-{pair_code(reference, SLOTS.index(slot)):03d}"
            )
            if row["case_id"] != expected_case:
                raise ValueError("F2L case mismatch")
            used = [macro_map[name] for name in row["macros"]]
            if format_sequence(" ".join(m.notation for m in used)) != word:
                raise ValueError("F2L sequence must consist of the declared insertion macros")
            check = reference
            for macro in used:
                check = check.apply(macro.notation)
                p = check.layer_progress()
                if not p["cross"] or any(not p["pairs"][s] for s in protected):
                    raise ValueError("F2L macro disturbed protected progress")
        elif row["id"] != kind:
            raise ValueError("Invalid CFOP stage identifier")
        if kind in ("oll", "pll"):
            match = (recognize_oll if kind == "oll" else recognize_pll)(reference)
            if not match or any(
                row[key] != match[key] for key in ("case_id", "setup", "algorithm")
            ):
                raise ValueError("Last-layer recognition mismatch")
            if word != format_sequence(match["setup"] + " " + match["algorithm"]):
                raise ValueError("Last-layer sequence is not the recognized registry algorithm")
        if kind == "auf" and (not before["pll"] or word != before["auf"]):
            raise ValueError("Invalid final alignment")
        if kind == "auf" and row["case_id"] != "AUF-" + (word or "skip"):
            raise ValueError("Invalid AUF case identifier")
        reference = reference.apply(word)
        after = reference.layer_progress()
        if kind == "cross" and not after["cross"]:
            raise ValueError("Cross goal failed")
        if kind == "f2l" and (
            not after["cross"]
            or not after["pairs"][row["slot"]]
            or any(not after["pairs"][s] for s in protected)
        ):
            raise ValueError("F2L goal failed")
        if kind in ("oll", "pll") and not after[kind]:
            raise ValueError("Last-layer goal failed")
        if kind == "auf" and not after["solved"]:
            raise ValueError("Final alignment failed")
        translated = reference_sequence(word, WHITE_DOWN_FRAME, initial.frame)
        before_hash = state.state_hash
        state = state.apply(translated)
        if state.in_reference(WHITE_DOWN_FRAME) != reference:
            raise ValueError("Reference-to-grip mapping failed")
        count = len(parse_sequence(translated))
        result.append(
            {
                "id": row["id"],
                "kind": kind,
                "slot": row.get("slot"),
                "case_id": row["case_id"],
                "status": "performed" if count else "skipped",
                "notation": translated,
                "reference_notation": word,
                "setup": row.get("setup", ""),
                "algorithm": row.get("algorithm", ""),
                "macro_ids": row["macros"],
                "move_count": count,
                "start_step": offset,
                "end_step": offset + count,
                "before_hash": before_hash,
                "after_hash": state.state_hash,
                "protected_pairs": protected,
                "progress_after": after,
            }
        )
        offset += count
        words.append(translated)
    if not state.is_solved or state.frame != initial.frame:
        raise ValueError("CFOP solution or grip verification failed")
    return format_sequence(" ".join(words)), result
