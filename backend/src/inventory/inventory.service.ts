import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RealtimeService } from '../realtime/realtime.service';
import { InventoryProduct, parseInventoryPage } from './inventory.contract';

class InventorySourceError extends Error {
  constructor(
    message: string,
    readonly retryMs = 0,
  ) {
    super(message);
  }
}
@Injectable()
export class InventoryService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InventoryService.name);
  private readonly pollMs: number;
  private readonly timeoutMs: number;
  private readonly token: string;
  private readonly endpoint: string | null;
  private readonly configurationError: string | null;
  private timer?: ReturnType<typeof setTimeout>;
  private operation?: Promise<void>;
  private stopped = false;
  private requestAt = 0;
  private nextAttemptAt = 0;
  private failures = 0;
  private products: InventoryProduct[] = [];
  private lastSuccess: string | null = null;
  private lastAttempt: string | null = null;
  private sourceFirst: string | null = null;
  private sourceLast: string | null = null;
  private lastError: string | null = null;
  private pageCount = 0;
  private revision = 0;
  private controller?: AbortController;
  constructor(
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {
    const bounded = (
      key: string,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const value = Number(config.get(key));
      return Number.isFinite(value) && value > 0
        ? Math.min(max, Math.max(min, value))
        : fallback;
    };
    this.pollMs = bounded('PETHUB_INVENTORY_POLL_MS', 15000, 15000, 300000);
    this.timeoutMs = bounded('PETHUB_INVENTORY_TIMEOUT_MS', 10000, 1000, 30000);
    this.token = String(config.get('PETHUB_INVENTORY_TOKEN') || '').trim();
    let error: string | null = null;
    let endpoint: string | null = null;
    try {
      const base = new URL(
        String(
          config.get('PETHUB_INVENTORY_BASE_URL') || 'http://localhost:4000',
        ),
      );
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
      if (
        (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        base.pathname !== '/'
      )
        throw new Error();
      endpoint = new URL('/api/woof/inventory', base).href;
    } catch {
      error =
        'Set PETHUB_INVENTORY_BASE_URL to an HTTPS server origin, or http://localhost:4000 for local development.';
    }
    if (!this.token)
      error =
        'Set PETHUB_INVENTORY_TOKEN on the WOOF backend to match PetHub’s WOOF_INVENTORY_TOKEN.';
    this.endpoint = endpoint;
    this.configurationError = error;
  }
  onApplicationBootstrap() {
    if (!this.configurationError) void this.sync();
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.controller?.abort();
  }
  snapshot() {
    const staleAfterMs = Math.max(
      60000,
      this.pollMs * 3,
      this.pageCount * 6000,
    );
    const age = this.lastSuccess
      ? Date.now() - Date.parse(this.lastSuccess)
      : Infinity;
    const status = this.configurationError
      ? 'not_configured'
      : !this.lastSuccess
        ? this.lastError
          ? 'unavailable'
          : 'connecting'
        : age > staleAfterMs
          ? 'stale'
          : this.lastError
            ? 'reconnecting'
            : 'near_realtime';
    return {
      source: 'PetHub retail inventory',
      mode: 'polling',
      status,
      hasSnapshot: this.lastSuccess !== null,
      syncing: !!this.operation,
      lastSuccessAt: this.lastSuccess,
      lastAttemptAt: this.lastAttempt,
      nextAttemptAt: this.nextAttemptAt
        ? new Date(this.nextAttemptAt).toISOString()
        : null,
      pollIntervalMs: this.pollMs,
      staleAfterMs,
      revision: this.revision,
      message: this.configurationError || this.lastError,
      sourceWindow: {
        firstResponseAt: this.sourceFirst,
        lastResponseAt: this.sourceLast,
        pages: this.pageCount,
        pointInTime: false,
      },
      products: this.products.map((product) => ({ ...product })),
      batchesSupported: false,
      limitations: [
        'Automatic polling, not a push-based live feed.',
        'Pages read live data; a completed refresh is not a frozen database snapshot.',
        'Products absent from a complete refresh are no longer returned by PetHub; absence does not prove a stockout.',
        'Expiry batches are unsupported. Velocity and stockout estimates require a verified product-to-sales mapping.',
      ],
    };
  }
  sync(): Promise<void> {
    if (this.operation) return this.operation;
    if (
      this.stopped ||
      this.configurationError ||
      Date.now() < this.nextAttemptAt
    )
      return Promise.resolve();
    if (this.timer) clearTimeout(this.timer);
    this.operation = this.fetchSnapshot().finally(() => {
      this.operation = undefined;
      if (!this.stopped) {
        this.timer = setTimeout(
          () => void this.sync(),
          Math.max(1, this.nextAttemptAt - Date.now()),
        );
        this.timer.unref?.();
      }
    });
    return this.operation;
  }
  private async fetchSnapshot() {
    this.lastAttempt = new Date().toISOString();
    const pending: InventoryProduct[] = [];
    let after: string | undefined;
    let pages = 0;
    let first: string | null = null;
    let last: string | null = null;
    try {
      do {
        if (this.stopped) return;
        if (pages >= 250)
          throw new InventorySourceError(
            'Inventory exceeds the safe scan limit; retaining the previous complete refresh.',
          );
        const spacing = Math.max(0, this.requestAt + 1500 - Date.now());
        if (spacing)
          await new Promise((resolve) => setTimeout(resolve, spacing));
        if (this.stopped) return;
        this.requestAt = Date.now();
        this.controller = new AbortController();
        const timeout = setTimeout(
          () => this.controller?.abort(),
          this.timeoutMs,
        );
        let page;
        try {
          const url = new URL(this.endpoint!);
          url.searchParams.set('limit', '200');
          if (after) url.searchParams.set('after', after);
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: 'application/json',
            },
            redirect: 'error',
            signal: this.controller.signal,
          });
          if (response.status === 429) {
            const retry = response.headers.get('retry-after');
            const seconds = retry === null ? NaN : Number(retry);
            const delay = Number.isFinite(seconds)
              ? Math.max(0, seconds * 1000)
              : retry
                ? Math.max(0, Date.parse(retry) - Date.now())
                : 60000;
            throw new InventorySourceError(
              'PetHub rate limit reached; waiting before retrying.',
              Number.isFinite(delay) ? delay : 60000,
            );
          }
          if (!response.ok)
            throw new InventorySourceError(
              response.status === 401 || response.status === 403
                ? 'PetHub rejected the inventory token. Check both server configurations.'
                : response.status === 503
                  ? 'PetHub inventory is not configured or temporarily unavailable.'
                  : 'PetHub inventory request failed. Retaining last-known stock.',
            );
          const declaredSize = Number(response.headers.get('content-length'));
          if (declaredSize > 2 * 1024 * 1024)
            throw new InventorySourceError(
              'PetHub inventory page is too large.',
            );
          const chunks: Uint8Array[] = [];
          let size = 0;
          if (!response.body)
            throw new InventorySourceError(
              'PetHub returned an empty inventory response.',
            );
          const reader = response.body.getReader();
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.byteLength;
              if (size > 2 * 1024 * 1024) {
                await reader.cancel();
                throw new InventorySourceError(
                  'PetHub inventory page is too large.',
                );
              }
              chunks.push(chunk.value);
            }
          } finally {
            reader.releaseLock();
          }
          page = parseInventoryPage(
            JSON.parse(Buffer.concat(chunks).toString('utf8')),
            after,
          );
        } finally {
          clearTimeout(timeout);
          this.controller = undefined;
        }
        pages++;
        first ??= page.response_timestamp;
        last = page.response_timestamp;
        pending.push(...page.products);
        after = page.pagination.has_more
          ? page.pagination.next_after!
          : undefined;
      } while (after);
      if (this.stopped) return;
      // Commit only a complete validated scan. Never expose partial pages.
      this.products = pending;
      this.pageCount = pages;
      this.sourceFirst = first;
      this.sourceLast = last;
      this.lastSuccess = new Date().toISOString();
      this.lastError = null;
      this.failures = 0;
      this.revision++;
      this.nextAttemptAt = Date.now() + this.pollMs;
      this.realtime.emit({
        type: 'inventory_updated',
        title: 'Inventory refreshed',
        module: 'retail-inventory',
      });
    } catch (error) {
      if (this.stopped) return;
      this.failures++;
      this.lastError =
        error instanceof InventorySourceError
          ? error.message
          : 'Could not complete the PetHub inventory refresh. Last-known stock is retained.';
      const retry = error instanceof InventorySourceError ? error.retryMs : 0;
      const backoff = Math.min(
        300000,
        this.pollMs * 2 ** Math.min(4, this.failures - 1),
      );
      this.nextAttemptAt =
        Date.now() +
        Math.max(backoff, retry) +
        Math.floor(Math.random() * 1000);
      this.logger.warn(this.lastError);
      this.realtime.emit({
        type: 'inventory_sync_status',
        title: 'Inventory connection needs attention',
        module: 'retail-inventory',
      });
    }
  }
}
