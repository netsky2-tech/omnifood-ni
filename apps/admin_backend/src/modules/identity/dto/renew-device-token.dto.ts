import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class RenewDeviceTokenDto {
  @IsUUID()
  @IsNotEmpty()
  credentialId!: string;

  @IsString()
  @IsNotEmpty()
  renewalSecret!: string;

  @IsOptional()
  @IsString()
  declarativeTenantId?: string;

  @IsOptional()
  @IsString()
  declarativeDeviceId?: string;

  @IsOptional()
  @IsInt()
  expectedCredentialVersion?: number;
}
