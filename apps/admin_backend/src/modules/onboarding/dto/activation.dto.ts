import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ActivationCheckCode,
  ActivationCheckStatus,
} from '../entities/activation-check-result.entity';
import { ActivationAttemptStatus } from '../entities/activation-attempt.entity';

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

export class CloseActivationFollowUpDto {
  @IsOptional()
  @IsString()
  closureEvidenceRef?: string;

  @IsOptional()
  @IsString()
  closureNote?: string;
}

export interface DevicePrincipal {
  tenantId: string;
  terminalId: string;
  credentialIdentity?: string;
}
