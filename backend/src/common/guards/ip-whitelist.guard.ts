import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * IP Whitelist Guard
 *
 * Restricts access to specific endpoints (e.g., PetHub webhook) by verifying
 * that the incoming request's IP address is in a pre-approved whitelist.
 *
 * Configurable via the WEBHOOK_TRUSTED_IPS environment variable (comma-separated).
 * If WEBHOOK_TRUSTED_IPS is not set, all IPs are allowed (open mode for development).
 *
 * Usage:
 *   @UseGuards(IpWhitelistGuard)
 *   @Post('transactions')
 *   async receiveTransaction(...) { ... }
 */
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IpWhitelistGuard.name);
  private readonly trustedIps: Set<string> | null;

  constructor() {
    const envIps = process.env.WEBHOOK_TRUSTED_IPS;
    if (envIps && envIps.trim()) {
      this.trustedIps = new Set(
        envIps.split(',').map((ip) => ip.trim()),
      );
      this.logger.log(
        `IP whitelist active with ${this.trustedIps.size} trusted IPs`,
      );
    } else {
      this.trustedIps = null;
      this.logger.warn(
        'WEBHOOK_TRUSTED_IPS not configured — webhook IP whitelist is OPEN. Set WEBHOOK_TRUSTED_IPS in .env to restrict access.',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    // If no whitelist is configured, allow all (dev mode)
    if (!this.trustedIps) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Extract the real client IP, accounting for proxies (Render/Cloudflare)
    const forwardedFor = request.headers['x-forwarded-for'];
    const clientIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.ip || request.socket.remoteAddress || '';

    if (this.trustedIps.has(clientIp)) {
      return true;
    }

    this.logger.warn(
      `Blocked webhook request from untrusted IP: ${clientIp}`,
    );
    throw new ForbiddenException(
      `Access denied: IP address '${clientIp}' is not authorized for webhook access.`,
    );
  }
}
