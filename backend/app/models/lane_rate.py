"""
Lane Rate ORM model.

Per-origin-destination pricing data. Replaces the flat vehicle operating_cost
with lane-specific rates so the solver's objective function reflects real
logistics economics (Mumbai→Delhi costs differently than Chennai→Hyderabad).
"""

from sqlalchemy import Column, String, Integer, Float, DateTime
from sqlalchemy.sql import func
from backend.app.db.base import Base


class LaneRate(Base):
    __tablename__ = "lane_rates"

    lane_id = Column(Integer, primary_key=True, autoincrement=True)

    # Origin and destination — match the city strings used in shipments table
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False)

    # Pricing — solver can use either or both in its objective function
    cost_per_kg = Column(Float, nullable=True)     # Rate per kg for weight-based pricing
    cost_per_trip = Column(Float, nullable=True)    # Flat rate per truck-trip on this lane

    # Transit metadata — replaces synthetic distance estimates
    transit_time_hrs = Column(Float, nullable=True)  # Expected hours for this lane
    distance_km = Column(Float, nullable=True)       # Actual lane distance in km

    # Rate validity window — enables historical rate tracking and future pricing
    effective_from = Column(DateTime, server_default=func.now())
    effective_to = Column(DateTime, nullable=True)    # NULL = still active
