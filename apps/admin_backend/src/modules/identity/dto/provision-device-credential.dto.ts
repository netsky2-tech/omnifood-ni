import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ProvisionDeviceCredentialDto {
  @IsUUID()
  @IsNotEmpty()
  activationAttemptId!: string;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}
