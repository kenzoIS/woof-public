import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
@Module({
  imports: [RealtimeModule],
  providers: [InventoryService],
  controllers: [InventoryController],
})
export class InventoryModule {}
