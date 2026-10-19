import type {
  SimConfig,
  SimCustomer,
  SimEvent,
  SimFrame,
  SimLog,
  SimMetrics,
  SimResult,
  SimComparisonRow,
} from './simulation.types';

export const ENGINE_VERSION = '2.0.0';
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function validateConfig(c: SimConfig): void {
  if (!c || typeof c !== 'object')
    throw new Error('Scenario configuration is required.');
  const range = (
    label: string,
    value: number,
    min: number,
    max: number,
    integer = false,
  ) => {
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      throw new Error(
        `${label} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}.`,
      );
  };
  if (typeof c.randomEvents !== 'boolean')
    throw new Error('Random events mode must be enabled or disabled.');
  range('Duration', c.minutes, 30, 1440, true);
  range('Opening hour', c.openHour, 0, 23);
  if (c.openHour * 60 + c.minutes > 1440)
    throw new Error('The simulation must close before midnight.');
  range('Customers', c.customers, 0, 1500, true);
  range('Seed', c.seed, 0, 4294967295, true);
  for (const k of [
    'staff',
    'cafeStaff',
    'stations',
    'cafeStations',
    'cashiers',
  ] as const)
    range(k, c[k], 0, 50, true);
  for (const k of [
    'walkInRate',
    'cancellationRate',
    'noShowRate',
    'lateRate',
    'paymentFailureRate',
    'randomEventRate',
  ] as const)
    range(k, c[k], 0, 100);
  range('Checkout duration', c.checkoutMinutes, 1, 120);
  range('Patience', c.patience, 1, 1440);
  range('Wait threshold', c.waitThreshold, 1, 1440);
  range('Waiting capacity', c.waitingCapacity, 1, 1500, true);
  range('Late minutes', c.lateMinutes, 0, 240, true);
  for (const k of ['serviceInventory', 'cafeInventory'] as const)
    range(k, c[k], 0, 100000, true);
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 100)
    throw new Error('Provide a scenario name (up to 100 characters).');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(c.date) ||
    !Number.isFinite(Date.parse(c.date))
  )
    throw new Error('Provide a valid simulation date.');
  if (
    !Array.isArray(c.services) ||
    c.services.length > 40 ||
    !c.services.length
  )
    throw new Error('Select 1–40 existing services or menu items.');
  if (new Set(c.services.map((s) => s.id)).size !== c.services.length)
    throw new Error('Service IDs must be unique.');
  for (const s of c.services) {
    if (
      typeof s.name !== 'string' ||
      !s.name ||
      s.name.length > 200 ||
      typeof s.id !== 'string' ||
      !['Services', 'Cafe'].includes(s.sector)
    )
      throw new Error('Service names and sectors are required.');
    range('Demand weight', s.weight, 0, 100000);
    range('Service duration', s.duration, 1, 720);
    range('Service price', s.price, 0, 100000);
    range('Resource units', s.inventoryUnits, 0, 100, true);
    range('Pets per visit', s.pets, 0, 10, true);
  }
  if (!c.services.some((s) => s.weight > 0))
    throw new Error('At least one service must have a positive demand weight.');
  if (
    !Array.isArray(c.arrivalWeights) ||
    c.arrivalWeights.length !== Math.ceil(c.minutes / 60) ||
    c.arrivalWeights.some((w) => !Number.isFinite(w) || w < 0) ||
    !c.arrivalWeights.some((w) => w > 0)
  )
    throw new Error(
      'Arrival weights need one nonnegative value per operating hour and a positive total.',
    );
  if (!Array.isArray(c.events) || c.events.length > 40)
    throw new Error('Use up to 40 combined events.');
  for (const e of c.events) {
    if (
      ![
        'staff',
        'stations',
        'demand',
        'duration',
        'inventory',
        'checkout',
        'closure',
        'late',
        'cancel',
        'noShow',
        'paymentFailure',
      ].includes(e.effect) ||
      !['Services', 'Cafe', 'All'].includes(e.sector)
    )
      throw new Error('Unsupported event effect or sector.');
    if (
      typeof e.id !== 'string' ||
      typeof e.label !== 'string' ||
      e.label.length > 200
    )
      throw new Error('Event ID and label are required.');
    if (e.audience && !['all', 'walkIn', 'appointment'].includes(e.audience))
      throw new Error('Choose a valid demand-event audience.');
    range('Event start', e.start, 0, c.minutes - 1, true);
    range('Event duration', e.duration, 1, c.minutes, true);
    range('Event value', e.value, -100000, 100000);
    if (
      ['demand', 'duration', 'checkout'].includes(e.effect) &&
      (e.value < 0 || e.value > 10)
    )
      throw new Error('Event multipliers must be between 0 and 10.');
    if (
      ['late', 'cancel', 'noShow', 'paymentFailure'].includes(e.effect) &&
      (e.value < 0 || e.value > 100)
    )
      throw new Error('Event probabilities must be between 0 and 100.');
    if (
      ['staff', 'stations', 'inventory'].includes(e.effect) &&
      !Number.isInteger(e.value)
    )
      throw new Error('Resource changes must be whole numbers.');
  }
}
const applies = (e: SimEvent, sector: string) =>
  e.sector === 'All' || e.sector === sector;
const weighted = (weights: number[], r: number) => {
  let n = r * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    n -= weights[i];
    if (n < 0) return i;
  }
  return weights.length - 1;
};

/** Fixed one-minute event steps; playback speed and animation never enter the calculation. */
export function simulate(config: SimConfig): SimResult {
  validateConfig(config);
  const c = structuredClone(config);
  const random = seededRandom(c.seed ^ 0x91ab);
  const events = [...c.events];
  if (c.randomEvents) {
    for (let t = 60; t < c.minutes; t += 60)
      if (random() * 100 < c.randomEventRate) {
        const options: Array<
          Pick<SimEvent, 'label' | 'effect' | 'sector' | 'value'>
        > = [
          {
            label: 'Unplanned staff break',
            effect: 'staff',
            sector: 'Services',
            value: -1,
          },
          {
            label: 'Service station interruption',
            effect: 'stations',
            sector: 'Services',
            value: -1,
          },
          {
            label: 'Additional pet handling time',
            effect: 'duration',
            sector: 'Services',
            value: 1.5,
          },
          {
            label: 'Checkout processing delay',
            effect: 'checkout',
            sector: 'All',
            value: 2,
          },
          {
            label: 'Unexpected walk-in demand',
            effect: 'demand',
            sector: 'All',
            value: 1.3,
          },
        ];
        events.push({
          ...options[Math.floor(random() * options.length)],
          id: `random-${t}`,
          start: t,
          duration: 30,
        });
      }
  }
  const at = (t: number) =>
    events.filter((e) => e.start <= t && t < e.start + e.duration);
  const sumEffect = (active: SimEvent[], effect: string, sector: string) =>
    active
      .filter((e) => e.effect === effect && applies(e, sector))
      .reduce((n, e) => n + e.value, 0);
  const multiplier = (active: SimEvent[], effect: string, sector: string) =>
    active
      .filter((e) => e.effect === effect && applies(e, sector))
      .reduce((n, e) => n * e.value, 1);
  const customers: SimCustomer[] = [];
  // The same candidate arrival draws are used in both scenarios, reducing comparison noise.
  for (let id = 1; id <= c.customers; id++) {
    const rng = seededRandom(c.seed + Math.imul(id, 2654435761));
    const bucket = weighted(c.arrivalWeights, rng());
    const rawArrival = Math.min(
      c.minutes - 1,
      bucket * 60 + Math.floor(rng() * Math.min(60, c.minutes - bucket * 60)),
    );
    const service =
      c.services[
        weighted(
          c.services.map((s) => s.weight),
          rng(),
        )
      ];
    const walkIn = rng() * 100 < c.walkInRate;
    const active = at(rawArrival);
    const cancelRoll = rng() * 100,
      noShowRoll = rng() * 100,
      lateRoll = rng() * 100;
    const cancelled =
      !walkIn &&
      cancelRoll <
        Math.min(
          100,
          c.cancellationRate + sumEffect(active, 'cancel', service.sector),
        );
    const noShow =
      !walkIn &&
      !cancelled &&
      noShowRoll <
        Math.min(
          100,
          c.noShowRate + sumEffect(active, 'noShow', service.sector),
        );
    const late =
      lateRoll <
      Math.min(100, c.lateRate + sumEffect(active, 'late', service.sector));
    const arrival = rawArrival + (late ? c.lateMinutes : 0);
    const base = {
      serviceId: service.id,
      sector: service.sector,
      pets: service.pets,
      price: service.price,
      duration: service.duration,
      walkIn,
      arrival,
      cancelled,
      noShow,
    };
    const demand = multiplier(
      active.filter(
        (e) =>
          !e.audience ||
          e.audience === 'all' ||
          (e.audience === 'walkIn' ? walkIn : !walkIn),
      ),
      'demand',
      service.sector,
    );
    if (demand > 5)
      throw new Error('Combined demand multipliers must not exceed 5×.');
    const copies = Math.floor(demand) + (rng() < demand % 1 ? 1 : 0);
    for (let j = 0; j < copies; j++) {
      if (customers.length >= 1500)
        throw new Error(
          'Scenario exceeds 1,500 simulated visits. Reduce demand or event multipliers.',
        );
      customers.push({
        ...base,
        id: (id - 1) * 10 + j + 1,
        arrival: Math.min(arrival + j, c.minutes + c.lateMinutes),
      });
    }
  }
  customers.sort((a, b) => a.arrival - b.arrival || a.id - b.id);
  const timeline: SimLog[] = [],
    frames: SimFrame[] = [];
  const log = (
    minute: number,
    label: string,
    impact: string,
    customerId?: number,
  ) => timeline.push({ minute, label, impact, customerId });
  const queue: SimCustomer[] = [],
    checkout: SimCustomer[] = [],
    checking: SimCustomer[] = [];
  const work: Record<string, { customer: SimCustomer; remaining: number }[]> = {
    Services: [],
    Cafe: [],
  };
  const paying: Array<{
    customer: SimCustomer;
    remaining: number;
    failed: boolean;
  }> = [];
  let serviceStock = c.serviceInventory,
    cafeStock = c.cafeInventory,
    stockoutMinute: number | null = null;
  let queueSum = 0,
    maxQueue = 0,
    observedMaxWait = 0,
    staffBusy = 0,
    staffAvailable = 0,
    stationAvailable = 0,
    cafeBusy = 0,
    cafeAvailable = 0,
    cashierBusy = 0,
    cashierAvailable = 0;
  let cursor = 0,
    served = 0,
    completedServices = 0,
    revenue = 0,
    inventoryConsumed = 0,
    paymentFailures = 0,
    firstQueueAlert = false;
  const waits: number[] = [];
  const lost = (p: SimCustomer, t: number, reason: string) => {
    p.lostAt = t;
    p.reason = reason;
    log(
      t,
      `Visit #${p.id}: ${reason}`,
      `Potential revenue of ₱${p.price.toFixed(2)} not completed.`,
      p.id,
    );
  };
  const metrics = (t: number): SimMetrics => {
    const arrived = customers.filter(
      (p) =>
        !p.cancelled && !p.noShow && p.arrival <= t && p.arrival < c.minutes,
    ).length;
    const lostCustomers = customers.filter((p) => p.lostAt !== undefined);
    const avgWait = waits.length
      ? waits.reduce((a, b) => a + b, 0) / waits.length
      : 0;
    const revenuePotential = customers.reduce((n, p) => n + p.price, 0);
    const currentWait = queue.reduce(
      (max, p) => Math.max(max, t - (p.checkInEnd ?? p.arrival)),
      0,
    );
    return {
      demand: customers.length,
      arrived,
      served,
      waiting: queue.length,
      petsWaiting: queue.reduce((n, p) => n + p.pets, 0),
      active: work.Services.length + work.Cafe.length,
      completedServices,
      checkoutQueue: checkout.length,
      inCheckout: paying.length,
      avgWait,
      maxWait: Math.max(observedMaxWait, ...waits, currentWait),
      currentWait,
      avgQueue: queueSum / Math.max(1, t),
      maxQueue,
      staffUtilization: staffAvailable ? (staffBusy / staffAvailable) * 100 : 0,
      stationUtilization: stationAvailable
        ? (staffBusy / stationAvailable) * 100
        : 0,
      cafeUtilization: cafeAvailable ? (cafeBusy / cafeAvailable) * 100 : 0,
      cashierUtilization: cashierAvailable
        ? (cashierBusy / cashierAvailable) * 100
        : 0,
      revenue,
      lostRevenue:
        lostCustomers.reduce((n, p) => n + p.price, 0) +
        customers
          .filter((p) => p.cancelled || p.noShow)
          .reduce((n, p) => n + p.price, 0),
      potentialRevenue: revenuePotential,
      projectedRevenue: t
        ? Math.min(revenuePotential, (revenue / t) * c.minutes)
        : 0,
      cancelled: customers.filter((p) => p.cancelled).length,
      noShows: customers.filter((p) => p.noShow).length,
      walkIns: customers.filter((p) => p.walkIn && p.arrival <= t).length,
      abandoned: lostCustomers.filter(
        (p) => p.reason?.includes('wait') || p.reason?.includes('Waiting'),
      ).length,
      unserved: lostCustomers.length,
      paymentFailures,
      serviceStock,
      cafeStock,
      inventoryConsumed,
      inventoryAffected: customers.filter(
        (p) => p.inventoryBlockedAt !== undefined,
      ).length,
      stockoutMinute,
      customersPerHour: t ? (served / t) * 60 : 0,
      servicesPerHour: t ? (completedServices / t) * 60 : 0,
      satisfaction: arrived
        ? Math.max(
            0,
            Math.min(
              100,
              100 *
                (served / arrived) *
                (1 - Math.min(1, avgWait / c.patience) * 0.5),
            ),
          )
        : 0,
      efficiency: arrived ? (served / arrived) * 100 : 0,
    };
  };
  for (let t = 0; t <= c.minutes; t++) {
    const active = at(t);
    const resources = (
      sector: 'Services' | 'Cafe',
      baseStaff: number,
      baseStations: number,
    ) => {
      const closed = active.some(
        (e) => e.effect === 'closure' && applies(e, sector),
      );
      return {
        staff: closed
          ? 0
          : Math.max(0, baseStaff + sumEffect(active, 'staff', sector)),
        stations: closed
          ? 0
          : Math.max(0, baseStations + sumEffect(active, 'stations', sector)),
      };
    };
    const svc = resources('Services', c.staff, c.stations),
      cafe = resources('Cafe', c.cafeStaff, c.cafeStations);
    const cashiers = active.some(
      (e) => e.effect === 'closure' && e.sector === 'All',
    )
      ? 0
      : c.cashiers;
    for (const e of events) {
      if (e.start === t) {
        log(
          t,
          e.label,
          `${e.effect}: ${e.value}; ${e.sector}; ${e.duration} minutes.`,
        );
        if (e.effect === 'inventory') {
          if (e.sector !== 'Cafe')
            serviceStock = Math.max(0, serviceStock + e.value);
          if (e.sector !== 'Services')
            cafeStock = Math.max(0, cafeStock + e.value);
        }
      }
      if (e.start + e.duration === t)
        log(
          t,
          `${e.label} ended`,
          e.effect === 'inventory'
            ? 'Stock changes persist until replenishment.'
            : 'Temporary resource or probability change removed.',
        );
    }
    // Complete work accrued during the previous minute before admitting new arrivals.
    for (const sector of ['Services', 'Cafe'] as const)
      for (let i = work[sector].length - 1; i >= 0; i--)
        if (work[sector][i].remaining <= 0) {
          const p = work[sector][i].customer;
          p.serviceEnd = t;
          completedServices++;
          checkout.push(p);
          work[sector].splice(i, 1);
          log(
            t,
            `Visit #${p.id}: service completed`,
            'Entered checkout queue.',
            p.id,
          );
        }
    for (let i = paying.length - 1; i >= 0; i--)
      if (paying[i].remaining <= 0) {
        const item = paying[i],
          p = item.customer;
        if (item.failed) {
          paymentFailures++;
          lost(p, t, 'Payment failed after retry');
        } else {
          p.completed = t;
          served++;
          revenue += p.price;
          log(
            t,
            `Visit #${p.id}: paid and exited`,
            `Revenue +₱${p.price.toFixed(2)}.`,
            p.id,
          );
        }
        paying.splice(i, 1);
      }
    while (cursor < customers.length && customers[cursor].arrival <= t) {
      const p = customers[cursor++];
      if (p.cancelled || p.noShow) {
        log(
          t,
          `Visit #${p.id}: ${p.cancelled ? 'appointment cancelled' : 'no-show'}`,
          'Did not enter the queue.',
          p.id,
        );
        continue;
      }
      if (t >= c.minutes) {
        lost(p, t, 'Arrived after closing');
        continue;
      }
      log(
        t,
        `Visit #${p.id}: ${p.walkIn ? 'walk-in' : 'appointment'} arrived`,
        `${p.sector}; ${p.pets} pet(s); one-minute check-in.`,
        p.id,
      );
      p.checkInEnd = t + 1;
      checking.push(p);
    }
    for (let i = checking.length - 1; i >= 0; i--)
      if (checking[i].checkInEnd! <= t) {
        const p = checking.splice(i, 1)[0];
        if (queue.length >= c.waitingCapacity)
          lost(p, t, 'Waiting area capacity reached');
        else {
          queue.push(p);
          log(
            t,
            `Visit #${p.id}: joined queue`,
            'Awaiting available staff, station, and stock.',
            p.id,
          );
        }
      }
    observedMaxWait = Math.max(
      observedMaxWait,
      ...queue.map((p) => t - (p.checkInEnd ?? p.arrival)),
    );
    queue.sort(
      (a, b) => (a.checkInEnd ?? 0) - (b.checkInEnd ?? 0) || a.id - b.id,
    );
    for (let i = queue.length - 1; i >= 0; i--)
      if (t - (queue[i].checkInEnd ?? t) >= c.patience)
        lost(queue.splice(i, 1)[0], t, 'Abandoned after excessive wait');
    if (t < c.minutes) {
      for (const sector of ['Services', 'Cafe'] as const) {
        const res = sector === 'Services' ? svc : cafe;
        for (
          let i = 0;
          i < queue.length &&
          work[sector].length < Math.min(res.staff, res.stations);
        ) {
          const p = queue[i];
          if (p.sector !== sector) {
            i++;
            continue;
          }
          const service = c.services.find((s) => s.id === p.serviceId)!;
          const stock = sector === 'Services' ? serviceStock : cafeStock;
          if (stock < service.inventoryUnits) {
            if (p.inventoryBlockedAt === undefined) p.inventoryBlockedAt = t;
            if (stockoutMinute === null) {
              stockoutMinute = t;
              log(
                t,
                `${sector} resource shortage`,
                'A required resource prevented a service start.',
              );
            }
            i++;
            continue;
          }
          queue.splice(i, 1);
          p.serviceStart = t;
          p.stockUsed = service.inventoryUnits;
          if (sector === 'Services') serviceStock -= service.inventoryUnits;
          else cafeStock -= service.inventoryUnits;
          inventoryConsumed += service.inventoryUnits;
          waits.push(t - (p.checkInEnd ?? p.arrival));
          // Temporary duration events slow progress instead of pre-writing an outcome.
          work[sector].push({ customer: p, remaining: p.duration });
          log(
            t,
            `Visit #${p.id}: service started`,
            `${service.name}; stock used ${service.inventoryUnits}.`,
            p.id,
          );
        }
      }
      while (checkout.length && paying.length < cashiers) {
        const p = checkout.shift()!;
        p.checkoutStart = t;
        const rng = seededRandom(c.seed ^ Math.imul(p.id, 1013));
        const failed =
          rng() * 100 <
          Math.min(
            100,
            c.paymentFailureRate +
              sumEffect(active, 'paymentFailure', p.sector),
          );
        paying.push({
          customer: p,
          remaining: c.checkoutMinutes * (failed ? 2 : 1),
          failed,
        });
        log(
          t,
          `Visit #${p.id}: checkout started`,
          failed
            ? 'Payment retry adds a second checkout attempt.'
            : 'Processing payment.',
          p.id,
        );
      }
      let minuteStaffBusy = 0,
        minuteCafeBusy = 0;
      for (const sector of ['Services', 'Cafe'] as const) {
        const res = sector === 'Services' ? svc : cafe;
        const available = Math.min(res.staff, res.stations);
        const speed = multiplier(active, 'duration', sector);
        if (speed === 0)
          throw new Error(
            'Service duration multiplier must be greater than zero.',
          );
        for (let slot = 0; slot < work[sector].length; slot++) {
          const item = work[sector][slot];
          const before = item.customer.duration - item.remaining;
          const working = slot < available;
          if (working) item.remaining = Math.max(0, item.remaining - 1 / speed);
          const after = item.customer.duration - item.remaining;
          const segments = (item.customer.workSegments ??= []);
          const previous = segments[segments.length - 1];
          const delta = after - before;
          const previousRate = previous
            ? (previous.processedEnd - previous.processedStart) /
              (previous.end - previous.start)
            : -1;
          if (
            previous &&
            previous.end === t &&
            previous.slot === slot &&
            previous.working === working &&
            Math.abs(previousRate - delta) < 1e-8
          ) {
            previous.end = t + 1;
            previous.processedEnd = after;
          } else
            segments.push({
              start: t,
              end: t + 1,
              processedStart: before,
              processedEnd: after,
              slot,
              working,
            });
        }
        const used = Math.min(work[sector].length, available);
        if (sector === 'Services') minuteStaffBusy = used;
        else minuteCafeBusy = used;
      }
      const checkoutMultiplier = multiplier(active, 'checkout', 'All');
      if (checkoutMultiplier === 0)
        throw new Error('Checkout multiplier must be greater than zero.');
      for (const p of paying.slice(0, cashiers))
        p.remaining -= 1 / checkoutMultiplier;
      staffBusy += minuteStaffBusy;
      staffAvailable += svc.staff;
      stationAvailable += svc.stations;
      cafeBusy += minuteCafeBusy;
      cafeAvailable += cafe.staff;
      cashierBusy += Math.min(paying.length, cashiers);
      cashierAvailable += cashiers;
      queueSum += queue.length;
      maxQueue = Math.max(maxQueue, queue.length);
      if (
        !firstQueueAlert &&
        queue.some((p) => t - (p.checkInEnd ?? t) > c.waitThreshold)
      ) {
        firstQueueAlert = true;
        log(
          t,
          'Waiting threshold exceeded',
          `At least one visit waited over ${c.waitThreshold} minutes.`,
        );
      }
    } else {
      for (const p of customers)
        if (
          !p.cancelled &&
          !p.noShow &&
          p.completed === undefined &&
          p.lostAt === undefined
        )
          lost(p, t, 'Uncompleted at closing');
    }
    frames.push({
      minute: t,
      metrics: metrics(t),
      serviceStaff: svc.staff,
      cafeStaff: cafe.staff,
      stations: svc.stations,
      cafeStations: cafe.stations,
      cashiers,
    });
  }
  const final = metrics(c.minutes);
  final.projectedRevenue = final.revenue;
  const bottlenecks: string[] = [];
  if (firstQueueAlert)
    bottlenecks.push(
      `Service waiting exceeded the configured ${c.waitThreshold}-minute threshold. Maximum queue: ${maxQueue} visits.`,
    );
  if (final.staffUtilization >= 90)
    bottlenecks.push(
      `Pet-service staff used ${final.staffUtilization.toFixed(1)}% of available staff-minutes.`,
    );
  if (final.stationUtilization >= 90)
    bottlenecks.push(
      `Pet-service stations used ${final.stationUtilization.toFixed(1)}% of available station-minutes.`,
    );
  if (final.cashierUtilization >= 90)
    bottlenecks.push(
      `Checkout used ${final.cashierUtilization.toFixed(1)}% of available cashier-minutes.`,
    );
  if (stockoutMinute !== null)
    bottlenecks.push(
      `Required stock first blocked a service at minute ${stockoutMinute}. Remaining stocks: Services ${serviceStock}, Cafe ${cafeStock}.`,
    );
  if (final.unserved)
    bottlenecks.push(
      `${final.unserved} arrivals did not finish payment before closing or abandoned the operation.`,
    );
  return {
    config: c,
    metrics: final,
    customers,
    frames,
    timeline: timeline.sort((a, b) => a.minute - b.minute),
    events,
    bottlenecks,
  };
}
export function compare(
  baseline: SimResult,
  whatIf: SimResult,
): SimComparisonRow[] {
  const fields: Array<[keyof SimMetrics, string, string]> = [
    ['avgWait', 'Average service wait', 'min'],
    ['maxWait', 'Maximum wait', 'min'],
    ['served', 'Customers served', 'visits'],
    ['unserved', 'Unserved arrivals', 'visits'],
    ['staffUtilization', 'Service staff utilization', '%'],
    ['stationUtilization', 'Station utilization', '%'],
    ['cafeUtilization', 'Cafe staff utilization', '%'],
    ['cashierUtilization', 'Checkout utilization', '%'],
    ['revenue', 'Revenue', 'PHP'],
    ['lostRevenue', 'Unrealized potential revenue', 'PHP'],
    ['maxQueue', 'Maximum queue', 'visits'],
    ['satisfaction', 'Satisfaction proxy', 'score'],
    ['efficiency', 'Completion efficiency', '%'],
  ];
  return fields.map(([key, label, unit]) => {
    const b = Number(baseline.metrics[key]),
      w = Number(whatIf.metrics[key]);
    return {
      key,
      label,
      unit,
      baseline: b,
      whatIf: w,
      difference: w - b,
      percent: b === 0 ? null : ((w - b) / b) * 100,
    };
  });
}
export function recommendations(b: SimResult, w: SimResult): string[] {
  const result: string[] = [];
  const wait = w.metrics.avgWait - b.metrics.avgWait,
    served = w.metrics.served - b.metrics.served,
    rev = w.metrics.revenue - b.metrics.revenue;
  result.push(
    `Compared with baseline, this scenario ${served >= 0 ? 'completed' : 'lost'} ${Math.abs(served)} ${served >= 0 ? 'additional' : 'fewer'} paid visits and changed revenue by ${rev >= 0 ? '+' : ''}₱${rev.toFixed(2)}. Average service wait changed by ${wait >= 0 ? '+' : ''}${wait.toFixed(1)} minutes.`,
  );
  // Counterfactual reruns substantiate operational recommendations rather than relying on a generic rule.
  for (const [field, label] of [
    ['staff', 'pet-service staff member'],
    ['stations', 'pet-service station'],
    ['cafeStaff', 'cafe staff member'],
    ['cashiers', 'cashier'],
  ] as const) {
    if (w.config[field] >= 50) continue;
    const candidate = simulate({ ...w.config, [field]: w.config[field] + 1 });
    const gain = candidate.metrics.served - w.metrics.served,
      delta = w.metrics.avgWait - candidate.metrics.avgWait;
    if (gain > 0 || delta > 1)
      result.push(
        `Adding one ${label} in a matched-seed rerun completed ${gain} more paid visits and ${delta >= 0 ? 'reduced' : 'increased'} average wait by ${Math.abs(delta).toFixed(1)} minutes (revenue change: ₱${(candidate.metrics.revenue - w.metrics.revenue).toFixed(2)}).`,
      );
    else if (field === 'staff' && w.config.staff >= w.config.stations)
      result.push(
        'An extra pet-service staff member did not improve paid throughput in the rerun; check station availability before increasing staffing.',
      );
  }
  if (w.metrics.stockoutMinute !== null)
    result.push(
      `Review stock before minute ${w.metrics.stockoutMinute}: required resources blocked service starts in this scenario. Set replenishment timing and rerun to test the effect.`,
    );
  return result;
}
