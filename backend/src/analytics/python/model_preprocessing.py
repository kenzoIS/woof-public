from typing import Dict, Iterable, List, Optional

import numpy as np
import pandas as pd

try:
    from sklearn.preprocessing import StandardScaler

    SKLEARN_PREPROCESSING_AVAILABLE = True
except Exception:
    SKLEARN_PREPROCESSING_AVAILABLE = False
    StandardScaler = None

try:
    from statsmodels.stats.outliers_influence import variance_inflation_factor

    STATSMODELS_VIF_AVAILABLE = True
except Exception:
    STATSMODELS_VIF_AVAILABLE = False
    variance_inflation_factor = None


CONTINUOUS_EXOG_COLUMNS = {
    "dayOfWeek",
    "dayOfWeekSin",
    "dayOfWeekCos",
    "tempCelsius",
    "humidity",
    "comfortIndex",
    "avgBasketSize",
    "avgOrderValue",
    "average_unit_price",
}


class Log1pTargetTransformer:
    def __init__(self, source_column: str):
        self.source_column = source_column

    def transform(self, values: Iterable[float]) -> np.ndarray:
        array = np.asarray(list(values), dtype=float)
        return np.log1p(np.clip(array, 0.0, None))

    def inverse(self, values: Iterable[float]) -> np.ndarray:
        array = np.asarray(list(values), dtype=float)
        return np.expm1(array)

    def metadata(self) -> Dict[str, object]:
        return {
            "targetSourceColumn": self.source_column,
            "targetTransform": "numpy.log1p",
            "inverseTargetTransform": "numpy.expm1",
            "targetTransformReason": (
                "Stabilizes skewed demand variance while preserving a non-negative "
                "inverse-transformed forecast scale."
            ),
        }


class ExogenousStandardizer:
    def __init__(self, columns: List[str]):
        self.columns = columns
        self.scaled_indices = [
            index
            for index, column in enumerate(columns)
            if column in CONTINUOUS_EXOG_COLUMNS
        ]
        self.scaled_columns = [columns[index] for index in self.scaled_indices]
        self.scaler = None

    def fit(self, matrix: Optional[np.ndarray]) -> "ExogenousStandardizer":
        if (
            matrix is None
            or len(matrix) == 0
            or not self.scaled_indices
            or not SKLEARN_PREPROCESSING_AVAILABLE
            or StandardScaler is None
        ):
            return self
        self.scaler = StandardScaler()
        self.scaler.fit(matrix[:, self.scaled_indices])
        return self

    def transform(self, matrix: Optional[np.ndarray]) -> Optional[np.ndarray]:
        if matrix is None:
            return None
        transformed = np.asarray(matrix, dtype=float).copy()
        if self.scaler is not None and self.scaled_indices:
            transformed[:, self.scaled_indices] = self.scaler.transform(
                transformed[:, self.scaled_indices]
            )
        return transformed

    def metadata(self) -> Dict[str, object]:
        return {
            "exogenousScaling": (
                "sklearn.preprocessing.StandardScaler"
                if self.scaler is not None
                else "unscaled_fallback"
            ),
            "scaledExogenousVariables": self.scaled_columns if self.scaler is not None else [],
            "binaryExogenousPolicy": "Binary indicator regressors remain 0/1 for interpretability.",
        }


def build_target_transformer(frame: pd.DataFrame, prefer_raw: bool = False) -> Log1pTargetTransformer:
    if prefer_raw:
        # Use raw 'actual' — Prophet handles outliers natively; skip capped version.
        source_column = "actual" if "actual" in frame.columns else "normalized"
    else:
        source_column = "cappedActual" if "cappedActual" in frame.columns else "normalized"
    return Log1pTargetTransformer(source_column)


def target_values(frame: pd.DataFrame, transformer: Log1pTargetTransformer) -> np.ndarray:
    col = transformer.source_column
    if col not in frame.columns:
        # Graceful fallback if the requested column is absent
        col = "actual" if "actual" in frame.columns else "normalized"
    return frame[col].astype(float).to_numpy()


def compute_vif_diagnostics(matrix: Optional[np.ndarray], columns: List[str]) -> Dict[str, object]:
    if matrix is None or len(matrix) < 3:
        return {"vifAvailable": False, "reason": "insufficient_exogenous_rows"}
    if not STATSMODELS_VIF_AVAILABLE or variance_inflation_factor is None:
        return {"vifAvailable": False, "reason": "statsmodels_vif_unavailable"}

    frame = pd.DataFrame(matrix, columns=columns)
    frame = frame.replace([np.inf, -np.inf], np.nan).dropna(axis=0, how="any")
    variable_columns = [
        column for column in frame.columns if float(frame[column].std(ddof=0) or 0.0) > 0.0
    ]
    if len(frame) <= len(variable_columns) + 1 or len(variable_columns) < 2:
        return {"vifAvailable": False, "reason": "not_enough_rank_for_vif"}

    design = frame[variable_columns].astype(float)
    vif_rows = []
    for index, column in enumerate(variable_columns):
        try:
            value = float(variance_inflation_factor(design.to_numpy(), index))
        except Exception:
            value = float("inf")
        vif_rows.append(
            {
                "variable": column,
                "vif": round(value, 2) if np.isfinite(value) else "inf",
                "flag": bool(np.isfinite(value) and value > 5),
            }
        )

    flagged = [row["variable"] for row in vif_rows if row["flag"] or row["vif"] == "inf"]
    return {
        "vifAvailable": True,
        "vifThreshold": 5,
        "vif": vif_rows,
        "highMulticollinearityVariables": flagged,
    }
