import { UnauthorizedException } from '@nestjs/common';
import { IndustryTemplateController } from './industry-template.controller';
import { IndustryTemplateService } from '../services/industry-template.service';
import { IndustryTemplate } from '../entities/industry-template.entity';

describe('IndustryTemplateController (Unit)', () => {
  let controller: IndustryTemplateController;
  let service: jest.Mocked<IndustryTemplateService>;

  beforeEach(() => {
    service = {
      listTemplates: jest.fn(),
      getTemplateByCode: jest.fn(),
      applyTemplate: jest.fn(),
    } as unknown as jest.Mocked<IndustryTemplateService>;

    controller = new IndustryTemplateController(service);
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
      );

      expect(result).toEqual(mockApplyResult);
      expect(service.applyTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'CAFETERIA',
        dto,
      );
    });
  });
});
