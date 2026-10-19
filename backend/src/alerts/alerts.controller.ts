import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import {
  AcknowledgeAlertDto,
  ResolveAlertDto,
} from './alerts.types';
import type { NotificationType } from './alerts.types';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('active')
  async getActiveAlerts() {
    return this.alertsService.getActiveAlerts();
  }

  @Post(':id/acknowledge')
  async acknowledgeAlert(
    @Param('id') id: string,
    @Body() body: AcknowledgeAlertDto,
  ) {
    return this.alertsService.acknowledgeAlert(id, body || {});
  }

  @Post(':id/resolve')
  async resolveAlert(
    @Param('id') id: string,
    @Body() body: ResolveAlertDto,
  ) {
    return this.alertsService.resolveAlert(id, body || { reason: 'Manually marked as resolved' });
  }

  @Post(':id/reactivate')
  async reactivateAlert(@Param('id') id: string) {
    return this.alertsService.reactivateAlert(id);
  }

  @Post('evaluate')
  async triggerEvaluation() {
    return this.alertsService.evaluateAllRules();
  }

  @Get('opportunities')
  async getActiveOpportunities() {
    return this.alertsService.getActiveOpportunities();
  }

  @Post('opportunities/:id/acted')
  async recordOpportunityActed(
    @Param('id') id: string,
    @Body('userEmail') userEmail?: string,
  ) {
    return this.alertsService.recordOpportunityActed(id, userEmail);
  }

  @Get('notifications')
  async getUserNotifications(@Query('userEmail') userEmail?: string) {
    return this.alertsService.getUserNotifications(userEmail);
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(
    @Param('id') id: string,
    @Body('userEmail') userEmail?: string,
  ) {
    const success = await this.alertsService.markNotificationRead(id, userEmail);
    return { success, id };
  }

  @Post('notifications/mark-all-read')
  async markAllNotificationsRead(
    @Body('userEmail') userEmail?: string,
    @Body('type') type?: NotificationType,
  ) {
    const count = await this.alertsService.markAllNotificationsRead(userEmail, type);
    return { success: true, count };
  }

  @Delete('notifications/:id')
  async dismissNotification(
    @Param('id') id: string,
    @Query('userEmail') userEmail?: string,
  ) {
    const success = this.alertsService.dismissNotification(id, userEmail);
    return { success, id };
  }
}
