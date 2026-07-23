import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsUUID,
  IsObject,
  Allow,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  @Transform(({ value }: { value: unknown }): unknown => value)
  @IsString()
  @IsOptional()
  metodo_autorizacion?: string | null | undefined;

  @Transform(({ value }: { value: unknown }): unknown => value)
  @IsString()
  @IsOptional()
  usuario_autorizador_id?: string | null | undefined;

  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  metadata_raw?: string;

  @Transform(({ value }: { value: unknown }): unknown => value)
  @Allow()
  @IsOptional()
  hash_version?: unknown;
}

export class PushAuditLogsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAuditLogDto)
  logs: CreateAuditLogDto[];
}

export const inventoryBohPermissionValues = [
  'inventory.boh.shell',
  'inventory.boh.purchases.view',
  'inventory.boh.production.view',
  'inventory.boh.counts.view',
  'inventory.boh.alerts.view',
  'inventory.boh.kardex.view',
  'inventory.boh.recipes.view',
] as const;

export type InventoryBohPermissionDto =
  (typeof inventoryBohPermissionValues)[number];

export class AuthenticatedUserDto {
  id: string;
  name: string;
  role: string;
  tenant_id: string;
  permissions: InventoryBohPermissionDto[];
}

export class StaffSyncSecurityProfileDto {
  user_id: string;
  pin_hash: string | null;
  totp_secret_seed: string | null;
  is_totp_enabled: boolean;
  is_pin_enabled: boolean;
  scope: 'self' | 'authorizer' | 'masked' | 'full';
}

export class StaffSyncUserDto {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  email: string;
  tenant_id: string;
  permissions: InventoryBohPermissionDto[];
  security_profile: StaffSyncSecurityProfileDto | null;
}
