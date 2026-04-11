"""
Alert ORM model.

System alerts for SLA breaches, capacity warnings, delays, solver
infeasibility, and anomalies. Can be populated by pipeline agents,
event triggers, or monitoring hooks. Supports acknowledge/resolve
workflow for operational dashboards.
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.sql import func
from backend.app.db.base import Base
import enum


class AlertTypeEnum(str, enum.Enum):
    SLA_BREACH = "SLA_BREACH"
    CAPACITY_WARNING = "CAPACITY_WARNING"
    DELAY = "DELAY"
    INFEASIBILITY = "INFEASIBILITY"
    ANOMALY = "ANOMALY"


class AlertSeverityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Alert(Base):
    __tablename__ = "alerts"

    alert_id = Column(Integer, primary_key=True, autoincrement=True)

    # What kind of alert and how urgent
    alert_type = Column(SAEnum(AlertTypeEnum), nullable=False)
    severity = Column(SAEnum(AlertSeverityEnum), default=AlertSeverityEnum.MEDIUM)

    # Optional links to the entities involved — nullable because not all alerts
    # are tied to a specific shipment, plan, or vehicle
    shipment_id = Column(String, ForeignKey("shipments.shipment_id"), nullable=True)
    plan_id = Column(Integer, ForeignKey("consolidation_plans.id"), nullable=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"), nullable=True)

    # Human-readable description of what happened
    message = Column(Text, nullable=False)

    created_at = Column(DateTime, server_default=func.now())

    # Acknowledge/resolve workflow
    acknowledged = Column(Integer, default=0)      # 1=seen, 0=pending
    acknowledged_at = Column(DateTime, nullable=True)
    resolved = Column(Integer, default=0)           # 1=fixed, 0=open
    resolved_at = Column(DateTime, nullable=True)
