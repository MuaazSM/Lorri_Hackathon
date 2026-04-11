"""
Pydantic schemas for Customer endpoints.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CustomerCreate(BaseModel):
    customer_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    sla_tier: str = "STANDARD"
    contract_rate_discount: float = 0.0


class CustomerResponse(BaseModel):
    customer_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    sla_tier: str
    contract_rate_discount: float
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
