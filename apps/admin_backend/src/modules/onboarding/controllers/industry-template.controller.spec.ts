import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthoritativeCurrentUserGuard } from '../../identity/guards/authoritative-current-user.guard';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { IndustryTemplateController } from './industry-template.controller';
import { IndustryTemplateService } from '../services/industry-template.service';
import { TemplatePreviewService } from '../services/template-preview.service';
import { LegacyTemplateRecipeScanService } from '../services/legacy-template-recipe-scan.service';
import { IndustryTemplate } from '../entities/industry-template.entity';

describe('IndustryTemplateController (Unit)', () => {
  let controller: IndustryTemplateController;
  let service: jest.Mocked<IndustryTemplateService>;
  let previewService: jest.Mocked<TemplatePreviewService>;
  let legacyScanService: jest.Mocked<LegacyTemplateRecipeScanService>;

  beforeEach(() => {
    service = {
      listTemplates: jest.fn(),
      getTemplateByCode: jest.fn(),
      applyTemplate: jest.fn(),
    } as unknown as jest.Mocked<IndustryTemplateService>;

    previewService = {
      buildPreview: jest.fn(),
    } as unknown as jest.Mocked<TemplatePreviewService>;

    legacyScanService = {
      scanAndRemediate: jest.fn(),
    } as unknown as jest.Mocked<LegacyTemplateRecipeScanService>;

    controller = new IndustryTemplateController(
      service,
      previewService,
      legacyScanService,
    );
  });

  it('adds authoritative authorization only to the catalog-mutating apply handler', () => {
    const applyTemplate: unknown = Object.getOwnPropertyDescriptor(
      IndustryTemplateController.prototype,
      'applyTemplate',
    )?.value;
    if (typeof applyTemplate !== 'function') {
      throw new Error('Missing applyTemplate handler');
    }

    expect(
      Reflect.getMetadata(GUARDS_METADATA, IndustryTemplateController),
    ).toEqual([AuthGuard, RolesGuard, PermissionsGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, applyTemplate)).toEqual([
      AuthoritativeCurrentUserGuard,
    ]);
  });

  describe('listTemplates', () => {
    it('delegates to service.listTemplates', async () => {
      const mockResult = [
        {
          id: 'CAFETERIA',
          code: 'CAFETERIA',
          name: 'Cafetería & Coffee Shop',
          description: 'Desc',
          icon: 'coffee',
          insumoCount: 2,
          productCount: 1,
        },
      ];
      service.listTemplates.mockResolvedValueOnce(mockResult);

      const result = await controller.listTemplates();
      expect(result).toEqual(mockResult);
      expect(service.listTemplates).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTemplate', () => {
    it('delegates to service.getTemplateByCode', async () => {
      const mockTemplate: IndustryTemplate = {
        id: 'CAFETERIA',
        code: 'CAFETERIA',
        name: 'Cafetería',
        description: 'Plantilla de cafetería',
        icon: 'coffee',
        is_active: true,
        version: 1,
        source_fingerprint: 'fp-1',
        templateInsumos: [],
        templateProducts: [],
        created_at: new Date(),
        updated_at: new Date(),
      };
      service.getTemplateByCode.mockResolvedValueOnce(mockTemplate);

      const result = await controller.getTemplate('CAFETERIA');
      expect(result).toEqual(mockTemplate);
      expect(service.getTemplateByCode).toHaveBeenCalledWith('CAFETERIA');
    });
  });

  describe('previewTemplate', () => {
    it('throws UnauthorizedException when tenantId is missing or empty', async () => {
      await expect(
        controller.previewTemplate('CAFETERIA', {}, undefined),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        controller.previewTemplate('CAFETERIA', {}, '   '),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('delegates to previewService.buildPreview with trimmed tenantId', async () => {
      const mockPreviewResult = {
        templateCode: 'CAFETERIA',
        templateVersion: 1,
        templateName: 'Cafetería',
        templateFingerprint: 'fp-1',
        items: [],
        summary: {
          totalItems: 0,
          newCount: 0,
          existingLinkedCount: 0,
          existingUnlinkedCount: 0,
          conflictCount: 0,
          unsupportedCount: 0,
        },
      };
      previewService.buildPreview.mockResolvedValueOnce(mockPreviewResult);

      const dto = { selectedItemIds: ['item-1'] };
      const result = await controller.previewTemplate(
        'CAFETERIA',
        dto,
        ' tenant-1 ',
      );

      expect(result).toEqual(mockPreviewResult);
      expect(previewService.buildPreview).toHaveBeenCalledWith(
        'tenant-1',
        'CAFETERIA',
        dto,
      );
    });
  });

  describe('scanLegacyRecipes', () => {
    it('throws UnauthorizedException when tenantId is missing or empty', async () => {
      await expect(controller.scanLegacyRecipes({}, undefined)).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(controller.scanLegacyRecipes({}, '   ')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('delegates to legacyScanService.scanAndRemediate with trimmed tenantId', async () => {
      const mockScanResult = {
        tenantId: 'tenant-1',
        scannedCount: 2,
        migratedToDraftCount: 1,
        keptPublishedCount: 1,
        unknownProvenanceCount: 0,
        receipts: [],
      };
      legacyScanService.scanAndRemediate.mockResolvedValueOnce(mockScanResult);

      const dto = {};
      const result = await controller.scanLegacyRecipes(dto, ' tenant-1 ');

      expect(result).toEqual(mockScanResult);
      expect(legacyScanService.scanAndRemediate).toHaveBeenCalledWith(
        'tenant-1',
        dto,
      );
    });
  });

  describe('applyTemplate', () => {
    it('throws UnauthorizedException when tenantId is missing or empty', async () => {
      await expect(
        controller.applyTemplate('CAFETERIA', {}, undefined),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        controller.applyTemplate('CAFETERIA', {}, '   '),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.applyTemplate).not.toHaveBeenCalled();
    });

    it('delegates to service.applyTemplate with trimmed tenantId', async () => {
      const mockApplyResult = {
        tenantId: 'tenant-1',
        templateCode: 'CAFETERIA',
        insumosCreated: 2,
        insumosSkipped: 0,
        productsCreated: 1,
        productsSkipped: 0,
        recipesCreated: 1,
      };
      service.applyTemplate.mockResolvedValueOnce(mockApplyResult);

      const dto = { overrideExisting: false };
      const result = await controller.applyTemplate(
        'CAFETERIA',
        dto,
        ' tenant-1 ',
        'user-1',
      );

      expect(result).toEqual(mockApplyResult);
      expect(service.applyTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'CAFETERIA',
        dto,
        'user-1',
      );
    });
  });
});
