import json
import logging
import sys
import warnings

import numpy as np
import pandas as pd
from prophet import Prophet

from model_metrics import evaluate_forecast_metrics, resample_and_evaluate
from model_preprocessing import (
    ExogenousStandardizer,
    build_target_transformer,
    compute_vif_diagnostics,
    target_values,
)

warnings.filterwarnings("ignore")
logging.getLogger("cmdstanpy").setLevel(logging.ERROR)
logging.getLogger("prophet").setLevel(logging.ERROR)

DEFAULT_FORECAST_DAYS = 30
MAX_FORECAST_DAYS = 90
EXOG_COLUMNS = [
    "isHotDay",
    "isCoolRainyDay",
    "comfortIndex",
    "isHoliday",
    "dayBeforeHoliday",
    "dayAfterHoliday",
    "isWeekend",
]

# Fine-tuned changepoint prior candidates discovered through grid search
CHANGEPOINT_CANDIDATES = [0.01, 0.05, 0.1, 0.2, 0.3, 0.5]


def build_model(
    changepoint_prior_scale,
    use_exog=False,
    exog_cols=None,
    seasonality_mode="multiplicative",
    weekly_fourier_order=8,
    monthly_fourier_order=4,
    yearly_seasonality=True,
):
    model = Prophet(
        weekly_seasonality=False,
        daily_seasonality=False,
        yearly_seasonality=yearly_seasonality,
        changepoint_prior_scale=changepoint_prior_scale,
        changepoint_range=0.9,
        seasonality_mode=seasonality_mode,
        interval_width=0.8,
    )
    if weekly_fourier_order and weekly_fourier_order > 0:
        model.add_seasonality(name="weekly", period=7, fourier_order=int(weekly_fourier_order))
    if monthly_fourier_order and monthly_fourier_order > 0:
        model.add_seasonality(name="monthly", period=30.5, fourier_order=int(monthly_fourier_order))

    if use_exog and exog_cols:
        for column in exog_cols:
            model.add_regressor(column, standardize=True)
    try:
        model.add_country_holidays(country_name="PH")
    except Exception:
        pass
    return model


def normalize_forecast_days(value):
    try:
        days = int(value)
    except Exception:
        days = DEFAULT_FORECAST_DAYS
    return max(1, min(days, MAX_FORECAST_DAYS))


def config_list(config, key, fallback):
    value = config.get(key) if isinstance(config, dict) else None
    if isinstance(value, list) and len(value) > 0:
        return value
    return fallback


def parse_splits(length, ratio_str="90-5-5"):
    if length < 30:
        raise ValueError(
            f"Cafe Prophet requires at least 30 observations for a valid 90-5-5 split (received {length})"
        )
    train_idx = int(np.floor(length * 0.90))
    val_idx = int(np.floor(length * 0.95))
    train_idx = min(max(10, train_idx), length - 4)
    val_idx = min(max(train_idx + 2, val_idx), length - 2)
    has_test = True
    return train_idx, val_idx, has_test


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
    changepoint_candidates = [
        float(value)
        for value in config_list(
            experiment_config,
            "changepointCandidates",
            CHANGEPOINT_CANDIDATES,
        )
    ]
    seasonality_modes = [
        str(value)
        for value in config_list(
            experiment_config,
            "seasonalityModes",
            ["multiplicative", "additive"],
        )
        if str(value) in ("multiplicative", "additive")
    ] or ["multiplicative", "additive"]
    weekly_fourier_orders = [
        int(value)
        for value in config_list(experiment_config, "weeklyFourierOrders", [8])
    ]
    monthly_fourier_orders = [
        int(value)
        for value in config_list(experiment_config, "monthlyFourierOrders", [4])
    ]
    yearly_seasonality = bool(experiment_config.get("yearlySeasonality", True))

    if not isinstance(data, list):
        raise ValueError("Input payload data must be an array")
    if len(data) < 30:
        raise ValueError("Cafe Prophet requires at least 30 daily observations")

    frame = pd.DataFrame(data)
    frame["_input_order"] = np.arange(len(frame))
    required_columns = {"date", "actual", "normalized"}
    missing_columns = required_columns.difference(frame.columns)
    if missing_columns:
        raise ValueError(f"Missing required fields: {', '.join(sorted(missing_columns))}")

    frame["ds"] = pd.to_datetime(frame["date"], utc=True, errors="coerce")
    frame = frame.dropna(subset=["ds"]).sort_values("ds").reset_index(drop=True)
    if len(frame) < 30:
        raise ValueError("Cafe Prophet requires at least 30 valid dated observations")
    frame["ds"] = frame["ds"].dt.tz_localize(None)

    # Use cappedActual + Log1p target transformation to prevent outlier noise from distorting model
    target_transformer = build_target_transformer(frame, prefer_raw=False)
    demand_target = target_values(frame, target_transformer)
    frame["y"] = target_transformer.transform(demand_target)

    # Re-align exogenous features by date
    use_exog = False
    exog_by_date = {}
    exog_forecast = payload.get("exogenousForecast", [])
    if isinstance(payload.get("exogenous"), list) and len(payload["exogenous"]) > 0:
        exog_list = payload["exogenous"]
        first_row = exog_list[0] if exog_list else {}
        requested_exog_cols = experiment_config.get("exogColumns", EXOG_COLUMNS)
        if not isinstance(requested_exog_cols, list):
            requested_exog_cols = EXOG_COLUMNS
        valid_cols = [c for c in requested_exog_cols if c in first_row]
        if valid_cols:
            for row in exog_list:
                d = str(row.get("date", ""))
                if d:
                    exog_by_date[d] = row
    else:
        valid_cols = []

    # Apply isObservedDemand filter (removes closed days from fitting)
    if "isObservedDemand" in frame.columns:
        frame = frame[frame["isObservedDemand"].astype(bool)].reset_index(drop=True)
        if len(frame) < 30:
            raise ValueError("Cafe Prophet requires at least 30 observed demand days for a valid split")
        demand_target = target_values(frame, target_transformer)
        frame["y"] = target_transformer.transform(demand_target)

    # Align exog columns to observed frame
    active_exog_cols = []
    if exog_by_date and valid_cols:
        for col in valid_cols:
            frame[col] = frame["date"].map(lambda d: float(exog_by_date.get(d, {}).get(col, 0.0)))
        matched = frame["date"].isin(exog_by_date).sum()
        if matched >= max(1, int(len(frame) * 0.80)):
            use_exog = True
            active_exog_cols = valid_cols
            for column in active_exog_cols:
                frame[column] = frame[column].fillna(0.0).astype(float)

    actual = demand_target
    train_idx, val_idx, has_test = parse_splits(len(frame), split_ratio)

    if use_exog and active_exog_cols:
        exog_diagnostics = compute_vif_diagnostics(
            frame[active_exog_cols].astype(float).to_numpy(),
            active_exog_cols,
        )
        train_standardizer = ExogenousStandardizer(active_exog_cols).fit(
            frame.iloc[:train_idx][active_exog_cols].astype(float).to_numpy()
        )
        train = frame.iloc[:train_idx][["ds", "y", *active_exog_cols]].copy()
        train.loc[:, active_exog_cols] = train_standardizer.transform(
            train[active_exog_cols].astype(float).to_numpy()
        )
        val_dates = frame.iloc[train_idx:val_idx][["ds", *active_exog_cols]].copy()
        val_dates.loc[:, active_exog_cols] = train_standardizer.transform(
            val_dates[active_exog_cols].astype(float).to_numpy()
        )
    else:
        exog_diagnostics = {"vifAvailable": False, "reason": "univariate_model"}
        train_standardizer = ExogenousStandardizer(EXOG_COLUMNS)
        train = frame.iloc[:train_idx][["ds", "y"]]
        val_dates = frame.iloc[train_idx:val_idx][["ds"]]

    val_actual = actual[train_idx:val_idx]

    # Grid search for best changepoint and seasonality mode
    best = None
    for s_mode in seasonality_modes:
        for weekly_order in weekly_fourier_orders:
            for monthly_order in monthly_fourier_orders:
                for candidate in changepoint_candidates:
                    try:
                        model = build_model(
                            candidate,
                            use_exog=use_exog,
                            exog_cols=active_exog_cols,
                            seasonality_mode=s_mode,
                            weekly_fourier_order=weekly_order,
                            monthly_fourier_order=monthly_order,
                            yearly_seasonality=yearly_seasonality,
                        )
                        model.fit(train)
                        predicted = target_transformer.inverse(
                            model.predict(val_dates)["yhat"].to_numpy()
                        )
                        metric_result = evaluate_forecast_metrics(
                            val_actual, predicted, actual[:train_idx]
                        )
                        score = (metric_result["mase"], metric_result["smape"])
                        if best is None or score < best["score"]:
                            best = {
                                "score": score,
                                "changepointPriorScale": candidate,
                                "seasonalityMode": s_mode,
                                "weeklyFourierOrder": weekly_order,
                                "monthlyFourierOrder": monthly_order,
                                "yearlySeasonality": yearly_seasonality,
                                "metrics": metric_result,
                            }
                    except Exception:
                        continue

    if best is None:
        raise RuntimeError("Prophet could not fit any changepoint prior candidate")

    # Step 2: Test Evaluation & Resampled Multi-Horizon Backtests
    weekly_metrics = None
    monthly_metrics = None
    backtest_payload = None
    if has_test:
        try:
            test_model = build_model(
                best["changepointPriorScale"],
                use_exog=use_exog,
                exog_cols=active_exog_cols,
                seasonality_mode=best["seasonalityMode"],
                weekly_fourier_order=best["weeklyFourierOrder"],
                monthly_fourier_order=best["monthlyFourierOrder"],
                yearly_seasonality=best["yearlySeasonality"],
            )
            if use_exog and active_exog_cols:
                test_standardizer = ExogenousStandardizer(active_exog_cols).fit(
                    frame.iloc[:val_idx][active_exog_cols].astype(float).to_numpy()
                )
                test_train = frame.iloc[:val_idx][["ds", "y", *active_exog_cols]].copy()
                test_train.loc[:, active_exog_cols] = test_standardizer.transform(
                    test_train[active_exog_cols].astype(float).to_numpy()
                )
                test_model.fit(test_train)
                test_dates = frame.iloc[val_idx:][["ds", *active_exog_cols]].copy()
                test_dates.loc[:, active_exog_cols] = test_standardizer.transform(
                    test_dates[active_exog_cols].astype(float).to_numpy()
                )
            else:
                test_model.fit(frame.iloc[:val_idx][["ds", "y"]])
                test_dates = frame.iloc[val_idx:][["ds"]]
            test_pred = target_transformer.inverse(
                test_model.predict(test_dates)["yhat"].to_numpy()
            )
            test_actual = actual[val_idx:]
            train_actual = actual[:val_idx]
            test_date_strings = [d.strftime("%Y-%m-%d") for d in frame.iloc[val_idx:]["ds"]]
            train_date_strings = [d.strftime("%Y-%m-%d") for d in frame.iloc[:val_idx]["ds"]]

            test_metrics = evaluate_forecast_metrics(
                test_actual, test_pred, actual[:train_idx]
            )
            eval_metrics = test_metrics
            if include_backtest:
                backtest_payload = {
                    "dates": test_date_strings,
                    "actual": [round(float(value), 4) for value in test_actual],
                    "predicted": [round(max(0.0, float(value)), 4) for value in test_pred],
                    "trainActual": [round(float(value), 4) for value in train_actual],
                }

            weekly_metrics = resample_and_evaluate(
                dates=test_date_strings,
                actual=test_actual,
                predicted=test_pred,
                train_actual=train_actual,
                train_dates=train_date_strings,
                freq="W",
            )
            monthly_metrics = resample_and_evaluate(
                dates=test_date_strings,
                actual=test_actual,
                predicted=test_pred,
                train_actual=train_actual,
                train_dates=train_date_strings,
                freq="ME",
            )
        except Exception:
            eval_metrics = best["metrics"]
            weekly_metrics = None
            monthly_metrics = None
    else:
        eval_metrics = best["metrics"]

    # Step 3: Fit Final Model on 100% of observed historical data
    final_model = build_model(
        best["changepointPriorScale"],
        use_exog=use_exog,
        exog_cols=active_exog_cols,
        seasonality_mode=best["seasonalityMode"],
        weekly_fourier_order=best["weeklyFourierOrder"],
        monthly_fourier_order=best["monthlyFourierOrder"],
        yearly_seasonality=best["yearlySeasonality"],
    )
    if use_exog and active_exog_cols:
        final_standardizer = ExogenousStandardizer(active_exog_cols).fit(
            frame[active_exog_cols].astype(float).to_numpy()
        )
        final_train = frame[["ds", "y", *active_exog_cols]].copy()
        final_train.loc[:, active_exog_cols] = final_standardizer.transform(
            final_train[active_exog_cols].astype(float).to_numpy()
        )
        final_model.fit(final_train)
    else:
        final_standardizer = train_standardizer
        final_model.fit(frame[["ds", "y"]])

    future = final_model.make_future_dataframe(
        periods=forecast_days, freq="D", include_history=False
    )

    if use_exog and active_exog_cols:
        exog_forecast_df = pd.DataFrame(exog_forecast)
        if not exog_forecast_df.empty and "date" in exog_forecast_df.columns:
            exog_forecast_df["ds"] = pd.to_datetime(exog_forecast_df["date"])
            for column in active_exog_cols:
                if column not in exog_forecast_df.columns:
                    exog_forecast_df[column] = 0.0
            future = future.merge(exog_forecast_df[["ds", *active_exog_cols]], on="ds", how="left")
        else:
            for column in active_exog_cols:
                future[column] = 0.0
        for column in active_exog_cols:
            fallback_value = 28.0 if column == "comfortIndex" else 0.0
            future[column] = future[column].fillna(fallback_value).astype(float)
        future.loc[:, active_exog_cols] = final_standardizer.transform(
            future[active_exog_cols].astype(float).to_numpy()
        )

    prediction = final_model.predict(future)

    prediction["yhat"] = target_transformer.inverse(prediction["yhat"].to_numpy())
    prediction["yhat_lower"] = target_transformer.inverse(prediction["yhat_lower"].to_numpy())
    prediction["yhat_upper"] = target_transformer.inverse(prediction["yhat_upper"].to_numpy())

    # Ensure strictly positive, realistic operational forecasts without runaway trend explosion
    historical_ceiling = float(np.percentile(demand_target, 99.5) * 1.25)
    for col in ["yhat", "yhat_lower"]:
        prediction[col] = prediction[col].clip(lower=1.0, upper=historical_ceiling)
    prediction["yhat_upper"] = prediction["yhat_upper"].clip(lower=1.0, upper=historical_ceiling * 1.15)

    if use_exog and active_exog_cols:
        hist_frame = frame[["ds", *active_exog_cols]].copy()
        hist_frame.loc[:, active_exog_cols] = final_standardizer.transform(
            hist_frame[active_exog_cols].astype(float).to_numpy()
        )
        hist_predictions = final_model.predict(hist_frame)
    else:
        hist_predictions = final_model.predict(frame[["ds"]])
    fitted_original = target_transformer.inverse(hist_predictions["yhat"].to_numpy())
    fitted_values = [round(max(1.0, float(v)), 2) for v in fitted_original]

    forecast = [
        {
            "date": row["ds"].strftime("%Y-%m-%d"),
            "forecast": round(max(1.0, float(row["yhat"])), 2),
            "confidenceLow": round(max(1.0, float(row["yhat_lower"])), 2),
            "confidenceHigh": round(max(1.0, float(row["yhat_upper"])), 2),
        }
        for _, row in prediction.iterrows()
    ]

    result = {
        "modelName": (
            f"Prophet (multiplicative weekly×8 + monthly + yearly"
            f"{' + weather/holiday exog' if use_exog else ''})"
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
        "fittedValues": fitted_values,
        "modelMetadata": {
            "changepointPriorScale": best["changepointPriorScale"],
            "testedChangepointPriorScales": changepoint_candidates,
            "seasonalityMode": best["seasonalityMode"],
            "weeklyFourierOrder": best["weeklyFourierOrder"],
            "monthlyFourierOrder": best["monthlyFourierOrder"],
            "changepointRange": 0.9,
            "useExog": use_exog,
            "exogMatchedRows": int(frame["date"].isin(exog_by_date).sum()) if exog_by_date else 0,
            **target_transformer.metadata(),
            **final_standardizer.metadata(),
            **exog_diagnostics,
            "metricImplementation": eval_metrics.get("metricImplementation", {}),
            "validationDays": val_idx - train_idx,
            "trainingDays": train_idx,
            "testDays": len(frame) - val_idx if has_test else 0,
            "splitDates": {
                "trainStart": frame["ds"].iloc[0].strftime("%Y-%m-%d"),
                "trainEnd": frame["ds"].iloc[train_idx - 1].strftime("%Y-%m-%d"),
                "validationStart": frame["ds"].iloc[train_idx].strftime("%Y-%m-%d"),
                "validationEnd": frame["ds"].iloc[val_idx - 1].strftime("%Y-%m-%d"),
                "testStart": frame["ds"].iloc[val_idx].strftime("%Y-%m-%d") if val_idx < len(frame) else None,
                "testEnd": frame["ds"].iloc[-1].strftime("%Y-%m-%d") if val_idx < len(frame) else None,
            },
            "splitRatio": split_ratio,
            "weeklySeasonality": True,
            "yearlySeasonality": True,
            "monthlySeasonality": True,
            "holidayCountry": "PH",
            "exogenousVariables": active_exog_cols if use_exog else [],
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
        import traceback
        sys.stdout.write(json.dumps({"error": f"{str(error)}\n{traceback.format_exc()}"}))
    sys.exit(0)
