import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AwsService } from '../aws/aws.service';
import {
  AuditActorLabel,
  AuditEvent,
  AuditLogInput,
  AuditQueryParams,
  AuditSummary,
  PaginatedAuditResponse,
} from './audit.types';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly retryBuffer: AuditLogInput[] = [];
  private isRetrying = false;

  constructor(
    private readonly supabaseService: SupabaseService,
    @Optional() private readonly awsService?: AwsService,
    @Optional() @InjectModel('AuditOutbox') private readonly outbox?: Model<any>,
  ) {}

  /**
   * Resolves the strict 2-tier Actor classification:
   * - 'Owner': Action explicitly initiated by the authenticated business owner.
   * - 'System': Automated background tasks, crons, alert engines, AI systems, or integrations.
   * Preserves specific process / user details in metadata.
   */
  private resolveActor(input: AuditLogInput): {
    actor: AuditActorLabel;
    actorType: 'user' | 'system' | 'integration';
  } {
    const rawActor = (input.actor || '').trim();
    const isUserType = input.actorType === 'user';
    const isExplicitOwner =
      rawActor.toLowerCase() === 'owner' ||
      rawActor.includes('@') ||
      rawActor.toLowerCase().includes('admin');

    if (isUserType || isExplicitOwner) {
      return { actor: 'Owner', actorType: 'user' };
    }

    return {
      actor: 'System',
      actorType: input.actorType === 'integration' ? 'integration' : 'system',
    };
  }

  /**
   * Records an explicit business or security audit event in Supabase.
   */
  async record(input: AuditLogInput) {
    const { actor, actorType } = this.resolveActor(input);

    // Preserve original initiator context in metadata without polluting actor label
    const safeMetadata: Record<string, unknown> = {
      ...(input.metadata || {}),
    };
    if (input.actor && input.actor !== actor) {
      safeMetadata.initiatedBy = input.actor;
    }

    const payload = {
      id: crypto.randomUUID(),
      actor,
      actor_type: actorType,
      action: input.action,
      module: input.module,
      category:
        input.category ||
        (input.module === 'auth' || input.module === 'security'
          ? 'security'
          : 'workflow'),
      target: input.target || null,
      status: input.status || 'success',
      state_before: input.stateBefore || null,
      state_after: input.stateAfter || null,
      duration_ms: input.durationMs ?? null,
      method: input.method || null,
      path: input.path || null,
      ip_address: input.ipAddress || null,
      user_agent: input.userAgent || null,
      metadata: safeMetadata,
    };

    let staged = false;
    if (this.outbox) {
      // Stage before delivery so a restart cannot silently discard failed inserts.
      try { await this.outbox.create({ id: payload.id, payload, createdAt: new Date() }); staged = true; }
      catch {
        this.logger.error('Audit outbox unavailable; attempting direct delivery with emergency memory retry.');
      }
    }
    try {
      const { error } = await this.supabaseService.client
        .from('audit_logs')
        .insert(payload);

      if (error) {
        this.logger.warn(`Audit event could not be persisted: ${error.message}`);
        if (!staged) this.bufferForRetry(input);
        return;
      }

      if (staged) await this.outbox!.deleteOne({ id: payload.id });
      // If we have buffered events, attempt to flush them
      if (this.retryBuffer.length > 0 && !this.isRetrying) {
        void this.flushRetryBuffer();
      }
    } catch (err: any) {
      this.logger.warn(
        `Audit insert exception: ${err?.message || (err instanceof Error ? err.message : String(err))}`,
      );
      if (!staged) this.bufferForRetry(input);
    }
  }

  private bufferForRetry(input: AuditLogInput) {
    if (this.retryBuffer.length >= 100) {
      this.retryBuffer.shift(); // Evict oldest to avoid memory leaks
    }
    this.retryBuffer.push(input);
  }

  private async flushRetryBuffer() {
    if (this.isRetrying || this.retryBuffer.length === 0) return;
    this.isRetrying = true;

    try {
      const batch = this.retryBuffer.splice(0, 20);
      for (let index = 0; index < batch.length; index++) {
        const item = batch[index];
        try {
        const { actor, actorType } = this.resolveActor(item);
        const meta = { ...(item.metadata || {}) };
        if (item.actor && item.actor !== actor) {
          meta.initiatedBy = item.actor;
        }

        const { error } = await this.supabaseService.client
          .from('audit_logs')
          .insert({
            actor,
            actor_type: actorType,
            action: item.action,
            module: item.module,
            category: item.category || 'workflow',
            target: item.target || null,
            status: item.status || 'success',
            state_before: item.stateBefore || null,
            state_after: item.stateAfter || null,
            duration_ms: item.durationMs ?? null,
            method: item.method || null,
            path: item.path || null,
            ip_address: item.ipAddress || null,
            user_agent: item.userAgent || null,
            metadata: meta,
          });

        if (error) {
          this.retryBuffer.unshift(...batch.slice(index));
          break;
        }
        } catch (error) {
          this.retryBuffer.unshift(...batch.slice(index));
          break;
        }
      }
    } catch (e) {
      this.logger.warn('Error flushing audit retry buffer: ' + e);
    } finally {
      this.isRetrying = false;
    }
  }

  @Cron('*/30 * * * * *')
  async retryPendingEvents() {
    await this.flushRetryBuffer();
    if (!this.outbox) return;
    const pending = await this.outbox.find().sort({ createdAt: 1 }).limit(100).lean();
    for (const event of pending) {
      try {
        const { error } = await this.supabaseService.client.from('audit_logs').insert(event.payload);
        // Acknowledgement may have been lost after a successful insert. The stable
        // UUID makes retries idempotent across processes and backend restarts.
        if (error && error.code !== '23505') break;
        await this.outbox.deleteOne({ id: event.id });
      } catch { break; }
    }
  }

  /**
   * Retrieves paginated audit logs with server-side filtering, searching, date constraints,
   * and optional AWS S3 archive retrieval.
   */
  async list(query: AuditQueryParams): Promise<PaginatedAuditResponse> {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Helper for strict 2-tier actor normalization
    const normalizeRow = (row: any): AuditEvent => {
      const rawActor = (row.actor || '').trim();
      const isOwner =
        rawActor.toLowerCase() === 'owner' ||
        row.actor_type === 'user' ||
        rawActor.includes('@') ||
        rawActor.toLowerCase().includes('admin');

      const meta = { ...(row.metadata || {}) };
      if (rawActor && rawActor !== 'Owner' && rawActor !== 'System' && !meta.initiatedBy) {
        meta.initiatedBy = rawActor;
      }

      return {
        ...row,
        actor: isOwner ? 'Owner' : 'System',
        metadata: meta,
      };
    };

    // If S3 archived records are requested, fetch and merge them
    if (query.includeArchived && this.awsService) {
      try {
        let liveRequest = this.supabaseService.client
          .from('audit_logs')
          .select('*')
          .is('method', null)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (query.module && query.module !== 'all') liveRequest = liveRequest.eq('module', query.module);
        if (query.action && query.action !== 'all') liveRequest = liveRequest.eq('action', query.action);
        if (query.status && query.status !== 'all') liveRequest = liveRequest.eq('status', query.status);
        if (query.category && query.category !== 'all') liveRequest = liveRequest.eq('category', query.category);
        if (query.actor && query.actor !== 'all') {
          if (query.actor === 'Owner') {
            liveRequest = liveRequest.or('actor.eq.Owner,actor_type.eq.user');
          } else if (query.actor === 'System') {
            liveRequest = liveRequest.or('actor.eq.System,actor_type.eq.system,actor_type.eq.integration');
          }
        }
        if (query.startDate) liveRequest = liveRequest.gte('created_at', new Date(query.startDate).toISOString());
        if (query.endDate) {
          const end = new Date(query.endDate);
          if (query.endDate.length <= 10) end.setHours(23, 59, 59, 999);
          liveRequest = liveRequest.lte('created_at', end.toISOString());
        }

        const { data: liveData } = await liveRequest;
        const normalizedLive: AuditEvent[] = (liveData || []).map(normalizeRow);

        // Fetch S3 archives
        const archiveMetaList = await this.awsService.listAuditArchives();
        const archivedRecords: AuditEvent[] = [];

        for (const meta of archiveMetaList) {
          // Extract date from key: audit-archives/YYYY/MM/audit_logs_YYYY-MM-DD.json
          const match = meta.key.match(/audit_logs_(\d{4}-\d{2}-\d{2})\.json/);
          if (match) {
            const archiveDate = match[1];
            if (query.startDate && archiveDate < query.startDate.slice(0, 10)) continue;
            if (query.endDate && archiveDate > query.endDate.slice(0, 10)) continue;
          }

          const records = await this.awsService.getAuditArchive(meta.key);
          if (Array.isArray(records)) {
            for (const r of records) {
              const norm = normalizeRow({ ...r, isArchived: true });

              // Apply in-memory filtering for archived records
              if (query.module && query.module !== 'all' && norm.module !== query.module) continue;
              if (query.action && query.action !== 'all' && norm.action !== query.action) continue;
              if (query.status && query.status !== 'all' && norm.status !== query.status) continue;
              if (query.category && query.category !== 'all' && norm.category !== query.category) continue;
              if (query.actor && query.actor !== 'all' && norm.actor !== query.actor) continue;
              if (query.startDate && new Date(norm.created_at) < new Date(query.startDate)) continue;
              if (query.endDate) {
                const end = new Date(query.endDate);
                if (query.endDate.length <= 10) end.setHours(23, 59, 59, 999);
                if (new Date(norm.created_at) > end) continue;
              }
              if (query.search && query.search.trim()) {
                const term = query.search.trim().toLowerCase();
                const hay = `${norm.actor} ${norm.action} ${norm.module} ${norm.target || ''}`.toLowerCase();
                if (!hay.includes(term)) continue;
              }

              archivedRecords.push(norm);
            }
          }
        }

        // Merge & deduplicate by ID
        const seenIds = new Set<string>();
        const combined: AuditEvent[] = [];
        for (const ev of [...normalizedLive, ...archivedRecords]) {
          if (!seenIds.has(ev.id)) {
            seenIds.add(ev.id);
            combined.push(ev);
          }
        }

        // Sort descending by created_at
        combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const total = combined.length;
        const totalPages = Math.max(Math.ceil(total / limit), 1);
        const events = combined.slice(from, to + 1);

        return {
          events,
          total,
          page,
          limit,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
        };
      } catch (err) {
        this.logger.warn(`Archived logs merge failed, falling back to live Supabase logs: ${err}`);
      }
    }

    let request = this.supabaseService.client
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .is('method', null)
      .order('created_at', { ascending: false });

    // Module filter
    if (query.module && query.module !== 'all') {
      request = request.eq('module', query.module);
    }

    // Action filter
    if (query.action && query.action !== 'all') {
      request = request.eq('action', query.action);
    }

    // Status filter
    if (query.status && query.status !== 'all') {
      request = request.eq('status', query.status);
    }

    // Category filter
    if (query.category && query.category !== 'all') {
      request = request.eq('category', query.category);
    }

    // Actor filter: Owner vs System
    if (query.actor && query.actor !== 'all') {
      if (query.actor === 'Owner') {
        request = request.or('actor.eq.Owner,actor_type.eq.user');
      } else if (query.actor === 'System') {
        request = request.or('actor.eq.System,actor_type.eq.system,actor_type.eq.integration');
      }
    }

    // Date range filters
    if (query.startDate) {
      const startIso = new Date(query.startDate).toISOString();
      request = request.gte('created_at', startIso);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      // If time not specified, ensure inclusive of full day
      if (query.endDate.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      request = request.lte('created_at', end.toISOString());
    }

    // Keyword search across actor, action, module, target
    if (query.search && query.search.trim()) {
      const value = query.search.trim().replace(/[%(),]/g, ' ');
      request = request.or(
        `actor.ilike.%${value}%,action.ilike.%${value}%,module.ilike.%${value}%,target.ilike.%${value}%`,
      );
    }

    // Deduplicate noisy repetitive automated system evaluations
    // Strictly preserves all Owner actions and any distinct state transitions
    const deduplicateNoisyEvents = (items: AuditEvent[]): AuditEvent[] => {
      const result: AuditEvent[] = [];
      const seenAutomated = new Map<string, number>();

      for (const ev of items) {
        if (ev.actor === 'Owner') {
          result.push(ev);
          continue;
        }

        const key = `${ev.action}:${ev.module}:${ev.target || ''}:${ev.status}:${ev.state_before || ''}:${ev.state_after || ''}`;
        const evTime = new Date(ev.created_at).getTime();
        const lastTime = seenAutomated.get(key);

        // Suppress repeated identical automated triggers occurring within 30 minutes of a newer one
        if (lastTime !== undefined && Math.abs(lastTime - evTime) < 30 * 60 * 1000) {
          continue;
        }

        seenAutomated.set(key, evTime);
        result.push(ev);
      }

      return result;
    };

    // Apply pagination range
    request = request.range(from, to);

    const { data, count, error } = await request;
    if (error) {
      this.logger.error(`Failed to query audit logs: ${error.message}`);
      throw error;
    }

    // Map rows ensuring strict 2-tier Owner vs System classification
    const normalized: AuditEvent[] = (data || []).map(normalizeRow);
    const events: AuditEvent[] = deduplicateNoisyEvents(normalized);

    const total = count || events.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return {
      events,
      total,
      page,
      limit,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    };
  }

  /**
   * Retrieves summary counts for the dashboard header KPIs.
   */
  async summary(): Promise<AuditSummary> {
    const { count: total } = await this.supabaseService.client
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .is('method', null);

    const { count: pending } = await this.supabaseService.client
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .is('method', null)
      .eq('status', 'pending');

    const { count: failed } = await this.supabaseService.client
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .is('method', null)
      .eq('status', 'failed');

    const { count: automated } = await this.supabaseService.client
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .is('method', null)
      .neq('actor_type', 'user');

    const { count: successful } = await this.supabaseService.client
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .is('method', null)
      .eq('status', 'success');

    // Sample recent durations
    const { data: durationRows } = await this.supabaseService.client
      .from('audit_logs')
      .select('duration_ms')
      .is('method', null)
      .not('duration_ms', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const durations = (durationRows || [])
      .map((r) => Number(r.duration_ms))
      .filter(Number.isFinite);

    const averageDurationMs = durations.length
      ? Math.round(durations.reduce((sum, v) => sum + v, 0) / durations.length)
      : 0;

    return {
      total: total || 0,
      pendingApprovals: pending || 0,
      automatedTriggers: automated || 0,
      systemBottlenecks: failed || 0,
      averageDurationMs,
      successful: successful || 0,
    };
  }

  // ----------------------------------------------------------------
  // AWS S3 10-Day Automated Archiving Pipeline
  // ----------------------------------------------------------------

  /**
   * Daily cron job: Archives audit records older than 10 days to AWS S3.
   * Runs at 2:00 AM Manila Time.
   */
  @Cron('0 2 * * *', { timeZone: 'Asia/Manila' })
  async handleDailyArchivingCron() {
    this.logger.log('[Audit Archiving] Running automated 10-day S3 archival cron...');
    try {
      const result = await this.archiveOldLogsToS3();
      this.logger.log(`[Audit Archiving] Finished: ${JSON.stringify(result)}`);
    } catch (error: any) {
      this.logger.error(`[Audit Archiving] Cron failed: ${error?.message || error}`);
    }
  }

  /**
   * Archives records older than 10 days to S3 with SHA-256 verification before deletion.
   */
  async archiveOldLogsToS3(retentionDays = 10): Promise<{
    archivedCount: number;
    daysProcessed: string[];
    s3Uris: string[];
  }> {
    if (!this.awsService) {
      throw new Error('AWS Service is not configured for audit log archiving');
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffIso = cutoff.toISOString();

    this.logger.log(`Scanning audit logs created before ${cutoffIso} (older than ${retentionDays} days)...`);

    // Fetch records eligible for archiving
    const { data: records, error } = await this.supabaseService.client
      .from('audit_logs')
      .select('*')
      .is('method', null)
      .lt('created_at', cutoffIso)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (error) {
      throw new Error(`Failed to query eligible archive records: ${error.message}`);
    }

    if (!records || records.length === 0) {
      return {
        archivedCount: 0,
        daysProcessed: [],
        s3Uris: [],
      };
    }

    // Group records by calendar date (YYYY-MM-DD)
    const groups: Record<string, Record<string, unknown>[]> = {};
    for (const record of records) {
      const dateStr = String(record.created_at).substring(0, 10);
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(record);
    }

    let totalArchived = 0;
    const daysProcessed: string[] = [];
    const s3Uris: string[] = [];

    for (const [dateStr, dateRecords] of Object.entries(groups)) {
      this.logger.log(`Processing archive for ${dateStr} (${dateRecords.length} records)...`);

      // Check if S3 already has an archive for this date; merge if needed
      const [y, m] = dateStr.split('-');
      const s3Key = `audit-archives/${y}/${m}/audit_logs_${dateStr}.json`;
      const existing = await this.awsService.getAuditArchive(s3Key);

      let finalRecords = dateRecords;
      if (existing && Array.isArray(existing)) {
        const existingIds = new Set(existing.map((r: any) => r.id));
        const newUnique = dateRecords.filter((r) => !existingIds.has(r.id));
        finalRecords = [...existing, ...newUnique];
      }

      // Calculate SHA-256 hash
      const jsonBuffer = Buffer.from(JSON.stringify(finalRecords, null, 2), 'utf-8');
      const sha256 = crypto.createHash('sha256').update(jsonBuffer).digest('hex');

      // Upload to S3
      const uploadResult = await this.awsService.uploadAuditArchive(dateStr, finalRecords, sha256);
      if (!uploadResult) {
        throw new Error(`S3 upload failed for audit archive ${dateStr}. Deletion aborted.`);
      }

      // Verify file integrity in S3 before deleting from Supabase
      const verified = await this.awsService.verifyAuditArchive(
        uploadResult.key,
        finalRecords.length,
        sha256,
      );

      if (!verified) {
        throw new Error(
          `S3 integrity verification failed for ${uploadResult.key}. Source records preserved; deletion aborted.`,
        );
      }

      // Safe deletion of verified records from Supabase
      const recordIds = dateRecords.map((r) => r.id);
      const { error: deleteError } = await this.supabaseService.client
        .from('audit_logs')
        .delete()
        .in('id', recordIds);

      if (deleteError) {
        this.logger.error(`Failed to delete archived records from Supabase: ${deleteError.message}`);
      } else {
        totalArchived += dateRecords.length;
        daysProcessed.push(dateStr);
        s3Uris.push(uploadResult.uri);

        // Record tamper-evident audit record of the archival
        void this.record({
          actor: 'System',
          actorType: 'system',
          action: 'AUDIT_LOGS_ARCHIVED_TO_S3',
          module: 'audit',
          category: 'workflow',
          status: 'success',
          target: uploadResult.uri,
          metadata: {
            dateStr,
            recordCount: dateRecords.length,
            sha256,
            s3Uri: uploadResult.uri,
            s3Key: uploadResult.key,
          },
        });
      }
    }

    return {
      archivedCount: totalArchived,
      daysProcessed,
      s3Uris,
    };
  }

  /**
   * Retrieves list of S3 archived dates and files.
   */
  async listArchivedDates() {
    if (!this.awsService) return [];
    return this.awsService.listAuditArchives();
  }

  /**
   * Reads an S3 archive by key.
   */
  async getArchivedLogFile(key: string) {
    if (!this.awsService) return null;
    return this.awsService.getAuditArchive(key);
  }
}
