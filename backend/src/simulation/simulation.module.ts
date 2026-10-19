import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SupabaseModule } from '../common/supabase/supabase.module';
import {
  Transaction,
  TransactionSchema,
} from '../csv/schemas/transaction.schema';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';
const RunSchema = new Schema(
  {
    userId: { type: String, required: true },
    createdBy: String,
    engineVersion: String,
    inputs: Schema.Types.Mixed,
    baseline: Schema.Types.Mixed,
    whatIf: Schema.Types.Mixed,
    comparison: Schema.Types.Mixed,
    recommendations: [String],
  },
  { timestamps: true, collection: 'simulation_runs' },
);
RunSchema.index({ userId: 1, createdAt: -1 });
@Module({
  imports: [
    AnalyticsModule,
    SupabaseModule,
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: 'SimulationRun', schema: RunSchema },
    ]),
  ],
  controllers: [SimulationController],
  providers: [SimulationService],
})
export class SimulationModule {}
