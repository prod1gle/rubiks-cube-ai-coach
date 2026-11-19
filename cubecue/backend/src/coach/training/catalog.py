from functools import lru_cache

from coach.analysis.service import display
from coach.cfop.alternatives import VERSION as ALTERNATIVES_VERSION
from coach.cfop.alternatives import candidates, simplify
from coach.cfop.registry import VERSION, WHITE_DOWN_FRAME, recognize_oll, recognize_pll, registry
from coach.cfop.search import SLOTS, macros, pair_code
from coach.cube import CubeState, inverse_sequence, plan_sequence, sequence_info


@lru_cache(maxsize=1)
def catalog():
    rows = []
    for case in registry()[0]:
        rows.append(
            {"id": case.id, "stage": case.stage, "algorithm": case.algorithm, "source": case.source}
        )
    seen = set()
    for macro in macros():
        state = CubeState().apply(inverse_sequence(macro.notation))
        missing = [s for s in SLOTS if not state.layer_progress()["pairs"][s]]
        if len(missing) != 1:
            continue
        slot = missing[0]
        coordinate = pair_code(state, SLOTS.index(slot))
        key = (slot, coordinate)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "id": f"F2L-{slot}-{coordinate}",
                "stage": "F2L",
                "algorithm": macro.notation,
                "slot": slot,
                "source": "Engine-derived single-pair insertion subset",
            }
        )
    return tuple(rows)


@lru_cache(maxsize=128)
def case_state(identifier):
    row = next((r for r in catalog() if r["id"] == identifier), None)
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(404, "Training case not found.")
    # Use the same logical reference as the CFOP registry, expressed physically
    # with white down / green front. Algorithms remain in the displayed grip.
    initial = CubeState().apply("z2").apply(inverse_sequence(row["algorithm"]))
    reference = initial.in_reference(WHITE_DOWN_FRAME)
    if row["stage"] == "OLL":
        recognized = recognize_oll(reference)["case_id"]
    elif row["stage"] == "PLL":
        recognized = recognize_pll(reference)["case_id"]
    else:
        recognized = f"F2L-{row['slot']}-{pair_code(reference, SLOTS.index(row['slot']))}"
    if recognized != identifier or not initial.apply(row["algorithm"]).is_solved:
        raise ValueError(f"Training case verification failed: {identifier}")
    algorithms = candidates(
        reference,
        row["stage"],
        row.get("slot"),
        baseline={
            "notation": row["algorithm"],
            "source": row["source"],
            "source_url": row["source"]
            if row["source"].startswith("https://")
            else "https://github.com/prod1gle/rubiks-cube-ai-coach/blob/main/docs/MILESTONE_2B.md",
            "source_case": identifier,
        },
    )
    for algorithm in algorithms:
        end = initial.apply(algorithm["notation"])
        algorithm.update(input_hash=initial.state_hash, result_hash=end.state_hash)
    return {
        **row,
        "version": VERSION + "/" + ALTERNATIVES_VERSION,
        "start": display(initial),
        "plan": plan_sequence(initial, row["algorithm"]),
        "verified": True,
        "algorithms": algorithms,
        "default_algorithm_id": algorithms[0]["id"],
        "algorithm_policy": (
            "Original baseline plus up to three sourced alternatives. Alternatives must be within "
            "2 HTM of the shortest available or 1 coded comfort point of the lowest cost. "
            "Counts include setup turns and explicit rotations; global optimality unproven."
        ),
        "metrics": sequence_info(row["algorithm"]),
        "scope": (
            "F2L is a curated engine-derived insertion subset, "
            "not all conventional F2L cases. OLL: 57; PLL: 21."
        ),
    }


def check_attempt(identifier, notation):
    case = case_state(identifier)
    initial = CubeState.from_dict(case["start"]["state"])
    final = initial.apply(notation)
    progress = final.in_reference(WHITE_DOWN_FRAME).layer_progress()
    before = initial.in_reference(WHITE_DOWN_FRAME).layer_progress()
    preserved = progress["cross"] and all(
        not v or progress["pairs"][k] for k, v in before["pairs"].items()
    )
    goal = (
        progress["f2l"]
        if case["stage"] == "F2L"
        else progress["oll"]
        if case["stage"] == "OLL"
        else progress["pll"]
    )
    return case, {
        "success": bool(goal and preserved),
        "preserved": bool(preserved),
        "metrics": sequence_info(notation),
        "end_hash": final.state_hash,
        "algorithm_id": next(
            (a["id"] for a in case["algorithms"] if a["notation"] == simplify(notation)), None
        ),
        "algorithm_catalog_version": ALTERNATIVES_VERSION,
        "timing": None,
        "timing_note": "Virtual algorithm input; execution speed was not measured.",
    }
