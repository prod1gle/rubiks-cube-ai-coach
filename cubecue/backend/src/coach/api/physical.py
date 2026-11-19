"""Physical stopwatch records are explicitly not canonical cube move recordings."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from coach.storage import physical

router = APIRouter(prefix="/api/physical-solves", tags=["Physical practice"])


class PhysicalRecording(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: UUID
    source: Literal["physical-stopwatch"]
    elapsed_ms: float = Field(ge=0, le=86400000)
    inspection_ms: float = Field(ge=0, le=86400000)
    started_mono_ms: float = Field(ge=0)
    status: Literal["stopped", "interrupted"]
    timing_integrity: Literal["valid", "uncertain"]
    integrity_notes: list[str] = Field(max_length=64)
    scramble: str = Field(max_length=1000)


@router.post("")
def save(body: PhysicalRecording, request: Request):
    return physical.save(request.app.state.database, body.model_dump(mode="json"))


@router.get("")
def listing(request: Request):
    return physical.listing(request.app.state.database)


@router.delete("/{identifier}")
def delete(identifier: UUID, request: Request):
    from fastapi import HTTPException

    with request.app.state.database.connect() as db:
        if not db.execute("DELETE FROM physical_solves WHERE id=?", (str(identifier),)).rowcount:
            raise HTTPException(404, "Physical solve not found.")
    return {"deleted": str(identifier)}
