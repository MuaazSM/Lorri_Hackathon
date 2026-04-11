"""
Driver ORM model.

Represents a truck operator in the fleet. Links to vehicles via assignment
and to depots via home location. Enables the solver to add driver-hours
constraints and the guardrail to enforce hazmat certification requirements.
"""

from sqlalchemy import Column, String, Integer, Float, ForeignKey
from backend.app.db.base import Base


class Driver(Base):
    __tablename__ = "drivers"

    driver_id = Column(String, primary_key=True)

    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)

    # License type — HMV (Heavy Motor Vehicle) required for large trucks
    license_type = Column(String, default="STANDARD")  # STANDARD | HMV

    # Hazmat certification — guardrail checks this before assigning hazardous loads
    hazmat_certified = Column(Integer, default=0)  # 1=yes, 0=no

    # Maximum driving hours per shift (Indian Motor Vehicles Act: 8-11 hours)
    max_hours = Column(Float, default=11.0)

    # Where this driver starts their shift — used for route optimization
    home_depot_id = Column(String, ForeignKey("depots.depot_id"), nullable=True)

    # Availability toggle — drivers on leave/rest are excluded from assignment
    is_available = Column(Integer, default=1)  # 1=available, 0=unavailable
