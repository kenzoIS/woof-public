import { Controller, Get, Post, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditQueryParams } from './audit.types';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  getLogs(
    @Query()
    query: {
      page?: string;
      limit?: string;
      search?: string;
      actor?: 'Owner' | 'System' | 'all';
      module?: string;
      action?: string;
      status?: string;
      category?: string;
      startDate?: string;
      endDate?: string;
      includeArchived?: string;
    },
  ) {
    const params: AuditQueryParams = {
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
      search: query.search,
      actor: query.actor,
      module: query.module,
      action: query.action,
      status: query.status,
      category: query.category,
      startDate: query.startDate,
      endDate: query.endDate,
      includeArchived: query.includeArchived === 'true',
    };
    return this.auditService.list(params);
  }

  @Get('summary')
  getSummary() {
    return this.auditService.summary();
  }

  @Post('archive')
  triggerArchival(@Query('retentionDays') retentionDays?: string) {
    const days = retentionDays ? Number(retentionDays) : 10;
    return this.auditService.archiveOldLogsToS3(days);
  }

  @Get('archives')
  listArchives() {
    return this.auditService.listArchivedDates();
  }

  @Get('archives/file')
  getArchiveFile(@Query('key') key: string) {
    return this.auditService.getArchivedLogFile(key);
  }
}
