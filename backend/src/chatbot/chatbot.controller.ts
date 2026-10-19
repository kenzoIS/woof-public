import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChatbotService } from './chatbot.service';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  // ── Security: Strict rate limit on LLM endpoint (5 req/min) ───────
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('ask')
  async ask(
    @Body('question') question: string,
    @Body('history') history?: Array<{ sender?: string; text?: string }>,
  ): Promise<any> {
    return this.chatbotService.answer(question, history);
  }
}

