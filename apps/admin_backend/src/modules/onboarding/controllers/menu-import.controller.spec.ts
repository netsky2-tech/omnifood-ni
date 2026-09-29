import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { ROLES_KEY } from '../../../core/decorators/roles.decorator';
import { UserRole } from '../../identity/entities/user.entity';
import { MenuImportController } from './menu-import.controller';
import { MenuImportService } from '../services/menu-import.service';
import { MenuImportRequestDto } from '../dto/menu-import.dto';

describe('MenuImportController (Unit)', () => {
  let controller: MenuImportController;
  let service: { preview: jest.Mock; commit: jest.Mock };

  const payload: MenuImportRequestDto = { fileBase64: 'aGVsbG8=' };
  const summary = {
    categories: 1,
    productsToCreate: 1,
    productsToUpdate: 0,
    recipesToCreate: 1,
    recipesSkipped: [],
    insumosToCreate: [],
    errors: [],
    warnings: [],
  };

  beforeEach(() => {
    service = { preview: jest.fn(), commit: jest.fn() };
    service.preview.mockResolvedValue(summary);
    service.commit.mockResolvedValue(summary);
    controller = new MenuImportController(
      service as unknown as MenuImportService,
    );
  });

  it('declares human transport guards and the OWNER/MANAGER roles on the controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MenuImportController),
    ).toEqual([AuthGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(ROLES_KEY, MenuImportController),
    ).toEqual([UserRole.OWNER, UserRole.MANAGER]);
  });

  describe('POST preview', () => {
    it('delegates to the service with the tenant bound by the session', async () => {
      const result = await controller.preview(payload, 'tenant-A');

      expect(result).toEqual(summary);
      expect(service.preview).toHaveBeenCalledTimes(1);
      expect(service.preview).toHaveBeenCalledWith('tenant-A', payload);
    });

    it('rejects a missing or blank tenant before touching the service', async () => {
      await expect(controller.preview(payload, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.preview(payload, '   ')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(service.preview).not.toHaveBeenCalled();
    });
  });

  describe('POST commit', () => {
    it('delegates to the service with the tenant bound by the session', async () => {
      const result = await controller.commit(payload, 'tenant-B');

      expect(result).toEqual(summary);
      expect(service.commit).toHaveBeenCalledTimes(1);
      expect(service.commit).toHaveBeenCalledWith('tenant-B', payload);
    });

    it('rejects a missing or blank tenant before touching the service', async () => {
      await expect(controller.commit(payload, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.commit(payload, '')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(service.commit).not.toHaveBeenCalled();
    });
  });
});
