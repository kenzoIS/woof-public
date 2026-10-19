import { getBackendConnection } from "./backendConnection";
const { apiUrl: API_BASE, uploadApiUrl: DIRECT_UPLOAD_API_BASE } = getBackendConnection();
const API_CACHE_TTL_MS = 10 * 60 * 1000;

type ApiCacheEntry = {
  expiresAt: number;
  data: unknown;
};

const apiCache = new Map<string, ApiCacheEntry>();
const apiInFlight = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

function cloneCachedValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function clearApiCache() {
  cacheGeneration++;
  apiCache.clear();
  apiInFlight.clear();
}

function getRequestMethod(options?: RequestInit) {
  return (options?.method || 'GET').toUpperCase();
}

function shouldCacheRequest(path: string, options?: RequestInit) {
  if (path.startsWith('/analytics/home')) {
    return false;
  }
  return path.startsWith('/analytics/') && !/feedback|prescription|notification|alert/i.test(path) && getRequestMethod(options) === 'GET' && !path.includes('forceRefresh=true');
}

async function request(
  path: string,
  options?: RequestInit,
  unavailableMessage = 'Backend unavailable. Start the backend server on port 3001 and try again.',
) {
  try {
    if (typeof window !== 'undefined' && sessionStorage.getItem('woofSessionEnded') === 'true' && !path.startsWith('/auth/')) {
      throw new Error('Session ended. Please sign in again.');
    }
    const fetchOptions = {
      ...options,
      cache: 'no-store' as RequestCache,
      credentials: 'include' as RequestCredentials,
    };
    return await fetch(`${API_BASE}${path}`, fetchOptions);
  } catch (error) {
    throw new Error(
      error instanceof TypeError
        ? unavailableMessage
        : error instanceof Error
          ? error.message
          : unavailableMessage,
    );
  }
}

async function apiError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = await response.json().catch(() => null);
  const message = Array.isArray(body?.message)
    ? body.message.join(', ')
    : body?.message;
  if (message) {
    return new Error(message);
  }
  if (response.status === 413) {
    return new Error('Upload too large. Maximum supported file size is 100 MB.');
  }
  if (response.status >= 500) {
    return new Error(
      'Backend unavailable. Check that MongoDB is configured and the backend is running on port 3001.',
    );
  }
  return new Error(message || fallback);
}

export interface ForecastPoint {
  date: string;
  forecast: number;
  confidenceLow?: number;
  confidenceHigh?: number;
  forecastQuantity?: number;
  projectedNetSales?: number;
  projectedConfidenceLow?: number;
  projectedConfidenceHigh?: number;
  unitPrice?: number;
  projectedGrossProfit?: number;
}

export interface ForecastRun {
  _id: string;
  module: 'Cafe' | 'Services';
  modelName: string;
  mase: number | null;
  smape: number | null;
  accuracy?: number | null;
  mae?: number | null;
  rmse?: number | null;
  mape?: number | null;
  r2?: number | null;
  biasMeanError?: number | null;
  forecastSkillPercent?: number | null;
  mpe?: number;
  weeklyMetrics?: {
    mase: number | null;
    smape: number | null;
    biasMeanError?: number;
    forecastSkillPercent?: number;
    mae?: number | null;
    rmse?: number | null;
    mape?: number | null;
    r2?: number;
  } | null;
  monthlyMetrics?: {
    mase: number | null;
    smape: number | null;
    biasMeanError?: number;
    forecastSkillPercent?: number;
    mae?: number | null;
    rmse?: number | null;
    mape?: number | null;
    r2?: number;
  } | null;
  weekly_metrics?: {
    mase: number | null;
    smape: number | null;
    biasMeanError?: number;
    forecastSkillPercent?: number;
    mae?: number | null;
    rmse?: number | null;
    mape?: number | null;
    r2?: number;
  } | null;
  monthly_metrics?: {
    mase: number | null;
    smape: number | null;
    biasMeanError?: number;
    forecastSkillPercent?: number;
    mae?: number | null;
    rmse?: number | null;
    mape?: number | null;
    r2?: number;
  } | null;
  isFallback: boolean;
  rejectionReason?: string;
  historical: Array<{
    date: string;
    actual: number;
    normalized: number;
    orders: number;
    revenue?: number;
    fitted?: number;
    grossProfit?: number;
    isClosedDay?: boolean;
    isObservedDemand?: boolean;
  }>;
  forecast: ForecastPoint[];
  volumeForecast?: ForecastPoint[];
  revenueForecast?: ForecastPoint[];
  kpis: {
    totalRevenue: number;
    totalOrders: number;
    totalQuantity: number;
    totalItems: number;
    avgOrderValue: number;
  };
  topItems: Array<{
    name: string;
    revenue: number;
    quantity: number;
    orderCount: number;
    avgPrice: number;
    category: string;
  }>;
  itemHistory?: Array<{
    date: string;
    name: string;
    revenue: number;
    quantity: number;
    orderCount: number;
    avgPrice: number;
    category: string;
  }>;
  modelMetadata: Record<string, unknown>;
  generatedAt: string;
}

export interface DataRange {
  serverNow: string;
  timezone: string;
  historyStartDate: string | null;
  historyEndDate: string | null;
  sectors: Record<string, {
    minDate: string | null;
    maxDate: string | null;
    rows: number;
  }>;
}

export interface ChannelStatus {
  serverNow: string;
  channels: Array<{
    channel: string;
    label: string;
    connected: boolean;
    status: 'active' | 'pending';
    connectionMode: string;
    rowCount: number;
    uploadCount: number;
    latestTransactionAt: string | null;
    latestUploadAt: string | null;
  }>;
}

export interface CrossSellQuery {
  minSupport?: string;
  minConfidence?: string;
  minLift?: string;
  maxBundleCandidates?: string;
  hour?: string;
  sector?: 'all' | 'cafe' | 'retail' | 'services';
  forceRefresh?: string;
  dateStart?: string;
  dateEnd?: string;
}

export interface PricingCatalogQuery {
  sector?: 'all' | 'cafe' | 'retail' | 'services';
  dateStart?: string;
  dateEnd?: string;
}

export interface TrafficOptimizerQuery {
  hour?: string;
  dateStart?: string;
  dateEnd?: string;
  referenceDate?: string;
  scenarioMultiplier?: string;
  scenarioDayOfWeekIndex?: string;
  scenarioLabel?: string;
}

export interface TodayTrafficContext {
  date: string;
  dayOfWeek: string;
  dayOfWeekIndex: number;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  holidayType: string | null;
  weather: {
    condition: string;
    tempCelsius: number;
    rainfallMm: number;
    relativeHumidity: number;
    isSynthetic: boolean;
    source: 'api' | 'cache' | 'synthetic' | 'unavailable' | 'unknown';
    fetchedAt?: string;
  };
  targetHour: number;
  historicalBaseline: number;
  predictedTraffic: number;
  contextAdjustedPrediction: number;
  factors: Array<{
    factor?: string;
    name: string;
    value?: any;
    effect?: number;
    impactPercent: number;
    direction: 'positive' | 'negative' | 'neutral';
    source?: 'historically_estimated' | 'business_rule';
    description: string;
  }>;
  sectorBreakdown: Array<{
    sector: 'Services' | 'Cafe' | 'Retail';
    baselineVisits: number;
    contextAdjustedVisits: number;
    demandLevel: 'Low' | 'Medium' | 'High';
    scheduledStaff: number;
    recommendedStaff: number;
    staffDelta: number;
    action: string;
    hourlyWageCost: number;
    capacityStatus: string;
  }>;
  recommendation: {
    headline: string;
    urgency: 'low' | 'medium' | 'high';
    operationalDirectives: string[];
    peakCongestionWindow: string;
    recommendedShiftAdjustments: string[];
    costEfficiencyNote: string;
  };
  reasoning: string[];
  hourlyForecast: Array<{
    hour: number;
    label: string;
    predictedVisits: number;
    demandLevel: 'Low' | 'Medium' | 'High';
    scheduledStaff: number;
    recommendedStaff: number;
    action: string;
    totalCapacity?: number;
    capacityUtilizationPercent?: number;
    sectorVisits?: Record<
      string,
      {
        visits: number;
        baselineVisits: number;
        demandLevel: 'Low' | 'Medium' | 'High';
        capacity?: number;
        utilizationPercent?: number;
        subSectors?: Array<{
          name: string;
          visits: number;
          demandLevel: 'Low' | 'Medium' | 'High';
          capacity?: number;
          utilizationPercent?: number;
        }>;
      }
    >;
  }>;
  modelDiagnostics: {
    modelName: string;
    historicalSampleDays: number;
    historicalObservationsCount?: number;
    historicalDateRange?: string;
    weatherCacheCoverage?: string;
    baselineMaeVsActual: number;
    contextAwareMae?: number;
    exogenousImpactSummary?: string;
    dataLeakageGuards: string;
    timezone: string;
  };
}

export interface TrafficOptimizerResponse {
  source: 'transaction_history';
  visitDefinition: string;
  displayMode: 'daily' | 'weekday_average';
  requestedHour?: number | null;
  hour: number | null;
  fallbackFromEmptyHour?: boolean;
  hourlyTotals?: Array<{
    hour: number;
    label: string;
    visits: number;
  }>;
  dateStart: string | null;
  dateEnd: string | null;
  totalVisits: number;
  columns: Array<{
    key: string;
    label: string;
    dayLabel: string;
    date?: string;
    sampleDays?: number;
  }>;
  sectors: Array<{
    sector: 'Services' | 'Cafe' | 'Retail';
    totalVisits: number;
    peakVisits: number;
    averageVisits: number;
    values: Array<{
      key: string;
      visits: number;
      date?: string;
      sampleDays?: number;
    }>;
    subSectors?: Array<{
      sector: string;
      totalVisits: number;
      peakVisits: number;
      averageVisits: number;
      values: Array<{
        key: string;
        visits: number;
        date?: string;
        sampleDays?: number;
      }>;
    }>;
  }>;
  todayContext?: TodayTrafficContext;
}

export interface AlertThresholds {
  capacityWarning: number;
  lowInventory: number;
  forecastAccuracyWarning: number;
  dataStalenessDays: number;
}

export interface DataRetentionSettings {
  retentionDays: number;
  protectedHistoricalSales: true;
  scope: string[];
}

export interface ExogenousStatus {
  weatherCache: {
    count: number;
    latestFetchedAt: string | null;
    lastSource: 'api' | 'cache' | 'synthetic' | 'unknown';
  };
  holidayCache: {
    count: number;
    latestFetchedAt: string | null;
    lastSource: 'api' | 'cache' | 'hardcoded' | 'unknown';
  };
  providers?: {
    weather?: {
      providerName: string;
      providerKind: 'weather';
      requiresApiKey: boolean;
      apiKeyStatus: 'not_required';
      targetLocation: string;
      countryCode: string;
      coordinates: { lat: number; lng: number };
      fallbackSource: 'synthetic';
    };
    holidays?: {
      providerName: string;
      providerKind: 'holiday_calendar';
      requiresApiKey: boolean;
      apiKeyStatus: 'configured' | 'missing';
      targetCountry: { name: string; code: string };
      fallbackSource: 'hardcoded';
    };
  };
  lastServicesForecast: {
    modelName: string | null;
    modelType: string;
    exogenousVariables: string[];
    weatherDataSource: string;
    holidayDataSource: string;
    generatedAt: string;
  } | null;
}

async function fetchApi<T = any>(path: string, options?: RequestInit): Promise<T> {
  if (typeof window !== 'undefined' && sessionStorage.getItem('woofSessionEnded') === 'true' && !path.startsWith('/auth/')) throw new Error('Session ended. Please sign in again.');
  const generation = cacheGeneration;
  const canUseCache = shouldCacheRequest(path, options);
  const cacheKey = `${API_BASE}${path}`;

  if (canUseCache) {
    const cached = apiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cloneCachedValue(cached.data) as T;
    }

    const inFlight = apiInFlight.get(cacheKey);
    if (inFlight) {
      return cloneCachedValue(await inFlight) as T;
    }
  }

  const promise = (async () => {
    const res = await request(path, {
      ...options,
      headers: {
        ...options?.headers,
      },
    });
    if (!res.ok) {
      throw await apiError(res, res.statusText || 'API request failed');
    }
    return res.json();
  })();

  if (!canUseCache) {
    const data = await promise;
    clearApiCache();
    return data as T;
  }

  apiInFlight.set(cacheKey, promise);
  try {
    const data = await promise;
    if (typeof window !== 'undefined' && sessionStorage.getItem('woofSessionEnded') === 'true') throw new Error('Session ended. Please sign in again.');
    if (generation === cacheGeneration) apiCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + API_CACHE_TTL_MS,
    });
    return cloneCachedValue(data) as T;
  } finally {
    apiInFlight.delete(cacheKey);
  }
}

function toQueryString(params?: object) {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

// CSV Upload APIs
export async function uploadCSV(file: File, channel?: string) {
  const formData = new FormData();
  formData.append('file', file);
  if (channel) {
    formData.append('channel', channel);
  }
  const res = await fetch(`${DIRECT_UPLOAD_API_BASE}/csv/upload`, {
    method: 'POST',
    body: formData,
  }).catch((error) => {
    throw new Error(
      error instanceof Error
        ? `Upload request was interrupted: ${error.message}`
        : 'Upload request was interrupted before the backend responded.',
    );
  });
  if (!res.ok) {
    throw await apiError(res, res.statusText || 'Upload failed');
  }
  clearApiCache();
  return res.json();
}

export async function uploadHistoricalCSV(
  file: File,
  module: 'cafe' | 'services',
) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${DIRECT_UPLOAD_API_BASE}/csv/historical/${module}`, {
    method: 'POST',
    body: formData,
  }).catch((error) => {
    throw new Error(
      error instanceof Error
        ? `Historical upload request was interrupted: ${error.message}`
        : 'Historical upload request was interrupted before the backend responded.',
    );
  });
  if (!res.ok) {
    throw await apiError(res, res.statusText || 'Historical upload failed');
  }
  clearApiCache();
  return res.json();
}

export async function getUploads() {
  return fetchApi('/csv/uploads');
}

export async function deleteUpload(id: string) {
  return fetchApi(`/csv/uploads/${id}`, { method: 'DELETE' });
}

export async function getMetrics() {
  return fetchApi('/csv/metrics');
}

export async function getAlertThresholds(): Promise<AlertThresholds> {
  return fetchApi('/settings/alert-thresholds');
}

export async function getAuditLogs(params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return fetchApi('/audit/logs');
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      sp.append(k, String(v));
    }
  }
  const query = sp.toString() ? `?${sp.toString()}` : '';
  return fetchApi(`/audit/logs${query}`);
}

export async function getAuditSummary() {
  return fetchApi('/audit/summary');
}

export interface LoginResponse {
  email: string;
  expiresAt: string;
  mfaRequired: boolean;
  requiresTwoFactor?: false;
}

export interface TwoFactorRequiredResponse {
  requiresTwoFactor: true;
  email: string;
}

export async function loginDashboard(
  email: string,
  password: string,
  twoFactorCode?: string,
): Promise<LoginResponse | TwoFactorRequiredResponse> {
  return fetchApi('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, twoFactorCode }),
  });
}

export async function requestPasswordReset(email: string): Promise<{
  success: boolean;
}> {
  return fetchApi('/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
}

export async function cancelPasswordRecovery() {
  return fetchApi('/auth/cancel-password-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

export async function verifyResetOtp(email: string, otp: string): Promise<{ success: boolean }> {
  return fetchApi('/auth/verify-reset-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp }) });
}

export async function resetDashboardPassword(password: string): Promise<{ success: boolean }> {
  return fetchApi('/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
}

export async function changeDashboardPassword(input: {
  newPassword: string;
  currentPassword: string;
}): Promise<{ success: boolean }> {
  return fetchApi('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getTwoFactorStatus(): Promise<{
  enabled: boolean;
  configured: boolean;
  factorId?: string;
}> {
  return fetchApi('/auth/2fa/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export interface LoginActivityEntry {
  id: string;
  action: 'login' | 'logout' | 'session_timeout';
  email: string;
  timestamp: string;
}

export async function recordLoginActivity(
  action: 'logout' | 'session_timeout',
  email?: string,
): Promise<{ success: boolean }> {
  return logoutDashboard(action);
}

export async function getLoginActivity(
  email: string,
): Promise<LoginActivityEntry[]> {
  return fetchApi('/auth/activity/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function logoutDashboard(reason: 'logout' | 'session_timeout' = 'logout'): Promise<{ success: boolean }> {
  return fetchApi('/auth/logout', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
}

export async function touchDashboardSession(timeoutMinutes: number): Promise<{ success: boolean }> {
  return fetchApi('/auth/session/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeoutMinutes }) });
}

export async function saveAlertThresholds(
  thresholds: Partial<AlertThresholds>,
): Promise<AlertThresholds> {
  return fetchApi('/settings/alert-thresholds', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(thresholds),
  });
}

export async function evaluateAlertThresholds(metrics: Partial<{
  capacityUsage: number;
  lowInventoryPercent: number;
  forecastAccuracy: number;
  dataAgeDays: number;
}>) {
  return fetchApi('/settings/alert-thresholds/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics),
  });
}

export async function getDataRetentionSettings(): Promise<DataRetentionSettings> {
  return fetchApi('/settings/data-retention');
}

export async function saveDataRetentionSettings(
  retentionDays: number,
): Promise<DataRetentionSettings> {
  return fetchApi('/settings/data-retention', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retentionDays }),
  });
}

export async function applyDataRetention(retentionDays: number) {
  return fetchApi('/settings/data-retention/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retentionDays }),
  });
}

export async function downloadSettingsDataExport(options?: {
  format?: 'json' | 'csv';
  exportAll?: boolean;
  datasets?: string[];
}): Promise<{
  blob: Blob;
  filename: string;
}> {
  const query = new URLSearchParams();
  if (options?.format) query.set('format', options.format);
  if (options?.exportAll === false) query.set('all', 'false');
  if (options?.datasets?.length) query.set('datasets', options.datasets.join(','));

  const res = await request(`/settings/export${query.toString() ? `?${query.toString()}` : ''}`);
  if (!res.ok) {
    throw await apiError(res, res.statusText || 'Data export failed');
  }

  const disposition = res.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
  const fallbackExtension = options?.format === 'csv' ? 'csv' : 'json';
  const fallbackScope =
    options?.format === 'csv' && options.datasets?.length === 1
      ? options.datasets[0]
      : 'Data_Export';
  return {
    blob: await res.blob(),
    filename:
      filenameMatch?.[1] ||
      `WOOF_${fallbackScope}_${new Date().toISOString().slice(0, 10)}.${fallbackExtension}`,
  };
}

// Analytics APIs
export async function getDashboard(sector: string) {
  return fetchApi(`/analytics/dashboard/${sector}`);
}

export async function getRootCauseAnalysis(
  period: string,
  sector: string,
  forceRefresh = false,
  dateStart?: string,
  dateEnd?: string,
) {
  const query = toQueryString({ period, sector, dateStart, dateEnd, ...(forceRefresh ? { forceRefresh: 'true' } : {}) });
  return fetchApi(`/analytics/root-cause${query}`);
}

export async function getHomeOverview(range?: string) {
  const query = range
    ? `?range=${encodeURIComponent(range)}&forceRefresh=true&_t=${Date.now()}`
    : `?forceRefresh=true&_t=${Date.now()}`;
  return fetchApi(`/analytics/home${query}`);
}

export async function getForecast(
  sector: string,
  params?: Record<string, string>,
): Promise<ForecastRun> {
  const query = toQueryString(params);
  return fetchApi(`/analytics/forecast/${sector}${query}`);
}

export async function getDataRange(): Promise<DataRange> {
  return fetchApi('/analytics/data-range');
}

export async function getChannelStatus(): Promise<ChannelStatus> {
  return fetchApi('/analytics/channel-status');
}

export async function getCrossSell(params?: CrossSellQuery) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/cross-sell${query}`);
}

export async function getStrategicProximity(params?: { forceRefresh?: string; dateStart?: string; dateEnd?: string }) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/cross-sell/strategic-proximity${query}`);
}

export async function getSeasonalCrossSellBundles(params?: CrossSellQuery) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/cross-sell/seasonal-bundles${query}`);
}

export async function getPricingCatalog(params?: PricingCatalogQuery) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/pricing-catalog${query}`);
}

export async function getTrafficOptimizer(params?: TrafficOptimizerQuery): Promise<TrafficOptimizerResponse> {
  const query = toQueryString(params);
  return fetchApi(`/analytics/traffic-optimizer${query}`);
}

export async function getQueueRecommendation(params: { arrivalRate: number; serviceTime: number; targetWait?: number }) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/queue/recommend${query}`);
}

export async function getCrossSellConfig(params?: CrossSellQuery) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/cross-sell/config${query}`);
}

export async function getCrossSellBySector(params?: CrossSellQuery) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/cross-sell/by-sector${query}`);
}

export async function getCrossSellBundles(params?: CrossSellQuery) {
  const query = toQueryString(params);
  return fetchApi(`/analytics/cross-sell/bundles${query}`);
}

export async function savePrescriptionDraft(dto: Record<string, unknown>) {
  return fetchApi('/analytics/prescriptions/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function createCampaignDraft(dto: {
  sourceType?: 'bundle_recommendation';
  bundleItems?: string[];
  itemASector?: string | null;
  itemBSector?: string | null;
  status?: 'pending';
  bundleName: string;
  itemA: string;
  itemB: string;
  regularPrice: number | null;
  proposedBundlePrice: number | null;
  regularCost?: number | null;
  suggestedDiscountPercent?: number | null;
  selectedDiscountPercent?: number;
  proposedDiscountPercent: number;
  projectedGrossProfit?: number | null;
  projectedMarginPercent?: number | null;
  minimumMarginPercent?: number | null;
  maxSafeDiscountPercent?: number | null;
  support?: number;
  confidence: number;
  lift: number;
}) {
  return fetchApi('/analytics/cross-sell/campaign-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export interface BundleArchiveItem {
  name: string;
  sector?: string | null;
  price?: number | null;
  cost?: number | null;
}

export interface BundleArchive {
  id: string;
  bundleName: string;
  source: 'manual' | 'generated';
  status: 'active' | 'archived' | 'deleted';
  items: BundleArchiveItem[];
  bundlePrice?: number | null;
  regularPrice?: number | null;
  savings?: number | null;
  discountPercent?: number | null;
  availableMonth?: string | null;
  availabilityStartDate?: string | null;
  availabilityEndDate?: string | null;
  promoMechanic?: string | null;
  notes?: string | null;
  support?: number | null;
  confidence?: number | null;
  lift?: number | null;
  projectedGrossProfit?: number | null;
  projectedMarginPercent?: number | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  deletedAt?: string | null;
  metadata?: Record<string, unknown>;
}

export async function getBundleArchives(params?: {
  status?: string;
  source?: string;
  search?: string;
}): Promise<{
  bundles: BundleArchive[];
  total: number;
  counts: Record<string, number>;
}> {
  const query = toQueryString(params);
  return fetchApi(`/analytics/bundles${query}`);
}

export async function createBundleArchive(dto: {
  bundleName: string;
  source: 'manual' | 'generated';
  status?: 'active' | 'archived' | 'deleted';
  items: BundleArchiveItem[];
  bundlePrice?: number | null;
  regularPrice?: number | null;
  savings?: number | null;
  discountPercent?: number | null;
  availableMonth?: string | null;
  availabilityStartDate?: string | null;
  availabilityEndDate?: string | null;
  promoMechanic?: string | null;
  notes?: string | null;
  support?: number | null;
  confidence?: number | null;
  lift?: number | null;
  projectedGrossProfit?: number | null;
  projectedMarginPercent?: number | null;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<BundleArchive> {
  return fetchApi('/analytics/bundles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function updateBundleArchiveStatus(
  id: string,
  status: 'active' | 'archived' | 'deleted',
): Promise<BundleArchive> {
  return fetchApi(`/analytics/bundles/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function deployPrescription(dto: {
  category: 'bundle' | 'happy_hour' | 'pethub_campaign' | 'staffing' | 'traffic' | 'forecast' | 'general';
  sourceType?: string;
  sourceId?: string;
  title: string;
  description?: string | null;
  sector?: string;
  targetTime?: string;
  mechanic?: string | null;
  discount?: string | null;
  confidence?: string | number | null;
  acceptedBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ prescription: FeedbackPromotion; source: unknown }> {
  return fetchApi('/analytics/prescriptions/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function getRetailForecastByChannel() {
  return fetchApi('/analytics/forecast-by-channel/retail');
}

export async function getCurrentWeather() {
  return fetchApi('/analytics/weather/current');
}

export async function getWeatherImpact(sector = 'cafe', days = 30) {
  return fetchApi(`/analytics/weather/impact?sector=${encodeURIComponent(sector)}&days=${encodeURIComponent(String(days))}`);
}

export interface BundlePlanningDay {
  date: string;
  tempCelsius: number;
  rainfallMm: number;
  humidity: number;
  rainFlag: boolean;
  condition: string;
  weatherRating: string;
  isSynthetic: boolean;
  isWeekend: boolean;
  holidayName: string | null;
}

export interface BundlePlanningContext {
  startDate: string;
  endDate: string;
  days: BundlePlanningDay[];
  weatherSource: string;
  calendarSource: string;
}

export async function getBundlePlanningContext(startDate: string, endDate?: string): Promise<BundlePlanningContext> {
  const params = new URLSearchParams({ startDate, endDate: endDate || startDate });
  return fetchApi(`/analytics/bundle-planning-context?${params.toString()}`);
}

export async function getExogenousStatus(): Promise<ExogenousStatus> {
  return fetchApi('/analytics/exogenous/status');
}

export async function getCafeCoAttachment(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const qs = params.toString();
  return fetchApi(`/analytics/cafe/co-attachment${qs ? `?${qs}` : ''}`);
}

export async function getActivationRecommendations() {
  return fetchApi('/activation/recommendations');
}

export async function getActivationCampaigns() {
  return fetchApi('/activation/campaigns');
}

export async function generateActivationCampaign(recommendation: unknown) {
  return fetchApi('/activation/campaigns/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recommendation }),
  });
}

export async function updateActivationCampaignStatus(
  campaignId: string,
  status: 'draft' | 'approved' | 'queued' | 'published',
) {
  return fetchApi(`/activation/campaigns/${encodeURIComponent(campaignId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
}

export async function publishActivationCampaign(campaignId: string) {
  return fetchApi(`/activation/campaigns/${encodeURIComponent(campaignId)}/publish`, {
    method: 'POST',
  });
}

export async function askWoofChatbot(
  question: string,
  history: Array<{ sender: 'user' | 'woof'; text: string }> = [],
) {
  return fetchApi('/chatbot/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, history }),
  });
}

export async function generateLlmExplanation(input: {
  feature:
    | 'descriptive_explanation'
    | 'predictive_explanation'
    | 'prescriptive_explanation'
    | 'manual_bundle_explanation'
    | 'business_assistant'
    | 'forecast_explanation'
    | 'recommendation_explanation'
    | 'report_summary';
  prompt: string;
  context?: Record<string, unknown>;
}) {
  return fetchApi('/llm/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface SmartReport {
  _id: string;
  title: string;
  dateRange: { start: string; end: string };
  sectors: string[];
  aggregatedData: {
    totalRevenue: number;
    totalGrossProfit: number;
    averageMargin: number;
    channelRevenue: Record<string, number>;
    categorySales: Record<string, number>;
    dailyHistory?: { date: string; value: number }[];
  };
  extrapolatedTrends: {
    horizonDays: number;
    dates: string[];
    projectedRevenue: number[];
    projectedGrowthRate: number;
    trendDirection: 'UPWARD' | 'DOWNWARD' | 'STABLE';
  };
  dataCompleteness: number;
  uatFeedback: {
    accuracyRating: number | null;
    usefulnessRating: number | null;
    ownerApproved: boolean;
    feedbackText: string | null;
    reviewedAt: string | null;
  };
  nlgSummary: string;
  nlgSections?: { title: string; content: string }[] | null;
  isPartialData?: boolean;
  generatedAt: string;
}

export async function generateSmartReport(dto: {
  title: string;
  startDate: string;
  endDate: string;
  sectors: string[];
}): Promise<SmartReport> {
  return fetchApi('/smart-reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function getSmartReports(): Promise<SmartReport[]> {
  return fetchApi('/smart-reports');
}

export async function getSmartReportById(id: string): Promise<SmartReport> {
  return fetchApi(`/smart-reports/${id}`);
}

export async function deleteSmartReport(id: string): Promise<{ success: boolean }> {
  return fetchApi(`/smart-reports/${id}`, { method: 'DELETE' });
}

export async function submitSmartReportFeedback(
  id: string,
  dto: {
    accuracyRating: number;
    usefulnessRating: number;
    ownerApproved: boolean;
    feedbackText?: string;
  }
): Promise<SmartReport> {
  return fetchApi(`/smart-reports/${id}/feedback`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function getNextQuietPeriod(): Promise<any> {
  return fetchApi('/analytics/promos/quiet-periods');
}

export async function getPastHappyHours(): Promise<any[]> {
  return fetchApi('/analytics/promos/history');
}

export async function activateHappyHour(dto: {
  items: Array<{ itemKey: string; discountPercent: number; probabilityScore?: number }>;
  targetDate: string;
  targetHour: number;
  probabilityScore?: number;
}): Promise<any> {
  return fetchApi('/analytics/promos/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

// ----------------------------------------------------------------
// Recommendation Feedback Loop & Model Recalibration API Client
// ----------------------------------------------------------------

export interface FeedbackPromotion {
  id: string;
  sourceId?: string;
  sourceType?: 'recommendation_feedback' | 'bundle_archive' | 'dynamic_promo' | 'activation_campaign' | string;
  type: 'bundle' | 'discount' | 'happy-hour' | 'flash-sale' | 'forecast';
  title: string;
  deployedDate: string;
  targetTime: string;
  discount: string | null;
  confidence: string;
  sector: string;
  status: 'active' | 'completed' | 'failed';
  feedback: 'helpful' | 'not-helpful' | null;
  feedbackNotes?: string | null;
  pethubLinked?: boolean;
  pethubStatus?: string | null;
}

export interface FeedbackSummary {
  totalDeployed: number;
  activeCount: number;
  completedCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  pendingCount: number;
  avgAccuracy: number;
  positiveRatio: number;
  recalibrationsTriggered: number;
  aiInsight: {
    title: string;
    summary: string;
    lastRecalibration: string;
  };
}

export async function getFeedbackPromotions(params?: {
  status?: string;
  type?: string;
}): Promise<FeedbackPromotion[]> {
  const query = new URLSearchParams();
  if (params?.status && params.status !== 'all') query.set('status', params.status);
  if (params?.type && params.type !== 'all') query.set('type', params.type);

  const queryString = query.toString();
  return fetchApi(`/analytics/feedback/promotions${queryString ? `?${queryString}` : ''}`);
}

export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  return fetchApi('/analytics/feedback/summary');
}

export async function submitFeedbackRating(dto: {
  id: string;
  feedback: 'helpful' | 'not-helpful';
  notes?: string;
  endPromotion?: boolean;
}): Promise<{
  promotion: FeedbackPromotion;
  recalibrated: boolean;
  recalibration?: any;
}> {
  return fetchApi('/analytics/feedback/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function endFeedbackPromotion(dto: {
  id: string;
  feedback?: 'helpful' | 'not-helpful';
  notes?: string;
}): Promise<{
  promotion: FeedbackPromotion;
  sourceResult?: any;
}> {
  return fetchApi('/analytics/feedback/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function triggerModelRecalibration(params?: {
  source?: string;
  reason?: string;
}): Promise<any> {
  return fetchApi('/analytics/feedback/recalibrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WOOF ALERTS & NOTIFICATIONS SYSTEM (No-Icon, Persistent, Audited)
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemAlert {
  id: string;
  alertKey: string;
  module: 'services' | 'cafe' | 'retail' | 'pipeline' | 'forecast' | 'general';
  severity: 'critical' | 'warning' | 'advisory';
  classification: 'OBSERVED' | 'PREDICTED' | 'FORECAST' | 'SIMULATION' | 'SUSPECTED_RISK';
  title: string;
  evidence: string;
  targetUrl: string;
  actionLabel: string;
  status: 'active' | 'acknowledged' | 'resolved';
  firstTriggeredAt: string;
  lastEvaluatedAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  snoozeUntil?: string | null;
  resolvedAt?: string | null;
  resolutionType?: 'auto' | 'manual' | null;
  metadata?: Record<string, unknown>;
}

export interface UserNotification {
  id: string;
  recipientEmail: string;
  type: 'alert' | 'opportunity' | 'suggestion' | 'report' | 'system' | 'info';
  title: string;
  message: string;
  targetUrl: string;
  actionLabel: string;
  read: boolean;
  readAt?: string | null;
  dismissed: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export async function getActiveAlerts(): Promise<SystemAlert[]> {
  try {
    return await fetchApi<SystemAlert[]>('/alerts/active');
  } catch {
    return [];
  }
}

export async function acknowledgeAlert(
  id: string,
  dto: { userEmail?: string; snoozeHours?: number; note?: string } = {},
): Promise<SystemAlert> {
  return fetchApi<SystemAlert>(`/alerts/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export async function resolveAlert(
  id: string,
  reason: string,
  userEmail?: string,
): Promise<SystemAlert> {
  return fetchApi<SystemAlert>(`/alerts/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, userEmail }),
  });
}

export async function getActiveOpportunities(): Promise<UserNotification[]> {
  try {
    return await fetchApi<UserNotification[]>('/alerts/opportunities');
  } catch {
    return [];
  }
}

export async function recordOpportunityActed(
  id: string,
  userEmail?: string,
): Promise<{ success: boolean; notification?: UserNotification }> {
  return fetchApi<{ success: boolean; notification?: UserNotification }>(
    `/alerts/opportunities/${encodeURIComponent(id)}/acted`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail }),
    },
  );
}

export async function getUserNotifications(
  userEmail?: string,
): Promise<UserNotification[]> {
  const query = userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : '';
  // A proxy can keep a failed backend request pending. Bound this polling call
  // so the header clears stale notifications promptly when the backend is down.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetchApi<UserNotification[]>(`/alerts/notifications${query}`, {
      signal: controller.signal,
    });
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function markNotificationRead(
  id: string,
  userEmail?: string,
): Promise<{ success: boolean; id: string }> {
  return fetchApi(`/alerts/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail }),
  });
}

export async function markAllNotificationsRead(
  userEmail?: string,
  type?: UserNotification['type'],
): Promise<{ success: boolean; count: number }> {
  return fetchApi('/alerts/notifications/mark-all-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail, type }),
  });
}

export async function dismissNotification(
  id: string,
  userEmail?: string,
): Promise<{ success: boolean; id: string }> {
  const query = userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : '';
  return fetchApi(`/alerts/notifications/${encodeURIComponent(id)}${query}`, {
    method: 'DELETE',
  });
}

