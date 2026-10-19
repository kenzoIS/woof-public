import sys
import json
import math

def erlang_c(A, c):
    """
    Computes the Erlang C probability that a customer will have to wait.
    A: Offered load (arrival rate * average service time)
    c: Number of servers (staff members)
    """
    if c <= A:
        return 1.0 # The queue will grow infinitely
    
    numerator = (A ** c) / math.factorial(c)
    sum_denom = sum((A ** i) / math.factorial(i) for i in range(c))
    
    erlang = numerator / (numerator + (1 - A / c) * sum_denom)
    return max(0.0, min(1.0, erlang))

def calculate_queue_metrics(arrival_rate_per_hour, service_time_minutes, c):
    A = arrival_rate_per_hour * (service_time_minutes / 60.0)
    prob_wait = erlang_c(A, c)
    
    if c > A:
        avg_wait_time = (prob_wait * (service_time_minutes / 60.0)) / (c - A)
        avg_wait_time_minutes = avg_wait_time * 60.0
    else:
        avg_wait_time_minutes = float('inf')
        
    return {
        "offeredLoad": round(A, 2),
        "probabilityOfWait": round(prob_wait, 4),
        "averageWaitTimeMinutes": round(avg_wait_time_minutes, 2) if avg_wait_time_minutes != float('inf') else 999.99,
        "isStable": c > A
    }

import numpy as np

def monte_carlo_staffing(
    mean_arrival_rate: float,
    std_arrival_rate: float,
    avg_service_minutes: float,
    num_servers: int,
    target_wait: float = 15.0,
    n_simulations: int = 1000
) -> dict:
    successes = 0
    wait_times = []
    for _ in range(n_simulations):
        simulated_rate = max(0.1, np.random.normal(mean_arrival_rate, std_arrival_rate))
        metrics = calculate_queue_metrics(simulated_rate, avg_service_minutes, num_servers)
        if metrics['isStable'] and metrics['averageWaitTimeMinutes'] <= target_wait:
            successes += 1
        if metrics['isStable']:
            wait_times.append(metrics['averageWaitTimeMinutes'])
    return {
        'successRate': round(successes / n_simulations, 4),
        'p95WaitMinutes': round(float(np.percentile(wait_times, 95)), 2) if wait_times else None,
        'nSimulations': n_simulations
    }

def recommend_staffing(arrival_rate_per_hour, service_time_minutes, target_wait_time_minutes=5.0, max_staff=20):
    A = arrival_rate_per_hour * (service_time_minutes / 60.0)
    min_c = math.floor(A) + 1
    
    selected_metrics = None
    for c in range(min_c, max_staff + 1):
        metrics = calculate_queue_metrics(arrival_rate_per_hour, service_time_minutes, c)
        if metrics["averageWaitTimeMinutes"] <= target_wait_time_minutes:
            metrics["recommendedStaff"] = c
            selected_metrics = metrics
            break
            
    if not selected_metrics:
        selected_metrics = calculate_queue_metrics(arrival_rate_per_hour, service_time_minutes, max_staff)
        selected_metrics["recommendedStaff"] = max_staff
        
    # Run Monte Carlo simulation for robustness
    mc_results = monte_carlo_staffing(
        mean_arrival_rate=arrival_rate_per_hour,
        std_arrival_rate=max(1.0, arrival_rate_per_hour * 0.2), # Assume 20% variance
        avg_service_minutes=service_time_minutes,
        num_servers=selected_metrics["recommendedStaff"],
        target_wait=target_wait_time_minutes
    )
    
    selected_metrics["monteCarlo"] = mc_results
    return selected_metrics

if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        arrival_rate = float(input_data.get("arrival_rate_per_hour", 10.0))
        service_time = float(input_data.get("service_time_minutes", 15.0))
        target_wait = float(input_data.get("target_wait_time_minutes", 5.0))
        
        result = recommend_staffing(arrival_rate, service_time, target_wait)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
