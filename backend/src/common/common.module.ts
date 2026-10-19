import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExogenousDataService } from './exogenous-data.service';
import {
  HolidayCache,
  HolidayCacheSchema,
} from './schemas/holiday-cache.schema';
import {
  WeatherCache,
  WeatherCacheSchema,
} from './schemas/weather-cache.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WeatherCache.name, schema: WeatherCacheSchema },
      { name: HolidayCache.name, schema: HolidayCacheSchema },
    ]),
  ],
  providers: [ExogenousDataService],
  exports: [ExogenousDataService],
})
export class CommonModule {}
