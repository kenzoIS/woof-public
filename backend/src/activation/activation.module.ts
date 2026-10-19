import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ActivationController } from './activation.controller';
import { ActivationService } from './activation.service';
import {
  CampaignActivation,
  CampaignActivationSchema,
} from './schemas/campaign-activation.schema';

@Module({
  imports: [
    forwardRef(() => AnalyticsModule),
    SupabaseModule,
    RealtimeModule,
    MongooseModule.forFeature([
      { name: CampaignActivation.name, schema: CampaignActivationSchema },
    ]),
  ],
  controllers: [ActivationController],
  providers: [ActivationService],
  exports: [ActivationService],
})
export class ActivationModule {}
