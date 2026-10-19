import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';

// ── Validated DTOs ──────────────────────────────────────────────────

class CreateCampaignDraftDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  items: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_pct?: number;

  @IsOptional()
  @IsString()
  season?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

class CreateBundleArchiveDto {
  @IsString()
  @IsNotEmpty()
  bundle_name: string;

  @IsArray()
  @IsString({ each: true })
  items: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_pct?: number;

  @IsOptional()
  @IsNumber()
  price_override?: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

const ANALYTICS_CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

@Controller('analytics')
export class AnalyticsController {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly analyticsService: AnalyticsService) {}

  private cached<T>(
    key: string,
    loader: () => Promise<T>,
    options?: { forceRefresh?: string },
  ): Promise<T> {
    if (options?.forceRefresh === 'true') {
      this.cache.delete(key);
      return loader();
    }

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value as T);
    }

    const active = this.inFlight.get(key);
    if (active) {
      return active as Promise<T>;
    }

    const promise = loader()
      .then((value) => {
        this.cache.set(key, {
          value,
          expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
        });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  private key(name: string, params?: Record<string, unknown>) {
    const query = Object.entries(params || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return `${name}:${JSON.stringify(query)}`;
  }

  @Get('home')
  async getHomeOverview(
    @Query('range') range?: string,
    @Query('forceRefresh') forceRefresh?: string,
  ) {
    return this.cached(
      this.key('home', { range: range || 'matched' }),
      () => this.analyticsService.getHomeOverview(range),
      { forceRefresh },
    );
  }

  @Get('dashboard/:sector')
  async getDashboard(
    @Param('sector') sector: string,
    @Query('forceRefresh') forceRefresh?: string,
  ) {
    return this.cached(
      this.key('dashboard', { sector }),
      () => this.analyticsService.getDashboard(sector),
      { forceRefresh },
    );
  }

  @Get('root-cause')
  async getRootCauseAnalysis(
    @Query('period') period = '30d',
    @Query('sector') sector = 'all',
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
    @Query('forceRefresh') forceRefresh?: string,
  ) {
    const validDate = (value?: string) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if ((dateStart || dateEnd) && (!validDate(dateStart) || !validDate(dateEnd) || dateStart! > dateEnd!)) {
      throw new BadRequestException('Custom analysis requires valid dateStart and dateEnd values in YYYY-MM-DD format, with start on or before end.');
    }
    const safePeriod = dateStart && dateEnd ? 'custom' : ['30d', '90d', 'ytd'].includes(period) ? period : '30d';
    const safeSector = ['all', 'cafe', 'services', 'retail'].includes(sector.toLowerCase()) ? sector.toLowerCase() : 'all';
    const safeDateStart = dateStart && dateEnd ? dateStart : undefined;
    const safeDateEnd = dateStart && dateEnd ? dateEnd : undefined;
    return this.cached(
      this.key('root-cause', { period: safePeriod, sector: safeSector, dateStart: safeDateStart, dateEnd: safeDateEnd }),
      () => this.analyticsService.getRootCauseAnalysis(safePeriod, safeSector, safeDateStart, safeDateEnd),
      { forceRefresh },
    );
  }

  @Get('data-range')
  async getDataRange() {
    return this.analyticsService.getDataRange();
  }

  @Get('channel-status')
  async getChannelStatus() {
    return this.analyticsService.getChannelStatus();
  }

  // ── Security: Strict rate limit on forecast (heavy Python + ML computation) ──
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('forecast/:sector')
  async getForecast(
    @Param('sector') sector: string,
    @Query('temp') temp?: string,
    @Query('rain') rain?: string,
    @Query('holiday') holiday?: string,
    @Query('isPayday') isPayday?: string,
    @Query('promoActive') promoActive?: string,
    @Query('days') days?: string,
    @Query('compact') compact?: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('forecastMode') forecastMode?: string,
    @Query('holdoutDays') holdoutDays?: string,
    @Query('trainEndDate') trainEndDate?: string,
    @Query('testStartDate') testStartDate?: string,
    @Query('testEndDate') testEndDate?: string,
    @Query('backtestSplit') backtestSplit?: string,
    @Query('segmentedWait') segmentedWait?: string,
  ) {
    const params = {
      temp,
      rain,
      holiday,
      isPayday,
      promoActive,
      days,
      compact,
      forceRefresh,
      forecastMode,
      holdoutDays,
      trainEndDate,
      testStartDate,
      testEndDate,
      backtestSplit,
      segmentedWait,
    };
    return this.cached(
      this.key('forecast', { sector, ...params }),
      () => this.analyticsService.getForecast(sector, params),
      { forceRefresh },
    );
  }

  @Get('forecast-by-channel/retail')
  async getRetailForecastByChannel(
    @Query('forceRefresh') forceRefresh?: string,
  ) {
    return this.cached(
      this.key('forecast-by-channel-retail'),
      () => this.analyticsService.getRetailForecastByChannel(),
      { forceRefresh },
    );
  }

  @Get('exogenous/status')
  async getExogenousStatus() {
    return this.analyticsService.getExogenousStatus();
  }

  @Get('weather/current')
  async getCurrentWeather() {
    return this.analyticsService.getCurrentWeather();
  }

  @Get('weather/impact')
  async getWeatherImpact(
    @Query('sector') sector?: string,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getWeatherImpact(
      sector || 'cafe',
      Number(days) || 30,
    );
  }

  @Get('bundle-planning-context')
  async getBundlePlanningContext(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getBundlePlanningContext(startDate, endDate);
  }

  @Get('cafe/co-attachment')
  async getCafeCoAttachment(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getCafeCoAttachment(startDate, endDate);
  }

  @Get('cross-sell')
  async getCrossSell(
    @Query('minSupport') minSupport?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('minLift') minLift?: string,
    @Query('maxBundleCandidates') maxBundleCandidates?: string,
    @Query('hour') hour?: string,
    @Query('sector') sector?: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    const params = {
      minSupport,
      minConfidence,
      minLift,
      maxBundleCandidates,
      hour,
      sector,
      forceRefresh,
      dateStart,
      dateEnd,
    };
    return this.cached(
      this.key('cross-sell', params),
      () => this.analyticsService.getCrossSell(params),
      { forceRefresh },
    );
  }

  @Get('cross-sell/strategic-proximity')
  async getStrategicProximity(
    @Query('forceRefresh') forceRefresh?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    const params = { forceRefresh, dateStart, dateEnd };
    return this.cached(
      this.key('cross-sell-strategic-proximity', params),
      () => this.analyticsService.getStrategicProximity(params),
      { forceRefresh },
    );
  }

  @Get('cross-sell/seasonal-bundles')
  async getSeasonalCrossSellBundles(
    @Query('minSupport') minSupport?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('minLift') minLift?: string,
    @Query('maxBundleCandidates') maxBundleCandidates?: string,
    @Query('hour') hour?: string,
    @Query('sector') sector?: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    const params = {
      minSupport,
      minConfidence,
      minLift,
      maxBundleCandidates,
      hour,
      sector,
      forceRefresh,
      dateStart,
      dateEnd,
    };
    return this.cached(
      this.key('cross-sell-seasonal-bundles', params),
      () => this.analyticsService.getSeasonalCrossSellBundles(params),
      { forceRefresh },
    );
  }

  @Post('cross-sell/campaign-drafts')
  async createCrossSellCampaignDraft(@Body() dto: CreateCampaignDraftDto) {
    return this.analyticsService.createCrossSellCampaignDraft(dto);
  }

  @Post('prescriptions/deploy')
  async deployPrescription(@Body() dto: Record<string, unknown>) {
    return this.analyticsService.deployPrescription(dto);
  }

  @Get('bundles')
  async getBundleArchives(
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('search') search?: string,
  ) {
    return this.analyticsService.getBundleArchives({ status, source, search });
  }

  @Post('bundles')
  async createBundleArchive(@Body() dto: CreateBundleArchiveDto) {
    return this.analyticsService.createBundleArchive(dto);
  }

  @Patch('bundles/:id/status')
  async updateBundleArchiveStatus(
    @Param('id') id: string,
    @Body() dto: { status?: string },
  ) {
    return this.analyticsService.updateBundleArchiveStatus(id, dto?.status);
  }

  @Get('pricing-catalog')
  async getPricingCatalog(
    @Query('sector') sector?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    const params = {
      sector,
      dateStart,
      dateEnd,
    };
    return this.cached(this.key('pricing-catalog', params), () =>
      this.analyticsService.getPricingCatalog(params),
    );
  }

  @Get('traffic-optimizer')
  async getTrafficOptimizer(
    @Query('hour') hour?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
    @Query('referenceDate') referenceDate?: string,
    @Query('scenarioMultiplier') scenarioMultiplier?: string,
    @Query('scenarioDayOfWeekIndex') scenarioDayOfWeekIndex?: string,
    @Query('scenarioLabel') scenarioLabel?: string,
  ) {
    const params = {
      hour,
      dateStart,
      dateEnd,
      referenceDate,
      scenarioMultiplier: scenarioMultiplier ? parseFloat(scenarioMultiplier) : undefined,
      scenarioDayOfWeekIndex: scenarioDayOfWeekIndex !== undefined ? parseInt(scenarioDayOfWeekIndex, 10) : undefined,
      scenarioLabel,
    };
    // Scenario what-if calls are never cached — they must always recompute
    if (scenarioMultiplier !== undefined || scenarioDayOfWeekIndex !== undefined) {
      return this.analyticsService.getTrafficOptimizer(params);
    }
    return this.cached(this.key('traffic-optimizer', params), () =>
      this.analyticsService.getTrafficOptimizer(params),
    );
  }

  @Get('cross-sell/config')
  async getCrossSellConfig(
    @Query('minSupport') minSupport?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('minLift') minLift?: string,
    @Query('maxBundleCandidates') maxBundleCandidates?: string,
    @Query('hour') hour?: string,
    @Query('sector') sector?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    const params = {
      minSupport,
      minConfidence,
      minLift,
      maxBundleCandidates,
      hour,
      sector,
      dateStart,
      dateEnd,
    };
    return this.cached(this.key('cross-sell-config', params), () =>
      this.analyticsService.getCrossSellConfig(params),
    );
  }

  @Get('cross-sell/by-sector')
  async getCrossSellBySector(
    @Query('minSupport') minSupport?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('minLift') minLift?: string,
    @Query('maxBundleCandidates') maxBundleCandidates?: string,
    @Query('hour') hour?: string,
    @Query('sector') sector?: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    const params = {
      minSupport,
      minConfidence,
      minLift,
      maxBundleCandidates,
      hour,
      sector,
      forceRefresh,
      dateStart,
      dateEnd,
    };
    return this.cached(
      this.key('cross-sell-by-sector', params),
      () => this.analyticsService.getCrossSellBySector(params),
      { forceRefresh },
    );
  }

  @Get('cross-sell/bundles')
  async getCrossSellBundles(
    @Query('minSupport') minSupport?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('minLift') minLift?: string,
    @Query('maxBundleCandidates') maxBundleCandidates?: string,
    @Query('hour') hour?: string,
    @Query('sector') sector?: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('dateStart') dateStart?: string,
    @Query('dateEnd') dateEnd?: string,
  ) {
    const params = {
      minSupport,
      minConfidence,
      minLift,
      maxBundleCandidates,
      hour,
      sector,
      forceRefresh,
      dateStart,
      dateEnd,
    };
    return this.cached(
      this.key('cross-sell-bundles', params),
      () => this.analyticsService.getCrossSellBundles(params),
      { forceRefresh },
    );
  }

  @Get('promos/quiet-periods')
  async getNextQuietPeriod() {
    return this.cached(this.key('promos-quiet-periods'), () =>
      this.analyticsService.getNextQuietPeriod(),
    );
  }

  @Get('promos/history')
  async getPastHappyHours() {
    return this.analyticsService.getPastHappyHours();
  }

  @Post('promos/draft')
  async activateHappyHour(
    @Body()
    body: {
      items: Array<{
        itemKey: string;
        discountPercent: number;
        probabilityScore?: number;
      }>;
      targetDate: string;
      targetHour: number;
      probabilityScore?: number;
    },
  ) {
    return this.analyticsService.activateHappyHour(
      body.items,
      body.targetDate,
      body.targetHour,
      body.probabilityScore || 0,
    );
  }

  // ----------------------------------------------------------------
  // Recommendation Feedback Loop Endpoints
  // ----------------------------------------------------------------

  @Get('feedback/promotions')
  async getFeedbackPromotions(
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.analyticsService.getFeedbackPromotions(status, type);
  }

  @Post('prescriptions/draft')
  async savePrescriptionDraft(@Body() dto: any) {
    return this.analyticsService.savePrescriptionDraft(dto);
  }

  @Get('feedback/summary')
  async getFeedbackSummary() {
    return this.analyticsService.getFeedbackSummary();
  }

  @Post('feedback/submit')
  async submitFeedback(
    @Body()
    dto: {
      id: string;
      feedback: 'helpful' | 'not-helpful';
      notes?: string;
      endPromotion?: boolean;
    },
  ) {
    return this.analyticsService.submitFeedback(dto.id, dto);
  }

  @Post('feedback/end')
  async endFeedbackPromotion(
    @Body()
    dto: {
      id: string;
      feedback?: 'helpful' | 'not-helpful';
      notes?: string;
    },
  ) {
    return this.analyticsService.endFeedbackPromotion(dto.id, dto);
  }

  @Post('feedback/recalibrate')
  async recalibrateModels(@Body() dto: { source?: string; reason?: string }) {
    return this.analyticsService.recalibrateModels(dto?.source, dto?.reason);
  }

  @Get('feedback/recalibration-events')
  async getRecalibrationEvents(@Query('status') status?: string) {
    return this.analyticsService.getRecalibrationEvents(status);
  }

  @Post('feedback/recalibration-events/recover')
  async recoverRecalibrationEvents() {
    return this.analyticsService.recoverRecalibrationEvents();
  }
}
