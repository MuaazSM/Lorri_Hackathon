"""
Depot / Warehouse ORM model.

Represents a physical hub location with coordinates, operating hours,
and dock capacity. Replaces the city-name-only approach with real
geographic data that the route optimizer and warehouse queue analyzer
can use directly.
"""

from sqlalchemy import Column, String, Integer, Float
from backend.app.db.base import Base


class Depot(Base):
    __tablename__ = "depots"

    depot_id = Column(String, primary_key=True)

    # Display name (e.g. "Mumbai Central Hub")
    name = Column(String, nullable=False)

    # City for grouping and backwards compatibility with existing city-based lookups
    city = Column(String, nullable=False)

    # WGS84 coordinates — enables real distance calculations instead of synthetic get_distance()
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    # Operating window — the solver should not schedule pickups/deliveries outside this
    operating_hours_start = Column(String, default="06:00")  # HH:MM format
    operating_hours_end = Column(String, default="22:00")

    # Physical capacity — used by warehouse_queue.py for congestion analysis
    dock_count = Column(Integer, default=1)
    queue_capacity = Column(Integer, default=10)

    # Soft delete — decommissioned depots are kept for historical queries
    is_active = Column(Integer, default=1)  # 1=active, 0=decommissioned
