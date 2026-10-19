import json
import sys
import os
import tempfile

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold, cross_validate


FEATURE_COLUMNS = [
    "hour",
    "is_weekend",
    "temp",
    "traffic_drop",
    "discount_depth",
    "baseline_units",
    "baseline_margin_rate",
]
MODEL_PATH = os.path.join(tempfile.gettempdir(), "woof_rf_promo_model.joblib")


def parse_manila_timestamps(values):
    """Parse source timestamps as instants and extract business dates in Manila."""
    parsed = pd.to_datetime(values, format="ISO8601", errors="coerce", utc=True)
    if parsed.isna().all():
        parsed = pd.to_datetime(values, format="mixed", errors="coerce", utc=True)
    return parsed.dt.tz_convert("Asia/Manila")


def series_or_default(df, column, default):
    if column in df:
        return df[column]
    return pd.Series([default] * len(df), index=df.index)


def safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        value = float(value)
        if np.isnan(value) or np.isinf(value):
            return default
        return value
    except Exception:
        return default


def build_training_examples(history_rows):
    if not history_rows:
        return pd.DataFrame()

    df = pd.DataFrame(history_rows)
    if df.empty:
        return pd.DataFrame()

    df["timestamp"] = parse_manila_timestamps(df.get("transactionTimestamp"))
    df = df.dropna(subset=["timestamp"])
    if df.empty:
        return pd.DataFrame()

    df["date"] = df["timestamp"].dt.date.astype(str)
    df["hour"] = df["timestamp"].dt.hour
    df["is_weekend"] = df["timestamp"].dt.dayofweek.isin([5, 6]).astype(int)
    df["item_key"] = series_or_default(df, "itemKey", "unknown").fillna("unknown").astype(str)
    df["channel_key"] = series_or_default(df, "channelKey", "unknown").fillna("unknown").astype(str)
    df["quantity"] = pd.to_numeric(series_or_default(df, "quantitySold", 0), errors="coerce").fillna(0)
    df["gross_sales"] = pd.to_numeric(series_or_default(df, "grossSales", 0), errors="coerce").fillna(0)
    df["discount_amount"] = pd.to_numeric(series_or_default(df, "discountAmount", 0), errors="coerce").fillna(0)
    df["discount_depth"] = pd.to_numeric(series_or_default(df, "discountDepth", 0), errors="coerce").fillna(0)
    df["net_sales"] = pd.to_numeric(series_or_default(df, "netSales", 0), errors="coerce").fillna(0)
    df["gross_profit"] = pd.to_numeric(series_or_default(df, "grossProfit", 0), errors="coerce").fillna(0)

    df["is_discounted"] = ((df["discount_amount"] > 0) | (df["discount_depth"] > 0.001)).astype(int)
    df["margin_rate"] = np.where(
        df["net_sales"] > 0,
        df["gross_profit"] / df["net_sales"],
        0,
    )

    group_cols = ["item_key", "channel_key", "date", "hour", "is_weekend", "is_discounted"]
    grouped = (
        df.groupby(group_cols, dropna=False)
        .agg(
            quantity=("quantity", "sum"),
            gross_sales=("gross_sales", "sum"),
            discount_amount=("discount_amount", "sum"),
            net_sales=("net_sales", "sum"),
            gross_profit=("gross_profit", "sum"),
            discount_depth=("discount_depth", "mean"),
            margin_rate=("margin_rate", "mean"),
        )
        .reset_index()
    )

    baseline = (
        grouped[grouped["is_discounted"] == 0]
        .groupby(["item_key", "channel_key", "hour", "is_weekend"], dropna=False)
        .agg(
            baseline_units=("quantity", "mean"),
            baseline_net_sales=("net_sales", "mean"),
            baseline_gross_profit=("gross_profit", "mean"),
            baseline_margin_rate=("margin_rate", "mean"),
        )
        .reset_index()
    )

    discounted = grouped[grouped["is_discounted"] == 1].copy()
    if discounted.empty or baseline.empty:
        return pd.DataFrame()

    examples = discounted.merge(
        baseline,
        on=["item_key", "channel_key", "hour", "is_weekend"],
        how="inner",
    )
    if examples.empty:
        # Fall back to broader item baseline if exact hour/weekend baselines are sparse.
        broad_baseline = (
            grouped[grouped["is_discounted"] == 0]
            .groupby(["item_key", "channel_key"], dropna=False)
            .agg(
                baseline_units=("quantity", "mean"),
                baseline_net_sales=("net_sales", "mean"),
                baseline_gross_profit=("gross_profit", "mean"),
                baseline_margin_rate=("margin_rate", "mean"),
            )
            .reset_index()
        )
        examples = discounted.merge(broad_baseline, on=["item_key", "channel_key"], how="inner")

    if examples.empty:
        return pd.DataFrame()

    examples["quantity_lift"] = np.where(
        examples["baseline_units"] > 0,
        (examples["quantity"] - examples["baseline_units"]) / examples["baseline_units"],
        0,
    )
    examples["profit_lift"] = np.where(
        examples["baseline_gross_profit"] > 0,
        (examples["gross_profit"] - examples["baseline_gross_profit"]) / examples["baseline_gross_profit"],
        0,
    )
    examples["traffic_drop"] = np.clip(45 - (examples["quantity_lift"] * 30), 0, 80)
    examples["temp"] = pd.to_numeric(series_or_default(examples, "temp", 28), errors="coerce").fillna(28)
    examples["baseline_margin_rate"] = examples["baseline_margin_rate"].fillna(0).clip(-1, 1)
    examples["discount_depth"] = examples["discount_depth"].fillna(0).clip(0, 0.9)

    has_profit_signal = examples["baseline_gross_profit"].abs().sum() > 0 and examples["gross_profit"].abs().sum() > 0
    if has_profit_signal:
      examples["success"] = (
          (examples["quantity_lift"] >= 0.10)
          & (examples["profit_lift"] >= -0.10)
          & (examples["discount_depth"].between(0.02, 0.50))
      ).astype(int)
    else:
      examples["success"] = (
          (examples["quantity_lift"] >= 0.10)
          & (examples["net_sales"] >= examples["baseline_net_sales"] * 0.90)
          & (examples["discount_depth"].between(0.02, 0.50))
      ).astype(int)

    return examples


def synthetic_fallback_examples():
    np.random.seed(42)
    n_samples = 500
    hours = np.random.randint(8, 22, n_samples)
    is_weekend = np.random.randint(0, 2, n_samples)
    temps = np.random.uniform(20.0, 35.0, n_samples)
    traffic_drops = np.random.uniform(10.0, 60.0, n_samples)
    discount_depths = np.random.uniform(0.05, 0.35, n_samples)
    baseline_units = np.random.uniform(1.0, 8.0, n_samples)
    baseline_margin_rate = np.random.uniform(0.10, 0.55, n_samples)

    score = (
        (traffic_drops > 30).astype(int) * 2
        + (temps > 30).astype(int)
        + ((hours >= 13) & (hours <= 16)).astype(int)
        + is_weekend
        + ((discount_depths >= 0.10) & (discount_depths <= 0.25)).astype(int)
        + (baseline_margin_rate > 0.25).astype(int)
    )
    noise = np.random.uniform(-0.1, 0.1, n_samples)
    success = ((score / 7.0 + noise) > 0.5).astype(int)

    return pd.DataFrame(
        {
            "hour": hours,
            "is_weekend": is_weekend,
            "temp": temps,
            "traffic_drop": traffic_drops,
            "discount_depth": discount_depths,
            "baseline_units": baseline_units,
            "baseline_margin_rate": baseline_margin_rate,
            "success": success,
        }
    )


def train_model(examples, source, signature):
    X = examples[FEATURE_COLUMNS].copy()
    y = examples["success"].astype(int)

    rf = RandomForestClassifier(n_estimators=150, max_depth=6, min_samples_leaf=2, random_state=42)
    metrics = {
        "trainingSource": source,
        "trainingRows": int(len(examples)),
        "positiveRows": int(y.sum()),
        "negativeRows": int(len(y) - y.sum()),
    }

    if len(examples) >= 20 and y.nunique() > 1:
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        cv_results = cross_validate(
            rf, X, y, cv=cv, scoring=("accuracy", "precision", "recall")
        )
        rf.fit(X, y)
        metrics.update(
            {
                "accuracy": round(float(np.mean(cv_results["test_accuracy"])), 4),
                "precision": round(float(np.mean(cv_results["test_precision"])), 4),
                "recall": round(float(np.mean(cv_results["test_recall"])), 4),
                "validationRows": int(len(X)),
                "kFold": 5,
            }
        )
    else:
        rf.fit(X, y)
        metrics.update(
            {
                "accuracy": None,
                "precision": None,
                "recall": None,
                "validationRows": 0,
            }
        )

    joblib.dump({"model": rf, "metrics": metrics, "signature": signature}, MODEL_PATH)
    return rf, metrics


def load_cached_model(signature):
    if not signature or not os.path.exists(MODEL_PATH):
        return None
    try:
        cached = joblib.load(MODEL_PATH)
        if cached.get("signature") == signature:
            return cached.get("model"), cached.get("metrics")
    except Exception:
        return None
    return None


def detect_quiet_period(history_rows, target_dayofweek=None):
    """Find the quietest business hour using only historical data from the same
    day-of-week as the target date. This ensures Monday recommendations differ
    from Saturday recommendations, etc.

    Args:
        history_rows: list of transaction dicts
        target_dayofweek: int 0=Monday … 6=Sunday.  If None, uses tomorrow.
    """
    if not history_rows:
        return 15, 45.0  # Default fallback if no data

    # Create a quick DataFrame of just hour and quantity
    df = pd.DataFrame(history_rows)
    if "transactionTimestamp" not in df.columns or "quantitySold" not in df.columns:
        return 15, 45.0

    # Parse hour and sum quantity
    df["transactionTimestamp"] = parse_manila_timestamps(df["transactionTimestamp"])
    df = df.dropna(subset=["transactionTimestamp"])
    if df.empty:
        return 15, 45.0

    df["hour"] = df["transactionTimestamp"].dt.hour
    df["dayofweek"] = df["transactionTimestamp"].dt.dayofweek  # 0=Mon … 6=Sun
    df["quantitySold"] = pd.to_numeric(df["quantitySold"], errors="coerce").fillna(0)

    # Determine the target day-of-week (default: tomorrow)
    if target_dayofweek is None:
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo
        target_dayofweek = (datetime.now(ZoneInfo("Asia/Manila")) + timedelta(days=1)).weekday()

    # Filter to matching day-of-week only
    df_dow = df[df["dayofweek"] == target_dayofweek]
    if df_dow.empty:
        # Fallback: use weekend vs weekday grouping if no exact match
        target_is_weekend = target_dayofweek in (5, 6)
        if target_is_weekend:
            df_dow = df[df["dayofweek"].isin([5, 6])]
        else:
            df_dow = df[~df["dayofweek"].isin([5, 6])]
    if df_dow.empty:
        df_dow = df  # Last resort: use all data

    hourly_sales = df_dow.groupby("hour")["quantitySold"].sum()

    if hourly_sales.empty:
        return 15, 45.0

    peak_volume = hourly_sales.max()

    # Filter for standard business hours (9 AM to 5 PM) to find realistic slump
    business_hours = hourly_sales.loc[hourly_sales.index.isin(range(9, 18))]
    if business_hours.empty:
        business_hours = hourly_sales

    slump_hour = business_hours.idxmin()
    slump_volume = business_hours.min()

    # Calculate traffic drop percentage
    if peak_volume > 0:
        traffic_drop = ((peak_volume - slump_volume) / peak_volume) * 100
        traffic_drop = float(np.clip(traffic_drop, 0, 100))
    else:
        traffic_drop = 45.0

    return int(slump_hour), round(traffic_drop, 2)


def predict_promo_success(payload):
    history_rows = payload.get("trainingRows") or []
    signature = payload.get("trainingSignature") or f"inline:{len(history_rows)}"
    examples = build_training_examples(history_rows)
    using_real_history = len(examples) >= 20 and examples["success"].value_counts().min() >= 5

    cached = load_cached_model(signature)
    if cached:
        rf, metrics = cached
        metrics = {**metrics, "loadedFromCache": True}
    else:
        metrics = None

    if using_real_history:
        if metrics is None:
            rf, metrics = train_model(examples, "real_discount_history", signature)
        else:
            metrics["trainingSource"] = metrics.get("trainingSource", "real_discount_history")
    elif metrics is None:
        examples = synthetic_fallback_examples()
        rf, metrics = train_model(
            examples,
            "synthetic_fallback_insufficient_discount_history",
            f"fallback:{signature}",
        )
        metrics["realDiscountExamplesFound"] = int(len(build_training_examples(history_rows)))
    else:
        examples = synthetic_fallback_examples()
        metrics["trainingSource"] = metrics.get(
            "trainingSource",
            "synthetic_fallback_insufficient_discount_history",
        )

    medians = examples[FEATURE_COLUMNS].median(numeric_only=True)

    # Determine tomorrow's day-of-week for weekday-aware recommendations
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    target_date = payload.get("target_date")
    if target_date:
        target_date = datetime.strptime(str(target_date), "%Y-%m-%d")
    else:
        target_date = datetime.now(ZoneInfo("Asia/Manila")) + timedelta(days=1)
    if not isinstance(target_date, datetime):
        target_date = datetime.now(ZoneInfo("Asia/Manila")) + timedelta(days=1)
    target_dayofweek = target_date.weekday()  # 0=Mon … 6=Sun
    target_is_weekend = 1 if target_dayofweek in (5, 6) else 0

    dynamic_hour, dynamic_traffic_drop = detect_quiet_period(history_rows, target_dayofweek)
    
    hour = safe_float(payload.get("hour"), dynamic_hour)
    is_weekend = safe_float(payload.get("is_weekend"), target_is_weekend)
    temp = safe_float(payload.get("temp"), safe_float(medians.get("temp"), 28))
    traffic_drop = safe_float(payload.get("traffic_drop"), dynamic_traffic_drop)
    discount_depth = safe_float(payload.get("discount_depth"), 0.15)
    baseline_units_global = safe_float(payload.get("baseline_units"), safe_float(medians.get("baseline_units"), 2))
    baseline_margin_rate_global = safe_float(
        payload.get("baseline_margin_rate"),
        safe_float(medians.get("baseline_margin_rate"), 0.25),
    )

    X_new = pd.DataFrame(
        {
            "hour": [hour],
            "is_weekend": [is_weekend],
            "temp": [temp],
            "traffic_drop": [traffic_drop],
            "discount_depth": [discount_depth],
            "baseline_units": [baseline_units_global],
            "baseline_margin_rate": [baseline_margin_rate_global],
        }
    )

    global_prob = rf.predict_proba(X_new)[0][1]
    importances = dict(zip(FEATURE_COLUMNS, rf.feature_importances_))

    # --- ITEM-LEVEL LOGIC (weekday-aware) ---
    recommended_items = []
    if history_rows:
        df = pd.DataFrame(history_rows)
        # Parse timestamp safely
        df["timestamp"] = parse_manila_timestamps(df.get("transactionTimestamp"))
        df = df.dropna(subset=["timestamp"])

        df["hour"] = df["timestamp"].dt.hour
        df["dayofweek"] = df["timestamp"].dt.dayofweek
        df["item_key"] = series_or_default(df, "itemKey", "unknown").fillna("unknown").astype(str)
        df["quantity"] = pd.to_numeric(series_or_default(df, "quantitySold", 0), errors="coerce").fillna(0)
        df["net_sales"] = pd.to_numeric(series_or_default(df, "netSales", 0), errors="coerce").fillna(0)
        df["gross_profit"] = pd.to_numeric(series_or_default(df, "grossProfit", 0), errors="coerce").fillna(0)
        df["margin_rate"] = np.where(df["net_sales"] > 0, df["gross_profit"] / df["net_sales"], 0)

        # Filter to same day-of-week AND target hour
        df_dow = df[df["dayofweek"] == target_dayofweek]
        if df_dow.empty:
            # Fallback: weekend vs weekday grouping
            if target_is_weekend:
                df_dow = df[df["dayofweek"].isin([5, 6])]
            else:
                df_dow = df[~df["dayofweek"].isin([5, 6])]
        if df_dow.empty:
            df_dow = df

        df_hour = df_dow[df_dow["hour"] == int(hour)]
        if df_hour.empty:
            # Keep suggestions available when this weekday has no transactions
            # at the quiet hour; first broaden to any weekday at that hour.
            df_hour = df[df["hour"] == int(hour)]
        if df_hour.empty:
            # Last resort: recommend from the target weekday/weekend rows.
            df_hour = df_dow
        
        if not df_hour.empty:
            # Group by itemKey leveraging pandas vectorized grouping
            item_hour_stats = df_hour.groupby("item_key").agg(
                total_quantity=("quantity", "sum"),
                baseline_units=("quantity", "mean"),
                baseline_margin_rate=("margin_rate", "mean")
            ).reset_index()

            # Using pandas quantile to find anomaly/underperforming items without custom math formulas
            if len(item_hour_stats) >= 4:
                threshold = item_hour_stats["total_quantity"].quantile(0.25)
                candidates_df = item_hour_stats[item_hour_stats["total_quantity"] <= threshold]
            else:
                candidates_df = item_hour_stats

            # Exclude unknown items
            if not candidates_df.empty:
                candidates_df = candidates_df[candidates_df["item_key"] != "unknown"].copy()
            
            if not candidates_df.empty:
                # Assign dynamic discounts purely based on margin bracket
                def calc_discount(margin):
                    if margin > 0.4: return 0.20
                    elif margin < 0.2: return 0.10
                    return 0.15
                
                candidates_df["rec_discount"] = candidates_df["baseline_margin_rate"].apply(calc_discount)
                
                # Create a feature matrix for the candidates
                X_candidates = pd.DataFrame({
                    "hour": [hour] * len(candidates_df),
                    "is_weekend": [is_weekend] * len(candidates_df),
                    "temp": [temp] * len(candidates_df),
                    "traffic_drop": [traffic_drop] * len(candidates_df),
                    "discount_depth": candidates_df["rec_discount"].values,
                    "baseline_units": candidates_df["baseline_units"].fillna(baseline_units_global).values,
                    "baseline_margin_rate": candidates_df["baseline_margin_rate"].fillna(baseline_margin_rate_global).values
                })
                
                # Vectorized prediction using scikit-learn
                probs = rf.predict_proba(X_candidates)[:, 1]
                candidates_df["probabilityScore"] = probs
                
                # Filter to good recommendations (> 0% probability), sort and take top 5
                good_cands = candidates_df[candidates_df["probabilityScore"] >= 0.0].sort_values(by="probabilityScore", ascending=False).head(5)
                
                for _, row in good_cands.iterrows():
                    recommended_items.append({
                        "itemKey": str(row["item_key"]),
                        "recommendedDiscount": float(row["rec_discount"] * 100),
                        "probabilityScore": float(row["probabilityScore"]),
                        "historicalDrop": float(traffic_drop)
                    })

    if recommended_items:
        # Override global probability with the max of the recommendations for backward compatibility
        global_prob = recommended_items[0]["probabilityScore"]

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    return {
        "probabilityScore": float(global_prob),
        "featureImportance": {key: float(value) for key, value in importances.items()},
        "modelMetrics": metrics,
        "targetHour": int(hour),
        "predictedTrafficDrop": float(traffic_drop),
        "targetDayName": day_names[target_dayofweek],
        "targetDayOfWeek": int(target_dayofweek),
        "recommendedItems": recommended_items
    }


if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        required = ["is_weekend", "temp"]
        if any(input_data.get(key) is None for key in required):
            raise ValueError("Missing required inputs")

        result = predict_promo_success(input_data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
