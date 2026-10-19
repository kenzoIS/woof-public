import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HolidayCache,
  HolidayCacheDocument,
} from './schemas/holiday-cache.schema';
import {
  WeatherCache,
  WeatherCacheDocument,
} from './schemas/weather-cache.schema';

export interface WeatherRecord {
  date: string;
  tempCelsius: number;
  rainfallMm: number;
  relativeHumidity: number;
  isSynthetic: boolean;
}

export interface HolidayRecord {
  date: string;
  name: string;
  isNational: boolean;
}

export interface ExogenousRow {
  date: string;
  tempCelsius: number;
  rainFlag: number;
  humidity: number;
  isHotDay: number;
  isCoolRainyDay: number;
  comfortIndex: number;
  isHoliday: number;
  dayBeforeHoliday: number;
  dayAfterHoliday: number;
}

export interface ExogenousCacheStatus {
  weatherCache: {
    count: number;
    latestFetchedAt: Date | null;
    lastSource: 'api' | 'cache' | 'synthetic' | 'unknown';
  };
  holidayCache: {
    count: number;
    latestFetchedAt: Date | null;
    lastSource: 'api' | 'cache' | 'hardcoded' | 'unknown';
  };
}

export interface ExogenousProviderDiagnostics {
  weather: {
    providerName: string;
    providerKind: 'weather';
    requiresApiKey: boolean;
    apiKeyStatus: 'not_required';
    targetLocation: string;
    countryCode: string;
    coordinates: { lat: number; lng: number };
    fallbackSource: 'synthetic';
  };
  holidays: {
    providerName: string;
    providerKind: 'holiday_calendar';
    requiresApiKey: boolean;
    apiKeyStatus: 'configured' | 'missing';
    targetCountry: { name: string; code: string };
    fallbackSource: 'hardcoded';
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TEMP_CELSIUS = 28;
const DEFAULT_LUCENA_LAT = 13.9397;
const DEFAULT_LUCENA_LNG = 121.6145;

@Injectable()
export class ExogenousDataService {
  private readonly logger = new Logger(ExogenousDataService.name);
  private lastWeatherSource: 'api' | 'cache' | 'synthetic' | 'unknown' =
    'unknown';
  private lastHolidaySource: 'api' | 'cache' | 'hardcoded' | 'unknown' =
    'unknown';

  constructor(
    @Optional()
    @InjectModel(WeatherCache.name)
    private readonly weatherCacheModel: Model<WeatherCacheDocument>,
    @Optional()
    @InjectModel(HolidayCache.name)
    private readonly holidayCacheModel: Model<HolidayCacheDocument>,
    private readonly configService: ConfigService,
  ) {}

  getDefaultCoordinates(): { lat: number; lng: number } {
    return {
      lat: Number(
        this.configService.get<string>('LUCENA_LAT') || DEFAULT_LUCENA_LAT,
      ),
      lng: Number(
        this.configService.get<string>('LUCENA_LNG') || DEFAULT_LUCENA_LNG,
      ),
    };
  }

  getLastWeatherSource(): 'api' | 'cache' | 'synthetic' | 'unknown' {
    return this.lastWeatherSource;
  }

  getLastHolidaySource(): 'api' | 'cache' | 'hardcoded' | 'unknown' {
    return this.lastHolidaySource;
  }

  getProviderDiagnostics(): ExogenousProviderDiagnostics {
    const coordinates = this.getDefaultCoordinates();
    const holidayApiKey = this.configService
      .get<string>('ABSTRACT_HOLIDAYS_KEY')
      ?.trim();

    return {
      weather: {
        providerName: 'Open-Meteo',
        providerKind: 'weather',
        requiresApiKey: false,
        apiKeyStatus: 'not_required',
        targetLocation:
          this.configService.get<string>('EXOGENOUS_LOCATION_LABEL') ||
          'Lucena City, PH',
        countryCode: 'PH',
        coordinates,
        fallbackSource: 'synthetic',
      },
      holidays: {
        providerName: 'Abstract Holidays API',
        providerKind: 'holiday_calendar',
        requiresApiKey: true,
        apiKeyStatus: holidayApiKey ? 'configured' : 'missing',
        targetCountry: { name: 'Philippines', code: 'PH' },
        fallbackSource: 'hardcoded',
      },
    };
  }

  /** Return only observed weather already present in cache; never synthesize values. */
  async getCachedRealWeatherHistory(
    startDate: string,
    endDate: string,
  ): Promise<WeatherRecord[]> {
    if (!this.weatherCacheModel) return [];
    const { lat, lng } = this.getDefaultCoordinates();
    const rows = await this.weatherCacheModel
      .find({
        date: { $gte: startDate, $lte: endDate },
        lat,
        lng,
        isSynthetic: false,
      })
      .sort({ date: 1 })
      .lean();
    return rows.map((row: any) => this.toWeatherRecord(row));
  }

  async fetchWeatherHistory(
    lat: number,
    lng: number,
    startDate: string,
    endDate: string,
  ): Promise<WeatherRecord[]> {
    const dates = enumerateDates(startDate, endDate);
    if (dates.length === 0) return [];

    const cachedRows = await this.weatherCacheModel
      .find({ date: { $in: dates }, lat, lng })
      .lean();
    const cachedByDate = new Map(
      cachedRows.map((row: any) => [row.date, this.toWeatherRecord(row)]),
    );
    const results = new Map<string, WeatherRecord>();
    for (const [date, record] of cachedByDate) {
      if (!record.isSynthetic) {
        results.set(date, record);
      }
    }

    let apiFetchCount = 0;
    let syntheticCount = 0;

    for (const date of dates) {
      if (results.has(date)) continue;

      let record: WeatherRecord | null = null;
      // Use Open-Meteo for historical data (no API key required)
      record = await this.fetchOpenMeteoDay(lat, lng, date);

      if (record) {
        apiFetchCount += 1;
      } else {
        syntheticCount += 1;
        record = {
          date,
          tempCelsius: DEFAULT_TEMP_CELSIUS,
          rainfallMm: 0,
          relativeHumidity: 60,
          isSynthetic: true,
        };
      }

      results.set(date, record);
      await this.upsertWeatherRecord(lat, lng, record);
    }

    const hasRealData =
      apiFetchCount > 0 ||
      Array.from(results.values()).some((r) => !r.isSynthetic);
    this.lastWeatherSource = hasRealData
      ? apiFetchCount > 0
        ? 'api'
        : 'cache'
      : 'synthetic';

    return dates.map(
      (date) =>
        results.get(date) || {
          date,
          tempCelsius: DEFAULT_TEMP_CELSIUS,
          rainfallMm: 0,
          relativeHumidity: 60,
          isSynthetic: true,
        },
    );
  }

  async fetchHolidayHistory(year: number): Promise<HolidayRecord[]> {
    const cached = await this.holidayCacheModel
      .find({ date: { $regex: `^${year}` }, location: 'PH' })
      .lean();
    if (cached && cached.length > 0) {
      this.lastHolidaySource = 'cache';
      return cached.map((holiday: any) => ({
        date: holiday.date,
        name: holiday.name,
        isNational:
          String(holiday.type || '')
            .toLowerCase()
            .includes('national') || true,
      }));
    }

    const apiKey = this.configService.get<string>('ABSTRACT_HOLIDAYS_KEY');
    if (apiKey) {
      try {
        const response = await fetch(
          `https://holidays.abstractapi.com/v1/?api_key=${encodeURIComponent(
            apiKey,
          )}&country=PH&year=${year}`,
        );
        if (response.ok) {
          const body = (await response.json()) as any[];
          const holidays = body.map((item) => ({
            date: String(item.date),
            name: String(item.name || item.localName || 'Philippine Holiday'),
            isNational:
              String(item.location || item.type || '')
                .toLowerCase()
                .includes('national') || true,
          }));
          await this.upsertHolidayRecord(year, holidays);
          this.lastHolidaySource = 'api';
          return holidays;
        }
      } catch (error) {
        this.logger.warn(
          `Abstract holiday fetch failed for ${year}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const hardcoded = buildPhilippineNationalHolidays(year);
    await this.upsertHolidayRecord(year, hardcoded);
    this.lastHolidaySource = 'hardcoded';
    return hardcoded;
  }

  buildExogenousMatrix(
    dates: string[],
    weatherRecords: WeatherRecord[],
    holidayRecords: HolidayRecord[],
  ): ExogenousRow[] {
    const weatherByDate = new Map(
      weatherRecords.map((record) => [record.date, record]),
    );
    const holidayDates = new Set(holidayRecords.map((holiday) => holiday.date));

    return dates.map((date) => {
      const weather = weatherByDate.get(date);
      const tempCelsius = round(weather?.tempCelsius ?? DEFAULT_TEMP_CELSIUS);
      const rainFlag = (weather?.rainfallMm ?? 0) > 0.5 ? 1 : 0;
      const humidity = round(weather?.relativeHumidity ?? 60);
      return {
        date,
        tempCelsius,
        rainFlag,
        humidity,
        ...this.buildWeatherTransformFields(tempCelsius, rainFlag, humidity),
        isHoliday: holidayDates.has(date) ? 1 : 0,
        dayBeforeHoliday: holidayDates.has(addDays(date, 1)) ? 1 : 0,
        dayAfterHoliday: holidayDates.has(addDays(date, -1)) ? 1 : 0,
      };
    });
  }

  buildWeatherTransformFields(
    tempCelsius: number,
    rainFlag: number,
    humidity: number,
  ): Pick<ExogenousRow, 'isHotDay' | 'isCoolRainyDay' | 'comfortIndex'> {
    const temp = Number.isFinite(tempCelsius)
      ? tempCelsius
      : DEFAULT_TEMP_CELSIUS;
    const relativeHumidity = Number.isFinite(humidity) ? humidity : 60;
    const rain = rainFlag === 1 ? 1 : 0;
    const comfortIndex =
      temp - (0.55 - 0.0055 * relativeHumidity) * (temp - 14.5);

    return {
      isHotDay: temp >= 31 ? 1 : 0,
      isCoolRainyDay: rain === 1 && temp <= 26 ? 1 : 0,
      comfortIndex: round(comfortIndex),
    };
  }

  async getCacheStatus(): Promise<ExogenousCacheStatus> {
    const [weatherCount, latestWeather, holidayCount, latestHoliday] =
      await Promise.all([
        this.weatherCacheModel.countDocuments(),
        this.weatherCacheModel.findOne().sort({ fetchedAt: -1 }).lean(),
        this.holidayCacheModel.countDocuments(),
        this.holidayCacheModel.findOne().sort({ fetchedAt: -1 }).lean(),
      ]);

    return {
      weatherCache: {
        count: weatherCount,
        latestFetchedAt: (latestWeather as any)?.fetchedAt || null,
        lastSource: this.lastWeatherSource,
      },
      holidayCache: {
        count: holidayCount,
        latestFetchedAt: (latestHoliday as any)?.fetchedAt || null,
        lastSource: this.lastHolidaySource,
      },
    };
  }

  async pruneOperationalCaches(cutoff: Date): Promise<{
    weatherCache: number;
    holidayCache: number;
  }> {
    const [weatherResult, holidayResult] = await Promise.all([
      this.weatherCacheModel.deleteMany({ fetchedAt: { $lt: cutoff } }),
      this.holidayCacheModel.deleteMany({ fetchedAt: { $lt: cutoff } }),
    ]);

    return {
      weatherCache: weatherResult.deletedCount || 0,
      holidayCache: holidayResult.deletedCount || 0,
    };
  }

  private async fetchOpenMeteoDay(
    lat: number,
    lng: number,
    date: string,
  ): Promise<WeatherRecord | null> {
    try {
      // Open-Meteo free tier limits future forecasts to ~14-16 days.
      // Prevent guaranteed 400 Bad Request errors for far-future dates.
      const targetDate = new Date(date).getTime();
      const now = Date.now();
      const daysAhead = (targetDate - now) / (1000 * 60 * 60 * 24);

      if (daysAhead > 14) {
        this.logger.log(
          `Skipping Open-Meteo API for ${date} (>${Math.round(daysAhead)} days in future exceeds API limit). Returning default.`,
        );
        return null;
      }

      // Use Archive API for historical data. It supports fetching exactly 1 day.
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&daily=temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&timezone=Asia%2FManila`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'WOOF-App/1.0' },
      });

      let body: any = null;
      if (response.ok) {
        body = await response.json();
        this.logger.log(
          `Open-Meteo Archive response for ${date}: ${JSON.stringify(body).substring(0, 200)}`,
        );
      } else {
        this.logger.warn(
          `Open-Meteo Archive API returned ${response.status} ${response.statusText} for ${date}`,
        );
      }

      if (
        !body ||
        !body.daily ||
        !body.daily.time ||
        body.daily.time.length === 0
      ) {
        this.logger.log(`Falling back to forecast API for ${date}`);
        // If Archive API returns nothing (e.g. for today or future dates) or an error, fallback to Forecast API
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&start_date=${date}&end_date=${date}&daily=temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&timezone=Asia%2FManila`;
        const forecastResponse = await fetch(forecastUrl, {
          headers: { 'User-Agent': 'WOOF-App/1.0' },
        });

        if (!forecastResponse.ok) {
          this.logger.error(
            `Open-Meteo Forecast API also failed for ${date}: ${forecastResponse.status}`,
          );
          return null;
        }

        const forecastBody = await forecastResponse.json();
        this.logger.log(
          `Open-Meteo Forecast response for ${date}: ${JSON.stringify(forecastBody).substring(0, 200)}`,
        );

        if (
          !forecastBody.daily ||
          !forecastBody.daily.time ||
          forecastBody.daily.time.length === 0
        )
          return null;

        return {
          date,
          tempCelsius: round(
            Number(
              forecastBody.daily.temperature_2m_mean[0] ?? DEFAULT_TEMP_CELSIUS,
            ),
          ),
          rainfallMm: round(
            Number(forecastBody.daily.precipitation_sum[0] ?? 0),
          ),
          relativeHumidity: round(
            Number(forecastBody.daily.relative_humidity_2m_mean[0] ?? 60),
          ),
          isSynthetic: false,
        };
      }

      return {
        date,
        tempCelsius: round(
          Number(body.daily.temperature_2m_mean[0] ?? DEFAULT_TEMP_CELSIUS),
        ),
        rainfallMm: round(Number(body.daily.precipitation_sum[0] ?? 0)),
        relativeHumidity: round(
          Number(body.daily.relative_humidity_2m_mean[0] ?? 60),
        ),
        isSynthetic: false,
      };
    } catch (error) {
      this.logger.warn(
        `Open-Meteo fetch failed for ${date}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private toWeatherRecord(row: any): WeatherRecord {
    return {
      date: row.date,
      tempCelsius: Number(row.tempCelsius),
      rainfallMm: Number(row.rainfallMm),
      relativeHumidity: Number(row.relativeHumidity ?? 60),
      isSynthetic: Boolean(row.isSynthetic),
    };
  }

  private async upsertWeatherRecord(
    lat: number,
    lng: number,
    record: WeatherRecord,
  ): Promise<void> {
    await this.weatherCacheModel.updateOne(
      { date: record.date, lat, lng },
      {
        $set: {
          ...record,
          lat,
          lng,
          fetchedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  private async upsertHolidayRecord(
    year: number,
    holidays: HolidayRecord[],
  ): Promise<void> {
    for (const holiday of holidays) {
      await this.holidayCacheModel.updateOne(
        { date: holiday.date, location: 'PH' },
        {
          $set: {
            name: holiday.name,
            type: holiday.isNational ? 'National' : 'Local',
          },
        },
        { upsert: true },
      );
    }
  }
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [];
  }

  const dates: string[] = [];
  for (let timestamp = start; timestamp <= end; timestamp += DAY_MS) {
    dates.push(new Date(timestamp).toISOString().slice(0, 10));
  }
  return dates;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function buildPhilippineNationalHolidays(year: number): HolidayRecord[] {
  const holyWeek = calculateHolyWeek(year);
  return [
    { date: `${year}-01-01`, name: "New Year's Day", isNational: true },
    {
      date: holyWeek.maundyThursday,
      name: 'Maundy Thursday',
      isNational: true,
    },
    { date: holyWeek.goodFriday, name: 'Good Friday', isNational: true },
    { date: `${year}-05-01`, name: 'Labor Day', isNational: true },
    { date: `${year}-06-12`, name: 'Independence Day', isNational: true },
    {
      date: getLastMondayOfAugust(year),
      name: 'National Heroes Day',
      isNational: true,
    },
    { date: `${year}-11-30`, name: 'Bonifacio Day', isNational: true },
    { date: `${year}-12-25`, name: 'Christmas Day', isNational: true },
    { date: `${year}-12-30`, name: 'Rizal Day', isNational: true },
  ];
}

function calculateHolyWeek(year: number): {
  maundyThursday: string;
  goodFriday: string;
} {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month - 1, day));
  const maundyThursday = new Date(easter);
  maundyThursday.setUTCDate(easter.getUTCDate() - 3);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(easter.getUTCDate() - 2);
  return {
    maundyThursday: maundyThursday.toISOString().slice(0, 10),
    goodFriday: goodFriday.toISOString().slice(0, 10),
  };
}

function getLastMondayOfAugust(year: number): string {
  const date = new Date(Date.UTC(year, 7, 31));
  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
