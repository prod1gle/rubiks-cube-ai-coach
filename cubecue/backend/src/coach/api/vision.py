from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from coach.vision.scanning import ORIENTATIONS, classify, sample_frame, validate_scan

router = APIRouter(prefix="/api/vision", tags=["Guided camera scanning"])
Channel = Annotated[float, Field(ge=0, le=255, allow_inf_nan=False)]


class FrameInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    image: str = Field(min_length=1, max_length=2_100_000)


class StickerSample(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    lab: list[Channel] = Field(min_length=3, max_length=3)
    quality: float = Field(ge=0, le=1, allow_inf_nan=False)


class Observation(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    samples: list[StickerSample] = Field(min_length=9, max_length=9)


class AssembleInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    faces: dict[str, Observation] = Field(min_length=6, max_length=6)


class ScanInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    facelets: str = Field(min_length=54, max_length=54)


@router.get("/guide")
def guide():
    return {
        "orientations": {k: {"top": v[0], "right": v[1]} for k, v in ORIENTATIONS.items()},
        "order": "URFDLB",
        "mirrored": False,
        "continuous_tracking": False,
    }


@router.post("/sample")
def sample(body: FrameInput):
    return sample_frame(body.image)


@router.post("/assemble")
def assemble(body: AssembleInput):
    return classify({f: obs.model_dump() for f, obs in body.faces.items()})


@router.post("/validate")
def validate(body: ScanInput):
    return validate_scan(body.facelets)
