import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsUUID,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  pass: string;
}

export class RefreshTokenDto {
  @IsUUID('4', { message: 'ID de usuario inválido' })
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class CreateAuditLogDto {
  @IsUUID('4', { message: 'ID de log inválido' })
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsOptional()
  user_id?: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsString()
  @IsOptional()
  tipo_accion?: string;

  @IsString()
  @IsOptional()
  target_type?: string;

  @IsString()
  @IsOptional()
  target_id?: string;

  @IsString()
  @IsNotEmpty()
  device_id: string;

  @IsNotEmpty()
  sequence_no: number;

  @IsString()
  @IsNotEmpty()
  prev_hash: string;

  @IsString()
  @IsNotEmpty()
  entry_hash: string;

  @IsString()
  @IsOptional()
  metodo_autorizacion?: string;

  @IsString()
  @IsOptional()
  usuario_autorizador_id?: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  metadata_raw?: string;

  @IsString()
  @IsOptional()
  hash_version?: string;
}

export class PushAuditLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAuditLogDto)
  logs: CreateAuditLogDto[];
}
