import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateUserPermissionsDto } from './permission-matrix.dto';
import { AppPermission } from '../security/permissions.enum';

describe('PermissionMatrix DTOs (Slice 10.1)', () => {
  describe('UpdateUserPermissionsDto validation', () => {
    it('validates a valid list of permissions successfully', async () => {
      const dto = plainToInstance(UpdateUserPermissionsDto, {
        custom_permissions: [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.CASH_MANUAL_DRAWER_OPEN,
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid permission string values', async () => {
      const dto = plainToInstance(UpdateUserPermissionsDto, {
        custom_permissions: ['invalid:nonexistent:permission'],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('custom_permissions');
    });

    it('rejects duplicate permissions in the array', async () => {
      const dto = plainToInstance(UpdateUserPermissionsDto, {
        custom_permissions: [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.SALES_VOID_INVOICE,
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('arrayUnique');
    });

    it('validates empty permission array as valid', async () => {
      const dto = plainToInstance(UpdateUserPermissionsDto, {
        custom_permissions: [],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
