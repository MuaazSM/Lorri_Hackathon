"""
Models package — re-exports all ORM models and enums.

This file exists so that other parts of the app can do:
    from backend.app.models import Shipment, Vehicle, ConsolidationPlan
instead of importing from individual files.

It also ensures all models are registered with Base.metadata
when we run create_all() at startup — SQLAlchemy only knows about
models that have been imported at least once.
"""

from backend.app.models.shipment import Shipment, PriorityEnum, StatusEnum
from backend.app.models.vehicle import Vehicle
from backend.app.models.plan import (
    ConsolidationPlan,
    PlanAssignment,
    ScenarioResult,
    PlanStatusEnum,
    ScenarioTypeEnum,
)
from backend.app.models.outcome import OptimizationOutcome
from backend.app.models.customer import Customer, SLATierEnum
from backend.app.models.depot import Depot
from backend.app.models.driver import Driver
from backend.app.models.lane_rate import LaneRate
from backend.app.models.shipment_event import ShipmentEvent, EventTypeEnum
from backend.app.models.ml_model_version import MLModelVersion
from backend.app.models.alert import Alert, AlertTypeEnum, AlertSeverityEnum
from backend.app.models.feedback import Feedback