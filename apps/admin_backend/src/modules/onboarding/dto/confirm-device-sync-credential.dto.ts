import { IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export class ConfirmDeviceSyncCredentialDto {
  @IsUUID()
  @IsNotEmpty()
  credentialId!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsInt()
  @Min(1)
  credentialVersion!: number;

  @IsString()
  @IsNotEmpty()
  renewalSecret!: string;
}
