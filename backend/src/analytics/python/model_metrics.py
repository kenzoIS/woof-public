import math
from typing import Dict, Iterable, Optional, Tuple

import numpy as np
import pandas as pd

try:
    from sklearn.metrics import (
        mean_absolute_error,
        mean_absolute_percentage_error,
        r2_score,
        root_mean_squared_error,
    )

    SKLEARN_AVAILABLE = True
except Exception:
    SKLEARN_AVAILABLE = False
    mean_absolute_error = None
    mean_absolute_percentage_error = None
    r2_score = None
    root_mean_squared_error = None

try:
    from sktime.performance_metrics.forecasting import (
        mean_absolute_percentage_error as sktime_mape,
        mean_absolute_scaled_error,
    )

    SKTIME_AVAILABLE = True
except Exception:
    SKTIME_AVAILABLE = False
    sktime_mape = None
    mean_absolute_scaled_error = None


def _as_aligned_arrays(actual: Iterable[float], predicted: Iterable[float]) -> Tuple[np.ndarray, np.ndarray]:
    actual_array = np.asarray(list(actual), dtype=float)
    predicted_array = np.asarray(list(predicted), dtype=float)
    length = min(len(actual_array), len(predicted_array))
    if length <= 0:
        return np.asarray([], dtype=float), np.asarray([], dtype=float)
    actual_array = np.nan_to_num(actual_array[:length], nan=0.0, posinf=0.0, neginf=0.0)
    predicted_array = np.nan_to_num(predicted_array[:length], nan=0.0, posinf=0.0, neginf=0.0)
    return actual_array, predicted_array


def _manual_mase(actual: np.ndarray, predicted: np.ndarray, training: np.ndarray, sp: int) -> float:
    mae = float(np.mean(np.abs(actual - predicted))) if len(actual) else 0.0
    if len(training) <= sp:
        naive_errors = np.abs(np.diff(training))
    else:
        naive_errors = np.abs(training[sp:] - training[:-sp])
    naive_mae = float(np.mean(naive_errors)) if len(naive_errors) else 0.0
    return mae / naive_mae if naive_mae > 0 else (0.0 if mae == 0 else 999.0)


def _manual_smape(actual: np.ndarray, predicted: np.ndarray) -> float:
    denominator = (np.abs(actual) + np.abs(predicted)) / 2.0
    terms = np.where(
        denominator == 0,
        0.0,
        np.abs(actual - predicted) / denominator * 100.0,
    )
    return float(np.mean(terms)) if len(terms) else 0.0


def _manual_wape(actual: np.ndarray, predicted: np.ndarray) -> float:
    actual_total = float(np.sum(np.abs(actual)))
    absolute_error_total = float(np.sum(np.abs(actual - predicted)))
    if actual_total <= 0:
        return 0.0 if absolute_error_total == 0 else 100.0
    return (absolute_error_total / actual_total) * 100.0


def _manual_bias_percent(actual: np.ndarray, predicted: np.ndarray) -> float:
    actual_total = float(np.sum(actual))
    if actual_total == 0:
        forecast_total = float(np.sum(predicted))
        return 0.0 if forecast_total == 0 else 100.0
    return (float(np.sum(predicted - actual)) / actual_total) * 100.0


def evaluate_forecast_metrics(
    actual: Iterable[float],
    predicted: Iterable[float],
    training: Iterable[float],
    seasonal_period: int = 7,
) -> Dict[str, object]:
    y_true, y_pred = _as_aligned_arrays(actual, predicted)
    y_train = np.asarray(list(training), dtype=float)
    y_train = np.nan_to_num(y_train, nan=0.0, posinf=0.0, neginf=0.0)
    sp = seasonal_period if len(y_train) > seasonal_period else 1

    if len(y_true) == 0:
        return {
            "mase": 0.0,
            "smape": 0.0,
            "accuracy": 0.0,
            "wape": 0.0,
            "biasPercent": 0.0,
            "mae": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
            "r2": 0.0,
            "metricImplementation": {
                "mase": "empty_input",
                "smape": "empty_input",
                "maeRmseMapeR2": "empty_input",
                "seasonalPeriod": sp,
            },
        }

    metric_sources = {
        "mase": "manual_fallback",
        "smape": "manual_fallback",
        "maeRmseMapeR2": "manual_fallback",
        "seasonalPeriod": sp,
    }

    try:
        if SKTIME_AVAILABLE and mean_absolute_scaled_error is not None:
            mase = float(
                mean_absolute_scaled_error(
                    y_true,
                    y_pred,
                    y_train=y_train,
                    sp=sp,
                )
            )
            metric_sources["mase"] = "sktime.mean_absolute_scaled_error"
        else:
            mase = _manual_mase(y_true, y_pred, y_train, sp)
    except Exception:
        mase = _manual_mase(y_true, y_pred, y_train, sp)

    try:
        if SKTIME_AVAILABLE and sktime_mape is not None:
            smape = float(sktime_mape(y_true, y_pred, symmetric=True)) * 100.0
            metric_sources["smape"] = "sktime.mean_absolute_percentage_error(symmetric=True)"
        else:
            smape = _manual_smape(y_true, y_pred)
    except Exception:
        smape = _manual_smape(y_true, y_pred)

    if SKLEARN_AVAILABLE:
        try:
            mae = float(mean_absolute_error(y_true, y_pred))
            rmse = float(root_mean_squared_error(y_true, y_pred))
            mape = float(mean_absolute_percentage_error(y_true, y_pred)) * 100.0
            r2 = float(r2_score(y_true, y_pred)) if len(y_true) > 1 else 0.0
            metric_sources["maeRmseMapeR2"] = "sklearn.metrics"
        except Exception:
            mae, rmse, mape, r2 = _manual_regression_metrics(y_true, y_pred)
    else:
        mae, rmse, mape, r2 = _manual_regression_metrics(y_true, y_pred)

    if not math.isfinite(mase):
        mase = 999.0
    if not math.isfinite(smape):
        smape = 100.0
    wape = _manual_wape(y_true, y_pred)
    bias_percent = _manual_bias_percent(y_true, y_pred)
    if not math.isfinite(wape):
        wape = 100.0
    if not math.isfinite(bias_percent):
        bias_percent = 0.0

    return {
        "mase": round(float(mase), 2),
        "smape": round(float(smape), 2),
        "accuracy": round(float(max(0.0, 100.0 - wape)), 2),
        "wape": round(float(wape), 2),
        "biasPercent": round(float(bias_percent), 2),
        "mae": round(float(mae), 2),
        "rmse": round(float(rmse), 2),
        "mape": round(float(mape), 2),
        "r2": round(float(r2), 4),
        "metricImplementation": metric_sources,
    }


def _manual_regression_metrics(actual: np.ndarray, predicted: np.ndarray) -> Tuple[float, float, float, float]:
    mae = float(np.mean(np.abs(actual - predicted))) if len(actual) else 0.0
    rmse = float(np.sqrt(np.mean((actual - predicted) ** 2))) if len(actual) else 0.0
    safe_actual = np.where(actual == 0, np.nan, actual)
    mape_terms = np.abs((actual - predicted) / safe_actual) * 100.0
    mape = float(np.nanmean(mape_terms)) if len(mape_terms) and not np.all(np.isnan(mape_terms)) else 0.0
    ss_res = float(np.sum((actual - predicted) ** 2))
    ss_tot = float(np.sum((actual - np.mean(actual)) ** 2))
    r2 = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0.0
    return mae, rmse, mape, r2


def resample_and_evaluate(
    dates: Iterable[str],
    actual: Iterable[float],
    predicted: Iterable[float],
    train_actual: Iterable[float],
    train_dates: Iterable[str],
    freq: str = "W",
    seasonal_period: Optional[int] = None,
) -> Dict[str, object]:
    """
    Resamples holdout predictions and actuals to a target frequency (e.g. Weekly 'W' or Monthly 'ME'/'M')
    using .sum() to aggregate total period demand, and calculates authentic backtest evaluation metrics
    against an appropriately resampled seasonal-naive baseline.
    """
    test_df = pd.DataFrame({
        "ds": pd.to_datetime(list(dates), errors="coerce"),
        "actual": list(actual),
        "predicted": list(predicted),
    }).dropna(subset=["ds"]).sort_values("ds").set_index("ds")

    train_df = pd.DataFrame({
        "ds": pd.to_datetime(list(train_dates), errors="coerce"),
        "actual": list(train_actual),
    }).dropna(subset=["ds"]).sort_values("ds").set_index("ds")

    if len(test_df) == 0 or len(train_df) == 0:
        return {
            "mase": 0.0,
            "smape": 0.0,
            "accuracy": 0.0,
            "wape": 0.0,
            "biasPercent": 0.0,
            "mae": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
            "r2": 0.0,
        }

    # Aggregate using .sum() because demand is volume/count, so period total = sum(daily)
    # Support pandas frequency aliases (e.g. 'W', 'ME', 'M')
    resample_freq = freq
    if freq == "M":
        resample_freq = "ME" if hasattr(pd.Series, "resample") else "M"

    try:
        resampled_test = test_df.resample(resample_freq).sum().dropna()
        resampled_train = train_df.resample(resample_freq).sum().dropna()
    except ValueError:
        # Fallback if frequency alias differs by pandas version
        resampled_test = test_df.resample("W" if "W" in freq else "M").sum().dropna()
        resampled_train = train_df.resample("W" if "W" in freq else "M").sum().dropna()

    if len(resampled_test) == 0 or len(resampled_train) == 0:
        return {
            "mase": 0.0,
            "smape": 0.0,
            "accuracy": 0.0,
            "wape": 0.0,
            "biasPercent": 0.0,
            "mae": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
            "r2": 0.0,
        }

    # Determine seasonal period for the naive baseline
    if seasonal_period is not None:
        sp = seasonal_period
    elif "W" in freq:
        # For weekly series, day-of-week seasonality is already aggregated out.
        # Use week-over-week naive baseline (lag-1).
        sp = 1
    elif freq in ("M", "ME", "MS"):
        # For monthly series, use year-over-year (12 months) if sufficient history exists (>=24 months),
        # otherwise fall back to month-over-month lag-1 naive baseline.
        sp = 12 if len(resampled_train) >= 24 else 1
    else:
        sp = 1

    return evaluate_forecast_metrics(
        actual=resampled_test["actual"].to_numpy(),
        predicted=resampled_test["predicted"].to_numpy(),
        training=resampled_train["actual"].to_numpy(),
        seasonal_period=sp,
    )

