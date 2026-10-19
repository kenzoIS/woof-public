import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PreferenceStoreService,
  PreferenceSchema,
} from './preference-store.service';
import { CommonModule } from '../common/common.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    CommonModule,
    MongooseModule.forFeature([
      { name: 'DashboardPreferences', schema: PreferenceSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService, PreferenceStoreService],
  exports: [SettingsService],
})
export class SettingsModule {}
