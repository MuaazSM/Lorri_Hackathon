"""
Shipment Event ORM model.

Audit trail for shipment lifecycle transitions. The shipments table has a
single status field; this table records every state change with a timestamp
and location. Enables real SLA breach detection and provides ground truth
data for ML retraining.
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.sql import func
from backend.app.db.base import Base
import enum


class EventTypeEnum(str, enum.Enum):
    """
    All possible lifecycle events for a shipment.
    """
    CREATED = "CREATED"
    PICKED_UP = "PICKED_UP"
    IN_TRANSIT = "IN_TRANSIT"
    DELAYED = "DELAYED"
    DELIVERED = "DELIVERED"
    SLA_BREACH = "SLA_BREACH"


class ShipmentEvent(Base):
    __tablename__ = "shipment_events"

    event_id = Column(Integer, primary_key=True, autoincrement=True)

    # Which shipment this event belongs to
    shipment_id = Column(String, ForeignKey("shipments.shipment_id"), nullable=False)

    # What happened
    event_type = Column(SAEnum(EventTypeEnum), nullable=False)

    # When it happened — defaults to now if not provided
    timestamp = Column(DateTime, server_default=func.now())

    # Where it happened — city or depot name
    location = Column(String, nullable=True)

    # Free-text context (e.g. "delayed 2h due to heavy rain on NH48")
    notes = Column(Text, nullable=True)
