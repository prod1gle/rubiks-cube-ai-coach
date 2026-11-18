"""Persistence adapters; never accept client-computed success or statistics."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from coach.api.cube import PracticeInput, TimedRecording
from coach.training.catalog import case_state, catalog, check_attempt

router = APIRouter(prefix="/api", tags=["Local persistence and training"])


class SaveSolve(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    recording: TimedRecording


class Attempt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    case_id: str = Field(max_length=64)
    notation: str = Field(max_length=10000)


@router.post("/solves")
def save(body: SaveSolve, request: Request):
    return request.app.state.database.save_solve(str(body.id), body.recording.model_dump())


@router.get("/solves")
def listing(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return request.app.state.database.list(limit, offset)


@router.get("/solves/{identifier}")
def view(identifier: UUID, request: Request):
    return request.app.state.database.get(str(identifier))


@router.post("/solves/{identifier}/reanalyze")
def reanalyze(identifier: UUID, request: Request):
    return request.app.state.database.get(str(identifier), reanalyze=True)


@router.delete("/solves/{identifier}")
def delete(identifier: UUID, request: Request):
    return request.app.state.database.delete(str(identifier))


@router.get("/dashboard")
def dashboard(request: Request):
    return request.app.state.database.dashboard()


@router.get("/training")
def training():
    return {"cases": catalog(), "scope": "57 OLL, 21 PLL; engine-derived F2L insertion subset."}


@router.get("/training/{identifier}")
def training_case(identifier: str):
    return case_state(identifier)


@router.post("/practice")
def practice(body: Attempt, request: Request):
    case, result = check_attempt(body.case_id, body.notation)
    return request.app.state.database.save_practice(
        str(body.id), body.case_id, case["version"], case["start"]["state"], body.notation, result
    )


class SegmentAttempt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    input: PracticeInput


@router.post("/practice/segment")
def practice_segment(body: SegmentAttempt, request: Request):
    from coach.analysis.service import practice, reconstruct
    from coach.recordings.analytics import VERSION

    data = body.input
    initial = data.to_cube()
    before = reconstruct(initial, data.sequence, data.start, data.end, data.expected_end_hash)[0]
    result = practice(
        initial,
        data.sequence,
        data.start,
        data.end,
        data.attempt,
        data.goal,
        data.expected_end_hash,
    )
    request.app.state.database.save_practice(
        str(body.id), "retrospective-" + data.goal, VERSION, before.to_dict(), data.attempt, result
    )
    return result
