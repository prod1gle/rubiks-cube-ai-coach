"""Read-only curriculum and stateless, state-bound practice verification."""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from coach.beginner.service import VERSION, check, lesson, lessons
from coach.cube import MAX_SEQUENCE_LENGTH

router = APIRouter(prefix="/api/beginner", tags=["Beginner academy"])


class PracticeInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    lesson_id: str = Field(max_length=64)
    attempt: str = Field(max_length=MAX_SEQUENCE_LENGTH)
    expected_hash: str = Field(min_length=64, max_length=64)


@router.get("/catalog")
def catalog():
    return {
        "version": VERSION,
        "lessons": [
            {key: item[key] for key in ("id", "title", "goal", "verified")}
            for item in lessons().values()
        ],
    }


@router.get("/lessons/{lesson_id}")
def get_lesson(lesson_id: str):
    return lesson(lesson_id)


@router.post("/check")
def check_practice(request: PracticeInput):
    return check(request.lesson_id, request.attempt, request.expected_hash)
