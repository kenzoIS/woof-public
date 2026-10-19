export type AuditActorLabel = 'Owner' | 'System';

export interface AuditLogInput {
  actor?: string;
  actorType?: 'user' | 'system' | 'integration';
  action: string;
  module: string;
  category?: 'workflow' | 'ai_system' | 'security';
  target?: string;
  status?: 'success' | 'failed' | 'pending';
  stateBefore?: string;
  stateAfter?: string;
  durationMs?: number;
  method?: string;
  path?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  actor: AuditActorLabel;
  actor_type: 'user' | 'system' | 'integration';
  action: string;
  module: string;
  category: 'workflow' | 'ai_system' | 'security';
  target?: string | null;
  status: 'success' | 'failed' | 'pending';
  state_before?: string | null;
  state_after?: string | null;
  duration_ms?: number | null;
  method?: string | null;
  path?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  isArchived?: boolean;
}

export interface AuditQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  actor?: 'Owner' | 'System' | 'all';
  module?: string;
  action?: string;
  status?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  includeArchived?: boolean;
}

export interface PaginatedAuditResponse {
  events: AuditEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface AuditSummary {
  total: number;
  pendingApprovals: number;
  automatedTriggers: number;
  systemBottlenecks: number;
  averageDurationMs: number;
  successful: number;
}
