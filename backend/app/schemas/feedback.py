"""
Pydantic schemas for Feedback endpoints.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class FeedbackCreate(BaseModel):
    plan_id: int
    rating: Optional[int] = None           # 1-5 star rating
    actual_utilization: Optional[float] = None
    actual_cost: Optional[float] = None
    actual_carbon: Optional[float] = None
    sla_met_pct: Optional[float] = None
    notes: Optional[str] = None


class FeedbackResponse(BaseModel):
    feedback_id: int
    plan_id: int
    submitted_at: Optional[datetime] = None
    rating: Optional[int] = None
    actual_utilization: Optional[float] = None
    actual_cost: Optional[float] = None
    actual_carbon: Optional[float] = None
    sla_met_pct: Optional[float] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}
