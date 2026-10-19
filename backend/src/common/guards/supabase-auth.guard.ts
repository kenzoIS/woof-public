import { CanActivate, ExecutionContext, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';
import { SessionLifecycleService } from '../../auth/session-lifecycle.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export type AuthenticatedRequest = Request & { user?: User };

/** Protects every non-auth API route with the HttpOnly Supabase session cookie. */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService, private readonly reflector: Reflector, private readonly config: ConfigService, @Optional() private readonly sessions?: SessionLifecycleService) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<any>();
    const authHeader = request.headers.authorization;
    let token = '';
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      const match = request.headers.cookie?.match(/(?:^|;\s*)woof_session=([^;]+)/);
      if (!match) throw new UnauthorizedException('Authentication required');
      try { token = decodeURIComponent(match[1]); } catch { throw new UnauthorizedException('Authentication required'); }
    }
    let { data, error } = await this.supabase.createSessionClient(token).auth.getUser();
    if (error || !data.user) {
      const refreshMatch = request.headers.cookie?.match(/(?:^|;\s*)woof_refresh=([^;]+)/);
      if (!refreshMatch) throw new UnauthorizedException('Authentication required');
      let refreshToken = '';
      try { refreshToken = decodeURIComponent(refreshMatch[1]); } catch { throw new UnauthorizedException('Authentication required'); }
      const refreshed = await this.supabase.createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
      if (refreshed.error || !refreshed.data.session || !refreshed.data.user) throw new UnauthorizedException('Authentication required');
      token = refreshed.data.session.access_token;
      data = { user: refreshed.data.user } as typeof data;
      error = null;
      response.cookie('woof_session', token, sessionCookieOptions());
      response.cookie('woof_refresh', refreshed.data.session.refresh_token, refreshCookieOptions());
    }
    const adminEmail = (this.config.get<string>('WOOF_ADMIN_EMAIL') || 'woof@admin.ph').trim().toLowerCase();
    if (error || data.user?.email?.toLowerCase() !== adminEmail) throw new UnauthorizedException('Authentication required');
    const assurance = await this.supabase.createSessionClient(token).auth.mfa.getAuthenticatorAssuranceLevel(token);
    if (assurance.error || assurance.data?.currentLevel !== 'aal2') {
      throw new UnauthorizedException('Multi-factor authentication required');
    }
    // Pass only the validated, refreshed AAL2 owner identity to route handlers.
    await this.sessions?.assertActive(token, data.user.id);
    request.user = data.user;
    return true;
  }
}

function sessionCookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 1000 }; }
function refreshCookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 }; }
