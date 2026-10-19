import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Schema } from 'mongoose';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';

export const PasswordRecoverySchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    userId: String,
    codeHash: String,
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'password_recovery_challenges', versionKey: false },
);
PasswordRecoverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Recovery proves inbox ownership, never creates a dashboard session or changes MFA factors. */
@Injectable()
export class PasswordRecoveryService {
  constructor(
    @InjectModel('PasswordRecovery')
    private readonly challenges: Model<{
      key: string;
      userId: string;
      codeHash: string;
      attempts: number;
      verified: boolean;
      expiresAt: Date;
    }>,
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}
  private hash(value: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
    )
      .update(value)
      .digest('hex');
  }
  async request(email: string, previous?: string) {
    if (previous) await this.challenges.deleteOne({ key: this.hash(previous) });
    const grant = randomBytes(32).toString('hex');
    const admin = (
      this.config.get<string>('WOOF_ADMIN_EMAIL') || 'woof@admin.ph'
    )
      .toLowerCase()
      .trim();
    if (email.trim().toLowerCase() !== admin) return grant;
    try {
      let user: any;
      for (let page = 1; ; page++) {
        const { data, error } = await this.supabase.client.auth.admin.listUsers(
          { page, perPage: 200 },
        );
        if (error) throw error;
        user = data.users.find((u) => u.email?.toLowerCase() === admin);
        if (user || data.users.length < 200) break;
      }
      if (!user) throw new Error('Recovery account unavailable');
      const code = String(randomInt(100000, 1000000));
      await this.challenges.create({
        key: this.hash(grant),
        userId: user.id,
        codeHash: this.hash(`${grant}:${code}`),
        attempts: 0,
        verified: false,
        expiresAt: new Date(Date.now() + 10 * 60000),
      });
      const smtpUser = this.config.getOrThrow<string>('WOOF_SMTP_USER');
      const pass = this.config
        .getOrThrow<string>('WOOF_SMTP_APP_PASSWORD')
        .replace(/\s+/g, '');
      await nodemailer
        .createTransport({
          service: 'gmail',
          auth: { user: smtpUser, pass },
          connectionTimeout: 15000,
          socketTimeout: 20000,
        })
        .sendMail({
          from: `"WOOF Dashboard" <${smtpUser}>`,
          to: admin,
          subject: 'Your WOOF password reset code',
          text: `Your WOOF password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
        });
      await this.audit.record({
        actor: 'Owner',
        actorType: 'user',
        module: 'auth',
        category: 'security',
        action: 'Password Reset Requested',
        status: 'success',
      });
    } catch {
      await this.challenges.deleteOne({ key: this.hash(grant) });
      await this.audit.record({
        actor: 'System',
        actorType: 'system',
        module: 'auth',
        category: 'security',
        action: 'Password Reset Requested',
        status: 'failed',
        metadata: { reason: 'Recovery email could not be delivered' },
      });
      // Public response is intentionally identical for eligible and ineligible addresses.
    }
    return grant;
  }
  async cancel(grant: string) {
    if (grant) await this.challenges.deleteOne({ key: this.hash(grant) });
    return { success: true };
  }
  async verify(grant: string, code: string) {
    const key = this.hash(grant || '');
    const record = await this.challenges
      .findOneAndUpdate(
        {
          key,
          expiresAt: { $gt: new Date() },
          attempts: { $lt: 5 },
          verified: false,
        },
        { $inc: { attempts: 1 } },
        { new: true },
      )
      .lean();
    if (
      !record ||
      !/^\d{6}$/.test(code) ||
      !timingSafeEqual(
        Buffer.from(record.codeHash),
        Buffer.from(this.hash(`${grant}:${code}`)),
      )
    ) {
      throw new UnauthorizedException(
        'Code is invalid, expired or has already been used. Request a new code.',
      );
    }
    const updated = await this.challenges.updateOne(
      { key, verified: false },
      { $set: { verified: true } },
    );
    if (!updated.modifiedCount)
      throw new UnauthorizedException('Code has already been used.');
    return { success: true };
  }
  async reset(grant: string, password: string) {
    const record = await this.challenges
      .findOneAndDelete({
        key: this.hash(grant || ''),
        verified: true,
        expiresAt: { $gt: new Date() },
      })
      .lean();
    if (!record)
      throw new UnauthorizedException(
        'Password reset is invalid or expired. Request a new code.',
      );
    const { error } = await this.supabase.client.auth.admin.updateUserById(
      record.userId,
      { password },
    );
    await this.audit.record({
      actor: 'Owner',
      actorType: 'user',
      module: 'auth',
      category: 'security',
      action: 'Password Reset Completed',
      status: error ? 'failed' : 'success',
    });
    if (error)
      throw new ServiceUnavailableException(
        'Password could not be updated. Request a new code and try again.',
      );
    return { success: true };
  }
}
