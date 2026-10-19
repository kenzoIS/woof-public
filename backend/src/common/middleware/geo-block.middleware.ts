import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Geo-Blocking Middleware
 *
 * Leverages the `cf-ipcountry` header injected by Cloudflare (via Render)
 * to restrict API access to traffic originating from the Philippines.
 *
 * Behavior:
 * - If the `cf-ipcountry` header is present and is NOT 'PH', the request
 *   is immediately rejected with a 403 Forbidden response.
 * - If the header is absent (e.g., local development), the request passes
 *   through to avoid blocking dev environments.
 *
 * Configurable via the ALLOWED_COUNTRIES environment variable (comma-separated).
 * Defaults to 'PH' if not set.
 */
@Injectable()
export class GeoBlockMiddleware implements NestMiddleware {
  private readonly allowedCountries: Set<string>;

  constructor() {
    const envCountries = process.env.ALLOWED_COUNTRIES || 'PH';
    this.allowedCountries = new Set(
      envCountries.split(',').map((c) => c.trim().toUpperCase()),
    );
  }

  use(req: Request, _res: Response, next: NextFunction) {
    const country = req.headers['cf-ipcountry'] as string | undefined;

    // If the header is absent (local dev, non-Cloudflare proxy), allow through
    if (!country) {
      return next();
    }

    if (!this.allowedCountries.has(country.toUpperCase())) {
      throw new ForbiddenException(
        `Access denied: requests from '${country}' are not permitted.`,
      );
    }

    next();
  }
}
