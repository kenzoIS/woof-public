import { Module, forwardRef } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { AuditModule } from '../audit/audit.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    SupabaseModule,
    AuditModule,
    forwardRef(() => AnalyticsModule),
    forwardRef(() => SettingsModule),
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
