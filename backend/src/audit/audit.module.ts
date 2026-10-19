import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: 'AuditOutbox',
        schema: new Schema(
          {
            id: { type: String, required: true, unique: true },
            payload: { type: Schema.Types.Mixed, required: true },
            createdAt: Date,
          },
          { collection: 'audit_outbox', versionKey: false },
        ),
      },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
