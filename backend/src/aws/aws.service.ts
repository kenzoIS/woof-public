import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import * as crypto from 'crypto';

const BUCKET_NAME = 'woof-data-lake-lucena-prod-1786959360';
const REGION = 'ap-southeast-2';
const DEFAULT_PROFILE = 'woof-prod';

/**
 * AwsService handles all S3 Data Lake archiving operations.
 *
 * Three archive layers:
 *   s3://BUCKET/raw/         — Original CSV buffers & raw JSON payloads
 *   s3://BUCKET/processed/   — Cleaned ETL fact rows (post-Supabase)
 *   s3://BUCKET/analytics/   — Forecast results, cross-sell caches, reports
 *
 * Authentication uses the local AWS CLI profile "woof-prod" which was set up
 * via `aws login --profile woof-prod`. Credentials rotate every 12 hours
 * and can be silently renewed for 90 days.
 */
@Injectable()
export class AwsService {
  private readonly logger = new Logger(AwsService.name);
  private readonly s3?: S3Client;
  private readonly enabled: boolean;

  constructor() {
    let credentialsProvider: any;
    const profile = process.env.AWS_PROFILE?.trim();

    // Check if long-lived IAM keys are present in .env
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      credentialsProvider = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    } else if (profile) {
      // Fallback to the SSO/profile credentials configured by AWS CLI.
      credentialsProvider = fromIni({ profile });
    }

    this.enabled = Boolean(credentialsProvider);

    if (!this.enabled) {
      this.logger.warn(
        `AWS S3 archiving disabled. Set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or AWS_PROFILE=${DEFAULT_PROFILE} to enable it.`,
      );
      return;
    }

    this.s3 = new S3Client({
      region: REGION,
      credentials: credentialsProvider,
    });
  }

  // ----------------------------------------------------------------
  // Health check
  // ----------------------------------------------------------------

  async verifyConnection(): Promise<boolean> {
    if (!this.s3) return false;

    try {
      await this.s3.send(new ListBucketsCommand({}));
      this.logger.log('AWS S3 connection verified.');
      return true;
    } catch (error) {
      this.logger.warn(
        `AWS S3 connection failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  // ----------------------------------------------------------------
  // Raw Layer — original file buffers before any processing
  // ----------------------------------------------------------------

  async uploadRawArchive(
    filename: string,
    buffer: Buffer,
    channel: string,
    uploadId: string,
  ): Promise<string | null> {
    const date = new Date();
    const datePrefix = this.datePath(date);
    const safeFilename = this.sanitizeFilename(filename);
    const key = `raw/${datePrefix}/${channel}/${uploadId}_${safeFilename}`;
    return this.putObject(key, buffer, this.mimeForFilename(filename));
  }

  // ----------------------------------------------------------------
  // Processed Layer — cleaned ETL data that was inserted into Supabase
  // ----------------------------------------------------------------

  async uploadProcessedArchive(
    uploadId: string,
    factRows: Record<string, unknown>[],
    channel: string,
  ): Promise<string | null> {
    const date = new Date();
    const datePrefix = this.datePath(date);
    const key = `processed/${datePrefix}/${channel}/${uploadId}_fact_rows.json`;
    const body = JSON.stringify(factRows, null, 2);
    return this.putObject(key, Buffer.from(body, 'utf-8'), 'application/json');
  }

  // ----------------------------------------------------------------
  // Analytics Layer — forecast outputs, cross-sell caches, reports
  // ----------------------------------------------------------------

  async uploadAnalyticsArchive(
    type:
      | 'forecast'
      | 'cross-sell'
      | 'smart-report'
      | 'dynamic-promo'
      | 'feedback'
      | 'recalibration',
    module: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const date = new Date();
    const datePrefix = this.datePath(date);
    const timestamp = date.toISOString().replace(/[:.]/g, '-');
    const key = `analytics/${datePrefix}/${type}/${module}_${timestamp}.json`;
    const body = JSON.stringify(payload, null, 2);
    return this.putObject(key, Buffer.from(body, 'utf-8'), 'application/json');
  }

  async uploadFeedbackArchive(
    promotionType: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    return this.uploadAnalyticsArchive(
      'feedback',
      promotionType || 'general',
      payload,
    );
  }

  async uploadRecalibrationArchive(
    module: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    return this.uploadAnalyticsArchive(
      'recalibration',
      module || 'system',
      payload,
    );
  }

  // ----------------------------------------------------------------
  // Audit Logs Archival Layer — 10+ day retention offload
  // ----------------------------------------------------------------

  async uploadAuditArchive(
    dateStr: string,
    records: Record<string, unknown>[],
    sha256: string,
  ): Promise<{ uri: string; key: string } | null> {
    if (!this.s3) return null;
    const [year, month] = dateStr.split('-');
    const key = `audit-archives/${year || '2026'}/${month || '10'}/audit_logs_${dateStr}.json`;
    const body = Buffer.from(JSON.stringify(records, null, 2), 'utf-8');

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: 'application/json',
          Metadata: {
            'record-count': String(records.length),
            'sha256': sha256,
          },
          ServerSideEncryption: 'AES256',
        }),
      );
      const uri = `s3://${BUCKET_NAME}/${key}`;
      this.logger.log(`Archived ${records.length} audit logs to ${uri} (${this.humanSize(body.length)})`);
      return { uri, key };
    } catch (error) {
      this.logger.error(
        `Failed to archive audit logs to S3 (${key}): ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async verifyAuditArchive(
    key: string,
    expectedCount: number,
    expectedSha256: string,
  ): Promise<boolean> {
    if (!this.s3) return false;
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        }),
      );
      if (!head.ContentLength || head.ContentLength <= 0) {
        this.logger.warn(`S3 archive verification failed: empty file for ${key}`);
        return false;
      }
      const metadataSha = head.Metadata?.['sha256'] || head.Metadata?.['sha-256'];
      if (metadataSha && metadataSha.toLowerCase() !== expectedSha256.toLowerCase()) {
        this.logger.warn(`S3 archive checksum mismatch for ${key}: expected ${expectedSha256}, got ${metadataSha}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to verify S3 archive ${key}: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  async getAuditArchive(key: string): Promise<Record<string, unknown>[] | null> {
    if (!this.s3) return null;
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        }),
      );
      if (!response.Body) return null;
      const str = await response.Body.transformToString('utf-8');
      return JSON.parse(str);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch S3 archive ${key}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async listAuditArchives(): Promise<{ key: string; size: number; lastModified?: Date }[]> {
    if (!this.s3) return [];
    try {
      const response = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: 'audit-archives/',
        }),
      );
      return (response.Contents || []).map((c) => ({
        key: c.Key || '',
        size: c.Size || 0,
        lastModified: c.LastModified,
      }));
    } catch (error) {
      this.logger.warn(
        `Failed to list S3 audit archives: ${error instanceof Error ? error.message : error}`,
      );
      return [];
    }
  }

  // ----------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------

  private async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string | null> {
    if (!this.s3) return null;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      const uri = `s3://${BUCKET_NAME}/${key}`;
      this.logger.log(`Archived to ${uri} (${this.humanSize(body.length)})`);
      return uri;
    } catch (error) {
      this.logger.warn(
        `S3 archive failed for ${key}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private datePath(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private mimeForFilename(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'csv') return 'text/csv';
    if (ext === 'xlsx' || ext === 'xls')
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return 'application/octet-stream';
  }

  private humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
