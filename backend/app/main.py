"""
FastAPI application entry point.

Sets up the app, configures CORS (wide open for dev — lock down in prod),
and creates all database tables on startup. This file is the single place
where the app boots — uvicorn points here.

Run with:
    uvicorn backend.app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.db.base import Base
from backend.app.db.session import engine

# This import looks unused, but it's critical — it forces Python to load
# all our ORM model classes so that Base.metadata.create_all() below
# actually knows about the tables it needs to create.
import backend.app.models  # noqa


app = FastAPI(
    title="Lorri — AI Load Consolidation Engine",
    version="0.1.0",
    description="AI-powered freight load consolidation using OR-Tools, ML, and LangChain agents.",
)

# CORS middleware — allows the React frontend (running on a different port)
# to call our API without getting blocked by the browser.
# In production, replace ["*"] with the actual frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """
    Runs once when the server starts.
    Creates all tables defined in our models if they don't already exist.
    This replaces the need for Alembic migrations in dev — simple and fast.
    """
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health_check():
    """
    Simple health check endpoint.
    Hit GET /health to verify the backend is running.
    Returns a basic JSON response — useful for Docker health checks
    and frontend connection testing.
    """
    return {"status": "ok", "service": "lorri-backend"}