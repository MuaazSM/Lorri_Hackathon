"""
Add this function to the existing training_data.py file.
"""

import json
from typing import List, Tuple, Optional
import numpy as np
from datetime import datetime, timedelta
import random
from backend.app.db.session import SessionLocal
from backend.app.models.outcome import OptimizationOutcome


FEATURE_NAMES = [
    "weight_ratio",
    "volume_ratio",
    "same_origin",
    "same_destination",
    "origin_destination_match",
    "pickup_time_diff_hours",
    "delivery_time_diff_hours",
    "pickup_overlap",
    "priority_gap",
    "priority_high_present",
    "special_handling_match",
    "special_handling_conflict",
    "combined_weight_util_proxy",
    "combined_volume_util_proxy",
]


def _parse_dt(value) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _priority_score(value) -> int:
    normalized = str(value or "MEDIUM").upper().strip()
    if normalized == "HIGH":
        return 2
    if normalized == "LOW":
        return 0
    return 1


def _handling_code(value) -> int:
    normalized = str(value or "").strip().lower()
    if normalized in {"", "none", "na", "n/a", "-"}:
        return 0
    if normalized == "fragile":
        return 1
    if normalized == "hazardous":
        return 2
    if normalized == "refrigerated":
        return 3
    if normalized == "oversized":
        return 4
    return 5


def extract_features(shipment_a: dict, shipment_b: dict) -> dict:
    """
    Build a fixed feature vector for a shipment pair.
    """
    weight_a = float(shipment_a.get("weight", 0) or 0)
    weight_b = float(shipment_b.get("weight", 0) or 0)
    vol_a = float(shipment_a.get("volume", 0) or 0)
    vol_b = float(shipment_b.get("volume", 0) or 0)

    max_weight = max(weight_a, weight_b, 1.0)
    max_volume = max(vol_a, vol_b, 0.1)

    pickup_a = _parse_dt(shipment_a.get("pickup_time"))
    pickup_b = _parse_dt(shipment_b.get("pickup_time"))
    delivery_a = _parse_dt(shipment_a.get("delivery_time"))
    delivery_b = _parse_dt(shipment_b.get("delivery_time"))

    pickup_diff = abs((pickup_a - pickup_b).total_seconds()) / 3600 if pickup_a and pickup_b else 12.0
    delivery_diff = abs((delivery_a - delivery_b).total_seconds()) / 3600 if delivery_a and delivery_b else 24.0
    pickup_overlap = 1.0 if pickup_diff <= 3.0 else 0.0

    p_a = _priority_score(shipment_a.get("priority"))
    p_b = _priority_score(shipment_b.get("priority"))

    h_a = _handling_code(shipment_a.get("special_handling"))
    h_b = _handling_code(shipment_b.get("special_handling"))

    same_origin = 1.0 if shipment_a.get("origin", "") == shipment_b.get("origin", "") else 0.0
    same_destination = 1.0 if shipment_a.get("destination", "") == shipment_b.get("destination", "") else 0.0
    od_match = 1.0 if shipment_a.get("origin", "") == shipment_b.get("destination", "") or shipment_b.get("origin", "") == shipment_a.get("destination", "") else 0.0

    special_match = 1.0 if h_a == h_b and h_a != 0 else 0.0
    special_conflict = 1.0 if {h_a, h_b} == {1, 2} else 0.0  # fragile + hazardous

    combined_weight = (weight_a + weight_b) / 15000.0
    combined_volume = (vol_a + vol_b) / 50.0

    return {
        "weight_ratio": min(weight_a, weight_b) / max_weight,
        "volume_ratio": min(vol_a, vol_b) / max_volume,
        "same_origin": same_origin,
        "same_destination": same_destination,
        "origin_destination_match": od_match,
        "pickup_time_diff_hours": min(pickup_diff, 48.0),
        "delivery_time_diff_hours": min(delivery_diff, 96.0),
        "pickup_overlap": pickup_overlap,
        "priority_gap": float(abs(p_a - p_b)),
        "priority_high_present": 1.0 if (p_a == 2 or p_b == 2) else 0.0,
        "special_handling_match": special_match,
        "special_handling_conflict": special_conflict,
        "combined_weight_util_proxy": min(combined_weight, 2.0),
        "combined_volume_util_proxy": min(combined_volume, 2.0),
    }


def _random_shipment(idx: int) -> dict:
    cities = [
        "Mumbai", "Delhi", "Bangalore", "Chennai",
        "Hyderabad", "Pune", "Ahmedabad", "Jaipur",
    ]
    handlings = [None, "fragile", "hazardous", "refrigerated", None, None]
    priorities = ["LOW", "MEDIUM", "MEDIUM", "HIGH"]

    origin = random.choice(cities)
    destination = random.choice([c for c in cities if c != origin])
    base = datetime(2026, 1, 1, 6, 0, 0)
    pickup = base + timedelta(hours=random.randint(0, 96))
    delivery = pickup + timedelta(hours=random.randint(8, 48))

    return {
        "shipment_id": f"S{idx:05d}",
        "origin": origin,
        "destination": destination,
        "weight": round(random.uniform(200, 3000), 1),
        "volume": round(random.uniform(0.8, 12.0), 2),
        "priority": random.choice(priorities),
        "special_handling": random.choice(handlings),
        "pickup_time": pickup.isoformat(),
        "delivery_time": delivery.isoformat(),
    }


def _label_pair(shipment_a: dict, shipment_b: dict) -> int:
    fa = extract_features(shipment_a, shipment_b)
    score = 0.0

    score += 0.25 * fa["same_origin"]
    score += 0.15 * fa["same_destination"]
    score += 0.15 * fa["pickup_overlap"]
    score += 0.1 * fa["weight_ratio"]
    score += 0.1 * fa["volume_ratio"]
    score -= 0.2 * fa["special_handling_conflict"]
    score -= 0.1 * (fa["priority_gap"] / 2.0)
    score -= 0.15 * max(0.0, fa["combined_weight_util_proxy"] - 1.0)
    score -= 0.1 * max(0.0, fa["combined_volume_util_proxy"] - 1.0)

    return 1 if score >= 0.2 else 0


def generate_training_data(
    n_pairs: int = 15000,
    n_shipments: int = 400,
    noise_rate: float = 0.05,
    seed: Optional[int] = 42,
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Generate synthetic pairwise training data for compatibility model.
    """
    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)

    shipments = [_random_shipment(i) for i in range(n_shipments)]

    X_rows = []
    y = []

    for _ in range(n_pairs):
        i, j = np.random.choice(n_shipments, 2, replace=False)
        s1, s2 = shipments[i], shipments[j]

        features = extract_features(s1, s2)
        label = _label_pair(s1, s2)

        if random.random() < noise_rate:
            label = 1 - label

        X_rows.append([features[name] for name in FEATURE_NAMES])
        y.append(label)

    X = np.array(X_rows, dtype=float)
    y_arr = np.array(y, dtype=int)
    return X, y_arr, FEATURE_NAMES


def generate_outcome_training_data(
    max_outcomes: int = 50,
) -> Optional[Tuple[np.ndarray, np.ndarray, List[str]]]:
    """
    Generate training data from REAL optimization outcomes.

    Reads the OptimizationOutcome table and constructs labeled pairs:
    - Positive (1): shipments that the solver PUT on the same truck
    - Negative (0): shipments that the solver SEPARATED despite being
      in the same batch

    This creates a feedback loop: the solver's actual decisions become
    training signal for future ML predictions. Over time, the model
    learns what the solver actually does — not just what synthetic
    rules say it should do.

    Returns:
        Tuple of (X, y, feature_names) or None if insufficient data.
        X: feature matrix (n_pairs × 14 features)
        y: binary labels (1=same truck, 0=different trucks)
        feature_names: list of feature column names
    """
    db = SessionLocal()

    try:
        outcomes = (
            db.query(OptimizationOutcome)
            .filter(OptimizationOutcome.is_feasible == 1)
            .order_by(OptimizationOutcome.created_at.desc())
            .limit(max_outcomes)
            .all()
        )

        if len(outcomes) < 3:
            print(f"[Outcome Training] Only {len(outcomes)} feasible outcomes — need at least 3")
            return None

        all_positive_pairs = []  # Pairs on the same truck
        all_negative_pairs = []  # Pairs on different trucks
        all_shipment_data = {}   # Shipment lookup across all outcomes

        for outcome in outcomes:
            # Parse assignments
            assignments_json = outcome.assignments_json
            if not assignments_json:
                continue

            try:
                assignments = json.loads(assignments_json)
            except (json.JSONDecodeError, TypeError):
                continue

            # Parse metrics to get shipment data
            metrics_json = outcome.metrics_json
            if not metrics_json:
                continue

            try:
                metrics = json.loads(metrics_json)
            except (json.JSONDecodeError, TypeError):
                continue

            # Build set of all shipment IDs in this batch
            batch_shipment_ids = set()
            truck_assignments = {}  # shipment_id → truck assignment index

            for truck_idx, assignment in enumerate(assignments):
                sids = assignment.get("shipment_ids", [])
                if isinstance(sids, str):
                    try:
                        sids = json.loads(sids)
                    except json.JSONDecodeError:
                        continue

                for sid in sids:
                    batch_shipment_ids.add(sid)
                    truck_assignments[sid] = truck_idx

            if len(batch_shipment_ids) < 2:
                continue

            # Generate pairs
            sid_list = sorted(batch_shipment_ids)
            for i in range(len(sid_list)):
                for j in range(i + 1, len(sid_list)):
                    sid_a = sid_list[i]
                    sid_b = sid_list[j]

                    # Label: 1 if same truck, 0 if different trucks
                    truck_a = truck_assignments.get(sid_a, -1)
                    truck_b = truck_assignments.get(sid_b, -2)

                    if truck_a >= 0 and truck_b >= 0:
                        label = 1 if truck_a == truck_b else 0
                        if label == 1:
                            all_positive_pairs.append((sid_a, sid_b))
                        else:
                            all_negative_pairs.append((sid_a, sid_b))

        print(f"[Outcome Training] Extracted {len(all_positive_pairs)} positive "
              f"and {len(all_negative_pairs)} negative pairs from {len(outcomes)} outcomes")

        if len(all_positive_pairs) < 5 or len(all_negative_pairs) < 5:
            print("[Outcome Training] Insufficient pairs for training")
            return None

        # Balance the dataset — undersample the majority class
        n_pairs = min(len(all_positive_pairs), len(all_negative_pairs))
        np.random.shuffle(all_positive_pairs)
        np.random.shuffle(all_negative_pairs)

        balanced_positive = all_positive_pairs[:n_pairs]
        balanced_negative = all_negative_pairs[:n_pairs]

        print(f"[Outcome Training] Balanced dataset: {n_pairs} positive + {n_pairs} negative = {n_pairs * 2} total")

        return balanced_positive, balanced_negative, n_pairs

    except Exception as e:
        print(f"[Outcome Training] Failed: {e}")
        return None

    finally:
        db.close()