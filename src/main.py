from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.auth_routes import router as auth_router
from src.api.vehicsim_routes import router as vehicsim_router
from src.config import get_settings

settings = get_settings()

app = FastAPI(
    title="VehicSim API",
    description="Mô phỏng, kiểm thử và tối ưu AEB/FCW — VehicSim (SEP490-FA26-G15)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(vehicsim_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}
