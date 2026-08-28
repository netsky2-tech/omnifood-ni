import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { FiscalSetupController } from './fiscal-setup.controller';
import { FiscalSetupService } from '../services/fiscal-setup.service';
import { FiscalRegime, FiscalSetupDto } from '../dto/fiscal-setup.dto';

describe('FiscalSetupController (Unit)', () => {
  let controller: FiscalSetupController;
  let service: jest.Mocked<FiscalSetupService>;

  beforeEach(() => {
    service = {
      getFiscalSetup: jest.fn(),
      configureFiscalSetup: jest.fn(),
    } as unknown as jest.Mocked<FiscalSetupService>;

    controller = new FiscalSetupController(service);
  });

  describe('getFiscalSetup', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      await expect(controller.getFiscalSetup(undefined)).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(controller.getFiscalSetup('   ')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(service.getFiscalSetup).not.toHaveBeenCalled();
    });

    it('delegates to service.getFiscalSetup with valid tenantId', async () => {
      const mockResponse = {
        tenantId: 'tenant-1',
        businessName: 'Café Managua',
        ruc: 'J0310000001234',
        regime: FiscalRegime.REGIMEN_GENERAL,
        taxRateIva: 0.15,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
      };

      service.getFiscalSetup.mockResolvedValueOnce(mockResponse);

      const result = await controller.getFiscalSetup(' tenant-1 ');
      expect(result).toEqual(mockResponse);
      expect(service.getFiscalSetup).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('configureFiscalSetup', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      };

      const req = { user: { sub: 'user-1' } } as unknown as Request;

      await expect(
        controller.configureFiscalSetup(dto, req, undefined),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.configureFiscalSetup).not.toHaveBeenCalled();
    });

    it('delegates to service.configureFiscalSetup extracting userId and trimmed tenantId', async () => {
      const dto: FiscalSetupDto = {
        regime: FiscalRegime.CUOTA_FIJA,
        businessName: 'Cafetín',
        commercialFxSpread: 0.5,
        pricesIncludeTax: true,
      };

      const mockResponse = {
        tenantId: 'tenant-1',
        businessName: 'Cafetín',
        ruc: null,
        regime: FiscalRegime.CUOTA_FIJA,
        taxRateIva: 0.0,
        pricesIncludeTax: true,
        commercialFxSpread: 0.5,
        configuredAt: new Date(),
      };

      service.configureFiscalSetup.mockResolvedValueOnce(mockResponse);

      const req = { user: { sub: 'user-123' } } as unknown as Request;
      const result = await controller.configureFiscalSetup(
        dto,
        req,
        ' tenant-1 ',
      );

      expect(result).toEqual(mockResponse);
      expect(service.configureFiscalSetup).toHaveBeenCalledWith(
        'tenant-1',
        dto,
        'user-123',
      );
    });
  });
});
