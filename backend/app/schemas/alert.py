"""
Pydantic schemas for Alert endpoints.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AlertCreate(BaseModel):
    alert_type: str                        # SLA_BREACH | CAPACITY_WARNING | DELAY | INFEASIBILITY | ANOMALY
    severity: str = "MEDIUM"               # LOW | MEDIUM | HIGH | CRITICAL
    shipment_id: Optional[str] = None
    plan_id: Optional[int] = None
    vehicle_id: Optional[str] = None
    message: str


class AlertResponse(BaseModel):
    alert_id: int
    alert_type: str
    severity: str
    shipment_id: Optional[str] = None
    plan_id: Optional[int] = None
    vehicle_id: Optional[str] = None
    message: str
    created_at: Optional[datetime] = None
    acknowledged: int
    acknowledged_at: Optional[datetime] = None
    resolved: int
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
