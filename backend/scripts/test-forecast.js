const { spawn } = require("child_process");
const path = require("path");
const assert = require("assert");

// Generate synthetic upward trending history data: y = 1000 + 100 * x + noise
const history = Array.from({ length: 30 }, (_, idx) => {
  const x = idx;
  const value = 1000 + 100 * x + (Math.random() - 0.5) * 10; // steady upward slope
  const date = new Date(2021, 2, 1 + idx).toISOString().split("T")[0];
  return {
    value,
    date,
    avg_temperature: 28 + Math.sin(idx) * 2,
    rainfall: Math.max(0, Math.cos(idx) * 5),
    is_holiday: idx % 7 === 0 ? 1 : 0
  };
});

// Future exogenous settings for a 30 day horizon
const futureExogenous = Array.from({ length: 30 }, (_, idx) => {
  const date = new Date(2021, 3, 1 + idx).toISOString().split("T")[0];
  return {
    date,
    avg_temperature: 28,
    rainfall: 0,
    is_holiday: 0
  };
});

const payload = {
  history,
  future_exogenous: futureExogenous,
  horizon: 30
};

// Python path detection logic (mirrors SmartReportsService path detection)
const pythonCmd = process.platform === "win32"
  ? path.join(__dirname, "..", "..", "backend", ".venv", "Scripts", "python.exe")
  : path.join(__dirname, "..", "..", "backend", ".venv", "bin", "python");

const scriptPath = path.join(__dirname, "..", "src", "smart-reports", "python", "extrapolate_trends.py");

console.log("Running OLS Trend Extrapolation validation test...");
console.log(`Python command: ${pythonCmd}`);
console.log(`Script: ${scriptPath}`);

// Fallback to standard python if venv not found
const cmd = require("fs").existsSync(pythonCmd) ? pythonCmd : "python";

const pyProcess = spawn(cmd, [scriptPath]);

let stdout = "";
let stderr = "";

pyProcess.stdout.on("data", (data) => {
  stdout += data.toString();
});

pyProcess.stderr.on("data", (data) => {
  stderr += data.toString();
});

pyProcess.on("close", (code) => {
  if (code !== 0) {
    console.error("Test process exited with non-zero code:", code);
    console.error("Stderr:", stderr);
    process.exit(1);
  }

  try {
    const result = JSON.parse(stdout);
    console.log("\n--- Forecasting Engine Response Received ---");
    console.log(`Trend Direction: ${result.trendDirection}`);
    console.log(`Projected Growth Rate: ${result.projectedGrowthRate}%`);
    console.log(`First 3 Projections:`, result.projectedRevenue.slice(0, 3));
    console.log(`Last 3 Projections:`, result.projectedRevenue.slice(-3));

    // Assertions
    assert.strictEqual(result.trendDirection, "UPWARD", "Assert failed: Trend direction must be UPWARD for positive slope synthetic data.");
    assert(result.projectedGrowthRate > 0, "Assert failed: Projected growth rate must be positive for positive slope synthetic data.");
    assert.strictEqual(result.projectedRevenue.length, 30, "Assert failed: Should yield exactly 30 projections.");
    
    // Check that projections are increasing overall
    const firstProj = result.projectedRevenue[0];
    const lastProj = result.projectedRevenue[29];
    assert(lastProj > firstProj, "Assert failed: Last projection must be greater than first projection for upward trend.");

    console.log("\n✅ ALL FORECASTING MATHEMATICAL ASSERTIONS PASSED SUCCESSFULLY!");
  } catch (err) {
    console.error("Assertion or JSON parsing failed:", err.message);
    process.exit(1);
  }
});

// Write inputs to stdin
pyProcess.stdin.write(JSON.stringify(payload));
pyProcess.stdin.end();
