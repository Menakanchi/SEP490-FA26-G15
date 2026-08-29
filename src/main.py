from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router
from src.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    try:
        from src.services import db

        db.init_db()
        if settings.app_env != "test":
            db.seed_default_trajectories()
            db.migrate_stuck_simulation_queued_scenarios()
            db.self_heal_all_scenarios()
    except Exception as e:
        print(f"DB Init Warning: {e}")
    yield
    print("Shutting down...")


app = FastAPI(
    title="Scenario Forge API",
    description="Backend API cho Scenario Forge — sinh kịch bản OpenSCENARIO 1.0 từ mô tả tiếng Việt",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}
