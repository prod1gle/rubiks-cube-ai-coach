from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from coach.api.vision import Channel
from coach.cube import CubeError, CubeState
from coach.vision import sessions

router = APIRouter(prefix="/api/tracking", tags=["Experimental camera assistance"])
Calibration = dict[str, Annotated[list[Channel], Field(min_length=3, max_length=3)]]
Time = Annotated[float, Field(ge=0, le=1e12, allow_inf_nan=False)]


class Start(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: dict
    calibration: Calibration
    confirmed_alignment: bool


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0, le=4096)
    clock_id: UUID
    at_ms: Time


class Observation(Event):
    face: Literal["U", "R", "F", "D", "L", "B"]
    image: str = Field(min_length=1, max_length=2_100_000)


class Confirmation(Event):
    observation_index: int = Field(ge=0, le=4096)
    token: str = Field(min_length=1, max_length=3)
    confirmed_single_action: bool


class Gap(Event):
    reason: str = Field(min_length=1, max_length=512)


class Recovery(Event):
    facelets: str | None = Field(default=None, min_length=54, max_length=54)
    calibration: Calibration | None = None
    manual_sequence: str = Field(default="", max_length=512)
    confirmed_alignment: bool


@router.post("")
def start(body: Start, request: Request):
    if not body.confirmed_alignment:
        raise CubeError(
            "camera_confirmation", "Confirm the physical cube still matches the reviewed scan."
        )
    return sessions.create(
        request.app.state.database, CubeState.from_dict(body.state), body.calibration
    )


@router.get("")
def listing(request: Request):
    return sessions.listing(request.app.state.database)


@router.get("/{identifier}")
def view(identifier: UUID, request: Request):
    return sessions.view(request.app.state.database, str(identifier))


@router.get("/{identifier}/analysis")
def report(identifier: UUID, request: Request):
    return sessions.report(request.app.state.database, str(identifier))


def mutate(request, identifier, body, action):
    return sessions.change(
        request.app.state.database,
        str(identifier),
        body.revision,
        str(body.clock_id),
        body.at_ms,
        action,
        body,
    )


@router.post("/{identifier}/observe")
def observe(identifier: UUID, body: Observation, request: Request):
    return mutate(request, identifier, body, "observe")


@router.post("/{identifier}/confirm")
def confirm(identifier: UUID, body: Confirmation, request: Request):
    return mutate(request, identifier, body, "confirm")


@router.post("/{identifier}/gap")
def gap(identifier: UUID, body: Gap, request: Request):
    return mutate(request, identifier, body, "gap")


@router.post("/{identifier}/resync")
def resync(identifier: UUID, body: Recovery, request: Request):
    return mutate(request, identifier, body, "resync")


@router.post("/{identifier}/stop")
def stop(identifier: UUID, body: Event, request: Request):
    return mutate(request, identifier, body, "stop")
