import json
import sys
import time
import warnings
from itertools import product

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

from model_metrics import evaluate_forecast_metrics, resample_and_evaluate
from model_preprocessing import (
    ExogenousStandardizer,
    build_target_transformer,
    compute_vif_diagnostics,
    target_values,
)

warnings.filterwarnings("ignore")

DEFAULT_ORDER = (1, 1, 1)
DEFAULT_SEASONAL_ORDER = (1, 1, 0, 7)
DEFAULT_FORECAST_DAYS = 30
MAX_FORECAST_DAYS = 90
GRID_SEARCH_TIMEOUT_SECONDS = 15
DEFAULT_EXOG_COLUMNS = [
    "dayOfWeek",
    "dayOfWeekSin",
    "dayOfWeekCos",
    "isWeekend",
    "isHoliday",
    "dayBeforeHoliday",
    "dayAfterHoliday",
    "isHotDay",
    "isCoolRainyDay",
    "comfortIndex",
    "promoFlag",
    "average_unit_price",
]
WEEKLY_SEASONAL_ORDERS = [
    DEFAULT_SEASONAL_ORDER,
    (0, 1, 1, 7),
    (1, 1, 1, 7),
    (1, 0, 0, 7),
    (0, 0, 1, 7),
    (1, 0, 1, 7),
    (0, 0, 0, 7),
]


def normalize_forecast_days(value):
    try:
        days = int(value)
    except Exception:
        days = DEFAULT_FORECAST_DAYS
    return max(1, min(days, MAX_FORECAST_DAYS))


def parse_splits(length, ratio_str="90-5-5"):
    # 90-5-5 Chronological Split (90% train, 5% validation, 5% test)
    if length < 30:
        raise ValueError(
            f"Services SARIMA requires at least 30 observations for a valid 90-5-5 split (received {length})"
        )
    train_idx = int(np.floor(length * 0.90))
    val_idx = int(np.floor(length * 0.95))
    
    # Guards to ensure at least 2 points in each of validation and test
    train_idx = min(max(10, train_idx), length - 4)
    val_idx = min(max(train_idx + 2, val_idx), length - 2)
    has_test = True
    return train_idx, val_idx, has_test


def ordered_unique(values):
    seen = set()
    result = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def default_exog_value(column):
    if column == "comfortIndex":
        return 28.0
    if column == "tempCelsius":
        return 28.0
    if column == "humidity":
        return 60.0
    return 0.0


def fit_model(series, order, seasonal_order, exog=None, maxiter=75):
    return SARIMAX(
        series,
        exog=exog,
        order=order,
        seasonal_order=seasonal_order,
        trend="c" if order[1] == 0 and seasonal_order[1] == 0 else None,
        enforce_stationarity=False,
        enforce_invertibility=False,
    ).fit(disp=False, maxiter=maxiter)


def fit_default(series, reason, exog=None):
    fitted = fit_model(series, DEFAULT_ORDER, DEFAULT_SEASONAL_ORDER, exog)
    return DEFAULT_ORDER, DEFAULT_SEASONAL_ORDER, fitted, {
        "gridSearchTimedOut": reason == "timeout",
        "usedDefaultOrder": True,
        "defaultReason": reason,
    }


def fit_best(
    series,
    exog=None,
    validation_actual=None,
    validation_exog=None,
    training_actual=None,
    target_transformer=None,
    timeout_seconds=GRID_SEARCH_TIMEOUT_SECONDS,
):
    best = None
    best_score = (float("inf"), float("inf"), float("inf"))
    if len(series) < 90:
        order_candidates = [
            DEFAULT_ORDER,
            (0, 1, 1),
            (1, 1, 0),
            (0, 0, 1),
            (1, 0, 0),
        ]
        seasonal_orders = WEEKLY_SEASONAL_ORDERS[:4]
    else:
        order_candidates = [DEFAULT_ORDER, *product(range(3), range(2), range(3))]
        seasonal_orders = WEEKLY_SEASONAL_ORDERS
    orders = ordered_unique(order_candidates)
    seasonal_orders = ordered_unique(
        seasonal_orders[:4] if exog is not None else seasonal_orders
    )
    started_at = time.monotonic()
    timed_out = False

    for order in orders:
        for seasonal_order in seasonal_orders:
            if time.monotonic() - started_at > timeout_seconds:
                timed_out = True
                break

            try:
                fitted = fit_model(series, order, seasonal_order, exog, maxiter=50)
                aic = float(fitted.aic) if np.isfinite(fitted.aic) else float("inf")
                if validation_actual is not None and len(validation_actual) > 0:
                    predicted = fitted.get_forecast(
                        steps=len(validation_actual),
                        exog=validation_exog,
                    ).predicted_mean
                    if target_transformer is not None:
                        predicted = target_transformer.inverse(predicted)
                    metric_result = evaluate_forecast_metrics(
                        validation_actual,
                        predicted,
                        training_actual if training_actual is not None else series,
                    )
                    score = (metric_result["mase"], metric_result["smape"], aic)
                else:
                    score = (aic, 0.0, aic)
                if score < best_score:
                    best = (order, seasonal_order, fitted)
                    best_score = score
            except Exception:
                continue
        if timed_out:
            break

    if timed_out:
        if best is not None:
            order, seasonal_order, fitted = best
            return order, seasonal_order, fitted, {
                "gridSearchTimedOut": True,
                "usedDefaultOrder": False,
                "defaultReason": "best_before_timeout",
                "selectionMetric": "validation_mase_smape",
            }
        return fit_default(series, "timeout", exog)

    if best is None:
        try:
            return fit_default(series, "grid_search_failed", exog)
        except Exception as error:
            raise RuntimeError(
                "SARIMA/SARIMAX grid search and default fallback could not fit"
            ) from error

    order, seasonal_order, fitted = best
    return order, seasonal_order, fitted, {
        "gridSearchTimedOut": False,
        "usedDefaultOrder": False,
        "selectionMetric": "validation_mase_smape",
    }


def build_exog_matrix(rows, expected_length, exog_columns):
    if not isinstance(rows, list) or len(rows) != expected_length:
        return None
    matrix = []
    for row in rows:
        try:
            matrix.append(
                [float(row.get(column, default_exog_value(column))) for column in exog_columns]
            )
        except Exception:
            return None
    return np.asarray(matrix, dtype=float)


def build_forecast_exog(payload, forecast_days, exog_columns):
    matrix = build_exog_matrix(payload.get("exogenousForecast", []), forecast_days, exog_columns)
    if matrix is not None:
        return matrix
    fallback_row = [default_exog_value(column) for column in exog_columns]
    return np.asarray(
        [fallback_row for _ in range(forecast_days)],
        dtype=float,
    )


def run(payload):
    if not isinstance(payload, dict):
        raise ValueError("Input payload must be a JSON object")

    data = payload.get("data", [])
    include_backtest = bool(payload.get("includeBacktest", False))
    forecast_days = normalize_forecast_days(
        payload.get("forecastDays", DEFAULT_FORECAST_DAYS)
    )
    split_ratio = payload.get("splitRatio", "90-5-5")
    experiment_config = payload.get("experimentConfig", {})
    if not isinstance(experiment_config, dict):
        experiment_config = {}
    grid_search_timeout_seconds = int(
        experiment_config.get("gridSearchTimeoutSeconds", GRID_SEARCH_TIMEOUT_SECONDS)
    )
    exog_columns = experiment_config.get("exogColumns", DEFAULT_EXOG_COLUMNS)
    if not isinstance(exog_columns, list) or not all(isinstance(column, str) for column in exog_columns):
        exog_columns = DEFAULT_EXOG_COLUMNS

    if not isinstance(data, list):
        raise ValueError("Input payload data must be an array")
    if len(data) < 30:
        raise ValueError("Services SARIMA requires at least 30 daily observations")

    frame = pd.DataFrame(data)
    frame["_input_order"] = np.arange(len(frame))
    required_columns = {"date", "actual", "normalized"}
    missing_columns = required_columns.difference(frame.columns)
    if missing_columns:
        raise ValueError(f"Missing required fields: {', '.join(sorted(missing_columns))}")

    frame["ds"] = pd.to_datetime(frame["date"], utc=True, errors="coerce")
    frame = frame.dropna(subset=["ds"]).sort_values("ds").reset_index(drop=True)
    if len(frame) < 30:
        raise ValueError("Services SARIMA requires at least 30 valid dated observations")

    exog_rows = payload.get("exogenous", [])
    if isinstance(exog_rows, list) and len(exog_rows) >= len(frame):
        exog_rows = [exog_rows[int(index)] for index in frame["_input_order"]]
    exog = build_exog_matrix(exog_rows, len(frame), exog_columns)
    if "isObservedDemand" in frame.columns:
        observed_mask = frame["isObservedDemand"].astype(bool).to_numpy()
        frame = frame[observed_mask].reset_index(drop=True)
        exog = exog[observed_mask] if exog is not None else None
        if len(frame) < 30:
            raise ValueError("Services SARIMA requires at least 30 observed demand days for a valid 90-5-5 split")
    target_transformer = build_target_transformer(frame)
    actual = target_values(frame, target_transformer)
    transformed_target = target_transformer.transform(actual)
    use_exog = exog is not None
    forecast_exog_raw = build_forecast_exog(payload, forecast_days, exog_columns) if use_exog else None
    exog_diagnostics = (
        compute_vif_diagnostics(exog, exog_columns)
        if use_exog
        else {"vifAvailable": False, "reason": "univariate_model"}
    )

    train_idx, val_idx, has_test = parse_splits(len(frame), split_ratio)
    train_target = transformed_target[:train_idx]
    train_exog_raw = exog[:train_idx] if use_exog else None
    validation_exog_raw = exog[train_idx:val_idx] if use_exog else None
    validation_standardizer = (
        ExogenousStandardizer(exog_columns).fit(train_exog_raw) if use_exog else ExogenousStandardizer(exog_columns)
    )
    train_exog = validation_standardizer.transform(train_exog_raw) if use_exog else None
    validation_exog = (
        validation_standardizer.transform(validation_exog_raw) if use_exog else None
    )
    validation_actual = actual[train_idx:val_idx]

    # Step 1: Validation Grid Search to find best model order
    order, seasonal_order, validation_fit, search_metadata = fit_best(
        train_target,
        train_exog,
        validation_actual,
        validation_exog,
        actual[:train_idx],
        target_transformer,
        timeout_seconds=grid_search_timeout_seconds,
    )
    validation_forecast = validation_fit.get_forecast(
        steps=val_idx - train_idx, exog=validation_exog
    ).predicted_mean
    validation_forecast = target_transformer.inverse(validation_forecast)
    val_metrics = evaluate_forecast_metrics(
        validation_actual, validation_forecast, actual[:train_idx]
    )

    # Step 2: Test Evaluation & Resampled Multi-Horizon Backtests
    weekly_metrics = None
    monthly_metrics = None
    backtest_payload = None
    if has_test:
        try:
            test_standardizer = (
                ExogenousStandardizer(exog_columns).fit(exog[:val_idx])
                if use_exog
                else ExogenousStandardizer(exog_columns)
            )
            test_exog = (
                test_standardizer.transform(exog[:val_idx]) if use_exog else None
            )
            test_fit = fit_model(transformed_target[:val_idx], order, seasonal_order, test_exog)
            test_forecast_exog = (
                test_standardizer.transform(exog[val_idx:]) if use_exog else None
            )
            test_forecast = test_fit.get_forecast(
                steps=len(frame) - val_idx, exog=test_forecast_exog
            ).predicted_mean
            test_forecast = target_transformer.inverse(test_forecast)
            test_actual = actual[val_idx:]
            train_actual = actual[:val_idx]
            test_date_strings = [d.strftime("%Y-%m-%d") for d in frame.iloc[val_idx:]["ds"]]
            train_date_strings = [d.strftime("%Y-%m-%d") for d in frame.iloc[:val_idx]["ds"]]

            test_metrics = evaluate_forecast_metrics(
                test_actual, test_forecast, actual[:train_idx]
            )
            eval_metrics = test_metrics
            if include_backtest:
                backtest_payload = {
                    "dates": test_date_strings,
                    "actual": [round(float(value), 4) for value in test_actual],
                    "predicted": [round(max(0.0, float(value)), 4) for value in test_forecast],
                    "trainActual": [round(float(value), 4) for value in train_actual],
                }

            # Compute genuine resampled backtests for Weekly and Monthly horizons
            weekly_metrics = resample_and_evaluate(
                dates=test_date_strings,
                actual=test_actual,
                predicted=test_forecast,
                train_actual=train_actual,
                train_dates=train_date_strings,
                freq="W",
            )
            monthly_metrics = resample_and_evaluate(
                dates=test_date_strings,
                actual=test_actual,
                predicted=test_forecast,
                train_actual=train_actual,
                train_dates=train_date_strings,
                freq="ME",
            )
        except Exception:
            eval_metrics = val_metrics
            weekly_metrics = None
            monthly_metrics = None
    else:
        eval_metrics = val_metrics

    # Step 3: Fit Final Model on 100% of input data
    final_standardizer = (
        ExogenousStandardizer(exog_columns).fit(exog)
        if use_exog
        else ExogenousStandardizer(exog_columns)
    )
    final_exog = final_standardizer.transform(exog) if use_exog else None
    forecast_exog = (
        final_standardizer.transform(forecast_exog_raw) if use_exog else None
    )
    final_fit = fit_model(transformed_target, order, seasonal_order, final_exog)
    prediction = final_fit.get_forecast(steps=forecast_days, exog=forecast_exog)
    intervals = prediction.conf_int(alpha=0.2)
    means = target_transformer.inverse(prediction.predicted_mean)
    last_date = pd.to_datetime(frame["date"].iloc[-1])

    forecast = []
    historical_ceiling = float(np.percentile(actual, 99.5) * 1.25)
    for index in range(forecast_days):
        date = last_date + pd.Timedelta(days=index + 1)
        lower = (
            intervals.iloc[index, 0]
            if hasattr(intervals, "iloc")
            else intervals[index, 0]
        )
        upper = (
            intervals.iloc[index, 1]
            if hasattr(intervals, "iloc")
            else intervals[index, 1]
        )
        lower = target_transformer.inverse([lower])[0]
        upper = target_transformer.inverse([upper])[0]
        forecast.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "forecast": round(max(0.0, min(float(means[index]), historical_ceiling)), 2),
                "confidenceLow": round(max(0.0, min(float(lower), historical_ceiling)), 2),
                "confidenceHigh": round(max(0.0, min(float(upper), historical_ceiling * 1.15)), 2),
            }
        )

    result = {
        "modelName": (
            f"{'SARIMAX' if use_exog else 'SARIMA'}{order}x"
            f"({seasonal_order[0]},{seasonal_order[1]},{seasonal_order[2]},7)"
            f"{'+exog' if use_exog else ''}"
        ),
        "mase": eval_metrics["mase"],
        "smape": eval_metrics["smape"],
        "accuracy": eval_metrics["accuracy"],
        "mae": eval_metrics.get("mae", 0),
        "rmse": eval_metrics.get("rmse", 0),
        "mape": eval_metrics.get("mape", 0),
        "r2": eval_metrics.get("r2", 0),
        "weeklyMetrics": weekly_metrics,
        "monthlyMetrics": monthly_metrics,
        "forecast": forecast,
        "fittedValues": [
            round(max(0.0, float(v)), 2)
            for v in target_transformer.inverse(final_fit.fittedvalues)
        ],
        "modelMetadata": {
            "order": list(order),
            "seasonalOrder": list(seasonal_order),
            "aic": round(float(final_fit.aic), 2),
            **target_transformer.metadata(),
            **final_standardizer.metadata(),
            **exog_diagnostics,
            "metricImplementation": eval_metrics.get("metricImplementation", {}),
            "validationDays": val_idx - train_idx,
            "trainingDays": train_idx,
            "testDays": len(frame) - val_idx if has_test else 0,
            "splitDates": {
                "trainStart": pd.to_datetime(frame["date"].iloc[0]).strftime("%Y-%m-%d"),
                "trainEnd": pd.to_datetime(frame["date"].iloc[train_idx - 1]).strftime("%Y-%m-%d"),
                "validationStart": pd.to_datetime(frame["date"].iloc[train_idx]).strftime("%Y-%m-%d"),
                "validationEnd": pd.to_datetime(frame["date"].iloc[val_idx - 1]).strftime("%Y-%m-%d"),
                "testStart": pd.to_datetime(frame["date"].iloc[val_idx]).strftime("%Y-%m-%d") if val_idx < len(frame) else None,
                "testEnd": pd.to_datetime(frame["date"].iloc[-1]).strftime("%Y-%m-%d") if val_idx < len(frame) else None,
            },
            "splitRatio": split_ratio,
            "univariate": not use_exog,
            "exogenousVariables": exog_columns if use_exog else [],
            **search_metadata,
        },
    }
    if include_backtest and backtest_payload:
        result["backtest"] = backtest_payload
    return result


if __name__ == "__main__":
    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input)
        sys.stdout.write(json.dumps(run(payload)))
    except json.JSONDecodeError as error:
        sys.stdout.write(json.dumps({"error": f"Malformed JSON input: {error.msg}"}))
    except Exception as error:
        sys.stdout.write(json.dumps({"error": str(error)}))
    sys.exit(0)
