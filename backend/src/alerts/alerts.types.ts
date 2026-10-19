import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export type AlertSeverity = 'critical' | 'warning' | 'advisory';
export type AlertClassification =
  | 'OBSERVED'
  | 'PREDICTED'
  | 'FORECAST'
  | 'SIMULATION'
  | 'SUSPECTED_RISK';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface SystemAlert {
  id: string;
  alertKey: string; // e.g. "ALERT_PEAK_CONGESTION:2026-10-14:13"
  module: 'services' | 'cafe' | 'retail' | 'pipeline' | 'forecast' | 'general';
  severity: AlertSeverity;
  classification: AlertClassification;
  title: string;
  evidence: string;
  targetUrl: string;
  actionLabel: string;
  status: AlertStatus;
  firstTriggeredAt: string;
  lastEvaluatedAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  snoozeUntil?: string | null;
  resolvedAt?: string | null;
  resolutionType?: 'auto' | 'manual' | null;
  resolutionReason?: string | null;
  metadata?: Record<string, unknown>;
}

export type NotificationType =
  | 'alert'
  | 'opportunity'
  | 'suggestion'
  | 'report'
  | 'system'
  | 'info';

export interface UserNotification {
  id: string;
  recipientEmail: string;
  type: NotificationType;
  title: string;
  message: string;
  targetUrl: string;
  actionLabel: string;
  read: boolean;
  readAt?: string | null;
  dismissed: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class AcknowledgeAlertDto {
  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  snoozeHours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ResolveAlertDto {
  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;
}
