import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SmartReportsService } from './smart-reports.service';
import { SmartReportsController } from './smart-reports.controller';
import {
  Transaction,
  TransactionSchema,
} from '../csv/schemas/transaction.schema';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    LlmModule,
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  providers: [SmartReportsService],
  controllers: [SmartReportsController],
  exports: [SmartReportsService],
})
export class SmartReportsModule {}
