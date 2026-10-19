import { Body, Controller, ForbiddenException, Headers, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PetHubWebhookService } from './pethub-webhook.service';
import { IpWhitelistGuard } from '../common/guards/ip-whitelist.guard';

// ── Security: IP Whitelist + Skip Rate Limiting for Webhooks ────────
// Webhooks are machine-to-machine and need IP-based auth, not throttling.
@SkipThrottle()
@UseGuards(IpWhitelistGuard)
@Controller('pethub/webhook')
export class PetHubWebhookController {
  constructor(private readonly pethubWebhookService: PetHubWebhookService) {}

  @Post('transactions')
  async receiveCompletedTransaction(
    @Body() payload: unknown,
    @Headers('x-pethub-webhook-secret') secret?: string,
  ) {
    throw new ForbiddenException(
      'PetHub data ingestion webhook has been permanently disabled.',
    );
  }
}

