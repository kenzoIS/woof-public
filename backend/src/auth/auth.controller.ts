import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PasswordRecoveryService } from './password-recovery.service';
import { SessionActivityDto, LogoutDto } from './dto/session.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  PasswordResetRequestDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from './dto/password-reset.dto';
import {
  ChangePasswordDto,
  TwoFactorCodeDto,
  VerifyMfaEnrollmentDto,
} from './dto/security.dto';

@Public() // AuthService explicitly validates sensitive auth endpoints below.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly recovery: PasswordRecoveryService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      body.email,
      body.password,
      body.twoFactorCode,
    );
    if ('accessToken' in result) {
      response.cookie('woof_session', result.accessToken, cookieOptions());
      response.cookie(
        'woof_refresh',
        result.refreshToken,
        refreshCookieOptions(),
      );
      // Do not return the access token to browser JavaScript.
      return {
        email: result.email,
        expiresAt: result.expiresAt,
        mfaRequired: result.mfaRequired,
      };
    }
    return result;
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async requestPasswordReset(
    @Body() body: PasswordResetRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const grant = await this.recovery.request(
      body.email,
      recoveryGrant(request),
    );
    response.cookie('woof_recovery', grant, {
      ...cookieOptions(),
      maxAge: 10 * 60000,
    });
    return { success: true };
  }

  @Post('cancel-password-recovery')
  async cancelPasswordRecovery(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.recovery.cancel(recoveryGrant(request));
    response.clearCookie('woof_recovery', cookieOptions());
    return { success: true };
  }

  @Post('verify-reset-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  verifyResetOtp(@Body() body: VerifyResetOtpDto, @Req() request: Request) {
    return this.recovery.verify(recoveryGrant(request), body.otp);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const grant = recoveryGrant(request);
    const result = grant
      ? await this.recovery.reset(grant, body.password)
      : await this.authService.resetPassword(
          sessionToken(request),
          body.password,
        );
    response.clearCookie('woof_recovery', cookieOptions());
    return result;
  }

  @Post('change-password')
  changePassword(@Body() body: ChangePasswordDto, @Req() request: Request) {
    return this.authService.changePassword(
      sessionToken(request),
      body.newPassword,
      body.currentPassword,
    );
  }

  @Post('2fa/enable')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  enableTwoFactor(@Body() body: TwoFactorCodeDto, @Req() request: Request) {
    return this.authService.enableTwoFactor(
      sessionToken(request),
      body.factorId,
      body.code,
    );
  }

  @Post('2fa/disable')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  disableTwoFactor(@Body() body: TwoFactorCodeDto, @Req() request: Request) {
    return this.authService.disableTwoFactor(
      sessionToken(request),
      body.factorId,
      body.code,
    );
  }

  @Post('2fa/status')
  getTwoFactorStatus(@Req() request: Request) {
    return this.authService.getTwoFactorStatus(sessionToken(request));
  }

  @Post('mfa/enrollment/verify')
  async verifyMfaEnrollment(
    @Body() body: VerifyMfaEnrollmentDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyMfaEnrollment(
      sessionToken(request),
      refreshToken(request),
      body.factorId,
      body.code,
      request.ip || request.socket.remoteAddress || 'unknown',
    );
    response.cookie('woof_session', result.accessToken, cookieOptions());
    response.cookie(
      'woof_refresh',
      result.refreshToken,
      refreshCookieOptions(),
    );
    response.setHeader('Cache-Control', 'no-store');
    return { success: true };
  }

  @Get('session')
  async getSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.authService.getSession(
        sessionToken(request),
        refreshToken(request),
      );
      if ('accessToken' in result) {
        response.cookie('woof_session', result.accessToken, cookieOptions());
        response.cookie(
          'woof_refresh',
          result.refreshToken,
          refreshCookieOptions(),
        );
      }
      return {
        authenticated: result.authenticated,
        email: result.email,
        mfaRequired: result.mfaRequired,
      };
    } catch (error) {
      response.clearCookie('woof_session', cookieOptions());
      response.clearCookie('woof_refresh', refreshCookieOptions());
      throw error;
    }
  }

  @Post('activity/list')
  getLoginActivity(@Req() request: Request) {
    return this.authService.getLoginActivity(sessionToken(request));
  }

  @Post('session/activity')
  activity(@Req() request: Request, @Body() body: SessionActivityDto) {
    return this.authService.activity(
      sessionToken(request),
      body.timeoutMinutes,
    );
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: LogoutDto,
  ) {
    try {
      return await this.authService.signOut(
        sessionToken(request),
        body?.reason || 'logout',
        refreshToken(request),
      );
    } finally {
      response.clearCookie('woof_session', cookieOptions());
      response.clearCookie('woof_refresh', refreshCookieOptions());
      response.clearCookie('woof_recovery', cookieOptions());
    }
  }
}

function sessionToken(request: Request) {
  const raw = request.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)woof_session=([^;]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}
function refreshToken(request: Request) {
  const match = (request.headers.cookie || '').match(
    /(?:^|;\s*)woof_refresh=([^;]+)/,
  );
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 1000,
  };
}
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function recoveryGrant(request: Request) {
  const match = request.headers.cookie?.match(
    /(?:^|;\s*)woof_recovery=([^;]+)/,
  );
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
}
