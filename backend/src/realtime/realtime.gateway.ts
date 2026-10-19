import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export type RealtimeEventType =
  | 'inventory_updated'
  | 'inventory_sync_status'
  | 'upload_processed'
  | 'etl_started'
  | 'etl_completed'
  | 'etl_failed'
  | 'forecast_warmup_started'
  | 'forecast_ready'
  | 'forecast_failed'
  | 'campaign_publish_started'
  | 'campaign_published'
  | 'campaign_publish_failed';

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  title: string;
  message?: string;
  module?: string;
  uploadId?: string;
  campaignId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server?: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Realtime client connected: ${client.id}`);
    client.emit('woof:connected', {
      status: 'connected',
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Realtime client disconnected: ${client.id}`);
  }

  broadcast(payload: RealtimeEventPayload) {
    this.server?.emit('woof:event', payload);
  }

  @SubscribeMessage('woof:ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('woof:pong', { timestamp: new Date().toISOString() });
  }
}
