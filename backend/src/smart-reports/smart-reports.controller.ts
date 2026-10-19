import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { SmartReportsService } from './smart-reports.service';

class GenerateReportDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;

  @IsArray()
  @IsIn(['Cafe', 'Retail', 'Services'], { each: true })
  sectors: ('Cafe' | 'Retail' | 'Services')[];
}

class SubmitFeedbackDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  accuracyRating: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  usefulnessRating: number;

  @IsBoolean()
  ownerApproved: boolean;

  @IsOptional()
  @IsString()
  feedbackText?: string;
}

@Controller('smart-reports')
export class SmartReportsController {
  constructor(private readonly smartReportsService: SmartReportsService) {}

  // ── Security: Strict rate limit on LLM endpoint (5 req/min) ───────
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('generate')
  async generateReport(@Body() dto: GenerateReportDto): Promise<any> {
    return await this.smartReportsService.generateReport(
      dto.title,
      dto.startDate,
      dto.endDate,
      dto.sectors,
    );
  }

  @Get()
  async getAllReports(): Promise<any[]> {
    return await this.smartReportsService.getAllReports();
  }

  @Get(':id')
  async getReportById(@Param('id') id: string): Promise<any> {
    return await this.smartReportsService.getReportById(id);
  }

  @Delete(':id')
  async deleteReport(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.smartReportsService.deleteReport(id);
    return { success: true };
  }

  @Put(':id/feedback')
  async submitFeedback(
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackDto,
  ): Promise<any> {
    return await this.smartReportsService.submitFeedback(id, dto);
  }
}

