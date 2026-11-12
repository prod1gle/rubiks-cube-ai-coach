"""HTTP-facing CFOP coordinator: isolate search and independently verify each stage."""

import json
import subprocess
import sys
from time import perf_counter

from coach.cfop.pipeline import recognize, verify_candidate
from coach.cfop.registry import VERSION, WHITE_DOWN_FRAME
from coach.cube import CubeState, plan_sequence
from coach.solvers.runtime import SolverError
from coach.solvers.runtime import worker_slot as _worker_slot


def solve_cfop(state: CubeState) -> dict:
    start = perf_counter()
    # Share only the CPU admission gate with two-phase; never its solver or output.
    if not _worker_slot.acquire(blocking=False):
        raise SolverError("solver_busy", "A local solve is already running. Wait and retry.")
    try:
        try:
            process = subprocess.run(
                [sys.executable, "-m", "coach.cfop.worker"],
                input=json.dumps({"state": state.in_reference(WHITE_DOWN_FRAME).to_dict()}),
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise SolverError(
                "cfop_timeout", "CFOP reached its 30-second budget. No moves were applied.", 504
            ) from error
        except OSError as error:
            raise SolverError(
                "cfop_unavailable", "CFOP worker could not start. Check the backend installation."
            ) from error
        if process.returncode:
            raise SolverError("cfop_worker", "CFOP search failed. No moves were applied.")
        try:
            candidate = json.loads(process.stdout)["stages"]
            notation, stages = verify_candidate(state, candidate)
            plan = plan_sequence(state, notation)
        except (ValueError, KeyError, TypeError, IndexError) as error:
            raise SolverError(
                "cfop_verification",
                "The engine rejected the CFOP plan. No moves were applied.",
                502,
            ) from error
        final = state.apply(notation)
        return {
            "status": "already_solved" if state.is_solved else "solved",
            "input_hash": state.state_hash,
            "result_hash": final.state_hash,
            "notation": notation,
            "move_count": plan["sequence"]["htm"],
            "metric": plan["sequence"]["metric"],
            "elapsed_ms": round((perf_counter() - start) * 1000, 3),
            "method": "cfop",
            "solver": {"name": "cubiq-cfop", "version": VERSION},
            "search_limits": {"max_plan_htm": 128, "timeout_ms": 30000},
            "optimality": "unproven",
            "label": "CFOP solution · optimality unproven",
            "verified": True,
            "plan": plan,
            "stages": stages,
            "initial_progress": recognize(state),
            "reference": {
                "frame": WHITE_DOWN_FRAME,
                "cross_color": "U",
                "front_color": "F",
                "description": "White cross down, green front; moves translated to your grip",
            },
        }
    finally:
        _worker_slot.release()
