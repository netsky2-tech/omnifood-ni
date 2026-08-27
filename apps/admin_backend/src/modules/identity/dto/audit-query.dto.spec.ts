import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  QueryOverridesDto,
  QueryDrawerOpensDto,
  RecordManualDrawerOpenDto,
  DRAWER_OPEN_REASONS,
  DrawerOpenReason,
} from './audit-query.dto';
import { AppPermission } from '../security/permissions.enum';

describe('AuditQuery DTOs (Slice 10.3)', () => {
  describe('DRAWER_OPEN_REASONS enum & constants (DEC-10.4)', () => {
    it('defines the required mandatory drawer opening reasons', () => {
      expect(DRAWER_OPEN_REASONS).toContain('CHANGE_REPLENISHMENT');
      expect(DRAWER_OPEN_REASONS).toContain('AUDIT_COUNT');
      expect(DRAWER_OPEN_REASONS).toContain('FLOAT_ADJUSTMENT');
      expect(DRAWER_OPEN_REASONS).toContain('OTHER');
      expect(DRAWER_OPEN_REASONS.length).toBe(4);
    });
  });

  describe('QueryOverridesDto validation', () => {
    it('validates a valid query payload with dates and filters', async () => {
      const dto = plainToInstance(QueryOverridesDto, {
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-26T23:59:59.999Z',
        supervisorId: '11111111-1111-1111-1111-111111111111',
        permission: AppPermission.SALES_VOID_INVOICE,
        limit: 20,
        offset: 0,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('validates an empty query payload with defaults', async () => {
      const dto = plainToInstance(QueryOverridesDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid date strings', async () => {
      const dto = plainToInstance(QueryOverridesDto, {
        startDate: 'invalid-date',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('startDate');
    });
  });

  describe('QueryDrawerOpensDto validation', () => {
    it('validates a valid drawer query payload', async () => {
      const dto = plainToInstance(QueryDrawerOpensDto, {
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-26T23:59:59.999Z',
        terminalId: 'POS-TERMINAL-01',
        reason: 'CHANGE_REPLENISHMENT',
        limit: 10,
        offset: 0,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects invalid reason enum value', async () => {
      const dto = plainToInstance(QueryDrawerOpensDto, {
        reason: 'INVALID_UNRECOGNIZED_REASON',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reason');
    });
  });

  describe('RecordManualDrawerOpenDto validation', () => {
    it('validates a complete manual drawer open event record', async () => {
      const dto = plainToInstance(RecordManualDrawerOpenDto, {
        terminalId: 'POS-01',
        reason: 'AUDIT_COUNT',
        notes: 'Arqueo de media tarde solicitado por administración',
        supervisorId: '22222222-2222-2222-2222-222222222222',
        metodoAutorizacion: 'PIN',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects missing mandatory terminalId or reason', async () => {
      const dto = plainToInstance(RecordManualDrawerOpenDto, {
        notes: 'Some note without required fields',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
