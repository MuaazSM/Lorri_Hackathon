"""
Dev seed endpoint — populates the database with synthetic test data.

POST /dev/seed generates fake shipments and vehicles so the team
can test the frontend and optimizer without manually entering data.

This calls the synthetic data generator (which we'll build later)
and inserts the results directly into the DB.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.db.session import get_db

router = APIRouter()


@router.post("/dev/seed")
def seed_data(db: Session = Depends(get_db)):
    """
    Seed the database with synthetic shipments and vehicles.

    Right now returns a placeholder message. Will later call:
    - synthetic_generator.generate_shipments(count=20)
    - synthetic_generator.generate_vehicles(count=10)
    and insert them into the DB.

    Only intended for development and demos — not for production use.
    """
    # --- PLACEHOLDER: wire up synthetic_generator here ---
    return {
        "message": "Seed endpoint ready. Generator not yet wired.",
        "shipments_created": 0,
        "vehicles_created": 0,
    }