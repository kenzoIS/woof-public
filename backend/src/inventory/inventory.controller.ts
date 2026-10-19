import {
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SupabaseService } from '../common/supabase/supabase.service';
import { InventoryService } from './inventory.service';
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly supabase: SupabaseService,
  ) {}
  private async authorize(auth?: string, cookie?: string) {
    const session = cookie?.match(/(?:^|;\s*)woof_session=([^;]+)/);
    if (session) {
      try { auth = `Bearer ${decodeURIComponent(session[1])}`; }
      catch { throw new UnauthorizedException("Authentication required"); }
    }
    if (!auth?.startsWith('Bearer '))
      throw new UnauthorizedException('Sign in to view inventory.');
    const { data, error } = await this.supabase.client.auth.getUser(
      auth.slice(7),
    );
    if (error || !data.user)
      throw new UnauthorizedException('Your session expired. Sign in again.');
  }
  @Get()
  async snapshot(
    @Headers('authorization') auth: string,
    @Res({ passthrough: true }) response: Response,
    @Headers("cookie") cookie?: string,
  ) {
    await this.authorize(auth, cookie);
    response.setHeader('Cache-Control', 'no-store');
    return this.inventory.snapshot();
  }
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Headers('authorization') auth: string,
    @Res({ passthrough: true }) response: Response,
    @Headers("cookie") cookie?: string,
  ) {
    await this.authorize(auth, cookie);
    response.setHeader('Cache-Control', 'no-store');
    await this.inventory.sync();
    return this.inventory.snapshot();
  }
}
