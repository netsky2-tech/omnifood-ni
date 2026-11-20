import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { ReactivationReason } from '../entities/terminal-reactivation-challenge.entity';
import { HARDWARE_FINGERPRINT_HEX_REGEX } from '../utils/terminal-recovery-code';

export class DeviceLookupDto {
  /** SHA-256 hex (64 chars) of the device hardware fingerprint (ANDROID_ID). */
  @IsString()
  @Matches(HARDWARE_FINGERPRINT_HEX_REGEX, {
    message: 'hardwareFingerprint must be a 64-character hex SHA-256 string',
  })
  hardwareFingerprint!: string;
}

export class ReactivationChallengeStatusDto {
  @IsString()
  @Matches(HARDWARE_FINGERPRINT_HEX_REGEX, {
    message: 'hardwareFingerprint must be a 64-character hex SHA-256 string',
  })
  hardwareFingerprint!: string;
}

export class CompleteReactivationDto {
  @IsString()
  @Matches(HARDWARE_FINGERPRINT_HEX_REGEX, {
    message: 'hardwareFingerprint must be a 64-character hex SHA-256 string',
  })
  hardwareFingerprint!: string;

  /** Optional one-time 6-digit recovery code for offline/dashboard-less approval. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'recoveryCode must be a 6-digit numeric string',
  })
  recoveryCode?: string;
}

export class ConfirmReactivationCredentialDto {
  @IsUUID()
  credentialId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @Length(16, 256)
  renewalSecret!: string;
}

export type ReactivationInitiationMode = 'challenge' | 'factory_reset';

export class InitiateTerminalReactivationDto {
  @IsEnum(ReactivationReason)
  reason!: ReactivationReason;

  @IsOptional()
  @IsIn(['challenge', 'factory_reset'])
  mode?: ReactivationInitiationMode;
}
