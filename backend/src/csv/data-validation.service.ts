import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { z } from 'zod';
import { Transaction } from './schemas/transaction.schema';

const transactionSchema = z.object({
  date: z.date({
    message: 'Invalid date format',
  }),
  transactionId: z.string().min(1, 'Transaction ID cannot be empty'),
  productName: z.string().min(1, 'Product Name cannot be empty'),
  sku: z.string().optional().nullable(),
  category: z.string().min(1, 'Category cannot be empty'),
  sector: z.enum(['Cafe', 'Retail', 'Services', 'Uncategorized'], {
    message: 'Invalid sector',
  }),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().min(0, 'Unit Price cannot be negative'),
  totalAmount: z.number().min(0, 'Total Amount cannot be negative'),
  discount: z
    .number()
    .min(0, 'Discount cannot be negative')
    .optional()
    .default(0),
  netSales: z.number().min(0, 'Net Sales cannot be negative'),
  channel: z.string().min(1, 'Channel is required'),
  paymentType: z.string().optional().nullable(),
});

@Injectable()
export class DataValidationService {
  private readonly logger = new Logger(DataValidationService.name);

  validateBatch(transactions: Partial<Transaction>[], channel: string) {
    if (!transactions || transactions.length === 0) {
      throw new BadRequestException('Upload contains no valid transactions.');
    }

    const cleanedTransactions: Partial<Transaction>[] = [];
    const stage1_dropReasons: string[] = [];
    let stage1_droppedCount = 0;
    let stage1_duplicateCount = 0;
    let missingOptionalFields = 0;
    let totalRevenue = 0;

    const uniqueHashes = new Set<string>();

    for (let i = 0; i < transactions.length; i++) {
      const row = transactions[i];

      // 1. Whitespace handling & Null Columns
      const stringFields = [
        'transactionId',
        'productName',
        'sku',
        'category',
        'sector',
        'channel',
        'paymentType',
      ] as const;
      for (const field of stringFields) {
        if (typeof row[field] === 'string') {
          const val = row[field].trim();
          if (val === '' || val.toLowerCase() === 'null') {
            (row as any)[field] = null;
          } else {
            (row as any)[field] = val;
          }
        }
      }

      // 2. Case sensitivity standardization (e.g. COFFEE -> Coffee)
      if (typeof row.category === 'string') {
        row.category =
          row.category.charAt(0).toUpperCase() +
          row.category.slice(1).toLowerCase();
      }
      if (typeof row.sector === 'string') {
        row.sector =
          row.sector.charAt(0).toUpperCase() +
          row.sector.slice(1).toLowerCase();
      }
      if (typeof row.productName === 'string') {
        row.productName = row.productName
          .split(/\s+/)
          .map((w) =>
            w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '',
          )
          .join(' ')
          .trim();
      }

      const result = transactionSchema.safeParse(row);

      if (!result.success) {
        stage1_droppedCount++;
        const rowErrors = result.error.issues
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');

        // Stop collecting huge strings of reasons after 50 to prevent DB bloat
        if (stage1_dropReasons.length < 50) {
          stage1_dropReasons.push(
            `Row ${i + 1} (Tx: ${row.transactionId || 'Unknown'}): ${rowErrors}`,
          );
        } else if (stage1_dropReasons.length === 50) {
          stage1_dropReasons.push(`...and more errors not shown.`);
        }
        continue; // Drop the row
      }

      // Duplicate Check
      // Hash based on Transaction ID + Date + Product + Quantity to uniquely identify a line item
      const dateStr = row.date ? new Date(row.date).toISOString() : '';
      const rowHash = `${row.transactionId}_${dateStr}_${row.productName}_${row.quantity}`;

      if (uniqueHashes.has(rowHash)) {
        stage1_duplicateCount++;
        if (stage1_dropReasons.length < 50) {
          stage1_dropReasons.push(
            `Row ${i + 1} (Tx: ${row.transactionId}): Exact Duplicate Dropped`,
          );
        }
        continue; // Drop the duplicate
      }
      uniqueHashes.add(rowHash);

      // Passed all checks!
      cleanedTransactions.push(row);
      if (!row.sku) missingOptionalFields++;
      if (!row.paymentType) missingOptionalFields++;
      totalRevenue += row.netSales || 0;
    }

    if (cleanedTransactions.length === 0) {
      throw new BadRequestException(
        `Data Validation Failed! Every single row was invalid or duplicate.\nSample Errors:\n${stage1_dropReasons.slice(0, 10).join('\n')}`,
      );
    }

    // Completeness Check
    const totalOptionalFields = cleanedTransactions.length * 2; // sku + paymentType
    const missingPercentage =
      (missingOptionalFields / totalOptionalFields) * 100;
    if (missingPercentage > 95) {
      this.logger.warn(
        `Completeness Warning: ${missingPercentage.toFixed(
          2,
        )}% of optional fields (SKU/PaymentType) are missing in this batch.`,
      );
    }

    // Distribution Drift Check
    if (cleanedTransactions.length > 150000 && channel !== 'POS') {
      this.logger.warn(
        `Drift Warning: Unusually high transaction volume for ${channel} (${cleanedTransactions.length} rows) detected.`,
      );
    }

    const averageOrderValue =
      cleanedTransactions.length > 0
        ? totalRevenue / cleanedTransactions.length
        : 0;
    if (averageOrderValue > 10000) {
      this.logger.warn(
        `Drift Warning: Unusually high average order value (₱${averageOrderValue.toFixed(2)}) detected.`,
      );
    }

    this.logger.log(
      `Data Validation Finished. Processed: ${transactions.length}, Valid: ${cleanedTransactions.length}, Dropped: ${stage1_droppedCount}, Duplicates: ${stage1_duplicateCount}`,
    );

    return {
      cleanedTransactions,
      report: {
        stage1_droppedCount,
        stage1_duplicateCount,
        stage1_dropReasons,
      },
    };
  }
}
