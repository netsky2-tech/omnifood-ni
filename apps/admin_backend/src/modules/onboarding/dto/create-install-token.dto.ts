import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInstallTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsBoolean()
  revokePrevious?: boolean;
}
