import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsvService } from './csv.service';

const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

@Controller('csv')
export class CsvController {
  constructor(private readonly csvService: CsvService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  async uploadCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body('channel') channel?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname
      .toLowerCase()
      .slice(file.originalname.lastIndexOf('.'));
    if (!allowedExtensions.includes(ext)) {
      throw new BadRequestException('Only CSV and Excel files are supported');
    }

    const result = await this.csvService.processUpload(file, channel);
    return {
      success: true,
      upload: result,
    };
  }

  @Post('historical/:module')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
    }),
  )
  async uploadHistoricalCsv(
    @Param('module') module: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException(
        'Historical forecasting ingestion accepts CSV files only',
      );
    }

    return this.csvService.processHistoricalUpload(file, module);
  }

  @Get('uploads')
  async getUploads() {
    const uploads = await this.csvService.getUploads();
    return { uploads };
  }

  @Delete('uploads/:id')
  async deleteUpload(@Param('id') id: string) {
    const result = await this.csvService.deleteUpload(id);
    return result;
  }

  @Get('metrics')
  async getMetrics() {
    const metrics = await this.csvService.getMetrics();
    return metrics;
  }
}
