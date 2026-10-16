"""Compatibility entry point for running the API locally from the repo root."""

from backend.main import app, model

__all__ = ["app", "model"]
