import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(UserRole)
  role: UserRole;

  // S3 (security-hardening-batch2): NIST SP 800-63B minimum with the
  // offline PIN acting as the terminal second factor. Common-password
  // rejection is the service-layer check (S2), not a DTO rule.
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsOptional()
  password?: string;

  @IsString()
  @MinLength(4)
  @IsOptional()
  pin?: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  // S3 (security-hardening-batch2): NIST SP 800-63B minimum with the
  // offline PIN acting as the terminal second factor. Common-password
  // rejection is the service-layer check (S2), not a DTO rule.
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @IsOptional()
  password?: string;

  @IsString()
  @MinLength(4)
  @IsOptional()
  pin?: string;
}
