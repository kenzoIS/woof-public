import { Body, Controller, Post } from '@nestjs/common';
import { LlmService } from './llm.service';
import type { LlmRequest } from './llm.service';

@Controller('llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post('generate')
  generate(@Body() request: LlmRequest) {
    return this.llmService.generate(request);
  }
}
