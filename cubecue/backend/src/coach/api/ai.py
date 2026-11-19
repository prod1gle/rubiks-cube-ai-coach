"""Read-only coaching; model inference requires explicit per-request opt-in."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, StrictBool

from coach.ai.service import coach, context

router = APIRouter(prefix="/api/ai", tags=["Grounded AI coaching"])


class CoachRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    solve_id: UUID | None = None
    goal: Literal["balanced", "efficiency", "fluency", "consistency"] = "balanced"
    use_model: StrictBool = False


@router.get("/context")
def coach_context(request: Request):
    return context(request.app.state.database)


@router.post("/coach")
def coaching(body: CoachRequest, request: Request):
    return coach(
        request.app.state.database,
        str(body.solve_id) if body.solve_id else None,
        body.goal,
        body.use_model,
    )
