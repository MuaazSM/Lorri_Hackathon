"""
Pydantic schemas for Driver endpoints.
"""

from pydantic import BaseModel
from typing import Optional


class DriverCreate(BaseModel):
    driver_id: str
    name: str
    phone: Optional[str] = None
    license_type: str = "STANDARD"
    hazmat_certified: int = 0
    max_hours: float = 11.0
    home_depot_id: Optional[str] = None


class DriverResponse(BaseModel):
    driver_id: str
    name: str
    phone: Optional[str] = None
    license_type: str
    hazmat_certified: int
    max_hours: float
    home_depot_id: Optional[str] = None
    is_available: int

    model_config = {"from_attributes": True}
