import { UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { ImportStagingController } from './import-staging.controller';
import { ImportStagingService } from '../services/import-staging.service';
import {
  UploadBatchDto,
  UploadRawCsvDto,
  CommitImportDto,
} from '../dto/import-staging.dto';
import { LegacyImportIntegrityReportService } from '../services/legacy-import-integrity-report.service';
import { LegacyImportIntegrityStatus } from '../entities/legacy-import-integrity-report.entity';

describe('ImportStagingController (Unit)', () => {
  let controller: ImportStagingController;
  let service: jest.Mocked<ImportStagingService>;
  let integrityService: jest.Mocked<LegacyImportIntegrityReportService>;

  const sessionToken = '11111111-2222-3333-4444-555555555555';

  beforeEach(() => {
    service = {
      uploadBatch: jest.fn(),
      uploadRawCsv: jest.fn(),
      getPreview: jest.fn(),
      commitImport: jest.fn(),
      getFailedRows: jest.fn(),
    } as unknown as jest.Mocked<ImportStagingService>;

    integrityService = {
      generateIntegrityReport: jest.fn(),
      expireIncompatibleLegacyStaging: jest.fn(),
    } as unknown as jest.Mocked<LegacyImportIntegrityReportService>;

    controller = new ImportStagingController(service, integrityService);
  });

  describe('getOfficialTemplate', () => {
    it('returns canonical template metadata and CSV content (AC-22)', () => {
      const template = controller.getOfficialTemplate();
      expect(template.version).toBe('v1.0');
      expect(template.requiredColumns).toEqual(['nombre', 'precio_venta']);
      expect(template.templateCsv).toContain(
        'nombre,precio_venta,unidad_venta,sku',
      );
    });
  });

  describe('uploadRawCsv', () => {
    it('throws UnauthorizedException when tenantId is missing', async () => {
      const dto: UploadRawCsvDto = {
        csvContent: 'nombre,precio_venta\nPizza,200',
      };

      await expect(controller.uploadRawCsv(dto, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('delegates to service.uploadRawCsv with trimmed tenantId', async () => {
      const dto: UploadRawCsvDto = {
        csvContent: 'nombre,precio_venta\nPizza,200',
      };

      const mockResponse = {
        sessionToken,
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
        errors: [],
      };

      service.uploadRawCsv.mockResolvedValueOnce(mockResponse);

      const result = await controller.uploadRawCsv(dto, ' tenant-1 ');
      expect(result).toEqual(mockResponse);
      expect(service.uploadRawCsv).toHaveBeenCalledWith('tenant-1', dto);
    });
  });

  describe('getPreview', () => {
    it('delegates to service.getPreview with trimmed tenantId (AC-23)', async () => {
      const mockPreview = {
        sessionToken,
        status: 'READY',
        parserContractVersion: 'v1.0',
        sourceHash: 'hash-1',
        totalRows: 2,
        validRows: 2,
        errorRows: 0,
        duplicatesCount: 1,
        conflictsCount: 0,
        duplicates: [],
        unsupportedColumns: [],
        unknownColumns: [],
      };

      service.getPreview.mockResolvedValueOnce(mockPreview);

      const result = await controller.getPreview(sessionToken, ' tenant-1 ');
      expect(result).toEqual(mockPreview);
      expect(service.getPreview).toHaveBeenCalledWith('tenant-1', sessionToken);
    });
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

  describe('getFailedRows & exportFailedRowsCsv', () => {
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

    it('exports failed rows as CSV with status 200 and headers (AC-21)', async () => {
      const mockErrors = [
        {
          rowNumber: 1,
          rawNombre: 'Prod Bad',
          rawSku: 'SKU-BAD',
          reason: 'Precio no numérico',
        },
      ];

      service.getFailedRows.mockResolvedValueOnce(mockErrors);

      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportFailedRowsCsv(sessionToken, mockRes, 'tenant-1');

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining(
          'fila,nombre_suministrado,sku_suministrado,motivo_error',
        ),
      );
    });
  });

  describe('runIntegrityScan & expireLegacyStaging (ONB1.4H)', () => {
    it('delegates runIntegrityScan to integrityReportService', async () => {
      integrityService.generateIntegrityReport.mockResolvedValueOnce({
        id: 'report-1',
        tenant_id: 'tenant-1',
        status: LegacyImportIntegrityStatus.CLEAN,
      } as never);

      const result = await controller.runIntegrityScan(' tenant-1 ');
      expect(result).toMatchObject({ id: 'report-1', status: 'CLEAN' });
      expect(integrityService.generateIntegrityReport).toHaveBeenCalledWith(
        'tenant-1',
      );
    });

    it('delegates expireLegacyStaging to integrityReportService', async () => {
      integrityService.expireIncompatibleLegacyStaging.mockResolvedValueOnce({
        expiredSessions: ['session-1'],
        expiredRowsCount: 3,
      });

      const result = await controller.expireLegacyStaging(' tenant-1 ');
      expect(result).toEqual({
        expiredSessions: ['session-1'],
        expiredRowsCount: 3,
      });
      expect(
        integrityService.expireIncompatibleLegacyStaging,
      ).toHaveBeenCalledWith('tenant-1');
    });
  });
});
