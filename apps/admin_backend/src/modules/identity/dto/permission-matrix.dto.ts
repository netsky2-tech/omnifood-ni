import { IsArray, IsEnum, ArrayUnique } from 'class-validator';
import { AppPermission } from '../security/permissions.enum';

export class UpdateUserPermissionsDto {
  @IsArray()
  @ArrayUnique({ message: 'Permissions array cannot contain duplicates' })
  @IsEnum(AppPermission, {
    each: true,
    message:
      'Each item in custom_permissions must be a valid AppPermission capability',
  })
  custom_permissions: AppPermission[];
}

export class PermissionMatrixResponseDto {
  role_defaults: Record<string, AppPermission[]>;
  all_permissions: AppPermission[];
}

export class UserEffectivePermissionsDto {
  user_id: string;
  role: string;
  role_permissions: AppPermission[];
  custom_permissions: AppPermission[];
  effective_permissions: AppPermission[];
}
