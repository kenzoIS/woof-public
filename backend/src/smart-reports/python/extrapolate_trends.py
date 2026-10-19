import sys
import json
from datetime import datetime, timedelta
import numpy as np

def main():
    try:
        # Read JSON payload from stdin
        input_data = json.loads(sys.stdin.read())
        
        history = input_data.get("history", [])
        future_exogenous = input_data.get("future_exogenous", [])
        horizon = int(input_data.get("horizon", 30))
        
        if not history:
            print(json.dumps({
                "error": "Empty history provided",
                "projectedRevenue": [],
                "dates": [],
                "trendDirection": "STABLE",
                "projectedGrowthRate": 0.0
            }))
            return

        n = len(history)
        
        # If dataset is too small to fit multiple variables, fall back to simple flat or single-variable projection
        if n < 5:
            history_values = [float(item.get("value", 0.0)) for item in history]
            last_val = history_values[-1] if n > 0 else 0.0
            projected = [last_val] * horizon
            dates = [exo.get("date") for exo in future_exogenous] if len(future_exogenous) >= horizon else []
            if not dates:
                # generate dates as fallback
                last_date_str = history[-1].get("date") if n > 0 else datetime.now().strftime("%Y-%m-%d")
                try:
                    last_date = datetime.strptime(last_date_str, "%Y-%m-%d")
                except ValueError:
                    last_date = datetime.fromisoformat(last_date_str.replace("Z", "+00:00"))
                dates = [(last_date + timedelta(days=i+1)).strftime("%Y-%m-%d") for i in range(horizon)]
                
            print(json.dumps({
                "projectedRevenue": [round(x, 2) for x in projected],
                "dates": dates[:horizon],
                "trendDirection": "STABLE",
                "projectedGrowthRate": 0.0
            }))
            return

        # Prepare matrices for Multivariate Linear Regression
        # Features: [1.0 (intercept), time_index, avg_temperature, rainfall, is_holiday]
        X = []
        y = []
        for idx, item in enumerate(history):
            val = float(item.get("value", 0.0))
            temp = float(item.get("avg_temperature", 28.0))
            rain = float(item.get("rainfall", 0.0))
            hol = float(item.get("is_holiday", 0.0))
            X.append([1.0, float(idx), temp, rain, hol])
            y.append(val)
            
        X = np.array(X)
        y = np.array(y)
        
        # Solve OLS: beta = (X^T * X)^-1 * X^T * y
        beta, residuals, rank, s = np.linalg.lstsq(X, y, rcond=None)
        
        # Extract features for future predictions
        projected = []
        future_dates = []
        
        for i in range(horizon):
            if i < len(future_exogenous):
                exo = future_exogenous[i]
                date_str = exo.get("date")
                temp = float(exo.get("avg_temperature", 28.0))
                rain = float(exo.get("rainfall", 0.0))
                hol = float(exo.get("is_holiday", 0.0))
            else:
                # fallback values
                date_str = (datetime.now() + timedelta(days=i+1)).strftime("%Y-%m-%d")
                temp = 28.0
                rain = 0.0
                hol = 0.0
                
            future_idx = float(n + i)
            pred = beta[0] + beta[1] * future_idx + beta[2] * temp + beta[3] * rain + beta[4] * hol
            projected.append(pred)
            future_dates.append(date_str)
            
        # Clip negative projections to zero
        projected = np.clip(projected, 0, None)
        
        # Trend classification based on slope of the time index coefficient (beta[1])
        trend_slope = beta[1]
        mean_y = np.mean(y)
        if mean_y == 0:
            trend = "STABLE"
        else:
            relative_slope = trend_slope / mean_y
            if relative_slope > 0.001:
                trend = "UPWARD"
            elif relative_slope < -0.001:
                trend = "DOWNWARD"
            else:
                trend = "STABLE"
                
        # Growth rate projection
        last_hist_val = y[-1]
        last_proj_val = projected[-1]
        if last_hist_val > 0:
            raw_growth = ((last_proj_val - last_hist_val) / last_hist_val) * 100.0
            growth_rate = max(-100.0, min(100.0, raw_growth))
        else:
            growth_rate = 0.0
            
        print(json.dumps({
            "projectedRevenue": [round(float(val), 2) for val in projected],
            "dates": future_dates,
            "trendDirection": trend,
            "projectedGrowthRate": round(growth_rate, 2)
        }))
        
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "projectedRevenue": [],
            "dates": [],
            "trendDirection": "STABLE",
            "projectedGrowthRate": 0.0
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
