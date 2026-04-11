"""
Pydantic schemas for ML Model Version endpoints.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MLModelVersionResponse(BaseModel):
    version_id: int
    trained_at: Optional[datetime] = None
    model_type: str
    training_samples: Optional[int] = None
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    precision_score: Optional[float] = None
    recall_score: Optional[float] = None
    feature_importances: Optional[str] = None  # JSON string
    hyperparameters: Optional[str] = None       # JSON string
    model_path: Optional[str] = None
    is_active: int
    notes: Optional[str] = None

    model_config = {"from_attributes": True}
