"""
Pydantic schemas for Shipment Event endpoints.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ShipmentEventCreate(BaseModel):
    shipment_id: str
    event_type: str                        # CREATED | PICKED_UP | IN_TRANSIT | DELAYED | DELIVERED | SLA_BREACH
    timestamp: Optional[datetime] = None   # Defaults to now on the server
    location: Optional[str] = None
    notes: Optional[str] = None


class ShipmentEventResponse(BaseModel):
    event_id: int
    shipment_id: str
    event_type: str
    timestamp: Optional[datetime] = None
    location: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}
