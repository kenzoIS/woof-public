import sys
import json
import logging
import warnings
import pandas as pd
from prophet import Prophet
import statsmodels.api as sm

from model_metrics import evaluate_forecast_metrics

# Suppress warnings for clean stdout JSON
warnings.filterwarnings('ignore')
logging.getLogger("cmdstanpy").setLevel(logging.ERROR)
logging.getLogger("prophet").setLevel(logging.ERROR)

DEFAULT_FORECAST_DAYS = 30
MAX_FORECAST_DAYS = 90


def normalize_forecast_days(value):
    try:
        days = int(value)
    except Exception:
        days = DEFAULT_FORECAST_DAYS
    return max(1, min(days, MAX_FORECAST_DAYS))


def run_forecast(payload):
    try:
        if isinstance(payload, dict):
            data = payload.get("data", [])
            forecast_days = normalize_forecast_days(
                payload.get("forecastDays", DEFAULT_FORECAST_DAYS)
            )
        else:
            data = payload
            forecast_days = DEFAULT_FORECAST_DAYS

        # data is expected to be a list of dicts: [{'date': 'YYYY-MM-DD', 'revenue': 100}, ...]
        if not data or len(data) < 14:
            return {
                "historical": data,
                "forecast": [],
                "modelInfo": {"model": "Insufficient Data", "accuracy": 0}
            }
        
        df = pd.DataFrame(data)
        df['ds'] = pd.to_datetime(df['date'])
        df['y'] = df['revenue']
        
        # Prophet Model
        m = Prophet(daily_seasonality=True, yearly_seasonality=False, weekly_seasonality=True)
        m.fit(df[['ds', 'y']])
        
        future = m.make_future_dataframe(periods=forecast_days)
        forecast_prophet = m.predict(future)
        
        # SARIMAX Model (basic auto-fit approximation)
        try:
            model_sarimax = sm.tsa.statespace.SARIMAX(df['y'], order=(1, 1, 1), seasonal_order=(1, 1, 1, 7))
            results_sarimax = model_sarimax.fit(disp=False)
            forecast_sarimax = results_sarimax.get_forecast(steps=forecast_days)
            sarimax_mean = forecast_sarimax.predicted_mean.values
        except Exception as e:
            sarimax_mean = None
            
        # Combine or select best
        forecast_output = []
        
        for i in range(forecast_days):
            idx = len(df) + i
            pred_date = forecast_prophet.iloc[idx]['ds'].strftime('%Y-%m-%d')
            yhat = forecast_prophet.iloc[idx]['yhat']
            yhat_lower = forecast_prophet.iloc[idx]['yhat_lower']
            yhat_upper = forecast_prophet.iloc[idx]['yhat_upper']
            
            # Simple blending if SARIMAX succeeded
            if sarimax_mean is not None and i < len(sarimax_mean):
                yhat = (yhat + sarimax_mean[i]) / 2.0
                
            forecast_output.append({
                "date": pred_date,
                "forecast": round(float(yhat), 2),
                "confidenceLow": round(float(yhat_lower), 2),
                "confidenceHigh": round(float(yhat_upper), 2)
            })
            
        # Calculate training error metrics using library-backed helpers where installed.
        import numpy as np
        train_pred = m.predict(df)
        y_true = df['y'].values
        y_pred = train_pred['yhat'].values
        metric_result = evaluate_forecast_metrics(y_true, y_pred, y_true, seasonal_period=7)

        return {
            "historical": data,
            "forecast": forecast_output,
            "fittedValues": [round(max(0.0, float(v)), 2) for v in y_pred],
            "modelInfo": {
                "model": "Prophet + SARIMAX Ensemble" if sarimax_mean is not None else "Prophet",
                "accuracy": metric_result["accuracy"],
                "mase": metric_result["mase"],
                "mae": metric_result["mae"],
                "rmse": metric_result["rmse"],
                "mape": metric_result["mape"],
                "smape": metric_result["smape"],
                "r2": metric_result["r2"],
                "metricImplementation": metric_result["metricImplementation"],
            }
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    input_data = sys.stdin.read()
    try:
        data = json.loads(input_data)
        result = run_forecast(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": "Invalid JSON input or script error: " + str(e)}))
