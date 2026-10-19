import { BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsService } from '../analytics/analytics.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { EtlService } from '../csv/etl.service';
import {
  Transaction,
  TransactionDocument,
} from '../csv/schemas/transaction.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { AwsService } from '../aws/aws.service';

type PetHubWebhookItem = {
  itemId?: string;
  name?: string;
  sku?: string;
  category?: string;
  sector?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  grossAmount?: number | string;
  discountAmount?: number | string;
  netAmount?: number | string;
};

type PetHubWebhookPayload = {
  event?: string;
  source?: string;
  transactionId?: string;
  transactionType?: string;
  orderId?: string;
  bookingId?: string;
  completedAt?: string;
  customerId?: string;
  customerName?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
  items?: PetHubWebhookItem[];
  totals?: {
    grossAmount?: number | string;
    discountAmount?: number | string;
    netAmount?: number | string;
    quantity?: number | string;
  };
};

@Injectable()
export class PetHubWebhookService {
  private readonly logger = new Logger(PetHubWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
    private readonly etlService: EtlService,
    private readonly analyticsService: AnalyticsService,
    private readonly realtimeService: RealtimeService,
    private readonly awsService: AwsService,
    @Optional()
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async receiveCompletedTransaction(payload: unknown, incomingSecret?: string) {
    throw new ForbiddenException(
      'PetHub data ingestion webhook has been permanently disabled. Incoming data is rejected.',
    );
  }

  private assertWebhookSecret(incomingSecret?: string) {
    const expectedSecret = this.configService
      .get<string>('PETHUB_WEBHOOK_SECRET')
      ?.trim();
    if (!expectedSecret) {
      throw new UnauthorizedException(
        'PETHUB_WEBHOOK_SECRET is not configured',
      );
    }
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid PetHub webhook secret');
    }
  }

  private validatePayload(payload: unknown): Required<PetHubWebhookPayload> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Webhook payload must be an object');
    }

    const body = payload as PetHubWebhookPayload;
    if (body.event !== 'pethub.transaction.completed') {
      throw new BadRequestException('Unsupported PetHub webhook event');
    }
    if (!body.transactionId || typeof body.transactionId !== 'string') {
      throw new BadRequestException('transactionId is required');
    }
    if (
      !body.completedAt ||
      Number.isNaN(new Date(body.completedAt).getTime())
    ) {
      throw new BadRequestException(
        'completedAt must be a valid ISO timestamp',
      );
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('items must contain at least one item');
    }

    return {
      event: body.event,
      source: body.source || 'PetHub',
      transactionId: body.transactionId,
      transactionType: body.transactionType || 'transaction',
      orderId: body.orderId || '',
      bookingId: body.bookingId || '',
      completedAt: body.completedAt,
      customerId: body.customerId || '',
      customerName: body.customerName || '',
      paymentMethod: body.paymentMethod || '',
      paymentStatus: body.paymentStatus || '',
      status: body.status || '',
      items: body.items,
      totals: body.totals || {},
    };
  }

  private mapPayloadToTransactions(
    body: Required<PetHubWebhookPayload>,
  ): Partial<Transaction>[] {
    const completedAt = new Date(body.completedAt);

    return body.items.map((item, index) => {
      const quantity = Math.max(1, this.toNumber(item.quantity, 1));
      const unitPrice = this.toNumber(item.unitPrice);
      const grossAmount = this.toNumber(item.grossAmount, unitPrice * quantity);
      const discount = this.toNumber(item.discountAmount);
      const netSales = this.toNumber(item.netAmount, grossAmount - discount);
      const category = this.safeString(item.category, 'PetHub');
      const sector = this.normalizeSector(item.sector, category);
      const productName = this.safeString(
        item.name,
        body.transactionType === 'booking' ? 'PetHub Booking' : 'PetHub Order',
      );

      return {
        csvUploadId: '',
        date: completedAt,
        transactionId: body.transactionId,
        productName,
        sku: this.safeString(
          item.sku,
          item.itemId || `${body.transactionId}-${index + 1}`,
        ),
        category,
        sector,
        quantity,
        unitPrice: unitPrice || netSales / quantity,
        totalAmount: grossAmount || netSales,
        discount,
        netSales,
        channel: 'PetHub',
        paymentType: this.safeString(body.paymentMethod, 'PetHub'),
        costOfGoods: 0,
        grossProfit: netSales,
        margin: netSales > 0 ? 100 : 0,
        refunds: 0,
        itemsRefunded: 0,
      };
    });
  }

  private async createUploadAuditRow(
    body: Required<PetHubWebhookPayload>,
    transactions: Partial<Transaction>[],
  ) {
    const totalRevenue = transactions.reduce(
      (sum, transaction) => sum + this.toNumber(transaction.netSales),
      0,
    );
    const totalQuantity = transactions.reduce(
      (sum, transaction) => sum + this.toNumber(transaction.quantity),
      0,
    );
    const categories = [
      ...new Set(
        transactions
          .map((transaction) => transaction.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ];

    const { data, error } = await this.supabaseService.client
      .from('csv_uploads')
      .insert({
        filename: `PetHub webhook ${body.transactionId}`,
        channel: 'PetHub',
        purpose: 'pethub-webhook',
        record_count: transactions.length,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_quantity: totalQuantity,
        total_transactions: 1,
        categories,
        uploaded_at: new Date().toISOString(),
        etl_report: {
          source: 'PetHub webhook',
          event: body.event,
          transactionId: body.transactionId,
          transactionType: body.transactionType,
        },
      })
      .select()
      .single();

    if (error || !data) {
      throw new BadRequestException(
        `Failed to create PetHub webhook upload record: ${error?.message || 'No row returned'}`,
      );
    }

    return data;
  }

  private runBackgroundProcessing(
    uploadId: string,
    transactionId: string,
    transactions: Transaction[],
  ) {
    this.realtimeService.emit({
      type: 'etl_started',
      title: 'PetHub warehouse sync started',
      message: `${transactionId} is syncing to Supabase warehouse.`,
      uploadId,
    });

    this.etlService
      .processTransactions(transactions, uploadId)
      .then(() => {
        this.realtimeService.emit({
          type: 'etl_completed',
          title: 'PetHub warehouse sync complete',
          message: `${transactionId} is ready in Supabase warehouse.`,
          uploadId,
        });
      })
      .catch((error) => {
        this.logger.error(
          `PetHub webhook ETL failed for ${transactionId}`,
          error instanceof Error ? error.stack : String(error),
        );
        this.realtimeService.emit({
          type: 'etl_failed',
          title: 'PetHub warehouse sync failed',
          message: error instanceof Error ? error.message : String(error),
          uploadId,
        });
      });

    this.warmForecasts(uploadId, transactionId, transactions);
  }

  private warmForecasts(
    uploadId: string,
    transactionId: string,
    transactions: Transaction[],
  ) {
    const modules = [
      ...new Set(
        transactions
          .map((transaction) => transaction.sector)
          .filter(
            (sector): sector is 'Cafe' | 'Services' =>
              sector === 'Cafe' || sector === 'Services',
          ),
      ),
    ];

    modules.forEach((module) => {
      this.realtimeService.emit({
        type: 'forecast_warmup_started',
        title: 'PetHub forecast precompute started',
        message: `${module} forecast is refreshing after ${transactionId}.`,
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
              `PetHub forecast warmup failed for ${module}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
              }`,
            );
            this.realtimeService.emit({
              type: 'forecast_failed',
              title: 'PetHub forecast precompute failed',
              message:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
              module,
              uploadId,
            });
          } else {
            this.realtimeService.emit({
              type: 'forecast_ready',
              title: 'PetHub forecast ready',
              message: `${module} forecast has been refreshed after ${transactionId}.`,
              module,
              uploadId,
            });
          }
        });
      });
    }, 1000);
  }

  private normalizeSector(value: unknown, category: string): string {
    const raw = this.safeString(value).toLowerCase();
    if (raw === 'cafe' || raw === 'services' || raw === 'retail') {
      return raw === 'services'
        ? 'Services'
        : raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    const normalizedCategory = category.toLowerCase();
    if (/pet menu|pet bakery|cafe|food|drink/.test(normalizedCategory)) {
      return 'Cafe';
    }
    if (
      /groom|boarding|pet hotel|event|service|birthday|general/.test(
        normalizedCategory,
      )
    ) {
      return 'Services';
    }
    return 'Retail';
  }

  private safeString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return '';
  }

  private toNumber(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
}
