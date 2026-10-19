import { Injectable, Optional } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ExogenousDataService } from '../common/exogenous-data.service';
import { AuditService } from '../audit/audit.service';

export type AlertThresholdKey =
  | 'capacityWarning'
  | 'lowInventory'
  | 'forecastAccuracyWarning'
  | 'dataStalenessDays';

export type AlertThresholds = Record<AlertThresholdKey, number>;

export type AlertEvaluationMetrics = Partial<{
  capacityUsage: number;
  lowInventoryPercent: number;
  forecastAccuracy: number;
  dataAgeDays: number;
}>;

export type DataRetentionSettings = {
  retentionDays: number;
  protectedHistoricalSales: true;
  scope: string[];
};

export type ExportFormat = 'json' | 'csv';

export type ExportDatasetKey =
  | 'auditLogs'
  | 'smartReports'
  | 'recommendationFeedback'
  | 'forecastRuns'
  | 'crossSellCaches'
  | 'bundleArchives'
  | 'csvUploads';

export type ExportOptions = Partial<{
  format: ExportFormat;
  datasets: ExportDatasetKey[];
  exportAll: boolean;
}>;

type RetentionTarget = {
  table: string;
  label: string;
  dateColumn: string;
  filter?: Record<string, string>;
};

type TriggeredAlertRule = {
  key: AlertThresholdKey;
  label: string;
  actual: number;
  threshold: number;
  comparison: '>=' | '<=' | '>';
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  capacityWarning: 85,
  lowInventory: 20,
  forecastAccuracyWarning: 80,
  dataStalenessDays: 7,
};

export const DEFAULT_DATA_RETENTION_DAYS = 90;

const DATA_RETENTION_LIMITS = { min: 30, max: 365 };

const RETENTION_SCOPE = [
  'audit_logs',
  'smart_reports',
  'recommendation_feedback',
  'forecast_runs',
  'cross_sell_caches',
  'failed_import_records',
  'weather_cache',
  'holiday_cache',
];

const PROTECTED_EXPORT_TABLES = [
  'transactions',
  'fact_transactions',
  'csv_transactions',
  'sales',
  'sales_facts',
];

const EXPORT_TABLES: Array<{
  key: ExportDatasetKey;
  label: string;
  table: string;
  orderBy: string;
  csvEligible: boolean;
}> = [
  {
    key: 'auditLogs',
    label: 'System logs',
    table: 'audit_logs',
    orderBy: 'created_at',
    csvEligible: false,
  },
  {
    key: 'smartReports',
    label: 'Generated reports',
    table: 'smart_reports',
    orderBy: 'created_at',
    csvEligible: false,
  },
  {
    key: 'recommendationFeedback',
    label: 'Recommendation feedback',
    table: 'recommendation_feedback',
    orderBy: 'created_at',
    csvEligible: true,
  },
  {
    key: 'forecastRuns',
    label: 'Model artifacts',
    table: 'forecast_runs',
    orderBy: 'generated_at',
    csvEligible: false,
  },
  {
    key: 'crossSellCaches',
    label: 'Temporary recommendation caches',
    table: 'cross_sell_caches',
    orderBy: 'computed_at',
    csvEligible: false,
  },
  {
    key: 'bundleArchives',
    label: 'Bundle archives',
    table: 'bundle_archives',
    orderBy: 'created_at',
    csvEligible: false,
  },
  {
    key: 'csvUploads',
    label: 'Upload metadata',
    table: 'csv_uploads',
    orderBy: 'uploaded_at',
    csvEligible: true,
  },
];

const RETENTION_TARGETS: RetentionTarget[] = [
  {
    table: 'audit_logs',
    label: 'System logs',
    dateColumn: 'created_at',
  },
  {
    table: 'smart_reports',
    label: 'Generated reports',
    dateColumn: 'created_at',
  },
  {
    table: 'recommendation_feedback',
    label: 'Feedback events',
    dateColumn: 'created_at',
  },
  {
    table: 'forecast_runs',
    label: 'Forecast/model artifacts',
    dateColumn: 'generated_at',
  },
  {
    table: 'cross_sell_caches',
    label: 'Temporary recommendation caches',
    dateColumn: 'computed_at',
  },
  {
    table: 'csv_uploads',
    label: 'Failed import records',
    dateColumn: 'uploaded_at',
    filter: { status: 'failed' },
  },
];

const THRESHOLD_LIMITS: Record<
  AlertThresholdKey,
  { min: number; max: number }
> = {
  capacityWarning: { min: 1, max: 100 },
  lowInventory: { min: 1, max: 100 },
  forecastAccuracyWarning: { min: 1, max: 100 },
  dataStalenessDays: { min: 1, max: 60 },
};

@Injectable()
export class SettingsService {
  private alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS };
  private dataRetentionDays = DEFAULT_DATA_RETENTION_DAYS;

  constructor(
    @Optional()
    private readonly supabaseService?: SupabaseService,
    @Optional()
    private readonly exogenousDataService?: ExogenousDataService,
    @Optional()
    private readonly auditService?: AuditService,
  ) {}

  getAlertThresholds() {
    return { ...this.alertThresholds };
  }

  updateAlertThresholds(input: Partial<AlertThresholds>) {
    const before = { ...this.alertThresholds };
    this.alertThresholds = this.normalizeAlertThresholds({
      ...this.alertThresholds,
      ...input,
    });
    const after = this.getAlertThresholds();
    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Updated Alert Thresholds',
      module: 'system_settings',
      category: 'workflow',
      target: 'alert_thresholds',
      status: 'success',
      stateBefore: JSON.stringify(before),
      stateAfter: JSON.stringify(after),
      metadata: { before, after },
    });
    return after;
  }

  evaluateAlertThresholds(metrics: AlertEvaluationMetrics) {
    const thresholds = this.getAlertThresholds();
    const triggered: TriggeredAlertRule[] = [];

    this.pushIfTriggered(triggered, {
      key: 'capacityWarning',
      label: 'Capacity warning threshold',
      actual: metrics.capacityUsage,
      threshold: thresholds.capacityWarning,
      comparison: '>=',
    });
    this.pushIfTriggered(triggered, {
      key: 'lowInventory',
      label: 'Low inventory threshold',
      actual: metrics.lowInventoryPercent,
      threshold: thresholds.lowInventory,
      comparison: '<=',
    });
    this.pushIfTriggered(triggered, {
      key: 'forecastAccuracyWarning',
      label: 'Forecast accuracy warning threshold',
      actual: metrics.forecastAccuracy,
      threshold: thresholds.forecastAccuracyWarning,
      comparison: '<=',
    });
    this.pushIfTriggered(triggered, {
      key: 'dataStalenessDays',
      label: 'Data staleness warning',
      actual: metrics.dataAgeDays,
      threshold: thresholds.dataStalenessDays,
      comparison: '>',
    });

    return { thresholds, metrics, triggered };
  }

  getDataRetentionSettings(): DataRetentionSettings {
    return {
      retentionDays: this.dataRetentionDays,
      protectedHistoricalSales: true,
      scope: [...RETENTION_SCOPE],
    };
  }

  updateDataRetentionSettings(input: Partial<{ retentionDays: number }>) {
    const before = this.dataRetentionDays;
    this.dataRetentionDays = this.normalizeRetentionDays(input.retentionDays);
    const after = this.dataRetentionDays;
    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Updated Data Retention Policy',
      module: 'system_settings',
      category: 'workflow',
      target: 'data_retention',
      status: 'success',
      stateBefore: `${before} days`,
      stateAfter: `${after} days`,
      metadata: { retentionDaysBefore: before, retentionDaysAfter: after },
    });
    return this.getDataRetentionSettings();
  }

  async applyDataRetention(input?: Partial<{ retentionDays: number }>) {
    if (input?.retentionDays !== undefined) {
      this.updateDataRetentionSettings(input);
    }

    const retention = this.getDataRetentionSettings();
    const cutoff = new Date(
      Date.now() - retention.retentionDays * 24 * 60 * 60 * 1000,
    );
    const targets: Record<string, number> = {};

    if (this.supabaseService) {
      for (const target of RETENTION_TARGETS) {
        targets[target.table] = await this.deleteSupabaseRowsOlderThan(
          target,
          cutoff,
        );
      }
    }

    const caches = this.exogenousDataService
      ? await this.exogenousDataService.pruneOperationalCaches(cutoff)
      : { weatherCache: 0, holidayCache: 0 };

    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Executed Data Retention Cleanup',
      module: 'system_settings',
      category: 'workflow',
      target: 'data_retention_cleanup',
      status: 'success',
      metadata: {
        cutoff: cutoff.toISOString(),
        retentionDays: retention.retentionDays,
        deleted: { ...targets, ...caches },
      },
    });

    return {
      ...retention,
      cutoff: cutoff.toISOString(),
      deleted: {
        ...targets,
        ...caches,
      },
      protectedTables: [...PROTECTED_EXPORT_TABLES],
      note: 'Historical transaction and sales fact tables are excluded from retention cleanup because forecasting depends on long-range history.',
    };
  }

  getExportCatalog() {
    return EXPORT_TABLES.map((target) => ({
      key: target.key,
      label: target.label,
      csvEligible: target.csvEligible,
    }));
  }

  async buildDataExport(options: ExportOptions = {}) {
    const generatedAt = new Date().toISOString();
    const selectedTargets = this.resolveExportTargets(options);
    const format: ExportFormat = options.format === 'csv' ? 'csv' : 'json';

    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Exported System Data',
      module: 'system_settings',
      category: 'workflow',
      target: format.toUpperCase(),
      status: 'success',
      metadata: {
        format,
        datasets: selectedTargets.map((t) => t.key),
      },
    });

    if (format === 'csv') {
      return this.buildCsvExport(generatedAt, selectedTargets);
    }

    const exportData: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    if (this.supabaseService) {
      for (const target of selectedTargets) {
        try {
          exportData[target.key] = await this.fetchExportRows(target);
        } catch (error) {
          exportData[target.key] = [];
          errors[target.key] =
            error instanceof Error ? error.message : String(error);
        }
      }
    }

    let exogenousCacheStatus: unknown = null;
    try {
      exogenousCacheStatus =
        await this.exogenousDataService?.getCacheStatus();
    } catch (error) {
      errors.exogenousCacheStatus =
        error instanceof Error ? error.message : String(error);
    }

    const payload = {
      manifest: {
        generatedAt,
        exportFormat: 'json',
        source: 'WOOF Settings Data Management',
        maxRowsPerTable: 5000,
        exportAll: options.exportAll !== false,
        selectedDatasets: selectedTargets.map((target) => target.key),
        retention: this.getDataRetentionSettings(),
        protectedHistoricalSales: {
          protected: true,
          reason:
            'Historical transaction and sales data is intentionally excluded from cleanup and export-by-default pruning because forecasting accuracy depends on long-range history.',
          tables: [...PROTECTED_EXPORT_TABLES],
        },
        includedArtifacts: [
          'audit logs',
          'generated smart reports',
          'recommendation feedback',
          'forecast/model artifacts',
          'cross-sell caches',
          'bundle archives',
          'upload metadata',
          'settings policy snapshot',
          'exogenous cache status',
        ],
      },
      settings: {
        alertThresholds: this.getAlertThresholds(),
        dataRetention: this.getDataRetentionSettings(),
      },
      data: exportData,
      diagnostics: {
        exogenousCacheStatus,
        errors,
      },
    };

    return {
      filename: `WOOF_Data_Export_${generatedAt.slice(0, 10)}.json`,
      contentType: 'application/json; charset=utf-8',
      payload,
    };
  }

  private normalizeAlertThresholds(input: Partial<AlertThresholds>) {
    return (
      Object.keys(DEFAULT_ALERT_THRESHOLDS) as AlertThresholdKey[]
    ).reduce((normalized, key) => {
      const limits = THRESHOLD_LIMITS[key];
      const rawValue = input[key];
      const numericValue =
        typeof rawValue === 'number' && Number.isFinite(rawValue)
          ? rawValue
          : DEFAULT_ALERT_THRESHOLDS[key];
      normalized[key] = Math.min(
        limits.max,
        Math.max(limits.min, Math.round(numericValue)),
      );
      return normalized;
    }, {} as AlertThresholds);
  }

  private normalizeRetentionDays(value: unknown) {
    const numericValue =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : DEFAULT_DATA_RETENTION_DAYS;
    return Math.min(
      DATA_RETENTION_LIMITS.max,
      Math.max(DATA_RETENTION_LIMITS.min, Math.round(numericValue)),
    );
  }

  private resolveExportTargets(options: ExportOptions) {
    if (options.exportAll !== false || !options.datasets?.length) {
      return [...EXPORT_TABLES];
    }

    const requested = new Set(options.datasets);
    const selected = EXPORT_TABLES.filter((target) => requested.has(target.key));
    return selected.length ? selected : [...EXPORT_TABLES];
  }

  private async fetchExportRows(target: (typeof EXPORT_TABLES)[number]) {
    if (!this.supabaseService) return [];

    const { data, error } = await this.supabaseService.client
      .from(target.table)
      .select('*')
      .order(target.orderBy, { ascending: false })
      .limit(5000);

    if (error) throw error;
    return data || [];
  }

  private async buildCsvExport(
    generatedAt: string,
    selectedTargets: Array<(typeof EXPORT_TABLES)[number]>,
  ) {
    if (selectedTargets.length !== 1 || !selectedTargets[0].csvEligible) {
      throw new Error(
        'CSV export is available only for one flat dataset at a time.',
      );
    }

    const target = selectedTargets[0];
    const rows = await this.fetchExportRows(target);
    const csv = this.toCsv(rows as Array<Record<string, unknown>>);

    return {
      filename: `WOOF_${target.key}_${generatedAt.slice(0, 10)}.csv`,
      contentType: 'text/csv; charset=utf-8',
      payload: csv,
    };
  }

  private toCsv(rows: Array<Record<string, unknown>>) {
    if (!rows.length) return '';

    const columns = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>()),
    );

    const lines = [
      columns.map((column) => this.escapeCsvValue(column)).join(','),
      ...rows.map((row) =>
        columns.map((column) => this.escapeCsvValue(row[column])).join(','),
      ),
    ];

    return lines.join('\n');
  }

  private escapeCsvValue(value: unknown) {
    if (value === null || value === undefined) return '';
    const stringValue =
      typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(stringValue)
      ? `"${stringValue.replace(/"/g, '""')}"`
      : stringValue;
  }

  private async deleteSupabaseRowsOlderThan(
    target: RetentionTarget,
    cutoff: Date,
  ) {
    if (!this.supabaseService) return 0;

    let request = this.supabaseService.client
      .from(target.table)
      .delete({ count: 'exact' })
      .lt(target.dateColumn, cutoff.toISOString());

    if (target.filter) {
      for (const [column, value] of Object.entries(target.filter)) {
        request = request.eq(column, value);
      }
    }

    const { count, error } = await request;
    if (error) {
      return 0;
    }
    return count || 0;
  }

  private pushIfTriggered(
    triggered: TriggeredAlertRule[],
    rule: {
      key: AlertThresholdKey;
      label: string;
      actual: number | undefined;
      threshold: number;
      comparison: '>=' | '<=' | '>';
    },
  ) {
    if (typeof rule.actual !== 'number' || !Number.isFinite(rule.actual)) {
      return;
    }

    const shouldTrigger =
      rule.comparison === '>='
        ? rule.actual >= rule.threshold
        : rule.comparison === '<='
          ? rule.actual <= rule.threshold
          : rule.actual > rule.threshold;

    if (shouldTrigger) {
      triggered.push({
        key: rule.key,
        label: rule.label,
        actual: rule.actual,
        threshold: rule.threshold,
        comparison: rule.comparison,
      });
    }
  }
}
