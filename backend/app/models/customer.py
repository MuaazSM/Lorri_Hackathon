"""
Customer ORM model.

Represents the entity that owns a shipment. Enables per-customer SLA
tracking, contract rate discounts, and customer-level reporting on the
dashboard. Referenced by the shipments table via customer_id.
"""

from sqlalchemy import Column, String, Float, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
from backend.app.db.base import Base
import enum


class SLATierEnum(str, enum.Enum):
    """
    Customer SLA tiers.
    - STANDARD: default delivery windows, no priority bump
    - PREMIUM: tighter SLA enforcement, higher priority in solver
    - EXPRESS: strictest windows, optimizer treats as HIGH priority
    """
    STANDARD = "STANDARD"
    PREMIUM = "PREMIUM"
    EXPRESS = "EXPRESS"


class Customer(Base):
    __tablename__ = "customers"

    customer_id = Column(String, primary_key=True)

    # Company or contact name
    name = Column(String, nullable=False)

    # Contact info
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    # SLA tier determines how aggressively the optimizer protects this customer's shipments
    sla_tier = Column(SAEnum(SLATierEnum), default=SLATierEnum.STANDARD)

    # Percentage discount on lane rates (0.0 to 100.0) — applied in cost calculation
    contract_rate_discount = Column(Float, default=0.0)

    created_at = Column(DateTime, server_default=func.now())
