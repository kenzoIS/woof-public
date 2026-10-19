import { BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupabaseService } from '../common/supabase/supabase.service';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { EtlService } from './etl.service';
import { DataValidationService } from './data-validation.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AwsService } from '../aws/aws.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import {
  buildDailyValuesFromTransactionLines,
  ForecastModule,
  normalizeDailySeries,
} from '../common/time-series';

// Map POS categories to sectors
const SECTOR_MAP: Record<string, string> = {
  Coffee: 'Cafe',
  'Non-Caffeine': 'Cafe',
  'Pasta/Snacks': 'Cafe',
  'Rice Meals': 'Cafe',
  'Pet Bakery': 'Cafe',
  'Pet Menu': 'Cafe',
  Cafe: 'Cafe',
  Grooming: 'Services',
  Events: 'Services',
  'Pet Hotel': 'Services',
  Boarding: 'Services',
  Services: 'Services',
  'Pet Supplies': 'Retail',
  'Pet Shop': 'Retail',
  Retail: 'Retail',
};

function mapCategoryToSector(category: string): string {
  const match = Object.entries(SECTOR_MAP).find(
    ([knownCategory]) =>
      knownCategory.toLowerCase() === category.trim().toLowerCase(),
  );
  return match?.[1] || 'Retail';
}

// Detect channel from filename and optionally file buffer content
function detectChannel(filename: string, buffer?: Buffer): string {
  const lower = filename.toLowerCase();
  if (lower.includes('shopee')) return 'Shopee';
  if (lower.includes('tiktok') || lower.includes('tiktokshop'))
    return 'TikTok Shop';
  if (lower.includes('pethub') || lower.includes('pet-hub')) return 'PetHub';

  if (buffer) {
    const head = buffer.toString('utf-8', 0, 1024).toLowerCase();
    if (head.includes('sku platform discount') || head.includes('tiktok')) {
      return 'TikTok Shop';
    }
    if (head.includes('shopee') || head.includes('deal price')) {
      return 'Shopee';
    }
    if (head.includes('pethub')) {
      return 'PetHub';
    }
  }

  if (lower.includes('pos')) return 'POS';
  return 'POS';
}

function normalizeUploadChannel(channel: string): string {
  const lower = channel.trim().toLowerCase();
  if (lower === 'pos') return 'POS';
  if (lower === 'shopee') return 'Shopee';
  if (lower === 'tiktok' || lower === 'tiktok shop' || lower === 'tiktokshop') {
    return 'TikTok Shop';
  }
  if (lower === 'pethub' || lower === 'pet hub' || lower === 'pet-hub') {
    return 'PetHub';
  }
  return channel.trim() || 'POS';
}

@Injectable()
export class CsvService {
  private readonly logger = new Logger(CsvService.name);

  constructor(
    private supabaseService: SupabaseService,
    @Optional()
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    private etlService: EtlService,
    private dataValidationService: DataValidationService,
    private analyticsService: AnalyticsService,
    @Optional() private awsService?: AwsService,
    @Optional() private realtimeService?: RealtimeService,
    @Optional() private auditService?: AuditService,
  ) {}

  async processUpload(
    file: Express.Multer.File,
    userChannel?: string,
  ): Promise<any> {
    let channel = normalizeUploadChannel(
      userChannel || detectChannel(file.originalname, file.buffer),
    );

    // Auto-correct if user accidentally left it as default POS but headers indicate otherwise
    if (channel === 'POS' && file.buffer) {
      const detected = detectChannel(file.originalname, file.buffer);
      if (detected !== 'POS') {
        this.logger.log(
          `Auto-corrected channel from POS to ${detected} based on file headers`,
        );
        channel = detected;
      }
    }

    if (
      channel === 'PetHub' ||
      detectChannel(file.originalname, file.buffer) === 'PetHub'
    ) {
      throw new BadRequestException('PetHub data ingestion is disabled.');
    }

    const isExcel =
      file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');

    let transactions: Partial<Transaction>[];

    if (channel === 'POS') {
      transactions = this.parseFlexibleUpload(
        file.buffer,
        file.originalname,
        channel,
        isExcel,
      );
    } else if (channel === 'Shopee') {
      if (isExcel) {
        transactions = this.parseShopeeExcel(file.buffer);
      } else {
        transactions = this.parseShopeeCsv(file.buffer);
      }
    } else {
      try {
        transactions = this.parseTikTok(file.buffer);
      } catch {
        transactions = this.parseFlexibleCsv(
          file.buffer,
          file.originalname,
          channel,
        );
      }
    }

    if (transactions.length === 0) {
      transactions = this.parseFlexibleUpload(
        file.buffer,
        file.originalname,
        channel,
        isExcel,
      );
    }

    // Shopee and TikTok Shop are always Retail — override any product-name-based inference
    if (channel === 'Shopee' || channel === 'TikTok Shop') {
      transactions = transactions.map((t) => ({ ...t, sector: 'Retail' }));
    }

    // Omit PetHub data per user configuration
    transactions = transactions.filter(
      (t) =>
        t.channel !== 'PetHub' &&
        (t as any).source !== 'PetHub' &&
        !String(t.channel || '').toLowerCase().includes('pethub') &&
        !String((t as any).source || '').toLowerCase().includes('pethub'),
    );

    // Auto-replace old upload for same Data Month
    const txDates = transactions
      .map((t) => (t.date ? new Date(t.date).getTime() : NaN))
      .filter((time) => !isNaN(time));
    let dataMonth: string | null = null;
    if (txDates.length > 0) {
      const maxDate = new Date(Math.max(...txDates));
      dataMonth = `${maxDate.getUTCFullYear()}-${String(
        maxDate.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
    }

    if (dataMonth) {
      const { data: existingUploads } = await this.supabaseService.client
        .from('csv_uploads')
        .select('id, etl_report')
        .eq('channel', channel)
        .order('uploaded_at', { ascending: false })
        .limit(20);

      const oldUpload = existingUploads?.find(
        (u) => u.etl_report?.dataMonth === dataMonth,
      );

      if (oldUpload) {
        this.logger.log(`Found existing upload for channel ${channel} and data month ${dataMonth}. Auto-replacing...`);
        await this.rollbackUpload(oldUpload.id);
      }
    }

    // Create upload record
    const uniqueTransactionIds = new Set(
      transactions.map((t) => t.transactionId),
    );
    const categories: string[] = [
      ...new Set(
        transactions
          .map((t) => t.category)
          .filter((c): c is string => Boolean(c)),
      ),
    ];
    const totalRevenue = transactions.reduce(
      (sum, t) => sum + (t.netSales || t.totalAmount || 0),
      0,
    );
    const totalQuantity = transactions.reduce(
      (sum, t) => sum + (t.quantity || 0),
      0,
    );

    const { data: uploadRows, error: insertError } =
      await this.supabaseService.client
        .from('csv_uploads')
        .insert({
          filename: file.originalname,
          channel,
          record_count: transactions.length,
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_quantity: totalQuantity,
          total_transactions: uniqueTransactionIds.size,
          categories,
          uploaded_at: new Date().toISOString(),
        })
        .select();

    if (insertError || !uploadRows || uploadRows.length === 0) {
      throw new InternalServerErrorException(
        'Failed to create upload record in Supabase: ' + insertError?.message,
      );
    }
    const upload = uploadRows[0];
    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Uploaded new data',
      module: 'data_ingestion',
      category: 'workflow',
      target: file.originalname,
      stateAfter: 'Uploaded',
      metadata: {
        channel,
        uploadId: upload.id,
        recordCount: transactions.length,
      },
    });

    // Add csvUploadId and channel to each transaction, then bulk insert
    const uploadId = upload.id;
    const transactionsWithUploadId = transactions.map((t) => ({
      ...t,
      csvUploadId: uploadId,
      channel,
    }));

    let reportPayload: any = null;
    try {
      const { cleanedTransactions, report } =
        this.dataValidationService.validateBatch(
          transactionsWithUploadId,
          channel,
        );
      reportPayload = report;

      const cleanedCategories = [
        ...new Set(
          cleanedTransactions
            .map((t) => t.category)
            .filter((c): c is string => Boolean(c)),
        ),
      ];

      await this.supabaseService.client
        .from('csv_uploads')
        .update({
          record_count: cleanedTransactions.length,
          categories: cleanedCategories,
          etl_report: {
            stage1_droppedCount: report.stage1_droppedCount,
            stage1_duplicateCount: report.stage1_duplicateCount,
            stage1_dropReasons: report.stage1_dropReasons,
            dataMonth,
          },
        })
        .eq('id', uploadId);

      await this.insertTransactionsInChunks(cleanedTransactions);
      this.realtimeService?.emit({
        type: 'upload_processed',
        title: 'Upload processed',
        message: `${cleanedTransactions.length} ${channel} records were saved to staging.`,
        uploadId: uploadId.toString(),
        data: {
          channel,
          recordCount: cleanedTransactions.length,
        },
      });

      // Run ETL to Supabase in the background
      this.realtimeService?.emit({
        type: 'etl_started',
        title: 'Warehouse sync started',
        message: `${channel} upload is syncing to Supabase warehouse.`,
        uploadId: uploadId.toString(),
      });
      this.etlService
        .processTransactions(
          cleanedTransactions as Transaction[],
          uploadId.toString(),
        )
        .then(() => {
          this.realtimeService?.emit({
            type: 'etl_completed',
            title: 'Warehouse sync complete',
            message: `${channel} upload is ready in Supabase warehouse.`,
            uploadId: uploadId.toString(),
          });
        })
        .catch((err) => {
          this.logger.error(
            'Background ETL process failed for upload ' + uploadId,
            err.stack,
          );
          this.realtimeService?.emit({
            type: 'etl_failed',
            title: 'Warehouse sync failed',
            message: err instanceof Error ? err.message : String(err),
            uploadId: uploadId.toString(),
          });
        });
      this.warmForecastCacheAfterUpload(
        uploadId.toString(),
        cleanedTransactions,
      );

      // Archive raw CSV to AWS S3 Data Lake (fire-and-forget)
      this.awsService
        ?.uploadRawArchive(
          file.originalname,
          file.buffer,
          channel,
          uploadId.toString(),
        )
        ?.catch((err) => {
          this.logger.warn(
            `S3 raw archive failed for upload ${uploadId}: ${err}`,
          );
        });
    } catch (error) {
      await this.rollbackUpload(uploadId);
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to persist ${transactionsWithUploadId.length} uploaded transactions for ${file.originalname}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        `Failed to persist uploaded transactions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      success: true,
      upload,
      report: reportPayload,
    } as any;
  }

  async processHistoricalUpload(
    file: Express.Multer.File,
    requestedModule: string,
  ): Promise<Record<string, unknown>> {
    const module = this.normalizeHistoricalModule(requestedModule);
    const parsed = this.parseHistoricalPOS(file.buffer, module);
    if (parsed.transactions.length === 0) {
      throw new BadRequestException(
        `No physical POS ${module} transactions were found in the uploaded CSV`,
      );
    }

    const uniqueTransactionIds = new Set(
      parsed.transactions.map((transaction) => transaction.transactionId),
    );
    const categories = [
      ...new Set(
        parsed.transactions
          .map((transaction) => transaction.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ];
    const totalRevenue = parsed.transactions.reduce(
      (sum, transaction) =>
        sum + (transaction.netSales || transaction.totalAmount || 0),
      0,
    );
    const totalQuantity = parsed.transactions.reduce(
      (sum, transaction) => sum + (transaction.quantity || 0),
      0,
    );

    const { data: uploadRows, error: insertError } =
      await this.supabaseService.client
        .from('csv_uploads')
        .insert({
          filename: file.originalname,
          channel: 'POS',
          purpose: 'historical-forecast',
          module,
          record_count: parsed.transactions.length,
          excluded_record_count: parsed.excludedRecordCount,
          repaired_date_count: parsed.repairedDateCount,
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_quantity: totalQuantity,
          total_transactions: uniqueTransactionIds.size,
          categories,
          uploaded_at: new Date().toISOString(),
        })
        .select();

    if (insertError || !uploadRows || uploadRows.length === 0) {
      throw new InternalServerErrorException(
        'Failed to create upload record in Supabase: ' + insertError?.message,
      );
    }
    const upload = uploadRows[0];

    const uploadId = upload.id;
    const transactionsWithUploadId = parsed.transactions.map((transaction) => ({
      ...transaction,
      csvUploadId: uploadId,
      channel: 'POS',
    }));

    let reportPayload: any = null;
    try {
      const { cleanedTransactions, report } =
        this.dataValidationService.validateBatch(
          transactionsWithUploadId,
          'POS',
        );
      reportPayload = report;

      const cleanedCategories = [
        ...new Set(
          cleanedTransactions
            .map((t) => t.category)
            .filter((c): c is string => Boolean(c)),
        ),
      ];

      await this.supabaseService.client
        .from('csv_uploads')
        .update({
          record_count: cleanedTransactions.length,
          categories: cleanedCategories,
          etl_report: {
            stage1_droppedCount: report.stage1_droppedCount,
            stage1_duplicateCount: report.stage1_duplicateCount,
            stage1_dropReasons: report.stage1_dropReasons,
          },
        })
        .eq('id', uploadId);

      await this.insertTransactionsInChunks(cleanedTransactions);
      this.realtimeService?.emit({
        type: 'upload_processed',
        title: 'Historical upload processed',
        message: `${cleanedTransactions.length} ${module} forecast records were saved to staging.`,
        module,
        uploadId: uploadId.toString(),
        data: {
          channel: 'POS',
          recordCount: cleanedTransactions.length,
        },
      });

      // Run ETL to Supabase in the background
      this.realtimeService?.emit({
        type: 'etl_started',
        title: 'Historical warehouse sync started',
        message: `${module} historical upload is syncing to Supabase warehouse.`,
        module,
        uploadId: uploadId.toString(),
      });
      this.etlService
        .processTransactions(
          cleanedTransactions as Transaction[],
          uploadId.toString(),
        )
        .then(() => {
          this.realtimeService?.emit({
            type: 'etl_completed',
            title: 'Historical warehouse sync complete',
            message: `${module} historical data is ready in Supabase warehouse.`,
            module,
            uploadId: uploadId.toString(),
          });
        })
        .catch((err) => {
          this.logger.error(
            'Background ETL process failed for historical upload ' + uploadId,
            err.stack,
          );
          this.realtimeService?.emit({
            type: 'etl_failed',
            title: 'Historical warehouse sync failed',
            message: err instanceof Error ? err.message : String(err),
            module,
            uploadId: uploadId.toString(),
          });
        });
      this.warmForecastCacheAfterUpload(
        uploadId.toString(),
        cleanedTransactions,
        [module],
      );
    } catch (error) {
      await this.rollbackUpload(uploadId);
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to persist ${transactionsWithUploadId.length} historical transactions for ${file.originalname}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        `Failed to persist historical transactions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Uploaded Historical Data',
      module: 'data_ingestion',
      category: 'workflow',
      target: file.originalname,
      status: 'success',
      stateAfter: 'Uploaded',
      metadata: {
        uploadId: upload.id,
        module,
        recordCount: parsed.transactions.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        channel: 'POS',
      },
    });

    const normalizedSeries = normalizeDailySeries(
      buildDailyValuesFromTransactionLines(parsed.transactions, module),
      module,
    );

    return {
      success: true,
      upload,
      report: reportPayload,
      preprocessing: {
        module,
        channel: 'POS',
        emaAlpha: module === 'Cafe' ? 0.3 : 0.4,
        acceptedRecordCount: parsed.transactions.length,
        excludedRecordCount: parsed.excludedRecordCount,
        repairedDateCount: parsed.repairedDateCount,
        filledMissingDayCount: normalizedSeries.filter(
          (point) => point.isMissingDate,
        ).length,
      },
      normalizedSeries,
    };
  }

  private async warmForecastCacheAfterUpload(
    uploadId: string,
    transactions: Partial<Transaction>[],
    forcedModules?: ForecastModule[],
  ) {
    const txDates = transactions
      .map((t) => (t.date ? new Date(t.date).getTime() : NaN))
      .filter((time) => !isNaN(time));
    let dataMonth: string | null = null;
    if (txDates.length > 0) {
      const maxDate = new Date(Math.max(...txDates));
      dataMonth = `${maxDate.getUTCFullYear()}-${String(
        maxDate.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
    }

    let modulesToWarm: string[] = [];

    if (forcedModules?.length) {
      modulesToWarm = forcedModules;
    } else if (dataMonth) {
      const { data: uploads } = await this.supabaseService.client
        .from('csv_uploads')
        .select('channel, etl_report')
        .order('uploaded_at', { ascending: false })
        .limit(100);

      const thisMonthUploads = (uploads || []).filter(
        (u) => u.etl_report?.dataMonth === dataMonth
      );
      const hasPos = thisMonthUploads.some((u) => u.channel === 'POS');
      const hasShopee = thisMonthUploads.some((u) => u.channel === 'Shopee');
      const hasTikTok = thisMonthUploads.some((u) => u.channel === 'TikTok Shop');

      if (hasPos) {
        modulesToWarm.push('Cafe', 'Services');
      }
      if (hasPos && hasShopee && hasTikTok) {
        modulesToWarm.push('Retail');
      }
      modulesToWarm = Array.from(new Set(modulesToWarm));
    }

    const modules = modulesToWarm;

    if (modules.length === 0) return;

    modules.forEach((module) => {
      this.realtimeService?.emit({
        type: 'forecast_warmup_started',
        title: 'Forecast precompute started',
        message: `${module} forecast cache is being refreshed from the new upload.`,
        module,
        uploadId,
      });
    });

    setTimeout(() => {
      Promise.allSettled(
        modules.map((module) =>
          this.analyticsService.getForecast(module, {
            days: module === 'Cafe' ? '14' : '30',
            forceRefresh: 'true',
          }),
        ),
      ).then((results) => {
        results.forEach((result, index) => {
          const module = modules[index];
          if (result.status === 'rejected') {
            this.logger.warn(
              `Forecast cache warmup failed for ${module} after upload ${uploadId}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
              }`,
            );
            this.realtimeService?.emit({
              type: 'forecast_failed',
              title: 'Forecast precompute failed',
              message:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
              module,
              uploadId,
            });
          } else {
            this.logger.log(
              `Forecast cache warmed for ${module} after upload ${uploadId}.`,
            );
            this.realtimeService?.emit({
              type: 'forecast_ready',
              title: 'Forecast ready',
              message: `${module} forecast has been precomputed and cached.`,
              module,
              uploadId,
            });
            void this.auditService?.record({
              actor: 'System',
              actorType: 'system',
              action: 'Precomputed forecast cache',
              module: 'forecasting',
              category: 'ai_system',
              target: module,
              status: 'success',
              stateBefore: 'Stale',
              stateAfter: 'Updated',
              metadata: { uploadId, trigger: 'new_data_upload' },
            });
          }
        });
      });
    }, 1000);
  }

  private parseFlexibleCsv(
    buffer: Buffer,
    filename: string,
    channel: string,
  ): Partial<Transaction>[] {
    const records = this.parseCsvRecords(buffer);
    return this.mapFlexibleRecords(records, filename, channel);
  }

  private parseFlexibleUpload(
    buffer: Buffer,
    filename: string,
    channel: string,
    isExcel: boolean,
  ): Partial<Transaction>[] {
    const records = isExcel
      ? this.parseExcelRecords(buffer)
      : this.parseCsvRecords(buffer);
    return this.mapFlexibleRecords(records, filename, channel);
  }

  private mapFlexibleRecords(
    records: Record<string, unknown>[],
    filename: string,
    channel: string,
  ): Partial<Transaction>[] {
    const fallbackDate = new Date();

    return records.map((row, index) =>
      this.mapFlexibleRow(row, {
        channel,
        fallbackDate,
        fallbackId: `${filename}-${index + 1}`,
      }),
    );
  }

  private parsePetHub(
    buffer: Buffer,
    filename: string,
    isExcel: boolean,
  ): Partial<Transaction>[] {
    const records = isExcel
      ? this.parseExcelRecords(buffer)
      : this.parseCsvRecords(buffer);
    const fallbackDate = new Date();

    return records
      .filter((row) => this.isAcceptedPetHubRow(row))
      .map((row, index) =>
        this.mapFlexibleRow(row, {
          channel: 'PetHub',
          fallbackDate,
          fallbackId: `${filename}-${index + 1}`,
        }),
      );
  }

  private isAcceptedPetHubRow(row: Record<string, unknown>): boolean {
    const orderStatus = this.getValue(row, [
      'order status',
      'order_status',
      'booking status',
      'booking_status',
      'status',
    ]).toLowerCase();
    const paymentStatus = this.getValue(row, [
      'payment status',
      'payment_status',
      'paid status',
      'paid_status',
    ]).toLowerCase();

    if (/cancel|refund|void|failed|rejected|unpaid/.test(orderStatus)) {
      return false;
    }
    if (
      paymentStatus &&
      !/paid|settled|completed|complete|cod|cash/.test(paymentStatus)
    ) {
      return false;
    }
    return true;
  }

  private parseHistoricalPOS(
    buffer: Buffer,
    module: ForecastModule,
  ): {
    transactions: Partial<Transaction>[];
    excludedRecordCount: number;
    repairedDateCount: number;
  } {
    const records = this.parseCsvRecords(buffer);

    const transactions: Partial<Transaction>[] = [];
    let excludedRecordCount = 0;
    let repairedDateCount = 0;
    const validDates = records
      .map((row) =>
        this.parseDate(
          this.getValue(row, [
            'transaction date',
            'date',
            'order date',
            'created at',
            'timestamp',
          ]),
        ),
      )
      .filter((date): date is Date => Boolean(date));
    let lastValidDate: Date | null = validDates[0] || new Date();

    for (const [index, row] of records.entries()) {
      const source = this.getValue(row, [
        'channel',
        'sales channel',
        'order source',
        'platform',
        'source',
      ]).toLowerCase();
      if (
        /shopee|tiktok|lazada|website|online|e-?commerce|marketplace/.test(
          source,
        )
      ) {
        excludedRecordCount += 1;
        continue;
      }

      const category = this.getValue(row, [
        'category',
        'product category',
        'item category',
      ]);
      const explicitSector = this.getValue(row, ['sector', 'module']);
      const productName = this.getValue(row, [
        'item names',
        'item name',
        'product name',
        'product',
        'service',
        'name',
        'description',
      ]);
      const inferredSector = this.inferFlexibleSector(
        category,
        explicitSector,
        productName,
      );
      if ((category || explicitSector) && inferredSector !== module) {
        excludedRecordCount += 1;
        continue;
      }

      const rawDate = this.getValue(row, [
        'transaction date',
        'date',
        'order date',
        'created at',
        'timestamp',
      ]);
      let date = this.parseDate(rawDate);
      if (date) {
        lastValidDate = date;
      } else {
        date = new Date(lastValidDate);
        repairedDateCount += 1;
      }

      transactions.push(
        this.mapFlexibleRow(row, {
          channel: 'POS',
          forcedModule: module,
          fallbackDate: date,
          fallbackId: `historical-${module}-${index + 1}`,
        }),
      );
    }

    return { transactions, excludedRecordCount, repairedDateCount };
  }

  private normalizeHistoricalModule(module: string): ForecastModule {
    const normalized = module.toLowerCase();
    if (normalized === 'cafe') return 'Cafe';
    if (normalized === 'services') return 'Services';
    throw new BadRequestException(
      'Historical ingestion is restricted to Cafe and Services',
    );
  }

  private toNumber(value: unknown, fallback: number): number {
    const parsedValue = Number.parseFloat(
      String(value ?? '').replace(/[^0-9.-]/g, ''),
    );
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  private parseCsvRecords(buffer: Buffer): Record<string, string>[] {
    const content = buffer
      .toString('utf-8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    if (!content) {
      throw new BadRequestException('The uploaded CSV is empty');
    }

    try {
      const rows = parse(content, {
        columns: (headers: string[]) =>
          headers.map(
            (header, index) => header.trim() || `column_${index + 1}`,
          ),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
        bom: true,
      });
      if (rows.length > 0) return rows as Record<string, string>[];

      const rawRows = parse(content, {
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
        bom: true,
      });
      return rawRows.map((values) =>
        Object.fromEntries(
          values.map((value, index) => [`column_${index + 1}`, value]),
        ),
      );
    } catch (error) {
      throw new BadRequestException(
        `Unable to parse CSV: ${error instanceof Error ? error.message : 'invalid format'}`,
      );
    }
  }

  private parseExcelRecords(buffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('The uploaded Excel file has no sheets');
    }
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName],
      { defval: '' },
    );
    if (records.length === 0) {
      throw new BadRequestException('The uploaded Excel file is empty');
    }
    return records;
  }

  private mapFlexibleRow(
    row: Record<string, unknown>,
    options: {
      channel: string;
      fallbackDate: Date;
      fallbackId: string;
      forcedModule?: ForecastModule;
    },
  ): Partial<Transaction> {
    const productName =
      this.getValue(row, [
        'item names',
        'item name',
        'product name',
        'product or service name',
        'product_or_service_name',
        'service name',
        'menu item',
        'item description',
        'product',
        'service',
        'name',
        'description',
      ]) ||
      this.firstMeaningfulValue(row) ||
      `Imported row ${options.fallbackId}`;
    const category =
      this.getValue(row, [
        'category',
        'product category',
        'item category',
        'service category',
        'department',
        'revenue category',
        'type',
      ]) ||
      options.forcedModule ||
      'Uncategorized';
    const explicitSector = this.getValue(row, [
      'sector',
      'module',
      'business sector',
      'revenue stream',
      'stream',
    ]);
    const sourceType = this.getValue(row, [
      'source type',
      'source_type',
      'record type',
      'transaction type',
    ]);
    const sector =
      options.forcedModule ||
      this.inferFlexibleSector(
        category,
        explicitSector,
        productName,
        sourceType,
      );
    const quantity = Math.max(
      0,
      this.toNumber(
        this.getValue(row, [
          'items sold',
          'quantity',
          'qty',
          'qty ordered',
          'order quantity',
          'booked quantity',
          'units',
          'count',
        ]),
        1,
      ),
    );
    const unitPrice = this.toNumber(
      this.getValue(row, [
        'unit price',
        'unit_price',
        'price',
        'rate',
        'booking price',
        'service price',
        'deal price',
        'original price',
      ]),
      0,
    );
    const grossSales = this.toNumber(
      this.getValue(row, [
        'gross sales',
        'gross amount',
        'total amount',
        'total_amount',
        'line total',
        'booking amount',
        'amount',
        'sales',
        'revenue',
        'total',
      ]),
      unitPrice * quantity,
    );
    const discount = this.toNumber(
      this.getValue(row, [
        'discounts',
        'discount',
        'discount amount',
        'discount_amount',
        'total discount',
      ]),
      0,
    );
    const netSales = this.toNumber(
      this.getValue(row, [
        'net sales',
        'net_sales',
        'net amount',
        'amount paid',
        'paid amount',
        'subtotal after discount',
      ]),
      grossSales - discount,
    );

    const transactionId =
      this.getValue(row, [
        'transaction id',
        'transaction_id',
        'source id',
        'source_id',
        'order id',
        'booking id',
        'invoice id',
        'receipt id',
        'reference id',
        'reference no',
        'id',
      ]) || options.fallbackId;

    const parsedDate =
      this.parseDate(
        this.getValue(row, [
          'order creation date',
          'order_creation_date',
          'order paid time',
          'order_paid_time',
          'order complete time',
          'order_complete_time',
          'transaction date',
          'transaction_date',
          'date',
          'order date',
          'order_date',
          'booking date',
          'booking_date',
          'appointment date',
          'service date',
          'created at',
          'created_at',
          'created time',
          'created_time',
          'completed at',
          'paid time',
          'timestamp',
        ]),
      ) ||
      this.extractDateFromTransactionId(transactionId) ||
      options.fallbackDate;

    return {
      date: parsedDate,
      transactionId,
      productName,
      sku: this.getValue(row, [
        'sku',
        'sku id',
        'sku_id',
        'product id',
        'product_id',
        'item code',
        'service code',
      ]),
      category,
      sector,
      quantity,
      unitPrice: unitPrice || grossSales / Math.max(quantity, 1),
      totalAmount: grossSales,
      discount,
      netSales,
      paymentType: this.getValue(row, [
        'payment type',
        'payment_type',
        'payment method',
        'payment',
      ]),
      costOfGoods: this.toNumber(
        this.getValue(row, [
          'cost of goods',
          'cost_of_goods',
          'cogs',
          'item cost',
          'cost',
        ]),
        0,
      ),
      grossProfit: this.toNumber(
        this.getValue(row, [
          'gross profit',
          'gross_profit',
          'profit',
          'earnings',
        ]),
        0,
      ),
      margin: this.toNumber(
        this.getValue(row, ['margin', 'profit margin', 'profit_margin']),
        0,
      ),
      refunds: this.toNumber(
        this.getValue(row, ['refunds', 'refund_amount', 'refund amount']),
        0,
      ),
      itemsRefunded: this.toNumber(
        this.getValue(row, [
          'items refunded',
          'items_refunded',
          'refunded quantity',
          'refund qty',
        ]),
        0,
      ),
    };
  }

  private inferFlexibleSector(
    category: string,
    explicitSector: string,
    productName: string,
    sourceType = '',
  ): string {
    const sector = explicitSector.trim().toLowerCase();
    if (sector.includes('cafe') || sector.includes('coffee')) return 'Cafe';
    if (sector.includes('service') || sector.includes('groom'))
      return 'Services';
    if (sector.includes('retail')) return 'Retail';

    const source = sourceType.trim().toLowerCase();
    if (/booking|appointment|reservation/.test(source)) return 'Services';

    const mapped = mapCategoryToSector(category);
    return mapped !== 'Retail' || category.toLowerCase().includes('retail')
      ? mapped
      : this.inferSectorFromProduct(productName, category);
  }

  private getValue(row: Record<string, unknown>, aliases: string[]): string {
    const valuesByHeader = new Map<string, string>();
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined && value !== null) {
        const normalizedKey = this.normalizeHeader(key);
        if (!valuesByHeader.has(normalizedKey)) {
          valuesByHeader.set(normalizedKey, this.cleanCell(value));
        }
      }
    }

    for (const alias of aliases) {
      const value = valuesByHeader.get(this.normalizeHeader(alias));
      if (value) return value;
    }
    return '';
  }

  private normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private firstMeaningfulValue(row: Record<string, unknown>): string {
    for (const value of Object.values(row)) {
      const text = this.cleanCell(value);
      if (text.length > 0) return text;
    }
    return '';
  }

  private parseDate(value: string): Date | null {
    if (!value) return null;
    const cleanValue = value.replace(/\t/g, '').trim();
    const excelSerialDate = this.parseExcelSerialDate(cleanValue);
    if (excelSerialDate) {
      return excelSerialDate;
    }

    const slashDate = this.parseSlashDateTime(cleanValue);
    if (slashDate) {
      return slashDate;
    }

    const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(cleanValue);

    let dateStr = cleanValue;
    if (!hasTimezone) {
      if (cleanValue.includes(' ')) {
        dateStr = `${cleanValue} +08:00`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
        dateStr = `${cleanValue}T00:00:00+08:00`;
      } else {
        dateStr = `${cleanValue} +08:00`;
      }
    }

    const parsedDate = new Date(dateStr);
    if (Number.isNaN(parsedDate.getTime())) {
      const fallback = new Date(cleanValue);
      return Number.isNaN(fallback.getTime()) ? null : fallback;
    }
    return parsedDate;
  }

  private parseSlashDateTime(value: string): Date | null {
    const match = value.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
    );
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const rawYear = Number(match[3]);
    let hour = match[4] !== undefined ? Number(match[4]) : 0;
    const minute = match[5] !== undefined ? Number(match[5]) : 0;
    const second = match[6] !== undefined ? Number(match[6]) : 0;
    const meridiem = match[7]?.toUpperCase();
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    ) {
      return null;
    }

    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;

    const dateOnlyCheck = new Date(Date.UTC(year, month - 1, day));
    if (
      dateOnlyCheck.getUTCFullYear() !== year ||
      dateOnlyCheck.getUTCMonth() !== month - 1 ||
      dateOnlyCheck.getUTCDate() !== day
    ) {
      return null;
    }
    return new Date(
      Date.UTC(year, month - 1, day, hour - 8, minute, second, 0),
    );
  }

  private parseExcelSerialDate(value: string): Date | null {
    if (!/^\d+(\.\d+)?$/.test(value)) return null;
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 1 || serial > 60000) {
      return null;
    }

    const wholeDays = Math.floor(serial);
    const fraction = serial - wholeDays;
    const excelEpoch = Date.UTC(1899, 11, 30);
    const millis = Math.round(fraction * 24 * 60 * 60 * 1000);
    return new Date(
      excelEpoch +
        wholeDays * 24 * 60 * 60 * 1000 +
        millis -
        8 * 60 * 60 * 1000,
    );
  }

  private extractDateFromTransactionId(id: string): Date | null {
    if (!id || typeof id !== 'string') return null;
    const match = id.trim().match(/^(\d{2})(\d{2})(\d{2})/);
    if (!match) return null;
    const year = 2000 + Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (
      year >= 2020 &&
      year <= 2035 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
    }
    return null;
  }

  private cleanCell(value: unknown): string {
    return String(value ?? '')
      .replace(/\t/g, '')
      .trim();
  }

  private parseTikTok(buffer: Buffer): Partial<Transaction>[] {
    // TikTok CSV may have BOM
    let content = buffer.toString('utf-8');
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    return records
      .filter((row: any) => {
        const status = (row['Order Status'] || '').toLowerCase().trim();
        return (
          status === 'completed' ||
          status === 'delivered' ||
          status === 'to ship' ||
          status === 'shipped'
        );
      })
      .map((row: any) => {
        const productCategory = this.cleanCell(row['Product Category']);
        const productName = this.cleanCell(row['Product Name']);
        const variation = this.cleanCell(row['Variation']);
        const displayName =
          variation && variation.toLowerCase() !== 'default'
            ? `${productName} (${variation})`
            : productName;
        const sector = this.inferSectorFromProduct(
          productName,
          productCategory,
        );
        const quantity = this.toNumber(row['Quantity'], 1);
        const unitPrice = this.toNumber(row['SKU Unit Original Price'], 0);
        const subtotalBeforeDiscount = this.toNumber(
          row['SKU Subtotal Before Discount'],
          unitPrice * quantity,
        );
        const subtotalAfterDiscount = this.toNumber(
          row['SKU Subtotal After Discount'],
          subtotalBeforeDiscount,
        );
        const platformDiscount = this.toNumber(row['SKU Platform Discount'], 0);
        const sellerDiscount = this.toNumber(row['SKU Seller Discount'], 0);
        const paymentDiscount = this.toNumber(
          row['Payment platform discount'],
          0,
        );

        // Parse date - TikTok uses "MM/DD/YYYY HH:mm:ss AM/PM" format
        const dateStr = this.cleanCell(row['Created Time']);
        let date: Date;
        try {
          date = new Date(dateStr);
          if (isNaN(date.getTime())) date = new Date();
        } catch {
          date = new Date();
        }

        return {
          date,
          transactionId: this.cleanCell(row['Order ID']),
          productName: displayName,
          sku:
            this.cleanCell(row['Seller SKU']) || this.cleanCell(row['SKU ID']),
          category: productCategory,
          sector,
          quantity,
          unitPrice,
          totalAmount: subtotalBeforeDiscount,
          discount: platformDiscount + sellerDiscount + paymentDiscount,
          netSales: subtotalAfterDiscount,
          paymentType: this.cleanCell(row['Payment Method']),
        };
      });
  }

  private parseShopeeExcel(buffer: Buffer): Partial<Transaction>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const records: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    return records
      .filter((row: any) => {
        const status = (row['Order Status'] || '').toLowerCase();
        return status === 'completed';
      })
      .map((row: any) => {
        const productName = this.cleanCell(row['Product Name']);
        const variation = this.cleanCell(row['Variation Name']);
        const displayName = variation
          ? `${productName} (${variation})`
          : productName;
        const sector = this.inferSectorFromProduct(productName, '');
        const quantity = this.toNumber(row['Quantity'], 1);
        const dealPrice = this.toNumber(
          row['Deal Price'],
          this.toNumber(row['Original Price'], 0),
        );
        const lineGross = dealPrice * quantity;
        const orderId = this.cleanCell(row['Order ID']);
        const rawDate =
          row['Order Creation Date'] ?? row['Order Paid Time'] ?? '';
        const date =
          this.parseDate(String(rawDate)) ||
          this.extractDateFromTransactionId(orderId) ||
          new Date();

        const totalDiscountFromCol = this.toNumber(
          row['Total Discount(PHP)'],
          0,
        );
        const buyerPayment = this.toNumber(row['Total Buyer Payment'], 0);
        const lineNetSales =
          buyerPayment > 0 && buyerPayment <= lineGross
            ? buyerPayment
            : Math.max(0, lineGross - totalDiscountFromCol);
        const totalDiscount = Math.max(0, lineGross - lineNetSales);

        return {
          date,
          transactionId: this.cleanCell(row['Order ID']),
          productName: displayName,
          sku:
            this.cleanCell(row['SKU Reference No.']) ||
            this.cleanCell(row['Parent SKU Reference No.']),
          category: this.inferCategoryFromProduct(productName),
          sector,
          quantity,
          unitPrice: dealPrice,
          totalAmount: lineGross,
          discount: totalDiscount,
          netSales: lineNetSales,
          paymentType: this.cleanCell(row['Payment Method']),
        };
      });
  }

  private parseShopeeCsv(buffer: Buffer): Partial<Transaction>[] {
    return this.parseFlexibleCsv(buffer, 'shopee.csv', 'Shopee');
  }

  private inferSectorFromProduct(
    productName: string,
    category: string,
  ): string {
    const lower = (productName + ' ' + category).toLowerCase();
    // Cafe items
    if (
      /coffee|latte|cappuccino|mocha|espresso|frappe|matcha|tea|smoothie|cake|pastry|bread|cookie|muffin|rice meal|pasta|snack|bakery|cupcake/.test(
        lower,
      )
    ) {
      return 'Cafe';
    }
    // Services
    if (
      /grooming|groom|bath|nail|paw.?dicure|boarding|hotel|pet hotel|birthday|party|trim|haircut|spa/.test(
        lower,
      )
    ) {
      return 'Services';
    }
    // Default to Retail (pet supplies, food, accessories, etc.)
    return 'Retail';
  }

  private inferCategoryFromProduct(productName: string): string {
    const lower = productName.toLowerCase();
    if (/food|kibble|treat|chew|snack|fattener|vitamins|supplement/.test(lower))
      return 'Pet Supplies';
    if (/shampoo|conditioner|soap|spray|cologne|powder/.test(lower))
      return 'Pet Supplies';
    if (/collar|leash|harness|bowl|bed|cage|carrier|toy/.test(lower))
      return 'Pet Supplies';
    if (/medicine|tablet|capsule|syrup|dewormer|worm|flea|tick/.test(lower))
      return 'Pet Supplies';
    return 'Pet Supplies';
  }

  async getUploads(): Promise<any[]> {
    const { data } = await this.supabaseService.client
      .from('csv_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false });
    return (data || []).map((upload: any) => ({
      ...upload,
      _id: upload._id || upload.id,
      filename: upload.filename || upload.file_name || 'Uploaded file',
      channel: upload.channel || 'Unknown',
      recordCount: Number(upload.record_count ?? upload.recordCount ?? 0),
      totalRevenue: Number(upload.total_revenue ?? upload.totalRevenue ?? 0),
      totalQuantity: Number(upload.total_quantity ?? upload.totalQuantity ?? 0),
      totalTransactions: Number(
        upload.total_transactions ?? upload.totalTransactions ?? 0,
      ),
      uploadedAt: upload.uploaded_at || upload.uploadedAt || upload.created_at,
      etlReport: upload.etl_report || upload.etlReport || null,
    }));
  }

  private async insertTransactionsInChunks(
    transactions: Partial<Transaction>[],
  ): Promise<void> {
    const chunkSize = 5000;
    for (let index = 0; index < transactions.length; index += chunkSize) {
      const chunk = transactions
        .slice(index, index + chunkSize)
        .map((transaction) => this.sanitizeTransaction(transaction));
      if (chunk.length > 0) {
        await this.transactionModel.insertMany(chunk, { ordered: false });
      }
    }
  }

  private sanitizeTransaction(
    transaction: Partial<Transaction>,
  ): Partial<Transaction> {
    const fallbackDate = new Date();
    const date =
      transaction.date instanceof Date &&
      Number.isFinite(transaction.date.getTime())
        ? transaction.date
        : fallbackDate;

    const quantity = this.safeNumber(transaction.quantity, 1);
    const unitPrice = this.safeNumber(transaction.unitPrice, 0);
    const totalAmount = this.safeNumber(transaction.totalAmount, 0);
    const discount = this.safeNumber(transaction.discount, 0);
    let netSales = this.safeNumber(transaction.netSales, 0);

    if (netSales <= 0 && totalAmount - discount > 0) {
      netSales = totalAmount - discount;
    }

    return {
      ...transaction,
      date,
      transactionId: this.safeRequiredString(
        transaction.transactionId,
        `imported-${date.getTime()}`,
      ),
      productName: this.safeRequiredString(
        transaction.productName,
        'Imported item',
      ),
      category: this.safeRequiredString(transaction.category, 'Uncategorized'),
      sector: this.safeRequiredString(transaction.sector, 'Retail'),
      channel: this.safeRequiredString(transaction.channel, 'POS'),
      quantity,
      unitPrice,
      totalAmount,
      discount,
      netSales,
    };
  }

  private safeRequiredString(value: unknown, fallback: string): string {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length > 0 ? text : fallback;
  }

  private safeNumber(value: unknown, fallback: number): number {
    const numberValue =
      typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  private async rollbackUpload(uploadId: string): Promise<void> {
    // Delete directly from Supabase fact table using the new column
    await this.supabaseService.client
      .from('fact_cross_channel_transactions')
      .delete()
      .eq('csv_upload_id', uploadId);

    await this.transactionModel.deleteMany({ csvUploadId: uploadId }).exec();
    await this.supabaseService.client
      .from('csv_uploads')
      .delete()
      .eq('id', uploadId);
  }

  async deleteUpload(id: string): Promise<{ deleted: boolean }> {
    const { data: upload } = await this.supabaseService.client
      .from('csv_uploads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    // Delete directly from Supabase fact table using the new column
    await this.supabaseService.client
      .from('fact_cross_channel_transactions')
      .delete()
      .eq('csv_upload_id', id);

    // Clear from staging DB and upload history
    await this.transactionModel.deleteMany({ csvUploadId: id }).exec();
    await this.supabaseService.client.from('csv_uploads').delete().eq('id', id);

    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Deleted Uploaded Dataset',
      module: 'data_ingestion',
      category: 'workflow',
      target: upload?.filename || id,
      status: 'success',
      stateBefore: 'Active',
      stateAfter: 'Deleted',
      metadata: {
        uploadId: id,
        filename: upload?.filename,
        channel: upload?.channel,
        recordCount: upload?.record_count,
        totalRevenue: upload?.total_revenue,
      },
    });

    return { deleted: true };
  }

  async getMetrics(): Promise<any> {
    const { data: uploads } = await this.supabaseService.client
      .from('csv_uploads')
      .select('id');
    const [channelAgg, totalAgg] = await Promise.all([
      this.transactionModel.aggregate([
        {
          $group: {
            _id: '$channel',
            count: { $sum: 1 },
            revenue: { $sum: '$netSales' },
          },
        },
      ], { allowDiskUse: true }).allowDiskUse(true),
      this.transactionModel.aggregate([
        {
          $group: {
            _id: '$transactionId',
            txQuantity: { $sum: '$quantity' },
            txRevenue: { $sum: '$netSales' },
            txLineItems: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalRecords: { $sum: '$txLineItems' },
            totalQuantity: { $sum: '$txQuantity' },
            totalRevenue: { $sum: '$txRevenue' },
          },
        },
      ], { allowDiskUse: true }).allowDiskUse(true),
    ]);

    const totals = totalAgg[0] || {
      totalRecords: 0,
      totalTransactions: 0,
      totalQuantity: 0,
      totalRevenue: 0,
    };
    const channels: Record<string, { count: number; revenue: number }> = {};
    channelAgg.forEach((c: any) => {
      channels[c._id] = {
        count: c.count,
        revenue: Math.round(c.revenue * 100) / 100,
      };
    });

    return {
      totalRecords: totals.totalRecords || 0,
      totalTransactions:
        typeof totals.totalTransactions === 'number'
          ? totals.totalTransactions
          : Array.isArray(totals.totalTransactions)
          ? totals.totalTransactions.length
          : 0,
      totalQuantity: totals.totalQuantity || 0,
      totalRevenue: Math.round((totals.totalRevenue || 0) * 100) / 100,
      channels,
      uploadCount: uploads ? uploads.length : 0,
    };
  }
}
