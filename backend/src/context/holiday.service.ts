import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import {
  HolidayCache,
  HolidayCacheDocument,
} from './schemas/holiday-cache.schema';

@Injectable()
export class HolidayService {
  private readonly logger = new Logger(HolidayService.name);

  constructor(
    @Optional()
    @InjectModel(HolidayCache.name)
    private holidayCacheModel: Model<HolidayCacheDocument>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // Fetch holidays on the 1st of every month
  @Cron('0 0 1 * *')
  async fetchHolidays() {
    this.logger.log('Fetching Philippine public holidays from Abstract API...');
    try {
      const apiKey = this.configService.get<string>('HOLIDAY_API_KEY');
      if (!apiKey) {
        this.logger.warn(
          'HOLIDAY_API_KEY is not defined. Skipping holiday fetch.',
        );
        return;
      }

      const year = new Date().getFullYear();

      const url = `https://holidays.abstractapi.com/v1/?api_key=${apiKey}&country=PH&year=${year}`;
      const response = await lastValueFrom(this.httpService.get(url));

      const holidays = response.data;

      for (const holiday of holidays) {
        // holiday date format is usually YYYY-MM-DD
        const dateString = holiday.date;

        await this.holidayCacheModel.updateOne(
          { date: dateString, location: 'PH' },
          {
            $set: {
              name: holiday.name,
              type: holiday.type, // Usually 'National' or 'Local'
            },
          },
          { upsert: true },
        );
      }

      this.logger.log(
        `Successfully cached ${holidays.length} holidays for ${year}.`,
      );
    } catch (error) {
      this.logger.error(`Failed to fetch holidays: ${error.message}`);
    }
  }
}
