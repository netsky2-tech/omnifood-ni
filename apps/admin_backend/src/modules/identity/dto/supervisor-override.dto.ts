import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsEnum,
  IsOptional,
  IsObject,
} from 'class-validator';
import { AppPermission } from '../security/permissions.enum';

export type SupervisorAuthMethod = 'PIN' | 'TOTP';

export class SupervisorOverrideRequestDto {
  @IsString({ message: 'supervisorId must be a valid string' })
  @IsNotEmpty({ message: 'supervisorId is required' })
  supervisorId: string;

  @IsString({ message: 'credential must be a string' })
  @IsNotEmpty({ message: 'credential (PIN or TOTP token) is required' })
  credential: string;

  @IsIn(['PIN', 'TOTP'], {
    message: 'method must be either PIN or TOTP',
  })
  method: SupervisorAuthMethod;

  @IsEnum(AppPermission, {
    message: 'permissionRequired must be a valid AppPermission capability',
  })
  permissionRequired: AppPermission;

  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>;
}

export class SupervisorOverrideResponseDto {
  authorized: boolean;
  supervisorId: string;
  supervisorName: string;
  authorizationToken: string;
  expiresAt: string;
  permission: AppPermission;
}
