import { InventoryModule } from './inventory/inventory.module';
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';
import { GeoBlockMiddleware } from './common/middleware/geo-block.middleware';
import { CsvModule } from './csv/csv.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SmartReportsModule } from './smart-reports/smart-reports.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { ActivationModule } from './activation/activation.module';
import { AwsModule } from './aws/aws.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SettingsModule } from './settings/settings.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ContextModule } from './context/context.module';
import { LlmModule } from './llm/llm.module';
import { AuditModule } from './audit/audit.module';
import { SimulationModule } from './simulation/simulation.module';
import { AuthModule } from './auth/auth.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => {
        if (typeof config.MONGODB_URI !== 'string' || !config.MONGODB_URI.trim()) {
          throw new Error('MONGODB_URI must be configured in backend/.env');
        }
        if (!config.SUPABASE_URL || typeof config.SUPABASE_URL !== 'string') {
          throw new Error('SUPABASE_URL must be configured in backend/.env');
        }
        if (!config.SUPABASE_SERVICE_ROLE_KEY || typeof config.SUPABASE_SERVICE_ROLE_KEY !== 'string') {
          throw new Error('SUPABASE_SERVICE_ROLE_KEY must be configured in backend/.env');
        }
        if (!config.SUPABASE_ANON_KEY || typeof config.SUPABASE_ANON_KEY !== 'string') {
          throw new Error('SUPABASE_ANON_KEY must be configured in backend/.env');
        }
        return config;
      },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
        dbName: configService.get<string>('MONGODB_DB') || 'woof_staging',
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        retryAttempts: 1,
      }),
    }),
    CsvModule,
    AnalyticsModule,
    ContextModule,
    SmartReportsModule,
    SupabaseModule,
    ActivationModule,
    ChatbotModule,
    AwsModule,
    RealtimeModule,
    LlmModule,
    SettingsModule,
    AuditModule,
    AuthModule,
    SimulationModule,
    AlertsModule,
    InventoryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GeoBlockMiddleware).forRoutes('*');
  }
}
