import { SetMetadata } from '@nestjs/common';
import { AppPermission, Permission } from '../security/permissions.enum';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to require fine-grained permissions on endpoints or controllers.
 * @param permissions List of required AppPermission values
 */
export const RequirePermissions = (
  ...permissions: (Permission | AppPermission)[]
) => SetMetadata(PERMISSIONS_KEY, permissions);
