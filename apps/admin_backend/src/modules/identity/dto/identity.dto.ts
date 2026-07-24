import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsUUID,
  IsIn,
  MaxLength,
  Allow,
  ValidateIf,
  ValidateBy,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const V3_HASH_VERSION = 'v3-jcs-rfc8785';

export const AUDIT_CAPABILITY_VERSION = {
  V2: 'v2',
  V3: V3_HASH_VERSION,
} as const;

export const auditCapabilityVersionValues = Object.values(
  AUDIT_CAPABILITY_VERSION,
);

export type AuditCapabilityVersionDto =
  (typeof AUDIT_CAPABILITY_VERSION)[keyof typeof AUDIT_CAPABILITY_VERSION];

export type NumberFreeJson =
  | null
  | string
  | boolean
  | { readonly [key: string]: NumberFreeJson }
  | readonly NumberFreeJson[];

const isNumberFreeJson = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isNumberFreeJson);
  if (typeof value !== 'object') return false;
  return Object.values(value).every(isNumberFreeJson);
};

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

  @IsOptional()
  @ValidateBy({
    name: 'isAuditMetadata',
    validator: {
      validate: (value: unknown, { object }): boolean =>
        (object as CreateAuditLogDto).hash_version === V3_HASH_VERSION
          ? isNumberFreeJson(value)
          : typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value),
      defaultMessage: ({ object }): string =>
        (object as CreateAuditLogDto).hash_version === V3_HASH_VERSION
          ? 'metadata must be a number-free JSON value'
          : 'metadata must be an object',
    },
  })
  metadata?: NumberFreeJson;

  @ValidateIf(
    ({ hash_version }: CreateAuditLogDto) => hash_version === V3_HASH_VERSION,
  )
  @IsString()
  @IsNotEmpty()
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

export class ActivateCapabilityDto {
  @IsIn(auditCapabilityVersionValues)
  new_version: AuditCapabilityVersionDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class AuditCapabilityResponseDto {
  tenant_id: string;
  active_version: AuditCapabilityVersionDto;
  contract_version: number;
  revision: number;
  previous_version?: AuditCapabilityVersionDto;
  server_issued_at: string;
  server_fetched_at: string;
  server_expires_at: string;
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
