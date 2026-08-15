"""Module entrypoint cho uvicorn src.api.main:app (Re-exports app từ src.main)."""

from src.main import app

__all__ = ["app"]
