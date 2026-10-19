import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction } from './schemas/transaction.schema';
import {
  HolidayCache,
  HolidayCacheDocument,
} from '../context/schemas/holiday-cache.schema';
import {
  WeatherLog,
  WeatherLogDocument,
} from '../context/schemas/weather-log.schema';
import { ExogenousDataService } from '../common/exogenous-data.service';
import { AwsService } from '../aws/aws.service';

@Injectable()
export class EtlService {
  private readonly logger = new Logger(EtlService.name);
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    @Optional()
    @InjectModel(HolidayCache.name)
    private holidayCacheModel: Model<HolidayCacheDocument>,
    @Optional()
    @InjectModel(WeatherLog.name)
    private weatherLogModel: Model<WeatherLogDocument>,
    private exogenousDataService: ExogenousDataService,
    private awsService: AwsService,
  ) {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // -----------------------------
  // Helpers
  // -----------------------------

  private getLocalDateString(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDateId(date: Date): number {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return Number(`${year}${month}${day}`);
  }

  private getIsoDayOfWeek(date: Date): number {
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  private getWeekOfYear(date: Date): number {
    const tempDate = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = tempDate.getUTCDay() || 7;
    tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
    return Math.ceil(
      ((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
  }

  private getSeason(month: number): string {
    if ([12, 1, 2, 3, 4, 5].includes(month)) return 'Dry Season';
    return 'Wet Season';
  }

  private normalizeChannel(sourcePlatform: string) {
    const platform = String(sourcePlatform || '').toLowerCase();
    if (platform.includes('shopee'))
      return {
        channel_id: 'CH_SHOPEE',
        channel_name: 'Shopee',
        channel_type: 'E-Commerce',
      };
    if (platform.includes('tiktok'))
      return {
        channel_id: 'CH_TIKTOK',
        channel_name: 'TikTok Shop',
        channel_type: 'E-Commerce',
      };
    if (platform.includes('pethub'))
      return {
        channel_id: 'CH_PETHUB',
        channel_name: 'PetHub',
        channel_type: 'Internal Digital Platform',
      };
    return {
      channel_id: 'CH_POS',
      channel_name: 'POS',
      channel_type: 'Physical Store',
    };
  }

  private normalizeSegment(sector: string) {
    const name = String(sector || 'Retail').toLowerCase();
    if (name.includes('service') || name.includes('grooming'))
      return {
        segment_id: 'SEG_SERVICE',
        segment_name: 'Service',
        segment_type: 'Service',
      };
    if (name.includes('cafe') || name.includes('food'))
      return {
        segment_id: 'SEG_CAFE',
        segment_name: 'Cafe',
        segment_type: 'Food and Beverage',
      };
    return {
      segment_id: 'SEG_RETAIL',
      segment_name: 'Retail',
      segment_type: 'Product',
    };
  }

  // -----------------------------
  // Main Processor (Bulk)
  // -----------------------------
  async processTransactions(transactions: Transaction[], uploadId?: string) {
    // Omit PetHub transactions from ETL
    transactions = (transactions || []).filter(
      (t) =>
        t.channel !== 'PetHub' &&
        !String(t.channel || '').toLowerCase().includes('pethub'),
    );

    if (transactions.length === 0) {
      this.logger.log(
        'All transactions in ETL batch are PetHub and have been omitted from data warehouse.',
      );
      return;
    }

    this.logger.log(
      `Starting bulk ETL to Supabase for ${transactions.length} transactions...`,
    );

    try {
      const datesMap = new Map<number, any>();
      const channelsMap = new Map<string, any>();
      const segmentsMap = new Map<string, any>();
      const productsMap = new Map<string, any>();
      const servicesMap = new Map<string, any>();
      const factRows: any[] = [];

      // Pre-fetch all holidays and weather for the dates in the transaction batch to avoid 1x1 mongo queries
      const uniqueDateStrings = new Set<string>();
      for (const t of transactions) {
        const orderDate = new Date(t.date);
        uniqueDateStrings.add(this.getLocalDateString(orderDate));

        const dateBefore = new Date(orderDate);
        dateBefore.setDate(dateBefore.getDate() - 1);
        uniqueDateStrings.add(this.getLocalDateString(dateBefore));

        const dateAfter = new Date(orderDate);
        dateAfter.setDate(dateAfter.getDate() + 1);
        uniqueDateStrings.add(this.getLocalDateString(dateAfter));
      }

      const dateArray = Array.from(uniqueDateStrings).sort();
      const minDate = dateArray[0];
      const maxDate = dateArray[dateArray.length - 1];

      // Pre-fetch/cache weather logs using ExogenousDataService
      const defaultCoords = this.exogenousDataService.getDefaultCoordinates();
      this.logger.log(
        `Pre-population: Ingesting weather from ${minDate} to ${maxDate}...`,
      );
      const weatherRecords =
        await this.exogenousDataService.fetchWeatherHistory(
          defaultCoords.lat,
          defaultCoords.lng,
          minDate,
          maxDate,
        );
      const weatherMap = new Map(weatherRecords.map((w) => [w.date, w]));

      // Pre-fetch/cache holidays using ExogenousDataService
      this.logger.log(`Pre-population: Ingesting holidays...`);
      const startYear = new Date(minDate).getFullYear();
      const endYear = new Date(maxDate).getFullYear();
      const holidayRecords: any[] = [];
      for (let y = startYear; y <= endYear; y++) {
        const yearHols = await this.exogenousDataService.fetchHolidayHistory(y);
        holidayRecords.push(...yearHols);
      }
      const holidayMap = new Map(holidayRecords.map((h) => [h.date, h]));

      this.logger.log(`Aggregating dimensions in memory...`);
      for (let i = 0; i < transactions.length; i++) {
        const t = transactions[i];

        // Channel
        const channel = this.normalizeChannel(t.channel);
        if (!channelsMap.has(channel.channel_id)) {
          channelsMap.set(channel.channel_id, channel);
        }

        // Segment
        const segment = this.normalizeSegment(t.sector);
        if (!segmentsMap.has(segment.segment_id)) {
          segmentsMap.set(segment.segment_id, segment);
        }

        // Date
        const orderDate = new Date(t.date);
        const dateId = this.getDateId(orderDate);
        if (!datesMap.has(dateId)) {
          const dateString = this.getLocalDateString(orderDate);

          const dateBefore = new Date(orderDate);
          dateBefore.setDate(dateBefore.getDate() - 1);
          const dateBeforeString = this.getLocalDateString(dateBefore);

          const dateAfter = new Date(orderDate);
          dateAfter.setDate(dateAfter.getDate() + 1);
          const dateAfterString = this.getLocalDateString(dateAfter);

          const holiday = holidayMap.get(dateString);
          const dayBeforeHoliday = holidayMap.get(dateBeforeString);
          const dayAfterHoliday = holidayMap.get(dateAfterString);

          const dayOfWeek = this.getIsoDayOfWeek(orderDate);
          const month = orderDate.getMonth() + 1;

          const weather = weatherMap.get(dateString);

          datesMap.set(dateId, {
            date_id: dateId,
            full_date: this.getLocalDateString(orderDate),
            day_of_week: dayOfWeek,
            day_name: orderDate.toLocaleDateString('en-US', {
              weekday: 'long',
            }),
            week_of_year: this.getWeekOfYear(orderDate),
            month,
            month_name: orderDate.toLocaleDateString('en-US', {
              month: 'long',
            }),
            quarter: Math.ceil(month / 3),
            year: orderDate.getFullYear(),
            is_weekend: dayOfWeek === 6 || dayOfWeek === 7,
            is_holiday: !!holiday,
            day_before_holiday: !!dayBeforeHoliday,
            day_after_holiday: !!dayAfterHoliday,
            holiday_name: holiday ? holiday.name : null,
            season: this.getSeason(month),
            avg_temperature_celsius: weather ? weather.tempCelsius : 28,
            rainfall_mm: weather ? weather.rainfallMm : 0,
            relative_humidity: weather ? weather.relativeHumidity : 60,
          });
        }

        // Product / Service
        const syntheticId = crypto
          .createHash('md5')
          .update((t.productName || '').trim().toLowerCase())
          .digest('hex')
          .substring(0, 16);
        let productId: string | null = null;
        let serviceId: string | null = null;

        if (segment.segment_type === 'Service') {
          serviceId = `SRV_${syntheticId}`;
          if (!servicesMap.has(serviceId)) {
            servicesMap.set(serviceId, {
              service_id: serviceId,
              service_name: t.productName
                ? t.productName.trim()
                : 'Unnamed Service',
              service_type: t.category || 'Uncategorized',
              base_price: Number(t.unitPrice || 0),
            });
          }
        } else {
          productId = `PRD_${syntheticId}`;
          if (!productsMap.has(productId)) {
            productsMap.set(productId, {
              product_id: productId,
              sku: t.sku ? t.sku.toUpperCase().trim() : null,
              product_name: t.productName
                ? t.productName.trim()
                : 'Unnamed Product',
              category: t.category || 'Uncategorized',
              brand: null,
              unit_cost: 0,
              selling_price: Number(t.unitPrice || 0),
            });
          }
        }

        // Fact Row
        const transactionLineId = `${t.transactionId}-${productId || serviceId}-${i + 1}`;
        const grossVal = Number(t.totalAmount || 0);
        const discountVal = Math.min(Number(t.discount || 0), grossVal);
        const discountDepth = grossVal > 0 ? discountVal / grossVal : 0;

        factRows.push({
          transaction_line_id: transactionLineId,
          transaction_id: t.transactionId,
          source_order_id: null,
          transaction_timestamp: new Date(t.date).toISOString(),
          date_id: dateId,
          product_id: productId,
          customer_id: null,
          channel_id: channel.channel_id,
          service_id: serviceId,
          campaign_id: null,
          segment_id: segment.segment_id,
          quantity_sold: Number(t.quantity || 0),
          gross_sales: grossVal,
          discount_amount: discountVal,
          net_sales: Number(t.netSales || 0),
          order_status: 'completed',
          source_system: channel.channel_name,
          cost_of_goods: Number(t.costOfGoods || 0),
          gross_profit: Number(t.grossProfit || 0),
          margin: Number(t.margin || 0),
          refunds: Number(t.refunds || 0),
          discount_depth: discountDepth,
          payment_type: t.paymentType || 'Cash',
          csv_upload_id: (t as any).csvUploadId || null,
        });
      }

      this.logger.log(`Upserting Dimensions...`);

      // Helper to chunk arrays for bulk upsert
      const chunkArray = (array: any[], size: number) => {
        const chunks: any[][] = [];
        for (let i = 0; i < array.length; i += size)
          chunks.push(array.slice(i, i + size));
        return chunks;
      };

      const upsertTable = async (
        table: string,
        data: any[],
        conflictKey: string,
      ) => {
        if (data.length === 0) return;
        const chunks = chunkArray(data, 2000); // 2000 per request
        for (const chunk of chunks) {
          const { error } = await this.supabase
            .from(table)
            .upsert(chunk, { onConflict: conflictKey });
          if (error)
            throw new Error(`${table} bulk upsert failed: ${error.message}`);
        }
      };

      // SCD Type 2 Product Dimension Handling
      const productsToIngest = Array.from(productsMap.values());
      const finalProductsToInsert: any[] = [];
      if (productsToIngest.length > 0) {
        const productIds = productsToIngest.map((p) => p.product_id);
        const { data: existingProducts, error: fetchErr } = await this.supabase
          .from('product_dim')
          .select('*')
          .in('product_id', productIds);

        if (fetchErr) {
          this.logger.error(
            `Failed to fetch existing products for SCD: ${fetchErr.message}`,
          );
        }

        const existingProductsMap = new Map<string, any[]>();
        if (existingProducts) {
          for (const ep of existingProducts) {
            const list = existingProductsMap.get(ep.product_id) || [];
            list.push(ep);
            existingProductsMap.set(ep.product_id, list);
          }
        }

        for (const p of productsToIngest) {
          const versions = existingProductsMap.get(p.product_id);
          if (!versions || versions.length === 0) {
            finalProductsToInsert.push({
              ...p,
              valid_from: new Date().toISOString(),
              valid_to: null,
              is_current: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          } else {
            const currentVersion = versions.find(
              (v) => v.is_current === true || v.valid_to === null,
            );
            if (currentVersion) {
              if (
                Number(currentVersion.selling_price) !== Number(p.selling_price)
              ) {
                // Price changed! Versioning.
                // 1. Close current version
                await this.supabase
                  .from('product_dim')
                  .update({
                    is_current: false,
                    valid_to: new Date().toISOString(),
                  })
                  .eq('product_id', p.product_id)
                  .eq('valid_from', currentVersion.valid_from);

                // 2. Insert new version
                finalProductsToInsert.push({
                  ...p,
                  valid_from: new Date().toISOString(),
                  valid_to: null,
                  is_current: true,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
              } else {
                finalProductsToInsert.push({
                  ...currentVersion,
                  sku: p.sku || currentVersion.sku,
                  category: p.category || currentVersion.category,
                  product_name: p.product_name || currentVersion.product_name,
                  updated_at: new Date().toISOString(),
                });
              }
            } else {
              finalProductsToInsert.push({
                ...p,
                valid_from: new Date().toISOString(),
                valid_to: null,
                is_current: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
      }

      await Promise.all([
        upsertTable('date_dim', Array.from(datesMap.values()), 'date_id'),
        upsertTable(
          'channel_dim',
          Array.from(channelsMap.values()),
          'channel_id',
        ),
        upsertTable(
          'business_segment_dim',
          Array.from(segmentsMap.values()),
          'segment_id',
        ),
        upsertTable(
          'service_dim',
          Array.from(servicesMap.values()),
          'service_id',
        ),
      ]);

      if (finalProductsToInsert.length > 0) {
        await upsertTable(
          'product_dim',
          finalProductsToInsert,
          'product_id,valid_from',
        );
      }

      this.logger.log(`Upserting ${factRows.length} Fact Rows in chunks...`);
      await upsertTable(
        'fact_cross_channel_transactions',
        factRows,
        'transaction_line_id',
      );

      this.logger.log(
        `ETL Process completed successfully for ${transactions.length} transactions.`,
      );

      // Archive processed fact rows to AWS S3 Data Lake (fire-and-forget)
      if (uploadId) {
        const channel = transactions[0]?.channel || 'unknown';
        this.awsService
          .uploadProcessedArchive(uploadId, factRows, channel)
          .catch((err) => {
            this.logger.warn(
              `S3 processed archive failed for upload ${uploadId}: ${err}`,
            );
          });
      }

      if (uploadId) {
        await this.supabase
          .from('csv_uploads')
          .update({
            etl_report: {
              stage2_droppedCount: 0,
              stage2_dropReasons: [],
            },
          })
          .eq('id', uploadId);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Critical ETL Failure: ${errMsg}`);

      if (uploadId) {
        await this.supabase
          .from('csv_uploads')
          .update({
            etl_report: {
              stage2_droppedCount: transactions.length,
              stage2_dropReasons: [`Supabase Error: ${errMsg}`],
            },
          })
          .eq('id', uploadId);
      }
    }
  }

  /**
   * Deletes transactions from Supabase fact tables.
   * This is used when a CSV upload is deleted from the system or when a rollback occurs.
   * We chunk the deletes to avoid URL length limits.
   */
  async deleteTransactions(transactionIds: string[]): Promise<void> {
    if (!transactionIds || transactionIds.length === 0) return;

    this.logger.log(
      `Deleting ${transactionIds.length} transactions from Supabase...`,
    );
    const chunkSize = 1000;

    for (let i = 0; i < transactionIds.length; i += chunkSize) {
      const chunk = transactionIds.slice(i, i + chunkSize);

      try {
        const { error } = await this.supabase
          .from('fact_cross_channel_transactions')
          .delete()
          .in('transaction_id', chunk);

        if (error) {
          this.logger.error(
            `Error deleting chunk from Supabase: ${error.message}`,
          );
        }
      } catch (err: any) {
        this.logger.error(`Exception during Supabase delete: ${err.message}`);
      }
    }

    this.logger.log(`Finished deleting transactions from Supabase.`);
  }
}
