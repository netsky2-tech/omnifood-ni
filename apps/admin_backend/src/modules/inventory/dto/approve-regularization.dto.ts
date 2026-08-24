import { IsUUID, IsString, IsNotEmpty, IsIn } from 'class-validator';

export class ApproveRegularizationDto {
  @IsUUID()
  @IsNotEmpty()
  queueId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['PIN', 'TOTP', 'WEB_CONSOLE'])
  authMethod: string;

  @IsString()
  token?: string;
}
