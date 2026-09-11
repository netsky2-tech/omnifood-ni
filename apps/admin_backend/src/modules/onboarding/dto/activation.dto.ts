import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsObject,
  IsDateString,
} from 'class-validator';
import {
  ActivationCheckCode,
  ActivationCheckStatus,
} from '../entities/activation-check-result.entity';

export class StartActivationDto {
  @IsNotEmpty({ message: 'candidateTerminalId is required' })
  @IsString()
  candidateTerminalId!: string;

  @IsOptional()
  @IsString()
  verificationProductId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  posBuild?: string;
}

export class IngestActivationCheckDto {
  @IsNotEmpty({ message: 'checkCode is required' })
  @IsEnum(ActivationCheckCode)
  checkCode!: ActivationCheckCode;

  @IsNotEmpty({ message: 'status is required' })
  @IsEnum(ActivationCheckStatus)
  status!: ActivationCheckStatus;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  evidenceType?: string;

  @IsOptional()
  @IsString()
  evidenceRef?: string;

  @IsOptional()
  occurredAt?: Date | string;

  @IsOptional()
  @IsObject()
  detailsSanitizedJson?: Record<string, unknown>;

  // Declarative fields for forgery detection against DevicePrincipal
  @IsOptional()
  @IsString()
  declarativeTenantId?: string;

  @IsOptional()
  @IsString()
  declarativeTerminalId?: string;

  @IsOptional()
  @IsString()
  verificationTicketId?: string;
}

export class FirstSuccessfulSaleClaimDto {
  @IsNotEmpty()
  @IsString()
  ticketId!: string;

  @IsNotEmpty()
  @IsString()
  declarativeTenantId!: string;

  @IsNotEmpty()
  @IsString()
  declarativeTerminalId!: string;

  @IsNotEmpty()
  @IsString()
  activationAttemptId!: string;

  @IsNotEmpty()
  @IsDateString()
  deviceOccurredAt!: string;

  @IsOptional()
  @IsDateString()
  anchoredOccurredAt?: string;

  @IsNotEmpty()
  @IsEnum(['ANCHORED', 'DEVICE_VALIDATED', 'DEGRADED'])
  clockConfidence!: 'ANCHORED' | 'DEVICE_VALIDATED' | 'DEGRADED';

  @IsOptional()
  @IsString()
  serverTimeAnchorId?: string;

  @IsOptional()
  @IsString()
  posBuild?: string;

  @IsNotEmpty()
  @IsString()
  outboxEventId!: string;
}

export class CloseActivationFollowUpDto {
  @IsOptional()
  @IsString()
  closureEvidenceRef?: string;

  @IsOptional()
  @IsString()
  closureNote?: string;
}

export enum SupportOverrideAction {
  FORCE_FAIL = 'FORCE_FAIL',
  DISMISS_WARNING = 'DISMISS_WARNING',
  RECORD_DIAGNOSTIC_ASSIST = 'RECORD_DIAGNOSTIC_ASSIST',
}

export class SupportOverrideDto {
  @IsNotEmpty({ message: 'reason is required' })
  @IsString()
  reason!: string;

  @IsNotEmpty({ message: 'overrideAction is required' })
  @IsEnum(SupportOverrideAction)
  overrideAction!: SupportOverrideAction;

  @IsOptional()
  @IsString()
  evidenceRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReconcileConvergenceDto {
  @IsOptional()
  @IsString()
  attemptId?: string;
}

export interface ActivationCheckDiagnosticItem {
  checkCode: ActivationCheckCode;
  status: ActivationCheckStatus | 'MISSING';
  required: boolean;
  isMissing: boolean;
  recordedAt?: Date | null;
  occurredAt?: Date | null;
  evidenceType?: string | null;
  evidenceRef?: string | null;
  detailsSanitizedJson?: Record<string, unknown> | null;
}

export interface ActivationDiagnosticsDto {
  tenantId: string;
  attempt: {
    id: string;
    status: string;
    candidateTerminalId: string;
    trustedTerminalId?: string | null;
    verificationTicketId?: string | null;
    requiredFiscalRevision: number;
    requiredFiscalFingerprint: string;
    verificationProductId: string;
    verificationProductRevision: number;
    startedAt: Date;
    completedAt?: Date | null;
    failureCode?: string | null;
    warningsCount: number;
  };
  session: {
    id: string;
    lifecycleState: string;
    activatedAt?: Date | null;
    saleReadyFirstAt?: Date | null;
  };
  checksMatrix: ActivationCheckDiagnosticItem[];
  missingChecks: ActivationCheckCode[];
  followUps: Array<{
    id: string;
    warningCode: string;
    status: string;
    openedAt: Date;
    openedBy: string;
    closureEvidenceRef?: string | null;
    closedAt?: Date | null;
    closedBy?: string | null;
    closureNote?: string | null;
  }>;
  readiness: {
    saleReady: boolean;
    blockers?: string[];
    warnings?: string[];
  };
  auditTrail?: Array<{
    action: string;
    targetType: string;
    targetId: string;
    userId: string;
    createdAt?: Date;
    changes?: Record<string, unknown> | null;
  }>;
}

export interface DevicePrincipal {
  tenantId: string;
  terminalId: string;
  credentialIdentity?: string;
}
