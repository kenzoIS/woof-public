import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { WeatherLog, WeatherLogSchema } from './schemas/weather-log.schema';
import {
  HolidayCache,
  HolidayCacheSchema,
} from './schemas/holiday-cache.schema';
import { WeatherService } from './weather.service';
import { HolidayService } from './holiday.service';
import { WeatherController } from './weather.controller';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: WeatherLog.name, schema: WeatherLogSchema },
      { name: HolidayCache.name, schema: HolidayCacheSchema },
    ]),
  ],
  controllers: [WeatherController],
  providers: [WeatherService, HolidayService],
  exports: [WeatherService, HolidayService, MongooseModule],
})
export class ContextModule {}
