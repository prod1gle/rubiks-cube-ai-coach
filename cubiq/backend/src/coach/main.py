"""Local application factory: health and the canonical cube-state engine."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from coach.api.cube import router as cube_router
from coach.cube import CubeError

LOCAL_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "cubiq-api"
    version: str = "0.1.0"
    milestone: str = "1C"


def create_app() -> FastAPI:
    """Create an isolated application; no camera, solver, or storage side effects."""
    app = FastAPI(
        title="Cubiq Local API",
        version="0.1.0",
        description="Milestone 1C: cube engine, 3D geometry and verified animation plans.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=LOCAL_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Accept", "Content-Type"],
    )
    app.include_router(cube_router)

    @app.exception_handler(CubeError)
    async def invalid_cube(_request: Request, error: CubeError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": error.as_dict()})

    @app.get("/health", response_model=HealthResponse, tags=["System"])
    @app.get("/api/health", response_model=HealthResponse, include_in_schema=False)
    def health() -> HealthResponse:
        """Report API availability, without implying cube features are ready."""
        return HealthResponse()

    return app


app = create_app()
