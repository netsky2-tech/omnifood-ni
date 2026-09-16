import { IsNotEmpty, IsString } from 'class-validator';

export class BootstrapDeviceSyncCredentialDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;
}
