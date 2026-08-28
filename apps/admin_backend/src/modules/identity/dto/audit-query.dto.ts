import {
  IsOptional,
  IsString,
  IsISO8601,
  IsIn,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export const DRAWER_OPEN_REASONS = [
  'CHANGE_REPLENISHMENT',
  'AUDIT_COUNT',
  'FLOAT_ADJUSTMENT',
  'OTHER',
] as const;

export type DrawerOpenReason = (typeof DRAWER_OPEN_REASONS)[number];

export class QueryOverridesDto {
  @IsOptional()
  @IsISO8601({}, { message: 'startDate must be a valid ISO 8601 string' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'endDate must be a valid ISO 8601 string' })
  endDate?: string;

  @IsOptional()
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @IsString()
  permission?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class QueryDrawerOpensDto {
  @IsOptional()
  @IsISO8601({}, { message: 'startDate must be a valid ISO 8601 string' })
  startDate?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'endDate must be a valid ISO 8601 string' })
  endDate?: string;

  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsOptional()
  @IsIn(DRAWER_OPEN_REASONS, {
    message: `reason must be one of: ${DRAWER_OPEN_REASONS.join(', ')}`,
  })
  reason?: DrawerOpenReason;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class RecordManualDrawerOpenDto {
  @IsString()
  @IsNotEmpty({ message: 'terminalId is required' })
  terminalId: string;

  @IsIn(DRAWER_OPEN_REASONS, {
    message: `reason must be one of: ${DRAWER_OPEN_REASONS.join(', ')}`,
  })
  reason: DrawerOpenReason;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @IsIn(['PIN', 'TOTP'], {
    message: 'metodoAutorizacion must be either PIN or TOTP',
  })
  metodoAutorizacion?: 'PIN' | 'TOTP';

  @IsOptional()
  @IsString()
  authorizationToken?: string;
}

export class AuditQueryResponseDto<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
