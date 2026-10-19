import { Injectable } from '@nestjs/common';
import {
  RealtimeEventPayload,
  RealtimeEventType,
  RealtimeGateway,
} from './realtime.gateway';

type EmitRealtimeEventInput = {
  type: RealtimeEventType;
  title: string;
  message?: string;
  module?: string;
  uploadId?: string;
  campaignId?: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emit(input: EmitRealtimeEventInput) {
    const payload: RealtimeEventPayload = {
      ...input,
      timestamp: new Date().toISOString(),
    };

    this.gateway.broadcast(payload);
  }
}
