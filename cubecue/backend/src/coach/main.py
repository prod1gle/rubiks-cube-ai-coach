"""Local application factory: health and the canonical cube-state engine."""

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from coach.api.beginner import router as beginner_router
from coach.api.cube import router as cube_router
from coach.api.persistence import router as persistence_router
from coach.api.physical import router as physical_router
from coach.api.tracking import router as tracking_router
from coach.api.vision import router as vision_router
from coach.cube import CubeError
from coach.solvers.runtime import SolverError
from coach.storage.database import Database

LOCAL_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "cubecue-api"
    version: str = "0.1.0"
    milestone: str = "5B-experimental"


def create_app(database_path: str | Path | None = None) -> FastAPI:
    """Create an isolated application; the solver starts only on explicit requests."""
    app = FastAPI(
        title="CubeCue Local API",
        version="0.1.0",
        description="Persistent training, guided scanning and experimental camera assistance.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=LOCAL_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Accept", "Content-Type"],
    )
    app.state.database = Database(
        database_path
        or os.environ.get("CUBECUE_DB_PATH", Path(__file__).parents[2] / ".data/cubecue.sqlite3")
    )
    app.include_router(beginner_router)
    app.include_router(cube_router)
    app.include_router(persistence_router)
    app.include_router(physical_router)
    app.include_router(vision_router)
    app.include_router(tracking_router)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, error: RequestValidationError) -> JSONResponse:
        # Non-finite timestamp inputs must produce 422, not fail while FastAPI
        # tries to echo NaN/Infinity in its own JSON validation response.
        detail = [{k: item[k] for k in ("loc", "msg", "type")} for item in error.errors()]
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.exception_handler(CubeError)
    async def invalid_cube(_request: Request, error: CubeError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": error.as_dict()})

    @app.exception_handler(SolverError)
    async def failed_solver(_request: Request, error: SolverError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status,
            content={"detail": {"code": error.code, "message": error.message}},
        )

    @app.get("/health", response_model=HealthResponse, tags=["System"])
    @app.get("/api/health", response_model=HealthResponse, include_in_schema=False)
    def health() -> HealthResponse:
        """Report API availability, without implying cube features are ready."""
        return HealthResponse()

    return app


app = create_app()
