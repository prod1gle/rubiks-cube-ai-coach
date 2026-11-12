"""Stateless cube endpoints; these adapters contain no move or reachability logic."""

from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from coach.cfop.pipeline import recognize
from coach.cfop.registry import manifest
from coach.cfop.service import solve_cfop
from coach.cube import (
    MAX_SEQUENCE_LENGTH,
    CubeError,
    CubeState,
    plan_sequence,
    random_scramble,
    sequence_info,
)
from coach.solvers.two_phase import solve_cube

router = APIRouter(prefix="/api/cube", tags=["Cube engine"])


class StateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    state: dict[str, Any] | None = None
    facelets: str | None = Field(default=None, max_length=MAX_SEQUENCE_LENGTH)

    def to_cube(self) -> CubeState:
        if (self.state is None) == (self.facelets is None):
            raise CubeError("state_input", "Provide exactly one of state or facelets.")
        if self.state is not None:
            return CubeState.from_dict(self.state)
        return CubeState.from_facelets(self.facelets)


class SequenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    sequence: str = Field(max_length=MAX_SEQUENCE_LENGTH)


class ApplyInput(StateInput):
    sequence: str = Field(max_length=MAX_SEQUENCE_LENGTH)


class SequenceInfo(BaseModel):
    normalized: str
    inverse: str
    htm: int
    metric: str
    face_turns: int
    rotations: int


class FaceView(BaseModel):
    face: str
    center: str
    stickers: str


class CubeReply(BaseModel):
    engine_version: str
    state: dict[str, Any]
    facelets: str
    canonical_facelets: str
    is_solved: bool
    state_hash: str
    position_hash: str
    palette: dict[str, str]
    faces: list[FaceView]
    cubies: list[dict[str, Any]]
    sequence: SequenceInfo


class SolutionReply(BaseModel):
    status: Literal["solved", "already_solved"]
    input_hash: str
    result_hash: str
    notation: str
    move_count: int
    metric: str
    elapsed_ms: float
    method: Literal["kociemba-two-phase"]
    solver: dict[str, str]
    search_limits: dict[str, int]
    optimality: Literal["unproven"]
    label: str
    verified: Literal[True]
    plan: dict[str, Any]


class CFOPStageReply(BaseModel):
    id: str
    kind: Literal["cross", "f2l", "oll", "pll", "auf"]
    slot: str | None
    case_id: str
    status: Literal["performed", "skipped"]
    notation: str
    reference_notation: str
    setup: str
    algorithm: str
    macro_ids: list[str]
    move_count: int
    start_step: int
    end_step: int
    before_hash: str
    after_hash: str
    protected_pairs: list[str]
    progress_after: dict[str, Any]


class CFOPReply(SolutionReply):
    method: Literal["cfop"]
    stages: list[CFOPStageReply]
    initial_progress: dict[str, Any]
    reference: dict[str, str]


@router.get("", response_model=CubeReply)
def solved_cube():
    """A new solved state; there is no global mutable session."""
    return CubeState().snapshot() | {"sequence": sequence_info("")}


@router.post("/validate", response_model=CubeReply)
def validate_cube(request: StateInput):
    """Import and prove legal reachability using the canonical engine."""
    return request.to_cube().snapshot() | {"sequence": sequence_info("")}


@router.post("/apply", response_model=CubeReply)
def apply_sequence(request: ApplyInput):
    """Validate the state and complete sequence before returning a new snapshot."""
    state = request.to_cube()
    info = sequence_info(request.sequence)
    return state.apply(info["normalized"]).snapshot() | {"sequence": info}


@router.post("/sequence", response_model=SequenceInfo)
def inspect_sequence(request: SequenceInput):
    """Parse, invert, and count notation without assuming any starting state."""
    return sequence_info(request.sequence)


@router.post("/plan")
def plan_moves(request: ApplyInput):
    """Verified per-turn states plus renderer-only descriptors, capped at 128 turns."""
    return plan_sequence(request.to_cube(), request.sequence)


@router.post("/scramble")
def scramble(request: StateInput):
    """Plan 20 random legal turns starting at the supplied state."""
    return plan_sequence(request.to_cube(), random_scramble())


@router.post("/solve", response_model=SolutionReply)
def solve(request: StateInput):
    """Validate, search, re-verify, and plan without changing any live cube state."""
    return solve_cube(request.to_cube())


@router.post("/cfop", response_model=CFOPReply, tags=["CFOP"])
def cfop_solve(request: StateInput):
    """Genuine staged planning, independent of the two-phase full-cube solver."""
    return solve_cfop(request.to_cube())


@router.post("/cfop/recognize", tags=["CFOP"])
def cfop_recognize(request: StateInput):
    """Precise stage predicates and cases, gated on their actual preconditions."""
    return recognize(request.to_cube())


@router.get("/cfop/registry", tags=["CFOP"])
def cfop_registry():
    """Versioned cases, setup conventions, sources, and validated insertion macros."""
    return manifest()
