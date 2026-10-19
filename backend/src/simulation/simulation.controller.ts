import {
  Body,
  Controller,
  Get,
  Req,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../common/guards/supabase-auth.guard';
import { SimulationService } from './simulation.service';
import type { SimConfig, SimInputs, SimEvent } from './simulation.types';

@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}
  private user(request: AuthenticatedRequest) {
    // The global SupabaseAuthGuard validates the session, owner and MFA first.
    // Reuse its identity, including when it rotated an expired access cookie.
    if (!request?.user?.id)
      throw new UnauthorizedException('Sign in to use Operations What-If.');
    return request.user;
  }
  @Get('inputs')
  async inputs(
    @Req() request: AuthenticatedRequest,
    @Query('source') source = 'historical',
    @Query('date') date: string,
    @Query('startDate') start?: string,
    @Query('endDate') end?: string,
  ) {
    this.user(request);
    return this.simulation.inputs(source, date, start, end);
  }
  @Post('runs')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async run(
    @Req() request: AuthenticatedRequest,
    @Body() body: { inputs: SimInputs; baseline: SimConfig; whatIf: SimConfig },
  ) {
    const user = this.user(request);
    return this.simulation.execute(body, user.id, user.email || user.id);
  }
  @Post('runs/:id/inject')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async inject(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { minute: number; event: SimEvent },
  ) {
    const user = this.user(request);
    return this.simulation.inject(
      id,
      user.id,
      user.email || user.id,
      body.minute,
      body.event,
    );
  }
  @Get('runs')
  async history(@Req() request: AuthenticatedRequest) {
    const user = this.user(request);
    return this.simulation.history(user.id);
  }
  @Get('runs/:id')
  async reopen(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const user = this.user(request);
    return this.simulation.reopen(id, user.id);
  }
}
