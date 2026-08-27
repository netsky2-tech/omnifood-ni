import { UnauthorizedException } from '@nestjs/common';
import { ImportStagingController } from './import-staging.controller';
import { ImportStagingService } from '../services/import-staging.service';
import { UploadBatchDto, CommitImportDto } from '../dto/import-staging.dto';

describe('ImportStagingController (Unit)', () => {
  let controller: ImportStagingController;
  let service: jest.Mocked<ImportStagingService>;

  const sessionToken = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    service = {
      uploadBatch: jest.fn(),
      commitImport: jest.fn(),
      getFailedRows: jest.fn(),
    } as unknown as jest.Mocked<ImportStagingService>;

    controller = new ImportStagingController(service);
  });

  describe('uploadBatch', () => {
    it('throws UnauthorizedException when tenantId is missing or blank', async () => {
      const dto: UploadBatchDto = {
        sessionToken,
        rows: [{ nombre: 'Gaseosa', precioVenta: '25' }],
      };

      await expect(controller.uploadBatch(dto, undefined)).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(controller.uploadBatch(dto, '   ')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(service.uploadBatch).not.toHaveBeenCalled();
    });

    it('delegates to service.uploadBatch with trimmed tenantId', async () => {
      const dto: UploadBatchDto = {
        sessionToken,
        rows: [{ nombre: 'Gaseosa', precioVenta: '25' }],
      };

      const mockResponse = {
        sessionToken,
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
        errors: [],
      };

      service.uploadBatch.mockResolvedValueOnce(mockResponse);

      const result = await controller.uploadBatch(dto, ' tenant-1 ');
      expect(result).toEqual(mockResponse);
      expect(service.uploadBatch).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  describe('commitImport', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      const dto: CommitImportDto = {
        sessionToken,
        mode: 'VALID_ONLY',
      };

      await expect(controller.commitImport(dto, undefined)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(service.commitImport).not.toHaveBeenCalled();
    });

    it('delegates to service.commitImport with trimmed tenantId', async () => {
      const dto: CommitImportDto = {
        sessionToken,
        mode: 'VALID_ONLY',
      };

      const mockResponse = {
        sessionToken,
        mode: 'VALID_ONLY' as const,
        productsCreated: 5,
        productsUpdated: 0,
        productsSkipped: 0,
        totalCommitted: 5,
        committedAt: new Date(),
      };

      service.commitImport.mockResolvedValueOnce(mockResponse);

      const result = await controller.commitImport(dto, ' tenant-1 ');
      expect(result).toEqual(mockResponse);
      expect(service.commitImport).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  describe('getFailedRows', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      await expect(
        controller.getFailedRows(sessionToken, undefined),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.getFailedRows).not.toHaveBeenCalled();
    });

    it('delegates to service.getFailedRows with trimmed tenantId', async () => {
      const mockErrors = [
        {
          rowNumber: 1,
          rawNombre: 'Prod Bad',
          reason: 'Precio inválido',
        },
      ];

      service.getFailedRows.mockResolvedValueOnce(mockErrors);

      const result = await controller.getFailedRows(sessionToken, ' tenant-1 ');
      expect(result).toEqual(mockErrors);
      expect(service.getFailedRows).toHaveBeenCalledWith(
        'tenant-1',
        sessionToken,
      );
    });
  });
});
