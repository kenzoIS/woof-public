import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema } from 'mongoose';
import { createHash } from 'crypto';
import { AuditService } from '../audit/audit.service';

export const DashboardSessionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    userId: String,
    lastActivity: { type: Date, required: true },
    timeoutMinutes: { type: Number, default: 10 },
    revokedAt: Date,
    expiresAt: { type: Date },
  },
  { collection: 'dashboard_sessions', versionKey: false },
);
DashboardSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Persistent revocation and idle deadlines apply equally to website and desktop cookies. */
@Injectable()
export class SessionLifecycleService {
  constructor(
    @InjectModel('DashboardSession')
    private readonly sessions: Model<{
      key: string;
      userId: string;
      lastActivity: Date;
      timeoutMinutes: number;
      revokedAt?: Date;
      expiresAt: Date;
    }>,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private key(token: string) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
      if (typeof payload.session_id === 'string' && payload.session_id)
        return payload.session_id;
    } catch {
      /* Fallback also supports legacy tokens without session_id. */
    }
    return createHash('sha256').update(token).digest('hex');
  }
  async assertActive(token: string, userId: string) {
    const key = this.key(token);
    const now = new Date();
    const record = await this.sessions
      .findOneAndUpdate(
        { key },
        {
          $setOnInsert: {
            key,
            userId,
            lastActivity: now,
            timeoutMinutes: 10,
            expiresAt: new Date(Date.now() + 35 * 86400000),
          },
        },
        { upsert: true, new: true },
      )
      .lean();
    if (!record || record.revokedAt)
      throw new UnauthorizedException('Session ended. Please sign in again.');
    if (
      Date.now() - new Date(record.lastActivity).getTime() >=
      record.timeoutMinutes * 60000
    ) {
      await this.revoke(token, 'session_timeout', userId);
      throw new UnauthorizedException(
        'Session expired due to inactivity. Please sign in again.',
      );
    }
    return record;
  }
  async activity(token: string, userId: string, timeoutMinutes = 10) {
    await this.assertActive(token, userId);
    const bounded = Math.min(120, Math.max(1, Number(timeoutMinutes) || 10));
    const record = await this.sessions
      .findOneAndUpdate(
        { key: this.key(token), revokedAt: null },
        { $set: { lastActivity: new Date(), timeoutMinutes: bounded } },
        { new: true },
      )
      .lean();
    if (!record)
      throw new UnauthorizedException('Session ended. Please sign in again.');
    return { success: true, timeoutMinutes: bounded };
  }
  async revoke(
    token: string,
    reason: 'logout' | 'session_timeout',
    userId?: string,
  ) {
    if (!token) return;
    const record = await this.sessions
      .findOneAndUpdate(
        { key: this.key(token), revokedAt: null },
        {
          $unset: { expiresAt: 1 },
          $set: { revokedAt: new Date(), ...(userId ? { userId } : {}) },
          $setOnInsert: {
            key: this.key(token),
            lastActivity: new Date(),
          },
        },
        { upsert: true, new: false },
      )
      .lean()
      .catch(async (error) => {
        // A concurrent logout already created the unique-key tombstone.
        if (error?.code === 11000) return undefined;
        throw error;
      });
    // Log the first tombstone only, including sessions created before tracking.
    if (record !== undefined)
      await this.audit?.record({
        actor: 'Owner',
        actorType: 'user',
        module: 'auth',
        category: 'security',
        action:
          reason === 'session_timeout'
            ? 'Session Timed Out'
            : 'Owner Logged Out',
        status: 'success',
        metadata: { reason },
      });
  }
}
