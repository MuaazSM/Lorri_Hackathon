"""
ML Model Version ORM model.

Tracks every training run of the compatibility model. The model retrains
automatically via outcome_logging_tool but previously had no record of
which version produced which predictions. This table enables quality
drift monitoring, A/B comparison, and rollback to a previous version.
"""

from sqlalchemy import Column, String, Integer, Float, Text, DateTime
from sqlalchemy.sql import func
from backend.app.db.base import Base


class MLModelVersion(Base):
    __tablename__ = "ml_model_versions"

    version_id = Column(Integer, primary_key=True, autoincrement=True)

    # When this version was trained
    trained_at = Column(DateTime, server_default=func.now())

    # Algorithm name — currently always RandomForest but allows future experimentation
    model_type = Column(String, default="RandomForest")

    # Training data size — how many shipment pairs were used
    training_samples = Column(Integer, nullable=True)

    # Performance metrics from evaluation
    accuracy = Column(Float, nullable=True)        # Overall accuracy (0-1)
    f1_score = Column(Float, nullable=True)         # F1 (0-1)
    precision_score = Column(Float, nullable=True)  # Precision (0-1)
    recall_score = Column(Float, nullable=True)     # Recall (0-1)

    # JSON dict: {"time_overlap_pct": 0.314, "route_distance": 0.12, ...}
    feature_importances = Column(Text, nullable=True)

    # JSON dict: {"n_estimators": 400, "max_depth": 25, "class_weight": "balanced"}
    hyperparameters = Column(Text, nullable=True)

    # Filesystem path to the saved .joblib model file
    model_path = Column(String, nullable=True)

    # Only one version should be active at a time — the scoring tool loads this one
    is_active = Column(Integer, default=0)  # 1=currently used, 0=archived

    # Why this version was created (e.g. "scheduled retrain after 50 new outcomes")
    notes = Column(Text, nullable=True)
