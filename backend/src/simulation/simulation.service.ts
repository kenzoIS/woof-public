import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuditService } from '../audit/audit.service';
import { Transaction } from '../csv/schemas/transaction.schema';
import {
  ENGINE_VERSION,
  simulate,
  compare,
  recommendations,
  validateConfig,
} from './simulation.engine';
import type {
  SimConfig,
  SimInputs,
  SimRun,
  SimService,
  SimEvent,
} from './simulation.types';

@Injectable()
export class SimulationService {
  constructor(
    @InjectModel(Transaction.name) private readonly transactions: Model<any>,
    @InjectModel('SimulationRun') private readonly runs: Model<any>,
    private readonly analytics: AnalyticsService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async inputs(
    source: string,
    date: string,
    startDate?: string,
    endDate?: string,
  ): Promise<SimInputs> {
    if (!['historical', 'forecast', 'custom'].includes(source))
      throw new BadRequestException(
        'Choose historical, forecast, or custom inputs.',
      );
    const validDate = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s));
    if (!validDate(date))
      throw new BadRequestException('A simulation date is required.');
    const physical = {
      sector: { $in: ['Services', 'Cafe'] },
      channel: 'POS',
    };
    const latest = await this.transactions
      .findOne(physical)
      .sort({ date: -1 })
      .select('date')
      .lean<{ date: Date } | null>();
    const end =
      endDate ||
      (latest?.date
        ? new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(latest.date))
        : date);
    const start =
      startDate ||
      new Date(Date.parse(end) - 29 * 86400000).toISOString().slice(0, 10);
    if (
      !validDate(start) ||
      !validDate(end) ||
      start > end ||
      Date.parse(end) - Date.parse(start) > 366 * 86400000
    )
      throw new BadRequestException(
        'Choose a history window of up to 366 days.',
      );
    const min = new Date(`${start}T00:00:00+08:00`),
      max = new Date(`${end}T23:59:59.999+08:00`);
    const match = { ...physical, date: { $gte: min, $lte: max } };
    const [items, visits, hours] = await Promise.all([
      this.transactions.aggregate([
        { $match: match },
        {
          $group: {
            _id: { name: '$productName', sector: '$sector' },
            quantity: { $sum: '$quantity' },
            revenue: { $sum: '$netSales' },
            orders: { $addToSet: '$transactionId' },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 40 },
      ]),
      this.transactions.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  date: '$date',
                  format: '%Y-%m-%d',
                  timezone: 'Asia/Manila',
                },
              },
              transaction: '$transactionId',
              sector: '$sector',
            },
          },
        },
        { $count: 'count' },
      ]),
      this.transactions.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              hour: { $hour: { date: '$date', timezone: 'Asia/Manila' } },
              day: {
                $dateToString: {
                  date: '$date',
                  format: '%Y-%m-%d',
                  timezone: 'Asia/Manila',
                },
              },
              transaction: '$transactionId',
              sector: '$sector',
            },
          },
        },
        { $group: { _id: '$_id.hour', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const days =
      Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    const services: SimService[] = items.map((row: any) => ({
      id: `${row._id.sector}:${row._id.name}`,
      name: row._id.name,
      sector: row._id.sector,
      weight: row.orders.length,
      duration: row._id.sector === 'Cafe' ? 10 : 45,
      price: row.quantity > 0 ? Math.max(0, row.revenue / row.quantity) : 0,
      inventoryUnits: 1,
      pets: row._id.sector === 'Services' ? 1 : 0,
    }));
    let customers = Math.round((visits[0]?.count || 0) / days);
    let arrivalWeights = Array.from(
      { length: 10 },
      (_, i) => hours.find((h: any) => h._id === i + 8)?.count || 0,
    );
    const provenance = [
      `Physical POS transactions, ${start} through ${end} (${days} calendar days, including days with no recorded sales).`,
      `Demand: distinct transaction ID per day and sector. A Cafe + Services basket is modeled as two visits; this is not a unique-person estimate.`,
      `Item mix: historical distinct transactions per item. Prices: net sales / units; each simulated visit purchases one selected service or menu item.`,
    ];
    const warnings = [
      `Operational assumptions are editable, not database observations: 08:00–18:00 hours; 3 service staff and stations; 2 Cafe staff and preparation slots; 1 cashier; 45-minute services / 10-minute Cafe preparation; 2-minute checkout; one stock unit per item; one pet per Services visit.`,
      `Appointment rates, pet handling probabilities, stock levels, patience and waiting capacity are user-configured assumptions. Satisfaction is an explicit queue-based proxy, not survey data.`,
    ];
    if (customers > 1500)
      warnings.push(
        `Historical/forecast demand of ${customers} exceeds the 1,500-visit run limit. The editable input is capped at 1,500; it does not represent the full demand. Use a shorter operating window or explicitly test a smaller scenario.`,
      );
    if (!items.length)
      warnings.push(
        'No eligible physical transactions were found. Load a history window containing existing services/menu items before running.',
      );
    if (hours.filter((h: any) => h._id > 0).length < 2) {
      arrivalWeights = Array(10).fill(1);
      warnings.push(
        'Historical timestamps do not support an hourly pattern. Uniform arrivals are an explicit assumption.',
      );
    }
    if (!arrivalWeights.some((w) => w > 0)) {
      arrivalWeights = Array(10).fill(1);
      warnings.push(
        'No arrivals within configured hours; a uniform profile is used until you edit it.',
      );
    }
    if (source === 'forecast') {
      const traffic = await this.analytics.getTrafficOptimizer({
        referenceDate: date,
        dateStart: start,
        dateEnd: end,
      });
      const hourly = traffic.todayContext?.hourlyForecast;
      if (!Array.isArray(hourly) || !hourly.length)
        throw new BadRequestException(
          'No traffic forecast is available for this date. Use historical or custom inputs.',
        );
      arrivalWeights = Array.from({ length: 10 }, (_, i) => {
        const h = hourly.find((x: any) => Number(x.hour) === i + 8);
        return Math.max(
          0,
          Number(h?.sectorVisits?.Services?.visits || 0) +
            Number(h?.sectorVisits?.Cafe?.visits || 0),
        );
      });
      customers = Math.round(arrivalWeights.reduce((a, b) => a + b, 0));
      for (const sector of ['Services', 'Cafe'] as const) {
        const demand = hourly
          .filter((h: any) => Number(h.hour) >= 8 && Number(h.hour) < 18)
          .reduce(
            (n: number, h: any) =>
              n + Math.max(0, Number(h.sectorVisits?.[sector]?.visits || 0)),
            0,
          );
        const weight = services
          .filter((s) => s.sector === sector)
          .reduce((n, s) => n + s.weight, 0);
        if (demand > 0 && !weight)
          throw new BadRequestException(
            `Forecast ${sector} demand has no matching historical item catalog in this window.`,
          );
        for (const service of services.filter((s) => s.sector === sector))
          service.weight = weight ? (service.weight / weight) * demand : 0;
      }
      if (!arrivalWeights.some((w) => w > 0))
        throw new BadRequestException(
          'The forecast has no Cafe or Services traffic within 08:00–18:00.',
        );
      provenance.push(
        `Demand and hourly arrivals: existing context-aware traffic forecast for ${date}. Service mix and prices remain historical; staffing and duration remain configurable.`,
      );
      warnings.push(
        'Forecast traffic is model output, not observed appointments. Weather/calendar adjustments come from the existing traffic analytics model.',
      );
    }
    const config: SimConfig = {
      name: source === 'custom' ? 'Custom scenario' : 'Baseline',
      date,
      dayType:
        new Date(`${date}T12:00:00+08:00`).getUTCDay() % 6 === 0
          ? 'Weekend'
          : 'Weekday',
      openHour: 8,
      minutes: 600,
      seed: 42,
      customers: Math.min(1500, customers),
      staff: 3,
      cafeStaff: 2,
      stations: 3,
      cafeStations: 2,
      cashiers: 1,
      checkoutMinutes: 2,
      patience: 60,
      waitThreshold: 30,
      waitingCapacity: 30,
      walkInRate: 30,
      cancellationRate: 0,
      noShowRate: 0,
      lateRate: 0,
      lateMinutes: 15,
      serviceInventory: 100,
      cafeInventory: 100,
      paymentFailureRate: 0,
      randomEvents: false,
      randomEventRate: 10,
      arrivalWeights,
      services,
      events: [],
    };
    return {
      source: source as SimInputs['source'],
      startDate: start,
      endDate: end,
      description:
        source === 'custom'
          ? 'Custom parameters with existing item catalog'
          : source === 'forecast'
            ? 'Forecast demand with historical item mix'
            : 'Historical average daily physical demand',
      provenance,
      warnings,
      config,
    };
  }

  async execute(
    body: { inputs: SimInputs; baseline: SimConfig; whatIf: SimConfig },
    userId: string,
    email: string,
  ): Promise<SimRun> {
    try {
      validateConfig(body?.baseline);
      validateConfig(body?.whatIf);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'Invalid simulation inputs.',
      );
    }
    if (body.baseline.seed !== body.whatIf.seed)
      throw new BadRequestException(
        'Baseline and What-If must use the same seed.',
      );
    if (
      body.baseline.date !== body.whatIf.date ||
      body.baseline.minutes !== body.whatIf.minutes ||
      body.baseline.openHour !== body.whatIf.openHour
    )
      throw new BadRequestException(
        'Comparison scenarios must share the date and operating window.',
      );
    if (
      !body.inputs ||
      !['historical', 'forecast', 'custom'].includes(body.inputs.source)
    )
      throw new BadRequestException('Analytics input provenance is required.');
    const requested = [...body.baseline.services, ...body.whatIf.services];
    const names = [...new Set(requested.map((s) => s.name))];
    const found = await this.transactions.aggregate([
      {
        $match: {
          sector: { $in: ['Services', 'Cafe'] },
          channel: 'POS',
          productName: { $in: names },
        },
      },
      { $group: { _id: { name: '$productName', sector: '$sector' } } },
    ]);
    const catalog = new Set(
      found.map((r: any) => `${r._id.sector}:${r._id.name}`),
    );
    if (
      requested.some(
        (s) => s.id !== `${s.sector}:${s.name}` || !catalog.has(s.id),
      )
    )
      throw new BadRequestException(
        'Only existing physical Cafe menu items and Services may be simulated.',
      );
    let baseline, whatIf, advice;
    try {
      baseline = simulate(body.baseline);
      whatIf = simulate(body.whatIf);
      advice = recommendations(baseline, whatIf);
    } catch (e) {
      void this.auditService?.record({
        actor: 'Owner',
        actorType: 'user',
        action: `Failed What-If Simulation: ${body?.whatIf?.name || 'Scenario'}`,
        module: 'simulation',
        category: 'ai_system',
        target: `${body?.whatIf?.name || 'Scenario'} (${body?.whatIf?.date || 'Unknown date'})`,
        status: 'failed',
        metadata: {
          error: e instanceof Error ? e.message : 'The simulation could not run.',
          userEmail: email,
        },
      });
      throw new BadRequestException(
        e instanceof Error ? e.message : 'The simulation could not run.',
      );
    }
    const run: SimRun = {
      engineVersion: ENGINE_VERSION,
      inputs: body.inputs,
      baseline,
      whatIf,
      comparison: compare(baseline, whatIf),
      recommendations: advice,
      createdBy: email,
    };
    const saved = await this.runs.create({ ...run, userId });

    const baselineRev = baseline.metrics?.revenue ?? 0;
    const whatIfRev = whatIf.metrics?.revenue ?? 0;
    const revDiff = whatIfRev - baselineRev;
    const revDiffStr = `${revDiff >= 0 ? '+' : ''}₱${revDiff.toLocaleString()}`;

    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: `Executed What-If Simulation: ${body.whatIf.name || 'Scenario'}`,
      module: 'simulation',
      category: 'ai_system',
      target: `${body.whatIf.name || 'Scenario'} (${body.whatIf.date})`,
      status: 'success',
      stateBefore: `Baseline: ₱${baselineRev.toLocaleString()} rev (${baseline.metrics?.served ?? 0} served)`,
      stateAfter: `What-If: ₱${whatIfRev.toLocaleString()} rev (${whatIf.metrics?.served ?? 0} served, diff ${revDiffStr})`,
      metadata: {
        scenarioName: body.whatIf.name,
        date: body.whatIf.date,
        engineVersion: ENGINE_VERSION,
        inputsSource: body.inputs?.source,
        baselineRevenue: baselineRev,
        whatIfRevenue: whatIfRev,
        servedDiff: (whatIf.metrics?.served ?? 0) - (baseline.metrics?.served ?? 0),
        recommendationsCount: advice.length,
        userEmail: email,
      },
    });

    return {
      ...run,
      _id: String(saved._id),
      createdAt: new Date(saved.createdAt).toISOString(),
    };
  }
  async inject(
    id: string,
    userId: string,
    email: string,
    minute: number,
    event: SimEvent,
  ): Promise<SimRun> {
    const saved = (await this.reopen(id, userId)) as unknown as SimRun;
    if (saved.engineVersion !== ENGINE_VERSION)
      throw new BadRequestException(
        'Start a new simulation to inject events into this older saved run.',
      );
    if (
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute >= saved.whatIf.config.minutes
    )
      throw new BadRequestException(
        'Inject an event before the simulation ends.',
      );
    const config = structuredClone(saved.whatIf.config);
    config.events.push({ ...event, start: minute });

    const eventDescriptor = event.label || event.effect || 'Event';
    void this.auditService?.record({
      actor: 'Owner',
      actorType: 'user',
      action: `Committed Scenario Configuration Change: ${eventDescriptor}`,
      module: 'simulation',
      category: 'ai_system',
      target: `${saved.whatIf.config.name} @ +${minute}m`,
      status: 'success',
      stateBefore: `${saved.whatIf.config.events.length} injected events`,
      stateAfter: `${config.events.length} injected events (added ${eventDescriptor} at +${minute}m)`,
      metadata: {
        simulationId: id,
        eventMinute: minute,
        eventLabel: event.label,
        eventEffect: event.effect,
        eventSector: event.sector,
        userEmail: email,
      },
    });

    return this.execute(
      { inputs: saved.inputs, baseline: saved.baseline.config, whatIf: config },
      userId,
      email,
    );
  }
  async history(userId: string) {
    return this.runs
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .select(
        'createdAt createdBy engineVersion whatIf.config.name whatIf.config.date whatIf.metrics.revenue whatIf.metrics.served',
      )
      .lean();
  }
  async reopen(id: string, userId: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid simulation run ID.');
    const run = await this.runs.findOne({ _id: id, userId }).lean();
    if (!run) throw new NotFoundException('Simulation run not found.');
    return run;
  }
}
