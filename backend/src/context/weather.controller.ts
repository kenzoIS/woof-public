import { Controller, Post } from '@nestjs/common';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Post('sync')
  async triggerWeatherSync() {
    await this.weatherService.fetchCurrentWeather();
    await this.weatherService.fetchDailyForecast();
    return {
      success: true,
      message:
        'Weather sync triggered successfully for current and 5-day forecast.',
    };
  }
}
