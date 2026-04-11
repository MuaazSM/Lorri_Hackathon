"""
Feedback ORM model.

Post-execution feedback on consolidation plans. Closes the learning loop
by comparing predicted metrics (from the optimizer) against actual outcomes
(from real-world execution). The ML retraining pipeline can use this as
signal for what the optimizer got right vs. wrong.
"""

from sqlalchemy import Column, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from backend.app.db.base import Base


class Feedback(Base):
    __tablename__ = "feedback"

    feedback_id = Column(Integer, primary_key=True, autoincrement=True)

    # Which plan is being evaluated
    plan_id = Column(Integer, ForeignKey("consolidation_plans.id"), nullable=False)

    submitted_at = Column(DateTime, server_default=func.now())

    # 1-5 star rating of overall plan quality
    rating = Column(Integer, nullable=True)

    # Actual metrics after the plan was executed — compared against predicted values
    actual_utilization = Column(Float, nullable=True)   # Real utilization (0-100)
    actual_cost = Column(Float, nullable=True)           # Real total cost
    actual_carbon = Column(Float, nullable=True)         # Real carbon emissions
    sla_met_pct = Column(Float, nullable=True)           # % shipments that actually met SLA (0-100)

    # Free-text notes — captures qualitative feedback that metrics miss
    notes = Column(Text, nullable=True)
