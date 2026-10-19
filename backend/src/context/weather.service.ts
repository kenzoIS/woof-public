import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { WeatherLog, WeatherLogDocument } from './schemas/weather-log.schema';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  // Lucena City Coordinates
  private readonly lat = 13.9333;
  private readonly lon = 121.6167;

  constructor(
    @Optional()
    @InjectModel(WeatherLog.name)
    private weatherLogModel: Model<WeatherLogDocument>,
    private readonly httpService: HttpService,
  ) {}

  // Fetch current weather every 3 hours
  @Cron('0 */3 * * *')
  async fetchCurrentWeather() {
    this.logger.log('Fetching current weather from Open-Meteo...');
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}&current=temperature_2m,precipitation,relative_humidity_2m&timezone=Asia%2FManila`;
      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: { 'User-Agent': 'WOOF-App/1.0' },
        }),
      );

      const current = response.data.current;

      await this.weatherLogModel.create({
        location: 'Lucena City',
        timestamp: new Date(current.time),
        temperature: current.temperature_2m,
        precipitation: current.precipitation,
        humidity: current.relative_humidity_2m,
        isForecast: false,
      });
      this.logger.log('Current weather successfully logged.');
    } catch (error) {
      this.logger.error(`Failed to fetch current weather: ${error.message}`);
    }
  }

  // Fetch 5-day forecast daily at 6:00 AM
  @Cron('0 6 * * *')
  async fetchDailyForecast() {
    this.logger.log('Fetching 5-day weather forecast from Open-Meteo...');
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}&hourly=temperature_2m,precipitation,relative_humidity_2m&forecast_days=5&timezone=Asia%2FManila`;
      const response = await lastValueFrom(
        this.httpService.get(url, {
          headers: { 'User-Agent': 'WOOF-App/1.0' },
        }),
      );

      const hourly = response.data.hourly;

      const logs = hourly.time.map((timeString: string, index: number) => ({
        location: 'Lucena City',
        timestamp: new Date(timeString),
        temperature: hourly.temperature_2m[index],
        precipitation: hourly.precipitation[index],
        humidity: hourly.relative_humidity_2m[index],
        isForecast: true,
      }));

      for (const log of logs) {
        await this.weatherLogModel.updateOne(
          {
            location: log.location,
            timestamp: log.timestamp,
            isForecast: true,
          },
          { $set: log },
          { upsert: true },
        );
      }

      this.logger.log('5-day forecast successfully logged.');
    } catch (error) {
      this.logger.error(`Failed to fetch 5-day forecast: ${error.message}`);
    }
  }
}
