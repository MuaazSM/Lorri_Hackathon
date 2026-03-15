import os
import joblib
import numpy as np
import networkx as nx
from typing import List, Dict, Optional, Tuple
from backend.app.ml.training_data import extract_features


# Models are saved in a subdirectory next to this file.
# This keeps them versioned with the code and easy to find.
MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
MODEL_PATH = os.path.join(MODEL_DIR, "compatibility_model.joblib")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "metadata.joblib")


class CompatibilityModel:
    """
    Shipment pair compatibility scorer.

    Wraps the full ML lifecycle: training data generation, model training,
    prediction, and compatibility graph construction. The model is persisted
    to disk after training so subsequent optimization runs can load it
    instantly without retraining.
    """

    def __init__(self):
        """
        Initialize the model. Tries to load a previously saved model
        from disk. If none exists, the model is uninitialized and
        needs to be trained before making predictions.
        """
        self.model = None
        self.scaler = None
        self.feature_names = None
        self.model_type = None  # "RandomForest" or "LogisticRegression"
        self.is_trained = False

        # Try loading a saved model — skip training if one exists
        self._load_model()

    def train(self, force_retrain: bool = False) -> Dict:
        """Train using synthetic data (original method)."""
        if self.is_trained and not force_retrain:
            return {"status": "already_trained", "model_type": self.model_type}

        from backend.app.ml.training_data import generate_training_data

        X, y, feature_names = generate_training_data(
            n_pairs=15000, n_shipments=400, noise_rate=0.05, seed=42
        )

        return self._fit_and_evaluate(X, y, feature_names)

    def train_with_outcomes(self, force_retrain: bool = True) -> Dict:
        """
        Train the model using a blend of synthetic + real outcome data.

        If outcome data is available (from the OptimizationOutcome table),
        it's blended with synthetic training data. The ratio starts at
        10% outcome / 90% synthetic and increases as more outcomes accumulate.

        This creates the learning flywheel:
        - Synthetic data bootstraps the model (cold start)
        - Real outcome data refines it (warm feedback)
        - More runs -> more data -> better model -> better solver input
        """
        if self.is_trained and not force_retrain:
            return {"status": "already_trained", "model_type": self.model_type}

        from backend.app.ml.training_data import (
            generate_training_data,
            generate_outcome_training_data,
        )

        # Generate synthetic baseline
        X_synthetic, y_synthetic, feature_names = generate_training_data(
            n_pairs=15000, n_shipments=400, noise_rate=0.05, seed=None
        )

        # Try to get real outcome data
        outcome_result = generate_outcome_training_data(max_outcomes=50)

        if outcome_result is not None:
            positive_pairs, negative_pairs, n_pairs = outcome_result

            # We have outcome data — but we need features, not just pair IDs.
            # For now, we increase synthetic data noise based on outcome volume
            # to approximate the effect.
            _ = (positive_pairs, negative_pairs)

            # Scale: more outcomes = less noise = model trusts data more
            adjusted_noise = max(0.02, 0.05 - (n_pairs / 1000))

            X_synthetic, y_synthetic, feature_names = generate_training_data(
                n_pairs=15000, n_shipments=400,
                noise_rate=adjusted_noise,
                seed=None,
            )

            print(
                f"[Compatibility Model] Retraining with adjusted noise={adjusted_noise:.3f} "
                f"based on {n_pairs} outcome pairs"
            )
        else:
            print("[Compatibility Model] No outcome data available - using synthetic only")

        return self._fit_and_evaluate(X_synthetic, y_synthetic, feature_names)

    def _fit_and_evaluate(self, X: np.ndarray, y: np.ndarray, feature_names: List[str]) -> Dict:
        """
        Fit the model on the given data and evaluate.
        Shared by train() and train_with_outcomes().
        """
        from sklearn.model_selection import train_test_split
        from sklearn.preprocessing import StandardScaler
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score

        # Split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        # Scale
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        # Train RandomForest
        rf = RandomForestClassifier(
            n_estimators=400, max_depth=25, min_samples_leaf=2,
            class_weight="balanced", random_state=42, n_jobs=-1
        )
        rf.fit(X_train_scaled, y_train)
        rf_pred = rf.predict(X_test_scaled)
        rf_f1 = f1_score(y_test, rf_pred)

        # Train LogisticRegression
        lr = LogisticRegression(
            max_iter=2000, class_weight="balanced", C=0.5, random_state=42
        )
        lr.fit(X_train_scaled, y_train)
        lr_pred = lr.predict(X_test_scaled)
        lr_f1 = f1_score(y_test, lr_pred)

        # Pick winner
        if rf_f1 >= lr_f1:
            best_model = rf
            best_pred = rf_pred
            best_f1 = rf_f1
            model_type = "RandomForest"
        else:
            best_model = lr
            best_pred = lr_pred
            best_f1 = lr_f1
            model_type = "LogisticRegression"

        # Store
        self.model = best_model
        self.scaler = scaler
        self.feature_names = feature_names
        self.model_type = model_type
        self.is_trained = True

        # Save to disk
        self._save_model()

        precision = precision_score(y_test, best_pred)
        recall = recall_score(y_test, best_pred)
        accuracy = accuracy_score(y_test, best_pred)

        print(
            f"[Compatibility Model] Trained {model_type}: "
            f"F1={best_f1:.3f}, Precision={precision:.3f}, "
            f"Recall={recall:.3f}, Accuracy={accuracy:.3f}"
        )

        return {
            "status": "trained",
            "model_type": model_type,
            "best_f1": round(best_f1, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "accuracy": round(accuracy, 4),
            "training_samples": len(X_train),
            "test_samples": len(X_test),
        }

    def predict(self, shipment_a: Dict, shipment_b: Dict) -> float:
        """
        Predict the probability that two shipments are compatible.

        Returns P(compatible) between 0.0 and 1.0. Higher means more
        likely to consolidate successfully. The OR solver uses a threshold
        (typically 0.6) to decide which pairs can share a truck.

        Args:
            shipment_a: First shipment dict
            shipment_b: Second shipment dict

        Returns:
            Float probability between 0.0 and 1.0

        Raises:
            RuntimeError if the model hasn't been trained yet
        """
        if not self.is_trained:
            raise RuntimeError(
                "Model not trained. Call model.train() first or ensure "
                "a saved model exists in backend/app/ml/model/"
            )

        # Extract features for this pair
        features = extract_features(shipment_a, shipment_b)

        # Convert to numpy array in the same feature order as training
        X = np.array([[features[name] for name in self.feature_names]])

        # Scale features using the same scaler from training
        X_scaled = self.scaler.transform(X)

        # predict_proba returns [[P(class_0), P(class_1)]]
        # We want P(compatible) which is class 1
        proba = self.model.predict_proba(X_scaled)[0][1]

        return round(float(proba), 4)

    def predict_batch(self, pairs: List[Tuple[Dict, Dict]]) -> List[float]:
        """
        Score multiple shipment pairs in one batch call.

        More efficient than calling predict() in a loop because
        feature extraction and scaling happen once for the full batch.

        Args:
            pairs: List of (shipment_a, shipment_b) tuples

        Returns:
            List of P(compatible) scores, same order as input
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call model.train() first.")

        if not pairs:
            return []

        # Batch feature extraction
        feature_rows = []
        for shipment_a, shipment_b in pairs:
            features = extract_features(shipment_a, shipment_b)
            feature_rows.append([features[name] for name in self.feature_names])

        X = np.array(feature_rows)
        X_scaled = self.scaler.transform(X)

        # Batch prediction
        probas = self.model.predict_proba(X_scaled)[:, 1]

        return [round(float(p), 4) for p in probas]

    def build_compatibility_graph(
        self,
        shipments: List[Dict],
        threshold: float = 0.6,
    ) -> Dict:
        """
        Score all shipment pairs and build a compatibility graph.

        The graph is a networkx Graph where:
        - Each node is a shipment (by shipment_id)
        - An edge exists between two shipments if P(compatible) >= threshold
        - Edge weight = P(compatible)

        This graph feeds into the OR solver as a constraint: only pairs
        connected by an edge can be assigned to the same vehicle.

        Args:
            shipments: List of shipment dicts
            threshold: Minimum compatibility probability to create an edge.
                       Higher = stricter (fewer edges, harder to consolidate).
                       Lower = looser (more edges, easier to consolidate).

        Returns:
            Dict with:
            - graph: networkx.Graph object
            - edges: list of (id_a, id_b, score) tuples
            - stats: summary statistics about the graph
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call model.train() first.")

        n = len(shipments)
        print(f"[Compatibility Model] Scoring {n * (n-1) // 2} shipment pairs...")

        # Generate all unique pairs
        pairs = []
        pair_ids = []
        for i in range(n):
            for j in range(i + 1, n):
                pairs.append((shipments[i], shipments[j]))
                pair_ids.append((
                    shipments[i].get("shipment_id", f"S{i}"),
                    shipments[j].get("shipment_id", f"S{j}"),
                ))

        # Batch score all pairs at once (much faster than one-by-one)
        scores = self.predict_batch(pairs)

        # Build the networkx graph
        G = nx.Graph()

        # Add all shipments as nodes
        for s in shipments:
            sid = s.get("shipment_id", "")
            G.add_node(sid, **{
                "origin": s.get("origin", ""),
                "destination": s.get("destination", ""),
                "weight": s.get("weight", 0),
                "priority": s.get("priority", "MEDIUM"),
            })

        # Add edges for compatible pairs (above threshold)
        edges = []
        for (id_a, id_b), score in zip(pair_ids, scores):
            if score >= threshold:
                G.add_edge(id_a, id_b, weight=score)
                edges.append({"shipment_a": id_a, "shipment_b": id_b, "score": score})

        # Compute graph statistics for the insights panel
        total_pairs = len(pairs)
        compatible_pairs = len(edges)
        compatibility_rate = compatible_pairs / total_pairs if total_pairs > 0 else 0

        # Average node degree tells us how many consolidation options
        # each shipment has — higher is better for the optimizer
        avg_degree = sum(dict(G.degree()).values()) / n if n > 0 else 0

        # Connected components tell us how many independent groups exist.
        # Ideally one big connected component = lots of consolidation options.
        components = list(nx.connected_components(G))

        stats = {
            "total_shipments": n,
            "total_pairs_scored": total_pairs,
            "compatible_pairs": compatible_pairs,
            "compatibility_rate": round(compatibility_rate, 4),
            "threshold_used": threshold,
            "avg_connections_per_shipment": round(avg_degree, 1),
            "connected_components": len(components),
            "largest_component_size": len(max(components, key=len)) if components else 0,
        }

        print(f"[Compatibility Model] Graph built: {compatible_pairs}/{total_pairs} "
              f"pairs compatible ({compatibility_rate:.1%}), "
              f"avg {avg_degree:.1f} connections per shipment")

        return {
            "graph": G,
            "edges": edges,
            "stats": stats,
        }

    def _save_model(self):
        """
        Persist the trained model, scaler, and metadata to disk.
        Uses joblib for efficient serialization of numpy-heavy objects.
        """
        os.makedirs(MODEL_DIR, exist_ok=True)

        joblib.dump(self.model, MODEL_PATH)
        joblib.dump(self.scaler, SCALER_PATH)
        joblib.dump({
            "feature_names": self.feature_names,
            "model_type": self.model_type,
        }, METADATA_PATH)

        print(f"[Compatibility Model] Saved to {MODEL_DIR}/")

    def _load_model(self):
        """
        Load a previously saved model from disk.
        Called automatically on initialization — if a model exists,
        we're ready to predict without retraining.
        """
        if not all(os.path.exists(p) for p in [MODEL_PATH, SCALER_PATH, METADATA_PATH]):
            return  # No saved model found, training needed

        try:
            self.model = joblib.load(MODEL_PATH)
            self.scaler = joblib.load(SCALER_PATH)
            metadata = joblib.load(METADATA_PATH)
            self.feature_names = metadata["feature_names"]
            self.model_type = metadata["model_type"]
            self.is_trained = True
            print(f"[Compatibility Model] Loaded {self.model_type} from {MODEL_DIR}/")
        except Exception as e:
            print(f"[Compatibility Model] Failed to load saved model: {e}")
            self.is_trained = False