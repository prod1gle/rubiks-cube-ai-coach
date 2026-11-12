"""Bounded two-phase adapter with independent canonical-engine verification."""

import json
import os
import subprocess
import sys
from pathlib import Path
from time import perf_counter

from coach.cube import (
    FACES,
    CubeError,
    CubeState,
    Move,
    format_sequence,
    parse_sequence,
    plan_sequence,
)
from coach.solvers.runtime import SolverError
from coach.solvers.runtime import worker_slot as _worker_slot

SOLVER_VERSION = "0.1.1"
TIMEOUT_SECONDS = 30
MAX_DEPTH = 24


def _candidate(facelets: str) -> str:
    """A separate interpreter makes the wall-clock timeout actually interrupt search."""
    cache = Path(
        os.environ.get(
            "CUBIQ_SOLVER_CACHE_DIR",
            Path(__file__).resolve().parents[3] / ".cache" / f"rubik-solver-py-{SOLVER_VERSION}",
        )
    ).resolve()
    env = os.environ | {"RUBIK_SOLVER_CACHE_DIR": str(cache)}
    try:
        result = subprocess.run(
            [sys.executable, "-m", "coach.solvers.worker"],
            input=json.dumps({"facelets": facelets, "max_depth": MAX_DEPTH}),
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as error:
        raise SolverError(
            "solver_timeout",
            "The solver reached its 30-second budget without a verified result. "
            "No moves were applied. Try again; the first solve also builds local tables.",
            504,
        ) from error
    except OSError as error:
        raise SolverError(
            "solver_unavailable",
            "The local solver could not start. Run the README backend install command.",
        ) from error
    if result.returncode:
        raise SolverError(
            "solver_unavailable",
            "The solver worker failed. Check the backend installation and writable solver cache. "
            "No moves were applied.",
        )
    try:
        data = json.loads(result.stdout)
        word = data["candidate"]
        if word is None:
            raise SolverError(
                "solver_no_result",
                "No solution was found within the search limits. No moves were applied.",
            )
        if not isinstance(word, str) or len(word) > 256:
            raise ValueError("Invalid candidate")
        return word
    except (ValueError, KeyError, TypeError) as error:
        raise SolverError(
            "solver_protocol",
            "The solver returned an invalid response. No moves were applied.",
            502,
        ) from error


def solve_cube(state: CubeState) -> dict:
    """Return an upper-bound solution, never an unchecked upstream optimality claim.

    Callers must construct a legal immutable CubeState first. A single worker slot
    per API process bounds CPU/cache contention; other requests fail explicitly.
    """
    start = perf_counter()
    if not _worker_slot.acquire(blocking=False):
        raise SolverError(
            "solver_busy", "A local solve is already running. Wait for it to finish and retry."
        )
    try:
        canonical_word = "" if state.is_solved else _candidate(state.to_facelets(canonical=True))
        try:
            moves = parse_sequence(canonical_word)
            if len(moves) > MAX_DEPTH or any(move.is_rotation for move in moves):
                raise ValueError("Only bounded outer face turns are allowed")
            # A library face names a canonical color. Translate it to the face in
            # the current grip. Rotations never count as physical solution turns.
            notation = format_sequence(
                tuple(Move(FACES[state.frame.index(move.face)], move.turns) for move in moves)
            )
            final = state.apply(notation)
            if not final.is_solved or final.frame != state.frame:
                raise ValueError("Candidate does not solve the supplied state")
        except (CubeError, ValueError, TypeError) as error:
            raise SolverError(
                "solver_verification",
                "The engine rejected the solver's candidate. No moves were applied.",
                502,
            ) from error
        plan = plan_sequence(state, notation)
        return {
            "status": "already_solved" if state.is_solved else "solved",
            "input_hash": state.state_hash,
            "result_hash": final.state_hash,
            "notation": notation,
            "move_count": plan["sequence"]["htm"],
            "metric": plan["sequence"]["metric"],
            "elapsed_ms": round((perf_counter() - start) * 1000, 3),
            "method": "kociemba-two-phase",
            "solver": {"name": "rubik-solver-py", "version": SOLVER_VERSION},
            "search_limits": {"max_depth_htm": MAX_DEPTH, "timeout_ms": TIMEOUT_SECONDS * 1000},
            "optimality": "unproven",
            "label": "Short solution · optimality unproven",
            "verified": True,
            "plan": plan,
        }
    finally:
        _worker_slot.release()
