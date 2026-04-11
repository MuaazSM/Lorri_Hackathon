"""
Pydantic schemas for Lane Rate endpoints.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class LaneRateCreate(BaseModel):
    origin: str
    destination: str
    cost_per_kg: Optional[float] = None
    cost_per_trip: Optional[float] = None
    transit_time_hrs: Optional[float] = None
    distance_km: Optional[float] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class LaneRateResponse(BaseModel):
    lane_id: int
    origin: str
    destination: str
    cost_per_kg: Optional[float] = None
    cost_per_trip: Optional[float] = None
    transit_time_hrs: Optional[float] = None
    distance_km: Optional[float] = None
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None

    model_config = {"from_attributes": True}
