"""Versioned last-layer cases and independently checked recognition coverage."""

import json
from dataclasses import asdict, dataclass
from functools import lru_cache
from importlib.resources import files

from coach.cube import CubeState, compile_catalog_algorithm, inverse_sequence

VERSION = "cfop-1"
AUFS = ("", "U", "U2", "U'")
WHITE_DOWN_FRAME = CubeState().apply("z2").frame


@dataclass(frozen=True)
class Case:
    id: str
    stage: str
    original: str
    algorithm: str
    source: str
    signature: tuple[int, ...]


def oll_key(state: CubeState) -> tuple[int, ...]:
    return state.co[:4] + state.eo[:4]


def pll_key(state: CubeState) -> tuple[int, ...]:
    return state.cp[:4] + state.ep[:4]


@lru_cache(maxsize=1)
def registry():
    data = json.loads(files("coach.cfop").joinpath("data/last_layer.json").read_text())
    cases, oll, pll = [], {}, {}
    for row in data["cases"]:
        algorithm = compile_catalog_algorithm(row["algorithm"])
        state = CubeState().apply(inverse_sequence(algorithm))
        progress = state.layer_progress()
        if not progress["f2l"] or (row["stage"] == "PLL" and not progress["oll"]):
            raise ValueError(f"Invalid registry precondition: {row['id']}")
        case = Case(
            row["id"],
            row["stage"],
            row["algorithm"],
            algorithm,
            data["source"],
            oll_key(state) if row["stage"] == "OLL" else pll_key(state),
        )
        cases.append(case)
        if case.stage == "OLL":
            for auf in AUFS:
                key = oll_key(state.apply(auf))
                if key in oll and oll[key][0].id != case.id:
                    raise ValueError("Overlapping OLL cases")
                setup = inverse_sequence(auf)
                if key not in oll or len(setup) < len(oll[key][1]):
                    oll[key] = (case, setup)
        else:
            for before in AUFS:
                for after in AUFS:
                    variant = CubeState().apply(
                        before + " " + inverse_sequence(algorithm) + " " + after
                    )
                    key = pll_key(variant)
                    if key in pll and pll[key][0].id != case.id:
                        raise ValueError("Overlapping PLL cases")
                    setup = inverse_sequence(after)
                    if key not in pll or len(setup) < len(pll[key][1]):
                        pll[key] = (case, setup)
    if len(cases) != 78 or len(oll) != 215 or len(pll) != 284:
        raise ValueError("Last-layer registry does not cover 57 OLL / 21 PLL classes")
    return tuple(cases), oll, pll


def recognize_oll(state: CubeState):
    progress = state.layer_progress()
    if not progress["f2l"]:
        return None
    if progress["oll"]:
        return {"case_id": "OLL-skip", "setup": "", "algorithm": ""}
    case, setup = registry()[1][oll_key(state)]
    return {"case_id": case.id, "setup": setup, "algorithm": case.algorithm}


def recognize_pll(state: CubeState):
    progress = state.layer_progress()
    if not progress["oll"]:
        return None
    if progress["pll"]:
        return {"case_id": "PLL-skip", "setup": "", "algorithm": ""}
    case, setup = registry()[2][pll_key(state)]
    return {"case_id": case.id, "setup": setup, "algorithm": case.algorithm}


def manifest():
    from coach.cfop.search import SLOTS, macros

    return {
        "version": VERSION,
        "reference_frame": WHITE_DOWN_FRAME,
        "reference": "White down, green front; notation translated to the current grip",
        "oll_cases": 57,
        "oll_orientations": 216,
        "pll_cases": 21,
        "pll_permutations": 288,
        "cases": [
            asdict(case) | {"verified": True, "setups": list(AUFS)} for case in registry()[0]
        ],
        "f2l_macros": [
            {
                "id": macro.id,
                "algorithm": macro.notation,
                "preserves": [slot for i, slot in enumerate(SLOTS) if macro.preserved & (1 << i)],
            }
            for macro in macros()
        ],
        "f2l_scope": "All legal target-pair placements after Cross; "
        "completed slots protected at macro endpoints",
    }
