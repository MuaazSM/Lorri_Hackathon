"""
Pydantic schemas for Depot endpoints.
"""

from pydantic import BaseModel
from typing import Optional


class DepotCreate(BaseModel):
    depot_id: str
    name: str
    city: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    operating_hours_start: str = "06:00"
    operating_hours_end: str = "22:00"
    dock_count: int = 1
    queue_capacity: int = 10


class DepotResponse(BaseModel):
    depot_id: str
    name: str
    city: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    operating_hours_start: str
    operating_hours_end: str
    dock_count: int
    queue_capacity: int
    is_active: int

    model_config = {"from_attributes": True}
