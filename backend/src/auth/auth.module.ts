import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupabaseModule } from '../common/supabase/supabase.module';
import {
  SessionLifecycleService,
  DashboardSessionSchema,
} from './session-lifecycle.service';
import {
  PasswordRecoveryService,
  PasswordRecoverySchema,
} from './password-recovery.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  MfaEnrollmentRateLimitSchema,
  MfaEnrollmentRateLimitService,
} from './mfa-enrollment-rate-limit.service';

@Global()
@Module({
  imports: [
    SupabaseModule,
    MongooseModule.forFeature([
      { name: 'MfaEnrollmentRateLimit', schema: MfaEnrollmentRateLimitSchema },
      { name: 'DashboardSession', schema: DashboardSessionSchema },
      { name: 'PasswordRecovery', schema: PasswordRecoverySchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaEnrollmentRateLimitService,
    SessionLifecycleService,
    PasswordRecoveryService,
  ],
  exports: [SessionLifecycleService],
})
export class AuthModule {}
