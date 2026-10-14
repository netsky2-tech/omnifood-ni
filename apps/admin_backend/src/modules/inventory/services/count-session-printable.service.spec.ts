import { DataSource, EntityManager } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CountSessionPrintableService } from './count-session-printable.service';
import { CompanyIdentityService } from '../../tenant/services/company-identity.service';
import { CountSession } from '../entities/count-session.entity';
import { CountSessionEntry } from '../entities/count-session-entry.entity';
import {
  extractPrintedText,
  pageCountOf,
} from './count-session-pdf.renderer.spec';

/**
 * Unit harness: the transaction and RLS binding are faked at the DataSource
 * boundary (the real binding is exercised by the DB specs); what is under
 * test here is the assembly — session + entries + RESOLVED identity → PDF,
 * and the S4/S15 seams.
 */
describe('CountSessionPrintableService', () => {
  let service: CountSessionPrintableService;
  let manager: EntityManager;

  const makeSession = (): Partial<CountSession> => ({
    id: 'CS/001 A',
    tenant_id: 'tenant-1',
    warehouse_id: 'wh-1',
    warehouse_name: 'Bodega Central',
    status: 'POSTED',
    notes: null,
    cutoff_at: new Date('2026-10-14T15:00:00.000Z'),
    posted_at: new Date('2026-10-14T16:00:00.000Z'),
    movement_references: null,
  });

  const makeEntry = (): Partial<CountSessionEntry> => ({
    session_id: 'CS/001 A',
    insumo_id: '11111111-1111-1111-1111-111111111111',
    insumo_name: 'Harina de trigo',
    uom: 'kg',
    // numeric(14,4) columns hydrate as strings from the driver — the
    // fixture mirrors what Postgres actually hands back.
    theoretical_quantity: '8.0000' as unknown as number,
    line_id: 'line-1',
    line_index: 0,
    entry_index: 0,
    counted_quantity: '7.5000' as unknown as number,
    counted_at: new Date('2026-10-14T09:35:00.000Z'),
    actor_label: 'María López',
    notes: null,
    is_disputed: false,
    is_approved: true,
  });

  beforeEach(async () => {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue(makeSession()),
    };
    const entryRepo = {
      find: jest.fn().mockResolvedValue([makeEntry()]),
    };
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        name: 'Pupusería La Casita, S.A.',
        ruc: null,
        address: null,
        phone: null,
        email: null,
      }),
    };
    manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === CountSession
          ? sessionRepo
          : entity === CountSessionEntry
            ? entryRepo
            : tenantRepo,
      ),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        async (work: (mgr: EntityManager) => Promise<unknown>) => work(manager),
      ),
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountSessionPrintableService,
        CompanyIdentityService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<CountSessionPrintableService>(
      CountSessionPrintableService,
    );
  });

  it('builds the PDF from the frozen rows and the resolved identity (S4/S12)', async () => {
    const result = await service.buildPrintableCountList(
      'tenant-1',
      'CS/001 A',
      {
        // Uncompressed so the spec verifies the PRINTED content, not bytes.
        compress: false,
      },
    );

    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toBe('conteo-fisico-CS-001-A.pdf');
    expect(result.buffer.slice(0, 5).toString('latin1')).toBe('%PDF-');

    const text = extractPrintedText(result.buffer);
    expect(text).toContain('Pupusería La Casita, S.A.');
    // Absent identity columns print the declared marker, not null.
    expect(text).toContain('RUC: No registrado');
    expect(text).toContain('Harina de trigo');
    expect(text).toContain('7.5');
    expect(text).toContain('2026-10-14 09:35');
    expect(pageCountOf(result.buffer)).toBe(1);
  });

  it('throws NotFound when the session does not resolve for this tenant', async () => {
    (
      manager.getRepository(CountSession) as unknown as { findOne: jest.Mock }
    ).findOne.mockResolvedValue(null);
    await expect(
      service.buildPrintableCountList('tenant-1', 'missing'),
    ).rejects.toThrow(NotFoundException);
  });
});
