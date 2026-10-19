const { spawn } = require('child_process');
const path = require('path');

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api';
const PYTHON = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
const SCRIPT_PATH = path.join(__dirname, '..', 'src', 'analytics', 'python', 'cafe_prophet.py');

const variants = [
  {
    name: 'current-live-full-exog',
    source: 'live',
  },
  {
    name: 'prophet-no-exog-default-seasonality',
    experimentConfig: {
      exogColumns: [],
      changepointCandidates: [0.01, 0.05, 0.1, 0.2, 0.3, 0.5],
      seasonalityModes: ['multiplicative', 'additive'],
      weeklyFourierOrders: [8],
      monthlyFourierOrders: [4],
      yearlySeasonality: true,
    },
  },
  {
    name: 'prophet-no-exog-lower-seasonality',
    experimentConfig: {
      exogColumns: [],
      changepointCandidates: [0.01, 0.05, 0.1, 0.2, 0.3],
      seasonalityModes: ['multiplicative', 'additive'],
      weeklyFourierOrders: [3, 5],
      monthlyFourierOrders: [2, 4],
      yearlySeasonality: true,
    },
  },
  {
    name: 'prophet-weekend-only',
    experimentConfig: {
      exogColumns: ['isWeekend'],
      changepointCandidates: [0.01, 0.05, 0.1, 0.2, 0.3],
      seasonalityModes: ['multiplicative', 'additive'],
      weeklyFourierOrders: [3, 5, 8],
      monthlyFourierOrders: [2, 4],
      yearlySeasonality: true,
    },
  },
  {
    name: 'prophet-calendar-basic',
    experimentConfig: {
      exogColumns: ['isWeekend', 'isHoliday', 'dayBeforeHoliday', 'dayAfterHoliday'],
      changepointCandidates: [0.01, 0.05, 0.1, 0.2, 0.3],
      seasonalityModes: ['multiplicative', 'additive'],
      weeklyFourierOrders: [3, 5, 8],
      monthlyFourierOrders: [2, 4],
      yearlySeasonality: true,
    },
  },
];

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekend(dateKey) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6 ? 1 : 0;
}

function buildExogenousRows(rows) {
  return rows.map((row) => ({
    date: row.date,
    isWeekend: row.isWeekend === true || row.isWeekend === 1 ? 1 : isWeekend(row.date),
    isHoliday: Number(row.isHoliday || 0),
    dayBeforeHoliday: Number(row.dayBeforeHoliday || 0),
    dayAfterHoliday: Number(row.dayAfterHoliday || 0),
  }));
}

function buildFutureExogenousRows(lastDate, days) {
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(lastDate, index + 1);
    return {
      date,
      isWeekend: isWeekend(date),
      isHoliday: 0,
      dayBeforeHoliday: 0,
      dayAfterHoliday: 0,
    };
  });
}

function runPython(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT_PATH], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python exited with ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          reject(new Error(parsed.error));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Invalid Python JSON: ${stdout.slice(0, 300)} ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function metricSummary(name, result, source) {
  return {
    name,
    source,
    modelName: result.modelName || result.model_name,
    mase: Number(result.mase),
    smape: Number(result.smape),
    accuracy: Number(result.accuracy),
    weeklyMase: result.weeklyMetrics ? Number(result.weeklyMetrics.mase) : null,
    monthlyMase: result.monthlyMetrics ? Number(result.monthlyMetrics.mase) : null,
    weeklyMetricsPresent: Boolean(result.weeklyMetrics),
    monthlyMetricsPresent: Boolean(result.monthlyMetrics),
    changepointPriorScale: result.modelMetadata?.changepointPriorScale ?? null,
    seasonalityMode: result.modelMetadata?.seasonalityMode ?? null,
    weeklyFourierOrder: result.modelMetadata?.weeklyFourierOrder ?? null,
    monthlyFourierOrder: result.modelMetadata?.monthlyFourierOrder ?? null,
    exogenousVariables: result.modelMetadata?.exogenousVariables ?? [],
    error: null,
  };
}

async function main() {
  const live = await fetch(`${API_BASE}/analytics/forecast/Cafe?days=30`);
  if (!live.ok) {
    throw new Error(`Cafe forecast endpoint returned ${live.status}`);
  }
  const liveResult = await live.json();
  const historical = Array.isArray(liveResult.historical) ? liveResult.historical : [];
  if (historical.length < 30) {
    throw new Error(`Need at least 30 Cafe history rows; received ${historical.length}`);
  }
  const forecastDays = Number(liveResult.modelMetadata?.daysRequested || 30);
  const lastDate = historical[historical.length - 1].date;
  const basePayload = {
    data: historical,
    forecastDays,
    splitRatio: liveResult.modelMetadata?.splitRatio || '90-5-5',
    exogenous: buildExogenousRows(historical),
    exogenousForecast: buildFutureExogenousRows(lastDate, forecastDays),
  };

  const results = [];
  for (const variant of variants) {
    const started = Date.now();
    try {
      if (variant.source === 'live') {
        results.push({
          ...metricSummary(variant.name, liveResult, 'saved forecast endpoint'),
          seconds: 0,
        });
        continue;
      }
      const result = await runPython({
        ...basePayload,
        experimentConfig: variant.experimentConfig,
      });
      results.push({
        ...metricSummary(variant.name, result, 'experiment script'),
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      });
    } catch (error) {
      results.push({
        name: variant.name,
        source: 'experiment script',
        error: error instanceof Error ? error.message : String(error),
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      });
    }
  }

  results.sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    return Number(a.mase ?? Infinity) - Number(b.mase ?? Infinity);
  });

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    endpoint: `${API_BASE}/analytics/forecast/Cafe?days=30`,
    historyRows: historical.length,
    historyStart: historical[0].date,
    historyEnd: lastDate,
    note: 'Production defaults are unchanged; variants are run through experimentConfig only.',
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
