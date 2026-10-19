import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema, Types } from 'mongoose';

export type MfaEnrollmentRateLimitRecord = {
  _id: Types.ObjectId;
  scope: 'account' | 'ip';
  key: string;
  windowStartedAt: Date;
  attempts: number;
  expiresAt: Date;
};

export const MfaEnrollmentRateLimitSchema = new Schema<MfaEnrollmentRateLimitRecord>(
  {
    scope: { type: String, enum: ['account', 'ip'], required: true },
    key: { type: String, required: true },
    windowStartedAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'mfa_enrollment_rate_limits', versionKey: false },
);

MfaEnrollmentRateLimitSchema.index({ scope: 1, key: 1, windowStartedAt: 1 }, { unique: true });
MfaEnrollmentRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const WINDOW_MS = 10 * 60 * 1000;
const ACCOUNT_LIMIT = 5;
const IP_LIMIT = 10;
const RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Durable MFA enrollment verification throttling. MongoDB makes counters
 * consistent across backend instances; no per-process memory is relied upon.
 */
@Injectable()
export class MfaEnrollmentRateLimitService {
  constructor(
    @InjectModel('MfaEnrollmentRateLimit')
    private readonly records: Model<MfaEnrollmentRateLimitRecord>,
  ) {}

  async assertAllowed(accountId: string, clientIp: string) {
    const [account, ip] = await Promise.all([
      this.consume('account', accountId, ACCOUNT_LIMIT),
      this.consume('ip', clientIp || 'unknown', IP_LIMIT),
    ]);

    if (!account || !ip) {
      throw new HttpException(
        'Too many verification attempts. Please wait before trying again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async consume(scope: 'account' | 'ip', key: string, limit: number) {
    const now = new Date();
    const windowStartedAt = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);

    try {
      const record = await this.records.findOneAndUpdate(
        { scope, key, windowStartedAt },
        {
          $inc: { attempts: 1 },
          $setOnInsert: { expiresAt: new Date(now.getTime() + RECORD_RETENTION_MS) },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      return Boolean(record && record.attempts <= limit);
    } catch {
      // A sensitive authenticator-verification operation must fail closed if
      // the shared limiter cannot record an attempt.
      throw new ServiceUnavailableException('Verification is temporarily unavailable. Please try again later.');
    }
  }
}
