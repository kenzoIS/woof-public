require('dotenv').config();

const { spawn } = require('child_process');
const path = require('path');
const { MongoClient } = require('mongodb');

const PYTHON = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
const DB_NAME = process.env.MONGODB_DB || 'woof_staging';
const LAT = Number(process.env.LUCENA_LAT || 13.9397);
const LNG = Number(process.env.LUCENA_LNG || 121.6145);
const DEFAULT_FORECAST_DAYS = Number(process.env.FORECAST_DAYS || 30);
const MIN_SEGMENT_ROWS = Number(process.env.MIN_SEGMENT_ROWS || 30);
const TODAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function computeOutlierCap(values) {
  const clean = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (clean.length < 7) return null;

  const q1 = percentile(clean, 0.25);
  const q3 = percentile(clean, 0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) {
    const median = percentile(clean, 0.5);
    const fallbackCap = median * 3;
    return fallbackCap > median ? fallbackCap : null;
  }

  const cap = q3 + 1.5 * iqr;
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluateWapeAccuracy(actual, predicted) {
  const pairs = actual
    .map((value, index) => [Number(value), Number(predicted[index])])
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  if (!pairs.length) {
    return { wape: null, wapeAccuracy: null };
  }
  const actualTotal = pairs.reduce((sum, [left]) => sum + Math.abs(left), 0);
  const absoluteErrorTotal = pairs.reduce(
    (sum, [left, right]) => sum + Math.abs(left - right),
    0,
  );
  if (actualTotal <= 0) {
    return {
      wape: absoluteErrorTotal === 0 ? 0 : null,
      wapeAccuracy: absoluteErrorTotal === 0 ? 100 : null,
    };
  }
  const wape = (absoluteErrorTotal / actualTotal) * 100;
  return {
    wape: round(wape),
    wapeAccuracy: round(Math.max(0, 100 - wape)),
  };
}

function evaluateForecastMetrics(actual, predicted, trainActual, seasonalPeriod = 7) {
  const pairs = actual
    .map((value, index) => [Number(value), Number(predicted[index])])
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  if (!pairs.length) {
    return { mase: null, smape: null, accuracy: null, mae: null };
  }
  const absoluteErrors = pairs.map(([left, right]) => Math.abs(left - right));
  const mae = mean(absoluteErrors);
  const cleanTrain = trainActual.filter((value) => Number.isFinite(Number(value))).map(Number);
  const naiveDiffs = [];
  const lag = cleanTrain.length > seasonalPeriod ? seasonalPeriod : 1;
  for (let index = lag; index < cleanTrain.length; index += 1) {
    naiveDiffs.push(Math.abs(cleanTrain[index] - cleanTrain[index - lag]));
  }
  const maseDenominator = mean(naiveDiffs);
  const smapeTerms = pairs
    .map(([left, right]) => {
      const denominator = (Math.abs(left) + Math.abs(right)) / 2;
      return denominator > 0 ? Math.abs(left - right) / denominator : null;
    })
    .filter((value) => value !== null);
  const smape = smapeTerms.length ? mean(smapeTerms) * 100 : null;
  const wapeMetrics = evaluateWapeAccuracy(actual, predicted);
  return {
    mase: maseDenominator > 0 ? round(mae / maseDenominator) : null,
    smape: smape === null ? null : round(smape),
    accuracy: wapeMetrics.wapeAccuracy,
    mae: round(mae),
    ...wapeMetrics,
  };
}

function periodKey(dateKey, bucket) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (bucket === 'month') {
    return dateKey.slice(0, 7);
  }
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function sumByPeriod(dates, actual, predicted, bucket) {
  const buckets = new Map();
  dates.forEach((date, index) => {
    const key = periodKey(date, bucket);
    if (!key) return;
    const current = buckets.get(key) || { actual: 0, predicted: 0 };
    current.actual += Number(actual[index]) || 0;
    current.predicted += Number(predicted[index]) || 0;
    buckets.set(key, current);
  });
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function sumTrainingByPeriod(dates, actual, bucket) {
  const buckets = new Map();
  dates.forEach((date, index) => {
    const key = periodKey(date, bucket);
    if (!key) return;
    buckets.set(key, (buckets.get(key) || 0) + (Number(actual[index]) || 0));
  });
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function evaluateResampledForecastMetrics(dates, actual, predicted, trainDates, trainActual, bucket) {
  const testBuckets = sumByPeriod(dates, actual, predicted, bucket);
  const trainBuckets = sumTrainingByPeriod(trainDates, trainActual, bucket);
  return evaluateForecastMetrics(
    testBuckets.map((point) => point.actual),
    testBuckets.map((point) => point.predicted),
    trainBuckets,
    1,
  );
}

function isoDayOfWeek(dateKey) {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function calendarFeatures(date) {
  const dayOfWeek = isoDayOfWeek(date);
  return {
    dayOfWeek,
    isWeekend: dayOfWeek === 6 || dayOfWeek === 7,
  };
}

function weatherTransforms(tempCelsius, rainFlag, humidity) {
  const temp = Number.isFinite(Number(tempCelsius)) ? Number(tempCelsius) : 28;
  const rh = Number.isFinite(Number(humidity)) ? Number(humidity) : 60;
  const rain = Number(rainFlag) === 1 ? 1 : 0;
  const comfortIndex = temp - (0.55 - 0.0055 * rh) * (temp - 14.5);
  return {
    isHotDay: temp >= 31 ? 1 : 0,
    isCoolRainyDay: rain === 1 && temp <= 26 ? 1 : 0,
    comfortIndex: round(comfortIndex),
  };
}

function textKey(...values) {
  return values
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function classifyCafeSegment(row) {
  const text = textKey(row.category, row.productName);
  if (/(pet bakery|pupcake|pup cake|dog cake|barkday cake|pet treat|dog treat|cat treat)/.test(text)) {
    return 'Pet bakery';
  }
  if (/(rice|silog|tapa|tocino|longganisa|cordon|chicken meal|pork meal|beef meal|rice meal)/.test(text)) {
    return 'Rice meals';
  }
  if (/(coffee|espresso|americano|latte|cappuccino|mocha|macchiato|cold brew|brew)/.test(text)) {
    return 'Coffee';
  }
  if (/(waffle|pasta|spaghetti|carbonara|snack|fries|nachos|sandwich|toast|burger|muffin|cookie|pastry)/.test(text)) {
    return 'Snacks/waffles/pasta';
  }
  if (/(non[- ]?caffeine|tea|matcha|chocolate|lemonade|smoothie|shake|juice|soda|frappe|milk tea|cooler)/.test(text)) {
    return 'Non-caffeine drinks';
  }
  return 'Other Cafe';
}

function classifyServicesSegment(row) {
  const text = textKey(row.category, row.productName);
  if (/(event|birthday|party|pawty|bday)/.test(text)) return 'Events';
  if (/(hotel|boarding|overnight|lodging|daycare|day care|day-care)/.test(text)) {
    return 'Pet Hotel / Boarding';
  }
  if (/(spa|bath|wash|shampoo|groom|grooming|trim|cut|nail)/.test(text)) {
    return 'Grooming';
  }
  return 'Other Services';
}

function modelFeatureColumns(row, point, defaults = {}) {
  const dayOfWeek = Number(point?.dayOfWeek || isoDayOfWeek(row.date));
  const radians = (2 * Math.PI * dayOfWeek) / 7;
  const isWeekend = point?.isWeekend !== undefined
    ? Boolean(point.isWeekend)
    : dayOfWeek === 6 || dayOfWeek === 7;
  return {
    ...row,
    dayOfWeek,
    isWeekend: isWeekend ? 1 : 0,
    dayOfWeekSin: round(Math.sin(radians)),
    dayOfWeekCos: round(Math.cos(radians)),
    promoFlag: Number(point?.promoFlag ?? defaults.promoFlag ?? 0),
    outlierFlag: point?.isOutlier ? 1 : 0,
    isMissingDate: point?.isMissingDate ? 1 : 0,
    avgBasketSize: round(point?.avgBasketSize ?? defaults.avgBasketSize ?? 0),
    avgOrderValue: round(point?.avgOrderValue ?? defaults.avgOrderValue ?? 0),
    average_unit_price: round(defaults.averageUnitPrice ?? point?.averageUnitPrice ?? 0),
  };
}

function toNormalizedDailySeries(values, moduleName) {
  const validValues = values
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || '')))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (validValues.length === 0) return [];

  const alpha = moduleName === 'Cafe' ? 0.3 : 0.4;
  const byDate = new Map(validValues.map((value) => [value.date, value]));
  const outlierCap = computeOutlierCap(validValues.map((value) => Number(value.actual) || 0));
  const dates = enumerateDates(validValues[0].date, validValues[validValues.length - 1].date);
  let ema = null;

  return dates.map((date) => {
    const existing = byDate.get(date);
    const actual = Number(existing?.actual) || 0;
    const isMissingDate = !existing;
    const isClosedDay = actual === 0;
    const isObservedDemand = !isClosedDay;
    const cappedActual =
      existing && outlierCap !== null ? Math.min(actual, outlierCap) : actual;
    if (ema === null && isObservedDemand) {
      ema = cappedActual;
    } else if (ema !== null && isObservedDemand) {
      ema = alpha * cappedActual + (1 - alpha) * ema;
    }

    return {
      date,
      actual: round(actual),
      orders: Number(existing?.orders) || 0,
      revenue: round(existing?.revenue),
      lineItems: Number(existing?.lineItems) || 0,
      basketItems: Number(existing?.basketItems) || 0,
      discountAmount: round(existing?.discountAmount),
      promoTransactions: Number(existing?.promoTransactions) || 0,
      avgBasketSize: round(
        existing?.avgBasketSize ??
          ((Number(existing?.orders) || 0) > 0
            ? (Number(existing?.basketItems) || 0) / (Number(existing?.orders) || 1)
            : 0),
      ),
      avgOrderValue: round(
        existing?.avgOrderValue ??
          ((Number(existing?.orders) || 0) > 0
            ? (Number(existing?.revenue) || 0) / (Number(existing?.orders) || 1)
            : 0),
      ),
      averageUnitPrice: round(
        existing?.averageUnitPrice ??
          (actual > 0 ? (Number(existing?.revenue) || 0) / Math.max(actual, 1) : 0),
      ),
      normalized: round(ema ?? 0),
      isMissingDate,
      isTrueZeroDay: false,
      isClosedDay,
      isObservedDemand,
      rawActual: round(actual),
      cappedActual: round(cappedActual),
      isOutlier: Boolean(existing && outlierCap !== null && actual > outlierCap),
      outlierCap: outlierCap === null ? null : round(outlierCap),
      ...calendarFeatures(date),
      promoFlag:
        (Number(existing?.promoTransactions) || 0) > 0 ||
        (Number(existing?.discountAmount) || 0) > 0
          ? 1
          : 0,
    };
  });
}

function forecastTransactionMatch(moduleName) {
  return {
    sector: moduleName,
    $and: [
      {
        $or: [
          { orderStatus: { $exists: false } },
          { orderStatus: null },
          { orderStatus: { $not: /(cancelled|canceled|void|voided|refund|refunded|failed|rejected)/i } },
        ],
      },
      {
        $or: [
          { paymentStatus: { $exists: false } },
          { paymentStatus: null },
          { paymentStatus: { $not: /(unpaid|failed|refunded|void|voided)/i } },
        ],
      },
    ],
  };
}

async function getForecastHistory(db, moduleName) {
  const rows = await db.collection('transactions').aggregate([
    { $match: forecastTransactionMatch(moduleName) },
    {
      $project: {
        dateKey: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$date',
            timezone: 'Asia/Manila',
          },
        },
        transactionId: { $ifNull: ['$transactionId', { $toString: '$_id' }] },
        productName: '$productName',
        quantity: { $ifNull: ['$quantity', 0] },
        revenue: { $ifNull: ['$netSales', 0] },
        discount: { $ifNull: ['$discount', 0] },
        grossProfit: { $ifNull: ['$grossProfit', 0] },
      },
    },
    {
      $group: {
        _id: {
          date: '$dateKey',
          transactionId: '$transactionId',
        },
        quantity: { $sum: '$quantity' },
        revenue: { $sum: '$revenue' },
        discountAmount: { $sum: '$discount' },
        grossProfit: { $sum: '$grossProfit' },
        lineItems: { $sum: 1 },
        uniqueItems: { $addToSet: '$productName' },
      },
    },
    {
      $addFields: {
        basketItems: { $size: '$uniqueItems' },
        hasPromotion: { $gt: ['$discountAmount', 0] },
      },
    },
    {
      $group: {
        _id: '$_id.date',
        revenue: { $sum: '$revenue' },
        quantity: { $sum: '$quantity' },
        grossProfit: { $sum: '$grossProfit' },
        orderCount: { $sum: 1 },
        lineItems: { $sum: '$lineItems' },
        basketItems: { $sum: '$basketItems' },
        discountAmount: { $sum: '$discountAmount' },
        promoTransactions: { $sum: { $cond: ['$hasPromotion', 1, 0] } },
      },
    },
    {
      $addFields: {
        avgBasketSize: {
          $cond: [
            { $gt: ['$orderCount', 0] },
            { $divide: ['$basketItems', '$orderCount'] },
            0,
          ],
        },
        avgOrderValue: {
          $cond: [
            { $gt: ['$orderCount', 0] },
            { $divide: ['$revenue', '$orderCount'] },
            0,
          ],
        },
        averageUnitPrice: {
          $cond: [
            { $gt: ['$quantity', 0] },
            { $divide: ['$revenue', '$quantity'] },
            0,
          ],
        },
      },
    },
    { $sort: { _id: 1 } },
  ], { allowDiskUse: true }).toArray();

  const dailyValues = rows.map((row) => {
    const quantity = Number(row.quantity) || 0;
    const orders = Number(row.orderCount) || 0;
    return {
      date: row._id,
      actual: moduleName === 'Services' ? orders : quantity,
      orders,
      revenue: round(row.revenue),
      grossProfit: round(row.grossProfit),
      lineItems: Number(row.lineItems) || 0,
      basketItems: Number(row.basketItems) || 0,
      discountAmount: round(row.discountAmount),
      promoTransactions: Number(row.promoTransactions) || 0,
      avgBasketSize: round(row.avgBasketSize),
      avgOrderValue: round(row.avgOrderValue),
      averageUnitPrice: round(row.averageUnitPrice),
    };
  });
  const historical = toNormalizedDailySeries(dailyValues, moduleName)
    .filter((point) => point.date < TODAY_KEY)
    .filter((point) => point.isObservedDemand);

  if (historical.length < 30) {
    throw new Error(`${moduleName} needs at least 30 observed history rows; received ${historical.length}`);
  }
  return historical;
}

async function getSegmentHistories(db, moduleName, aggregateHistorical) {
  const classifier = moduleName === 'Cafe' ? classifyCafeSegment : classifyServicesSegment;
  const lines = await db.collection('transactions').aggregate([
    { $match: forecastTransactionMatch(moduleName) },
    {
      $project: {
        dateKey: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$date',
            timezone: 'Asia/Manila',
          },
        },
        transactionId: { $ifNull: ['$transactionId', { $toString: '$_id' }] },
        productName: '$productName',
        category: '$category',
        quantity: { $ifNull: ['$quantity', 0] },
        revenue: { $ifNull: ['$netSales', 0] },
        discount: { $ifNull: ['$discount', 0] },
        grossProfit: { $ifNull: ['$grossProfit', 0] },
      },
    },
  ], { allowDiskUse: true }).toArray();

  const transactionMap = new Map();
  for (const line of lines) {
    const date = String(line.dateKey || '');
    if (!date || date >= TODAY_KEY) continue;
    const segment = classifier(line);
    const transactionId = String(line.transactionId || '');
    const key = `${segment}::${date}::${transactionId}`;
    const current = transactionMap.get(key) || {
      segment,
      date,
      quantity: 0,
      revenue: 0,
      discountAmount: 0,
      grossProfit: 0,
      lineItems: 0,
      items: new Set(),
    };
    current.quantity += Number(line.quantity) || 0;
    current.revenue += Number(line.revenue) || 0;
    current.discountAmount += Number(line.discount) || 0;
    current.grossProfit += Number(line.grossProfit) || 0;
    current.lineItems += 1;
    if (line.productName) current.items.add(String(line.productName));
    transactionMap.set(key, current);
  }

  const dailyBySegment = new Map();
  for (const transaction of transactionMap.values()) {
    if (!dailyBySegment.has(transaction.segment)) {
      dailyBySegment.set(transaction.segment, new Map());
    }
    const segmentMap = dailyBySegment.get(transaction.segment);
    const current = segmentMap.get(transaction.date) || {
      date: transaction.date,
      quantity: 0,
      revenue: 0,
      grossProfit: 0,
      orders: 0,
      lineItems: 0,
      basketItems: 0,
      discountAmount: 0,
      promoTransactions: 0,
    };
    current.quantity += transaction.quantity;
    current.revenue += transaction.revenue;
    current.grossProfit += transaction.grossProfit;
    current.orders += 1;
    current.lineItems += transaction.lineItems;
    current.basketItems += transaction.items.size || transaction.lineItems;
    current.discountAmount += transaction.discountAmount;
    if (transaction.discountAmount > 0) current.promoTransactions += 1;
    segmentMap.set(transaction.date, current);
  }

  const aggregateDates = aggregateHistorical.map((point) => point.date);
  return [...dailyBySegment.entries()]
    .map(([segment, byDate]) => {
      const dailyValues = aggregateDates.map((date) => {
        const value = byDate.get(date);
        const quantity = Number(value?.quantity) || 0;
        const orders = Number(value?.orders) || 0;
        const actual = moduleName === 'Services' ? orders : quantity;
        return {
          date,
          actual: round(actual),
          orders,
          revenue: round(value?.revenue),
          grossProfit: round(value?.grossProfit),
          lineItems: Number(value?.lineItems) || 0,
          basketItems: Number(value?.basketItems) || 0,
          discountAmount: round(value?.discountAmount),
          promoTransactions: Number(value?.promoTransactions) || 0,
          avgBasketSize: orders > 0 ? round((Number(value?.basketItems) || 0) / orders) : 0,
          avgOrderValue: orders > 0 ? round((Number(value?.revenue) || 0) / orders) : 0,
          averageUnitPrice: quantity > 0 ? round((Number(value?.revenue) || 0) / quantity) : 0,
        };
      });
      const history = toNormalizedDailySeries(dailyValues, moduleName).map((point) => ({
        ...point,
        isMissingDate: false,
        isClosedDay: false,
        isObservedDemand: true,
      }));
      const observedRows = history.filter((point) => Number(point.actual) > 0).length;
      const totalActual = history.reduce((sum, point) => sum + Number(point.actual || 0), 0);
      return { segment, history, observedRows, totalActual: round(totalActual) };
    })
    .filter((item) => item.totalActual > 0)
    .sort((left, right) => right.totalActual - left.totalActual);
}

async function buildExternalContext(db, dates) {
  const [weatherRows, holidayRows] = await Promise.all([
    db.collection('weather_cache').find({
      date: { $in: dates },
      lat: LAT,
      lng: LNG,
    }).toArray(),
    db.collection('holiday_cache').find({
      date: { $in: dates },
      location: 'PH',
    }).toArray(),
  ]);
  return {
    weatherByDate: new Map(weatherRows.map((row) => [row.date, row])),
    holidayDates: new Set(holidayRows.map((row) => row.date)),
  };
}

function buildExogenousRows(dates, historyByDate, context, defaults = {}) {
  return dates.map((date) => {
    const point = historyByDate.get(date);
    const weather = context.weatherByDate.get(date);
    const tempCelsius = round(weather?.tempCelsius ?? 28);
    const rainFlag = Number(weather?.rainfallMm || 0) > 0.5 ? 1 : 0;
    const humidity = round(weather?.relativeHumidity ?? 60);
    const raw = {
      date,
      tempCelsius,
      rainFlag,
      humidity,
      ...weatherTransforms(tempCelsius, rainFlag, humidity),
      isHoliday: context.holidayDates.has(date) ? 1 : 0,
      dayBeforeHoliday: context.holidayDates.has(addDays(date, 1)) ? 1 : 0,
      dayAfterHoliday: context.holidayDates.has(addDays(date, -1)) ? 1 : 0,
    };
    return modelFeatureColumns(raw, point, defaults);
  });
}

function runPython(scriptName, payload) {
  const scriptPath = path.join(__dirname, '..', 'src', 'analytics', 'python', scriptName);
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [scriptPath], {
      cwd: path.join(__dirname, '..', 'src', 'analytics', 'python'),
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
        reject(new Error(`${scriptName} exited with ${code}: ${stderr}`));
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
        reject(new Error(`Invalid ${scriptName} JSON: ${stdout.slice(0, 300)} ${error.message}`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function summarize(name, moduleName, result) {
  const backtestWape = result.backtest?.actual?.length
    ? evaluateWapeAccuracy(result.backtest.actual, result.backtest.predicted || [])
    : { wape: null, wapeAccuracy: null };
  return {
    name,
    module: moduleName,
    modelName: result.modelName,
    mase: result.mase,
    smape: result.smape,
    accuracy: result.accuracy,
    wape: backtestWape.wape,
    wapeAccuracy: backtestWape.wapeAccuracy,
    weeklyMase: result.weeklyMetrics?.mase ?? null,
    weeklyWape: result.weeklyMetrics?.wape ?? null,
    weeklyWapeAccuracy: result.weeklyMetrics?.accuracy ?? null,
    monthlyMase: result.monthlyMetrics?.mase ?? null,
    monthlyWape: result.monthlyMetrics?.wape ?? null,
    monthlyWapeAccuracy: result.monthlyMetrics?.accuracy ?? null,
    exogenousVariables: result.modelMetadata?.exogenousVariables ?? [],
    scaledExogenousVariables: result.modelMetadata?.scaledExogenousVariables ?? [],
    highMulticollinearityVariables: result.modelMetadata?.highMulticollinearityVariables ?? [],
    selected: {
      changepointPriorScale: result.modelMetadata?.changepointPriorScale,
      seasonalityMode: result.modelMetadata?.seasonalityMode,
      weeklyFourierOrder: result.modelMetadata?.weeklyFourierOrder,
      monthlyFourierOrder: result.modelMetadata?.monthlyFourierOrder,
      order: result.modelMetadata?.order,
      seasonalOrder: result.modelMetadata?.seasonalOrder,
    },
  };
}

async function runSegmentModel(moduleName, scriptName, segment, history, context, forecastDays) {
  const historyByDate = new Map(history.map((row) => [row.date, row]));
  const firstDate = history[0].date;
  const lastDate = history[history.length - 1].date;
  const futureDates = Array.from({ length: forecastDays }, (_, index) => addDays(lastDate, index + 1));
  const recent = history.filter((row) => Number(row.actual) > 0).slice(-14);
  const defaults = {
    avgBasketSize: recent.reduce((sum, row) => sum + Number(row.avgBasketSize || 0), 0) / Math.max(recent.length, 1),
    avgOrderValue: recent.reduce((sum, row) => sum + Number(row.avgOrderValue || 0), 0) / Math.max(recent.length, 1),
    averageUnitPrice: recent.reduce((sum, row) => sum + Number(row.averageUnitPrice || 0), 0) / Math.max(recent.length, 1),
    promoFlag: 0,
  };
  const exogenous = buildExogenousRows(history.map((row) => row.date), historyByDate, context, defaults);
  const exogenousForecast = buildExogenousRows(futureDates, historyByDate, context, defaults);
  const result = await runPython(scriptName, {
    data: history,
    forecastDays,
    splitRatio: '90-5-5',
    exogenous,
    exogenousForecast,
    includeBacktest: true,
    experimentConfig:
      moduleName === 'Cafe'
        ? {
            changepointCandidates: [0.3],
            seasonalityModes: ['multiplicative'],
            weeklyFourierOrders: [8],
            monthlyFourierOrders: [4],
          }
        : {
            gridSearchTimeoutSeconds: 4,
          },
  });
  return {
    segment,
    history,
    historyRows: history.length,
    observedRows: history.filter((point) => Number(point.actual) > 0).length,
    totalActual: round(history.reduce((sum, point) => sum + Number(point.actual || 0), 0)),
    ...summarize('segment', moduleName, result),
    forecast: result.forecast || [],
    backtest: result.backtest || null,
  };
}

async function compareSegmentedModule(db, moduleName, scriptName, aggregateHistorical) {
  const forecastDays = DEFAULT_FORECAST_DAYS;
  const firstDate = aggregateHistorical[0].date;
  const lastDate = aggregateHistorical[aggregateHistorical.length - 1].date;
  const allDates = [
    ...enumerateDates(firstDate, lastDate),
    ...Array.from({ length: forecastDays }, (_, index) => addDays(lastDate, index + 1)),
  ];
  const context = await buildExternalContext(db, allDates);
  const segmentHistories = await getSegmentHistories(db, moduleName, aggregateHistorical);
  const modeled = [];
  const skipped = [];

  for (const segmentInfo of segmentHistories) {
    if (segmentInfo.observedRows < MIN_SEGMENT_ROWS) {
      skipped.push({
        segment: segmentInfo.segment,
        observedRows: segmentInfo.observedRows,
        totalActual: segmentInfo.totalActual,
        reason: `below MIN_SEGMENT_ROWS=${MIN_SEGMENT_ROWS}`,
      });
      continue;
    }
    try {
      console.error(`[compare] ${moduleName}: segment ${segmentInfo.segment}`);
      modeled.push(
        await runSegmentModel(
          moduleName,
          scriptName,
          segmentInfo.segment,
          segmentInfo.history,
          context,
          forecastDays,
        ),
      );
    } catch (error) {
      skipped.push({
        segment: segmentInfo.segment,
        observedRows: segmentInfo.observedRows,
        totalActual: segmentInfo.totalActual,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const testDates = modeled.find((item) => item.backtest?.dates?.length)?.backtest.dates || [];
  const summedActual = testDates.map((date) =>
    modeled.reduce((sum, item) => {
      const index = item.backtest?.dates?.indexOf(date) ?? -1;
      return sum + (index >= 0 ? Number(item.backtest.actual[index] || 0) : 0);
    }, 0),
  );
  const summedPredicted = testDates.map((date) =>
    modeled.reduce((sum, item) => {
      const index = item.backtest?.dates?.indexOf(date) ?? -1;
      return sum + (index >= 0 ? Number(item.backtest.predicted[index] || 0) : 0);
    }, 0),
  );
  const trainActualByDate = new Map();
  for (const item of modeled) {
    const backtest = item.backtest;
    if (!backtest?.trainActual?.length) continue;
    const trainDates = item.history
      .slice(0, backtest.trainActual.length)
      .map((point) => point.date);
    trainDates.forEach((date, index) => {
      trainActualByDate.set(
        date,
        (trainActualByDate.get(date) || 0) + Number(backtest.trainActual[index] || 0),
      );
    });
  }
  const trainEntries = [...trainActualByDate.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const trainDates = trainEntries.map(([date]) => date);
  const trainActual = trainEntries.map(([, value]) => value);
  const forecastDates = Array.from({ length: forecastDays }, (_, index) => addDays(lastDate, index + 1));
  const summedForecast = forecastDates.map((date) => ({
    date,
    forecast: round(
      modeled.reduce((sum, item) => {
        const point = item.forecast.find((forecastPoint) => forecastPoint.date === date);
        return sum + Number(point?.forecast || 0);
      }, 0),
    ),
  }));

  return {
    module: moduleName,
    segmentation:
      moduleName === 'Cafe'
        ? ['Coffee', 'Non-caffeine drinks', 'Snacks/waffles/pasta', 'Rice meals', 'Pet bakery', 'Other Cafe']
        : ['Grooming', 'Pet Hotel / Boarding', 'Events', 'Other Services'],
    modeledSegments: modeled.map((item) => ({
      segment: item.segment,
      observedRows: item.observedRows,
      totalActual: item.totalActual,
      mase: item.mase,
      smape: item.smape,
      accuracy: item.accuracy,
      wape: item.wape,
      wapeAccuracy: item.wapeAccuracy,
      weeklyMase: item.weeklyMase,
      monthlyMase: item.monthlyMase,
      modelName: item.modelName,
    })),
    skippedSegments: skipped,
    summedBacktestMetrics: evaluateForecastMetrics(summedActual, summedPredicted, trainActual),
    summedWeeklyMetrics: evaluateResampledForecastMetrics(
      testDates,
      summedActual,
      summedPredicted,
      trainDates,
      trainActual,
      'week',
    ),
    summedMonthlyMetrics: evaluateResampledForecastMetrics(
      testDates,
      summedActual,
      summedPredicted,
      trainDates,
      trainActual,
      'month',
    ),
    summedBacktestDays: testDates.length,
    summedForecastPreview: summedForecast.slice(0, 7),
  };
}

async function compareModule(db, moduleName, scriptName) {
  const historical = await getForecastHistory(db, moduleName);
  const historyByDate = new Map(historical.map((row) => [row.date, row]));
  const forecastDays = DEFAULT_FORECAST_DAYS;
  const firstDate = historical[0].date;
  const lastDate = historical[historical.length - 1].date;
  const allDates = [
    ...enumerateDates(firstDate, lastDate),
    ...Array.from({ length: forecastDays }, (_, index) => addDays(lastDate, index + 1)),
  ];
  const context = await buildExternalContext(db, allDates);
  const historyDates = historical.map((row) => row.date);
  const futureDates = Array.from({ length: forecastDays }, (_, index) => addDays(lastDate, index + 1));
  const recent = historical.filter((row) => !row.isMissingDate).slice(-14);
  const defaults = {
    avgBasketSize: recent.reduce((sum, row) => sum + Number(row.avgBasketSize || 0), 0) / Math.max(recent.length, 1),
    avgOrderValue: recent.reduce((sum, row) => sum + Number(row.avgOrderValue || 0), 0) / Math.max(recent.length, 1),
    averageUnitPrice: recent.reduce((sum, row) => sum + Number(row.averageUnitPrice || 0), 0) / Math.max(recent.length, 1),
    promoFlag: 0,
  };
  const exogenous = buildExogenousRows(historyDates, historyByDate, context, defaults);
  const exogenousForecast = buildExogenousRows(futureDates, historyByDate, context, defaults);
  const basePayload = {
    data: historical,
    forecastDays,
    splitRatio: '90-5-5',
    exogenous,
    exogenousForecast,
    includeBacktest: true,
    experimentConfig:
      moduleName === 'Cafe'
        ? {
            changepointCandidates: [0.3],
            seasonalityModes: ['multiplicative'],
            weeklyFourierOrders: [8],
            monthlyFourierOrders: [4],
          }
        : undefined,
  };

  console.error(`[compare] ${moduleName}: aggregate transformed-weather run`);
  const transformed = await runPython(scriptName, basePayload);
  const outputs = [summarize('transformed-weather-default', moduleName, transformed)];

  const shouldRunRawReference =
    moduleName === 'Services' || process.env.RUN_RAW_REFERENCE === '1';

  if (shouldRunRawReference) {
    console.error(`[compare] ${moduleName}: aggregate raw-weather reference run`);
    const rawFull = await runPython(scriptName, {
      ...basePayload,
      experimentConfig: {
        ...(basePayload.experimentConfig || {}),
        exogColumns: [
          'tempCelsius',
          'rainFlag',
          'humidity',
          'isHoliday',
          'dayBeforeHoliday',
          'dayAfterHoliday',
          'isWeekend',
        ],
      },
    });
    outputs.push(summarize('raw-weather-reference', moduleName, rawFull));
  }

  return {
    module: moduleName,
    historyRows: historical.length,
    historyStart: firstDate,
    historyEnd: lastDate,
    outputs,
    segmented: await compareSegmentedModule(db, moduleName, scriptName, historical),
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for direct comparison.');
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const results = [];
  try {
    const db = client.db(DB_NAME);
    for (const [moduleName, scriptName] of [
      ['Cafe', 'cafe_prophet.py'],
      ['Services', 'services_sarima.py'],
    ]) {
      try {
        results.push(await compareModule(db, moduleName, scriptName));
      } catch (error) {
        results.push({
          module: moduleName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await client.close();
  }
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    database: DB_NAME,
    todayKey: TODAY_KEY,
    note: 'Direct MongoDB/Python comparison only; no forecast_runs writes, no S3 archive, no Nest server started.',
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
