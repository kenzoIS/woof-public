import {
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { SettingsService } from '../settings/settings.service';
import {
  AcknowledgeAlertDto,
  AlertSeverity,
  ResolveAlertDto,
  SystemAlert,
  UserNotification,
} from './alerts.types';

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);

  // In-memory persistent alert registry (keyed by stable alertKey)
  private readonly alerts = new Map<string, SystemAlert>();

  // In-memory persistent user notification registry (keyed by notification ID)
  private readonly notifications = new Map<string, UserNotification>();

  // Tracks opportunity keys that have already been audited to prevent duplicate logs on polling
  private readonly loggedOpportunityKeys = new Set<string>();

  private lastEvaluationTime: number = 0;
  private readonly CACHE_TTL_MS = 60_000; // 60s cache for high throughput

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly analyticsService: AnalyticsService,
    private readonly settingsService: SettingsService,
  ) {}

  private stableId(prefix: string, key: string): string {
    return `${prefix}-${key.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase()}`;
  }

  async onModuleInit() {
    this.logger.log('Initializing WOOF Alerts & Notification Service...');
    try {
      await this.hydrateFromDatabase();
      await this.evaluateAllRules();
    } catch (err: any) {
      this.logger.warn(
        `Initial alert evaluation completed with advisory: ${err?.message || err}`,
      );
    }
  }

  /**
   * Automatic periodic recalibration runs every 15 minutes to synchronize with
   * dynamic Traffic Optimizer predictions, time window transitions, and daily rollovers.
   */
  @Interval(15 * 60 * 1000)
  async handleAutomaticRecalibration() {
    try {
      await this.evaluateAllRules();
    } catch (err: any) {
      this.logger.debug(`Periodic alert recalibration note: ${err?.message || err}`);
    }
  }

  /**
   * Hydrates active alerts and notifications from Supabase if tables exist.
   */
  private async hydrateFromDatabase() {
    try {
      const { data: dbAlerts, error: alertErr } = await this.supabaseService.client
        .from('system_alerts')
        .select('*')
        .in('status', ['active', 'acknowledged']);

      if (alertErr) {
        throw new Error(`system_alerts hydration failed: ${alertErr.message}`);
      }
      if (Array.isArray(dbAlerts)) {
        for (const row of dbAlerts) {
          const alert: SystemAlert = {
            id: row.id,
            alertKey: row.alert_key,
            module: row.module,
            severity: row.severity,
            classification: row.classification,
            title: row.title,
            evidence: row.evidence,
            targetUrl: row.target_url,
            actionLabel: row.action_label,
            status: row.status,
            firstTriggeredAt: row.first_triggered_at,
            lastEvaluatedAt: row.last_evaluated_at,
            acknowledgedAt: row.acknowledged_at,
            acknowledgedBy: row.acknowledged_by,
            snoozeUntil: row.snooze_until,
            resolvedAt: row.resolved_at,
            resolutionType: row.resolution_type,
            resolutionReason: row.resolution_reason,
            metadata: row.metadata,
          };
          this.alerts.set(alert.alertKey, alert);
        }
        this.logger.log(`Hydrated ${dbAlerts.length} active alerts from database.`);
      }
    } catch (err: any) {
      this.logger.error(`Database alerts hydration failed: ${err?.message || err}`);
    }

    try {
      const { data: dbNotifs, error: notifErr } = await this.supabaseService.client
        .from('user_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (notifErr) {
        throw new Error(`user_notifications hydration failed: ${notifErr.message}`);
      }
      if (Array.isArray(dbNotifs)) {
        for (const row of dbNotifs) {
          this.notifications.set(row.id, {
            id: row.id,
            recipientEmail: row.recipient_email,
            type: row.type,
            title: row.title,
            message: row.message,
            targetUrl: row.target_url,
            actionLabel: row.action_label,
            read: Boolean(row.read),
            readAt: row.read_at,
            dismissed: Boolean(row.dismissed),
            createdAt: row.created_at,
            metadata: row.metadata,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Database notifications hydration failed: ${err?.message || err}`);
    }
  }

  /**
   * Main idempotent evaluation engine.
   * Compares empirical system metrics with thresholds and updates stable alert states.
   */
  async evaluateAllRules(): Promise<SystemAlert[]> {
    const thresholds = this.settingsService.getAlertThresholds();
    const evaluatedKeys = new Set<string>();
    const nowIso = new Date().toISOString();

    const manilaDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const manilaHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
    );

    // ────────────────────────────────────────────────────────────────────────
    // RULE 1: Peak Congested Window & Staffing Bottlenecks (Traffic Optimizer)
    // The Traffic Optimizer is the SINGLE SOURCE OF TRUTH.
    // Retrieves calculated peakCongestion directly from todayContext.
    // ────────────────────────────────────────────────────────────────────────
    try {
      const optimizer = await this.analyticsService.getTrafficOptimizer();
      const todayCtx = optimizer?.todayContext;
      const peak = todayCtx?.peakCongestion;

      if (todayCtx && peak) {
        const peakHour = Number(peak.hour);
        const timeWindow = peak.timeWindow || `${peak.startLabel} – ${peak.endLabel}`;
        const alertKey = `ALERT_PEAK_CONGESTION:${todayCtx.date || manilaDateStr}:${peakHour}`;
        evaluatedKeys.add(alertKey);

        const delta = Number(peak.staffDelta ?? Math.max(0, (peak.recommendedStaff || 0) - (peak.scheduledStaff || 0)));
        const util = Number(peak.capacityUtilizationPercent || 0);
        const demand = peak.demandLevel || 'Moderate';
        const predictedVisits = Number(peak.predictedVisits || 0);
        const scheduledStaff = Number(peak.scheduledStaff || 0);
        const recommendedStaff = Number(peak.recommendedStaff || 0);

        // Extract affected sectors directly from peak sectorVisits
        const affectedSectors: string[] = [];
        if (peak.sectorVisits) {
          for (const [sName, sData] of Object.entries<any>(peak.sectorVisits)) {
            if (sData.utilizationPercent >= 40 || sData.visits >= 2) {
              affectedSectors.push(sName);
            }
          }
        }
        if (affectedSectors.length === 0) {
          affectedSectors.push('Cafe', 'Services');
        }
        const sectorsStr = affectedSectors.join(' & ');

        const isCritical = delta >= 2 || util >= 80;
        const severity: AlertSeverity = isCritical ? 'critical' : 'warning';

        const title = isCritical
          ? `High Customer Traffic & Staffing Deficit (${timeWindow})`
          : `Peak Congestion Window: ${sectorsStr} (${timeWindow})`;

        // Business-friendly explanation with ZERO statistical / modeling jargon (No Erlang, Prophet, etc.)
        // Displays strictly the capacity load percentage without visit count
        const evidence = delta > 0
          ? `Customer traffic is projected to peak between ${timeWindow} (${util}% capacity load). Currently, ${scheduledStaff} staff are scheduled against ${recommendedStaff} recommended. To prevent customer service delays, consider reallocating ${delta} team member(s) to ${sectorsStr} during this window.`
          : `Customer traffic is projected to peak between ${timeWindow} (${util}% capacity load, ${demand} demand). Scheduled staffing (${scheduledStaff}) matches expected customer volume. Monitor floor flow during this peak window.`;

        await this.upsertAlert({
          alertKey,
          module: affectedSectors.includes('Services') ? 'services' : 'cafe',
          severity,
          classification: 'PREDICTED',
          title,
          evidence,
          targetUrl: '/ai-simulation?tab=traffic-optimizer',
          actionLabel: 'VIEW TRAFFIC OPTIMIZER',
          actor: 'Traffic Optimizer',
          auditModule: 'traffic_optimizer',
          metadata: {
            date: todayCtx.date || manilaDateStr,
            hour: peakHour,
            timeWindow,
            predictedVisits,
            scheduledStaff,
            recommendedStaff,
            staffDeficit: delta,
            capacityUtilizationPercent: util,
            demandLevel: demand,
            affectedSectors,
          },
        });
      }

      // ──────────────────────────────────────────────────────────────────────
      // Today's Expected Visits (All Hours) Alert & Notification
      // Registered as both a SystemAlert (for Home Dashboard) and a UserNotification
      // ──────────────────────────────────────────────────────────────────────
      if (todayCtx && todayCtx.totalExpectedVisits != null) {
        const totalVisits = Number(todayCtx.totalExpectedVisits || 0);
        const dayLabel = todayCtx.dayOfWeek || 'Today';
        const dateStr = todayCtx.date || manilaDateStr;
        const visitsNotifId = `NTF-EXPECTED-VISITS-${dateStr.replace(/-/g, '')}`;
        const visitsAlertKey = `ALERT_EXPECTED_VISITS:${dateStr}`;
        evaluatedKeys.add(visitsAlertKey);

        // System Alert visible on Home Dashboard
        await this.upsertAlert({
          alertKey: visitsAlertKey,
          module: 'forecast',
          severity: 'advisory',
          classification: 'PREDICTED',
          title: `Today's Expected Visits: ~${totalVisits} Predicted Visits (All Hours)`,
          evidence: `Traffic Optimizer projects approximately ${totalVisits} customer visits across all operating hours (07:00 – 19:00) on ${dayLabel}, ${dateStr}. Daily staffing and inventory levels are aligned for this anticipated traffic flow.`,
          targetUrl: '/ai-simulation?tab=traffic-optimizer',
          actionLabel: 'VIEW TRAFFIC FORECAST',
          actor: 'Traffic Optimizer',
          auditModule: 'traffic_optimizer',
          metadata: {
            date: dateStr,
            dayOfWeek: dayLabel,
            totalExpectedVisits: totalVisits,
            classification: 'PREDICTED',
            weatherCondition: todayCtx.weatherCondition,
          },
        });

        // Mirror in User Notifications
        await this.upsertOpportunityNotification({
          id: visitsNotifId,
          oppKey: `EXPECTED_VISITS:${dateStr}`,
          recipientEmail: 'all',
          type: 'info',
          title: `Predicted Daily Traffic: ~${totalVisits} Expected Visits (All Hours)`,
          message: `Traffic Optimizer projects approximately ${totalVisits} customer visits across all operating hours (07:00 – 19:00) on ${dayLabel}, ${dateStr}. Daily staffing and supplies are aligned to support this anticipated traffic flow.`,
          targetUrl: '/ai-simulation?tab=traffic-optimizer',
          actionLabel: 'VIEW TRAFFIC FORECAST',
          metadata: {
            date: dateStr,
            dayOfWeek: dayLabel,
            totalExpectedVisits: totalVisits,
            classification: 'PREDICTED',
            weatherCondition: todayCtx.weatherCondition,
          },
        });
      }
    } catch (err: any) {
      this.logger.debug(`Rule 1 (Peak Congestion) evaluation note: ${err?.message || err}`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // RULE 2: Data Staleness Warning (Transaction Freshness in Asia/Manila)
    // ────────────────────────────────────────────────────────────────────────
    try {
      const dataRange = await this.analyticsService.getDataRange();
      if (dataRange?.historyEndDate) {
        const historyEnd = new Date(dataRange.historyEndDate);
        const daysStale = Math.floor(
          (Date.now() - historyEnd.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysStale > thresholds.dataStalenessDays) {
          const alertKey = 'ALERT_DATA_STALENESS:System';
          evaluatedKeys.add(alertKey);

          await this.upsertAlert({
            alertKey,
            module: 'pipeline',
            severity: 'warning',
            classification: 'OBSERVED',
            title: `Transaction Dataset Staleness (${daysStale} Days Old)`,
            evidence: `The newest ingested transaction record is dated ${dataRange.historyEndDate.slice(0, 10)}. Staleness exceeds configured threshold (${thresholds.dataStalenessDays} days). Demand forecasts and promotional recommendations may use aged history.`,
            targetUrl: 'action:openIngestionDrawer',
            actionLabel: 'OPEN DATA INGESTION',
            actor: 'WOOF Alert Engine',
            auditModule: 'pipeline',
            metadata: {
              historyEndDate: dataRange.historyEndDate,
              daysStale,
              thresholdDays: thresholds.dataStalenessDays,
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.debug(`Rule 2 evaluation note: ${err?.message || err}`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // RULE 3: Channel Integration Health (Respects disabled/omitted integrations)
    // ────────────────────────────────────────────────────────────────────────
    try {
      const channelStatus = await this.analyticsService.getChannelStatus();
      if (channelStatus && Array.isArray(channelStatus.channels)) {
        for (const ch of channelStatus.channels) {
          if (ch.connectionMode === 'disabled' || ch.status === 'omitted') {
            continue;
          }

          if (ch.status === 'error' || (ch.connectionMode === 'active-sync' && !ch.connected)) {
            const alertKey = `ALERT_CHANNEL_ERROR:${ch.channel}`;
            evaluatedKeys.add(alertKey);

            await this.upsertAlert({
              alertKey,
              module: 'pipeline',
              severity: 'critical',
              classification: 'OBSERVED',
              title: `${ch.label || ch.channel} Channel Sync Interrupted`,
              evidence: `Integration for ${ch.label || ch.channel} is failing health verification. Ingestion is paused.`,
              targetUrl: 'action:openIngestionDrawer',
              actionLabel: 'VERIFY CHANNEL SYNC',
              actor: 'WOOF Alert Engine',
              auditModule: 'pipeline',
              metadata: { channel: ch.channel },
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.debug(`Rule 3 evaluation note: ${err?.message || err}`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // RULE 4: Happy Hour (Next Quiet Period) — Business Opportunity
    // ────────────────────────────────────────────────────────────────────────
    try {
      const qp = await this.analyticsService.getNextQuietPeriod();
      if (qp && qp.status === 'success') {
        const targetDate = String(qp.targetDate || '');
        const targetHour = Number(qp.targetHour ?? 14);
        const dropPercent = Math.round(Number(qp.predictedTrafficDrop ?? 35));
        const items = qp.recommendedItems || [];
        const itemNames =
          items
            .map((i: any) => `${i.itemKey} (-${i.recommendedDiscount || 15}%)`)
            .join(', ') || 'Americano (iced) (-15%), Chicken Cordon Bleu With Rice (-15%)';
        const dayLabel = qp.targetDayName || targetDate;

        const isUpcoming =
          targetDate > manilaDateStr ||
          (targetDate === manilaDateStr && targetHour >= manilaHour);

        if (isUpcoming) {
          const oppKey = `OPP_HAPPY_HOUR:${targetDate}:${targetHour}`;
          const oppId = `NTF-OPP-HAPPY-HOUR-${targetDate.replace(/-/g, '')}-${String(targetHour).padStart(2, '0')}`;

          await this.upsertOpportunityNotification({
            id: oppId,
            oppKey,
            recipientEmail: 'all',
            type: 'opportunity',
            title: `Business Opportunity: Next Quiet Period (${dayLabel} @ ${String(targetHour).padStart(2, '0')}:00)`,
            message: `Predicted traffic lull of ~${dropPercent}% at ${String(targetHour).padStart(2, '0')}:00 - ${String(targetHour + 1).padStart(2, '0')}:00. Recommended promotional tactic: Dynamic Happy Hour discount on ${itemNames} to stimulate off-peak walk-ins.`,
            targetUrl: '/ai-simulation?tab=traffic-optimizer',
            actionLabel: 'PLAN PROMOTION',
            metadata: {
              classification: 'PREDICTED',
              targetDate,
              targetHour,
              predictedTrafficDrop: dropPercent,
              probabilityScore: qp.probabilityScore,
              recommendedItems: items,
              sector: 'Cafe',
              dayName: dayLabel,
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.debug(`Rule 4 (Happy Hour Opportunity) evaluation note: ${err?.message || err}`);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Auto-resolve any active alerts whose trigger condition has cleared/passed
    // ────────────────────────────────────────────────────────────────────────
    for (const [key, alert] of this.alerts.entries()) {
      if (alert.status === 'active' || alert.status === 'acknowledged') {
        if (!evaluatedKeys.has(key)) {
          await this.autoResolveAlert(
            key,
            'Metric normalized within acceptable operating bounds or predicted window has elapsed.',
          );
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Expire past opportunities whose window has elapsed
    // ────────────────────────────────────────────────────────────────────────
    for (const notif of this.notifications.values()) {
      if (notif.type === 'opportunity' && !notif.dismissed && notif.metadata) {
        const tDate = String(notif.metadata.targetDate || '');
        const tHour = Number(notif.metadata.targetHour || 0);
        if (tDate) {
          const hasPassed =
            tDate < manilaDateStr ||
            (tDate === manilaDateStr && manilaHour > tHour + 1);
          if (hasPassed) {
            notif.dismissed = true;
            void this.supabaseService.client
              .from('user_notifications')
              .update({ dismissed: true })
              .eq('id', notif.id);

            void this.auditService.record({
              actor: 'System',
              actorType: 'system',
              action: 'OPPORTUNITY_EXPIRED',
              module: 'happy_hour',
              category: 'workflow',
              target: notif.title,
              status: 'success',
              stateBefore: 'opportunity',
              stateAfter: 'expired',
              metadata: {
                initiatedBy: 'Traffic Optimizer',
                notificationId: notif.id,
                targetDate: tDate,
                targetHour: tHour,
                reason: 'Quiet period window has elapsed.',
              },
            });
          }
        }
      }
    }

    this.lastEvaluationTime = Date.now();
    return this.getActiveAlerts();
  }

  /**
   * Idempotent alert creation or evidence update.
   * If already active or acknowledged, updates evidence without spamming audit logs.
   */
  private async upsertAlert(input: {
    alertKey: string;
    module: SystemAlert['module'];
    severity: SystemAlert['severity'];
    classification: SystemAlert['classification'];
    title: string;
    evidence: string;
    targetUrl: string;
    actionLabel: string;
    actor?: string;
    auditModule?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SystemAlert> {
    const existing = this.alerts.get(input.alertKey);
    const nowIso = new Date().toISOString();

    if (existing && (existing.status === 'active' || existing.status === 'acknowledged')) {
      const metadata = { ...existing.metadata, ...input.metadata };
      const { error } = await this.supabaseService.client
        .from('system_alerts')
        .update({
          evidence: input.evidence,
          target_url: input.targetUrl,
          action_label: input.actionLabel,
          last_evaluated_at: nowIso,
          metadata,
        })
        .eq('id', existing.id);
      if (error) throw new Error(`Could not persist alert ${existing.id}: ${error.message}`);

      existing.evidence = input.evidence;
      existing.targetUrl = input.targetUrl;
      existing.actionLabel = input.actionLabel;
      existing.lastEvaluatedAt = nowIso;
      existing.metadata = metadata;

      return existing;
    }

    // Alert keys identify a single real-world condition. Stable IDs prevent a
    // backend restart from producing a second, unread copy of the same alert.
    const id = this.stableId('ALR', input.alertKey);
    const newAlert: SystemAlert = {
      id,
      alertKey: input.alertKey,
      module: input.module,
      severity: input.severity,
      classification: input.classification,
      title: input.title,
      evidence: input.evidence,
      targetUrl: input.targetUrl,
      actionLabel: input.actionLabel,
      status: 'active',
      firstTriggeredAt: nowIso,
      lastEvaluatedAt: nowIso,
      metadata: input.metadata,
    };

    const { error: insertError } = await this.supabaseService.client
      .from('system_alerts')
      .insert({
        id: newAlert.id,
        alert_key: newAlert.alertKey,
        module: newAlert.module,
        severity: newAlert.severity,
        classification: newAlert.classification,
        title: newAlert.title,
        evidence: newAlert.evidence,
        target_url: newAlert.targetUrl,
        action_label: newAlert.actionLabel,
        status: newAlert.status,
        first_triggered_at: newAlert.firstTriggeredAt,
        last_evaluated_at: newAlert.lastEvaluatedAt,
        metadata: newAlert.metadata || {},
      });
    if (insertError) throw new Error(`Could not create alert ${newAlert.id}: ${insertError.message}`);

    this.alerts.set(input.alertKey, newAlert);

    // Audit Log: Record state transition
    void this.auditService.record({
      actor: 'System',
      actorType: 'system',
      action: 'ALERT_TRIGGERED',
      module: input.auditModule || (input.module === 'pipeline' ? 'pipeline' : 'alerts'),
      category: 'workflow',
      target: newAlert.title,
      status: 'pending',
      stateBefore: 'normal',
      stateAfter: newAlert.severity,
      metadata: {
        initiatedBy: input.actor || 'WOOF Alert Engine',
        alertId: newAlert.id,
        alertKey: newAlert.alertKey,
        classification: newAlert.classification,
        affectedSector:
          (input.metadata?.affectedSectors as string[])?.join(' & ') ||
          (input.metadata?.sector as string) ||
          input.module,
        predictedTimeWindow: (input.metadata?.timeWindow as string) || '',
        supportingEvidence: newAlert.evidence,
        ...input.metadata,
      },
    });

    await this.createNotification({
      id: this.stableId('NTF-ALERT', newAlert.alertKey),
      recipientEmail: 'all',
      type: 'alert',
      title: newAlert.title,
      message: newAlert.evidence,
      targetUrl: newAlert.targetUrl,
      actionLabel: newAlert.actionLabel,
    });

    return newAlert;
  }

  /**
   * Auto-resolves an alert when underlying condition recovers or passes.
   */
  private async autoResolveAlert(alertKey: string, reason: string) {
    const alert = this.alerts.get(alertKey);
    if (!alert || alert.status === 'resolved') return;

    const previousStatus = alert.status;
    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolutionType = 'auto';
    alert.resolutionReason = reason;

    void this.supabaseService.client
      .from('system_alerts')
      .update({
        status: 'resolved',
        resolved_at: alert.resolvedAt,
        resolution_type: 'auto',
        resolution_reason: reason,
      })
      .eq('id', alert.id);

    const isTraffic =
      alert.alertKey.startsWith('ALERT_PEAK_CONGESTION') ||
      alert.alertKey.startsWith('ALERT_STAFF_BOTTLENECK');

    void this.auditService.record({
      actor: 'System',
      actorType: 'system',
      action: 'ALERT_RESOLVED',
      module: isTraffic ? 'traffic_optimizer' : 'alerts',
      category: 'workflow',
      target: alert.title,
      status: 'success',
      stateBefore: previousStatus,
      stateAfter: 'resolved',
      metadata: {
        initiatedBy: isTraffic ? 'Traffic Optimizer' : 'WOOF Alert Engine',
        alertId: alert.id,
        alertKey: alert.alertKey,
        affectedSector:
          (alert.metadata?.affectedSectors as string[])?.join(' & ') ||
          (alert.metadata?.sector as string) ||
          alert.module,
        predictedTimeWindow: (alert.metadata?.timeWindow as string) || '',
        supportingEvidence: alert.evidence,
        reason,
        ...alert.metadata,
      },
    });
  }

  /**
   * Returns active and un-snoozed alerts for display.
   */
  async getActiveAlerts(): Promise<SystemAlert[]> {
    // If cache expired, re-evaluate rules in background
    if (Date.now() - this.lastEvaluationTime > this.CACHE_TTL_MS) {
      void this.evaluateAllRules().catch((err) =>
        this.logger.debug(`Background alert re-evaluation note: ${err?.message || err}`),
      );
    }

    const now = Date.now();
    const activeList: SystemAlert[] = [];

    for (const alert of this.alerts.values()) {
      if (alert.status === 'active') {
        activeList.push(alert);
      } else if (alert.status === 'acknowledged') {
        // If snooze period expired, reactivate
        if (alert.snoozeUntil && new Date(alert.snoozeUntil).getTime() <= now) {
          alert.status = 'active';
          alert.snoozeUntil = null;
          activeList.push(alert);
        }
      }
    }

    // Sort by severity (critical first) then newest
    return activeList.sort((a, b) => {
      const pA = a.severity === 'critical' ? 3 : a.severity === 'warning' ? 2 : 1;
      const pB = b.severity === 'critical' ? 3 : b.severity === 'warning' ? 2 : 1;
      if (pA !== pB) return pB - pA;
      return new Date(b.lastEvaluatedAt).getTime() - new Date(a.lastEvaluatedAt).getTime();
    });
  }

  /**
   * Acknowledges and snoozes an alert without falsely resolving it.
   */
  async acknowledgeAlert(
    alertId: string,
    dto: AcknowledgeAlertDto,
  ): Promise<SystemAlert | null> {
    const alert = Array.from(this.alerts.values()).find((a) => a.id === alertId);
    if (!alert) return null;

    const userEmail = dto.userEmail || 'owner@happytails.com';
    const snoozeHours = dto.snoozeHours && dto.snoozeHours > 0 ? dto.snoozeHours : 12;
    const snoozeDate = new Date(Date.now() + snoozeHours * 60 * 60 * 1000);

    const acknowledgedAt = new Date().toISOString();
    const snoozeUntil = snoozeDate.toISOString();
    const { error } = await this.supabaseService.client
      .from('system_alerts')
      .update({
        status: 'acknowledged',
        acknowledged_at: acknowledgedAt,
        acknowledged_by: userEmail,
        snooze_until: snoozeUntil,
      })
      .eq('id', alert.id);
    if (error) throw new Error(`Could not acknowledge alert ${alert.id}: ${error.message}`);

    alert.status = 'acknowledged';
    alert.acknowledgedAt = acknowledgedAt;
    alert.acknowledgedBy = userEmail;
    alert.snoozeUntil = snoozeUntil;

    const isTraffic =
      alert.alertKey.startsWith('ALERT_PEAK_CONGESTION') ||
      alert.alertKey.startsWith('ALERT_STAFF_BOTTLENECK');

    void this.auditService.record({
      actor: userEmail,
      actorType: 'user',
      action: 'ALERT_ACKNOWLEDGED',
      module: isTraffic ? 'traffic_optimizer' : 'alerts',
      category: 'workflow',
      target: alert.title,
      status: 'success',
      stateBefore: 'active',
      stateAfter: 'acknowledged',
      metadata: {
        alertId: alert.id,
        alertKey: alert.alertKey,
        affectedSector:
          (alert.metadata?.affectedSectors as string[])?.join(' & ') ||
          (alert.metadata?.sector as string) ||
          alert.module,
        predictedTimeWindow: (alert.metadata?.timeWindow as string) || '',
        supportingEvidence: alert.evidence,
        snoozeHours,
        note: dto.note || null,
        ...alert.metadata,
      },
    });

    return alert;
  }

  /**
   * Manually resolves an alert with an audit reason.
   */
  async resolveAlert(
    alertId: string,
    dto: ResolveAlertDto,
  ): Promise<SystemAlert | null> {
    const alert = Array.from(this.alerts.values()).find((a) => a.id === alertId);
    if (!alert || alert.status === 'resolved') return null;

    const previousStatus = alert.status;
    const userEmail = dto.userEmail || 'owner@happytails.com';
    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolutionType = 'manual';
    alert.resolutionReason = dto.reason;

    void this.supabaseService.client
      .from('system_alerts')
      .update({
        status: 'resolved',
        resolved_at: alert.resolvedAt,
        resolution_type: 'manual',
        resolution_reason: dto.reason,
      })
      .eq('id', alert.id);

    const isTraffic =
      alert.alertKey.startsWith('ALERT_PEAK_CONGESTION') ||
      alert.alertKey.startsWith('ALERT_STAFF_BOTTLENECK');

    void this.auditService.record({
      actor: userEmail,
      actorType: 'user',
      action: 'ALERT_RESOLVED',
      module: isTraffic ? 'traffic_optimizer' : 'alerts',
      category: 'workflow',
      target: alert.title,
      status: 'success',
      stateBefore: previousStatus,
      stateAfter: 'resolved',
      metadata: {
        alertId: alert.id,
        alertKey: alert.alertKey,
        affectedSector:
          (alert.metadata?.affectedSectors as string[])?.join(' & ') ||
          (alert.metadata?.sector as string) ||
          alert.module,
        predictedTimeWindow: (alert.metadata?.timeWindow as string) || '',
        supportingEvidence: alert.evidence,
        reason: dto.reason,
        resolutionType: 'manual',
        ...alert.metadata,
      },
    });

    return alert;
  }

  /**
   * Reactivates an acknowledged or snoozed alert.
   */
  async reactivateAlert(alertId: string): Promise<SystemAlert | null> {
    const alert = Array.from(this.alerts.values()).find((a) => a.id === alertId);
    if (!alert) return null;

    alert.status = 'active';
    alert.snoozeUntil = null;

    void this.supabaseService.client
      .from('system_alerts')
      .update({
        status: 'active',
        snooze_until: null,
      })
      .eq('id', alert.id);

    return alert;
  }

  /**
   * User notifications scoped by recipient email.
   */
  getUserNotifications(userEmail: string = 'user@happytails.com'): UserNotification[] {
    const target = (userEmail || 'user@happytails.com').toLowerCase().trim();
    const result: UserNotification[] = [];

    for (const notif of this.notifications.values()) {
      if (notif.dismissed) continue;
      const rec = notif.recipientEmail.toLowerCase().trim();
      if (rec === 'all' || rec === target) {
        result.push(notif);
      }
    }

    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async markNotificationRead(id: string, userEmail: string = 'user@happytails.com'): Promise<boolean> {
    const notif = this.notifications.get(id);
    if (!notif) return false;

    const readAt = new Date().toISOString();
    const { error } = await this.supabaseService.client
      .from('user_notifications')
      .update({ read: true, read_at: readAt })
      .eq('id', id);
    if (error) {
      this.logger.warn(`Could not persist read state for notification ${id}: ${error.message}`);
      return false;
    }

    notif.read = true;
    notif.readAt = readAt;
    return true;
  }

  async markAllNotificationsRead(
    userEmail: string = 'user@happytails.com',
    type?: UserNotification['type'],
  ): Promise<number> {
    const list = this.getUserNotifications(userEmail).filter((notification) => !type || notification.type === type);
    const unread = list.filter((notification) => !notification.read);
    if (unread.length === 0) return 0;

    const nowIso = new Date().toISOString();
    let query = this.supabaseService.client
      .from('user_notifications')
      .update({ read: true, read_at: nowIso })
      .or(`recipient_email.eq.all,recipient_email.eq.${userEmail}`);
    if (type) query = query.eq('type', type);
    const { error } = await query;
    if (error) {
      this.logger.warn(`Could not persist bulk notification read state: ${error.message}`);
      return 0;
    }

    for (const notification of unread) {
      notification.read = true;
      notification.readAt = nowIso;
    }
    return unread.length;
  }

  dismissNotification(id: string, userEmail: string = 'user@happytails.com'): boolean {
    const notif = this.notifications.get(id);
    if (!notif) return false;

    notif.dismissed = true;

    void this.supabaseService.client
      .from('user_notifications')
      .update({ dismissed: true })
      .eq('id', id);

    return true;
  }

  async createNotification(input: {
    id?: string;
    recipientEmail?: string;
    type: UserNotification['type'];
    title: string;
    message: string;
    targetUrl: string;
    actionLabel: string;
  }): Promise<UserNotification> {
    const id = input.id || `NTF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const notif: UserNotification = {
      id,
      recipientEmail: input.recipientEmail || 'all',
      type: input.type,
      title: input.title,
      message: input.message,
      targetUrl: input.targetUrl,
      actionLabel: input.actionLabel,
      read: false,
      dismissed: false,
      createdAt: new Date().toISOString(),
    };

    this.notifications.set(id, notif);

    const { error } = await this.supabaseService.client
      .from('user_notifications')
      .insert({
        id: notif.id,
        recipient_email: notif.recipientEmail,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        target_url: notif.targetUrl,
        action_label: notif.actionLabel,
        read: false,
        dismissed: false,
        created_at: notif.createdAt,
      });
    if (error) {
      this.logger.warn(`Could not persist notification ${notif.id}: ${error.message}`);
    }

    return notif;
  }

  /**
   * Returns active, un-dismissed opportunity notifications.
   */
  getActiveOpportunities(): UserNotification[] {
    const list: UserNotification[] = [];
    for (const notif of this.notifications.values()) {
      if (notif.type === 'opportunity' && !notif.dismissed) {
        list.push(notif);
      }
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Idempotent opportunity upsert.
   * Records OPPORTUNITY_DETECTED audit log exactly once per window, avoiding duplicates on polling.
   */
  async upsertOpportunityNotification(input: {
    id: string;
    oppKey: string;
    recipientEmail?: string;
    type: UserNotification['type'];
    title: string;
    message: string;
    targetUrl: string;
    actionLabel: string;
    metadata?: Record<string, unknown>;
  }): Promise<UserNotification> {
    const existing = this.notifications.get(input.id);
    const nowIso = new Date().toISOString();

    if (existing && !existing.dismissed) {
      existing.message = input.message;
      existing.targetUrl = input.targetUrl;
      existing.actionLabel = input.actionLabel;
      existing.metadata = { ...existing.metadata, ...input.metadata };

      void this.supabaseService.client
        .from('user_notifications')
        .update({
          message: existing.message,
          target_url: existing.targetUrl,
          action_label: existing.actionLabel,
          metadata: existing.metadata,
        })
        .eq('id', existing.id);

      return existing;
    }

    // Startup hydration can be incomplete (for example, when a notification
    // falls outside the initial page). Reuse the persisted record by stable ID
    // before constructing an unread in-memory replacement.
    const { data: persisted, error: lookupError } = await this.supabaseService.client
      .from('user_notifications')
      .select('*')
      .eq('id', input.id)
      .maybeSingle();
    if (lookupError) {
      throw new Error(`Could not look up notification ${input.id}: ${lookupError.message}`);
    }
    if (persisted) {
      const restored: UserNotification = {
        id: persisted.id,
        recipientEmail: persisted.recipient_email,
        type: persisted.type,
        title: persisted.title,
        message: persisted.message,
        targetUrl: persisted.target_url,
        actionLabel: persisted.action_label,
        read: Boolean(persisted.read),
        readAt: persisted.read_at,
        dismissed: Boolean(persisted.dismissed),
        createdAt: persisted.created_at,
        metadata: persisted.metadata,
      };
      this.notifications.set(restored.id, restored);

      if (!restored.dismissed) {
        restored.message = input.message;
        restored.targetUrl = input.targetUrl;
        restored.actionLabel = input.actionLabel;
        restored.metadata = { ...restored.metadata, ...input.metadata };
        const { error: updateError } = await this.supabaseService.client
          .from('user_notifications')
          .update({
            message: restored.message,
            target_url: restored.targetUrl,
            action_label: restored.actionLabel,
            metadata: restored.metadata,
          })
          .eq('id', restored.id);
        if (updateError) {
          throw new Error(`Could not refresh notification ${restored.id}: ${updateError.message}`);
        }
      }

      return restored;
    }

    const notif: UserNotification = {
      id: input.id,
      recipientEmail: input.recipientEmail || 'all',
      type: input.type,
      title: input.title,
      message: input.message,
      targetUrl: input.targetUrl,
      actionLabel: input.actionLabel,
      read: false,
      dismissed: false,
      createdAt: nowIso,
      metadata: input.metadata,
    };

    const { error: insertError } = await this.supabaseService.client
      .from('user_notifications')
      .insert({
        id: notif.id,
        recipient_email: notif.recipientEmail,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        target_url: notif.targetUrl,
        action_label: notif.actionLabel,
        read: false,
        dismissed: false,
        created_at: notif.createdAt,
        metadata: notif.metadata || {},
      });
    if (insertError) {
      throw new Error(`Could not create notification ${notif.id}: ${insertError.message}`);
    }

    this.notifications.set(input.id, notif);

    // Audit Log: Prevent duplicate log entries when polling or re-evaluating
    if (input.type === 'opportunity' && !this.loggedOpportunityKeys.has(input.oppKey)) {
      this.loggedOpportunityKeys.add(input.oppKey);

      const targetH = input.metadata?.targetHour;
      const windowStr =
        targetH !== undefined
          ? `${String(targetH).padStart(2, '0')}:00 - ${String(Number(targetH) + 1).padStart(2, '0')}:00`
          : '';

      const isQuietPeriod =
        input.oppKey.includes('HAPPY_HOUR') ||
        (notif.title && notif.title.toLowerCase().includes('quiet period'));
      const oppModule = isQuietPeriod ? 'cafe' : 'traffic_optimizer';
      const initiatedBy = isQuietPeriod ? 'Cafe' : 'Traffic Optimizer';

      void this.auditService.record({
        actor: 'System',
        actorType: 'system',
        action: 'OPPORTUNITY_DETECTED',
        module: oppModule,
        category: 'workflow',
        target: notif.title,
        status: 'pending',
        stateBefore: 'none',
        stateAfter: 'opportunity',
        metadata: {
          initiatedBy,
          notificationId: notif.id,
          opportunityId: notif.id,
          oppKey: input.oppKey,
          affectedSector: (input.metadata?.sector as string) || (isQuietPeriod ? 'Cafe' : 'General'),
          predictedTimeWindow: windowStr,
          supportingEvidence: notif.message,
          targetDate: input.metadata?.targetDate,
          targetHour: input.metadata?.targetHour,
          predictedTrafficDrop: input.metadata?.predictedTrafficDrop,
          recommendedItems: input.metadata?.recommendedItems,
          ...input.metadata,
        },
      });
    }

    return notif;
  }

  /**
   * Records user interaction when acting upon an opportunity (e.g. Planning promotion).
   */
  async recordOpportunityActed(
    id: string,
    userEmail: string = 'owner@happytails.com',
  ): Promise<{ success: boolean; notification?: UserNotification }> {
    const notif = this.notifications.get(id);
    if (!notif) {
      return { success: false };
    }

    notif.read = true;
    notif.readAt = new Date().toISOString();

    void this.supabaseService.client
      .from('user_notifications')
      .update({ read: true, read_at: notif.readAt })
      .eq('id', notif.id);

    const targetH = notif.metadata?.targetHour;
    const windowStr =
      targetH !== undefined
        ? `${String(targetH).padStart(2, '0')}:00 - ${String(Number(targetH) + 1).padStart(2, '0')}:00`
        : '';

    const isQuietPeriod =
      notif.title && notif.title.toLowerCase().includes('quiet period');
    const oppModule = isQuietPeriod ? 'cafe' : 'traffic_optimizer';
    const initiatedBy = isQuietPeriod ? 'Cafe' : 'Traffic Optimizer';

    void this.auditService.record({
      actor: userEmail || 'owner@happytails.com',
      actorType: 'user',
      action: 'OPPORTUNITY_ACTED',
      module: oppModule,
      category: 'workflow',
      target: notif.title,
      status: 'success',
      stateBefore: 'opportunity',
      stateAfter: 'acted',
      metadata: {
        initiatedBy,
        notificationId: notif.id,
        opportunityId: notif.id,
        affectedSector: (notif.metadata?.sector as string) || (isQuietPeriod ? 'Cafe' : 'General'),
        predictedTimeWindow: windowStr,
        supportingEvidence: notif.message,
        targetUrl: notif.targetUrl,
        ...notif.metadata,
      },
    });

    return { success: true, notification: notif };
  }
}
