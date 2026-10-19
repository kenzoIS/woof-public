import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import {
  Transaction,
  TransactionSchema,
} from '../csv/schemas/transaction.schema';

import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { ActivationModule } from '../activation/activation.module';
import { LlmModule } from '../llm/llm.module';
import { RecalibrationService } from './recalibration.service';

@Module({
  imports: [
    CommonModule,
    AuditModule,
    LlmModule,
    forwardRef(() => ActivationModule),
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RecalibrationService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
