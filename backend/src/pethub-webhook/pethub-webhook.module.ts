import { Module } from '@nestjs/common';
// [MONGO_DISABLED] import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CommonModule } from '../common/common.module';
import { SupabaseModule } from '../common/supabase/supabase.module';
import {
  HolidayCache,
  HolidayCacheSchema,
} from '../context/schemas/holiday-cache.schema';
import {
  WeatherLog,
  WeatherLogSchema,
} from '../context/schemas/weather-log.schema';
import { EtlService } from '../csv/etl.service';
import {
  Transaction,
  TransactionSchema,
} from '../csv/schemas/transaction.schema';
import { RealtimeModule } from '../realtime/realtime.module';
import { PetHubWebhookController } from './pethub-webhook.controller';
import { PetHubWebhookService } from './pethub-webhook.service';

@Module({
  imports: [
    AnalyticsModule,
    CommonModule,
    SupabaseModule,
    RealtimeModule,
    // [MONGO_DISABLED] MongooseModule.forFeature([
    // [MONGO_DISABLED] { name: Transaction.name, schema: TransactionSchema },
    // [MONGO_DISABLED] { name: HolidayCache.name, schema: HolidayCacheSchema },
    // [MONGO_DISABLED] { name: WeatherLog.name, schema: WeatherLogSchema },
    // [MONGO_DISABLED] ]),
  ],
  controllers: [PetHubWebhookController],
  providers: [PetHubWebhookService, EtlService],
})
export class PetHubWebhookModule {}
