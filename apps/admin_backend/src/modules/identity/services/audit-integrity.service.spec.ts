import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditIntegrityService } from './audit-integrity.service';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditIntegrityAlert } from '../entities/audit-integrity-alert.entity';

type GapRow = {
  tenant_id: string;
  device_id: string;
  user_id: string;
  gap_start: number;
  gap_end: number;
  forensic_status?: 'ACTIVE' | 'QUARANTINED' | 'REVOKED';
};

describe('AuditIntegrityService', () => {
  let service: AuditIntegrityService;
  let auditLogRepository: { query: jest.Mock<Promise<GapRow[]>, [string]> };
  let alertRepository: {
    findOneBy: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
    insert: jest.Mock<Promise<unknown>, [unknown]>;
    update: jest.Mock<
      Promise<unknown>,
      [{ id: string }, { last_seen_at: Date }]
    >;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    auditLogRepository = {
      query: jest.fn<Promise<GapRow[]>, [string]>(),
    };

    alertRepository = {
      findOneBy: jest.fn<Promise<{ id: string } | null>, [unknown]>(),
      insert: jest.fn<Promise<unknown>, [unknown]>(),
      update: jest.fn<
        Promise<unknown>,
        [{ id: string }, { last_seen_at: Date }]
      >(),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditIntegrityService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: auditLogRepository,
        },
        {
          provide: getRepositoryToken(AuditIntegrityAlert),
          useValue: alertRepository,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get(AuditIntegrityService);
  });

  it('detects ACTIVE-only gaps per tenant stream, persists new alert evidence, and emits gap event', async () => {
    const gaps: GapRow[] = [
      {
        tenant_id: 'T1',
        device_id: 'D1',
        user_id: 'U1',
        gap_start: 12,
        gap_end: 12,
      },
    ];

    auditLogRepository.query.mockResolvedValue(gaps);
    alertRepository.findOneBy.mockResolvedValue(null);

    const result = await service.runNightly();

    expect(auditLogRepository.query).toHaveBeenCalledTimes(1);
    const firstQueryArg = auditLogRepository.query.mock.calls[0]?.[0];
    expect(firstQueryArg).toContain("WHERE forensic_status = 'ACTIVE'");
    expect(result.newAlerts).toBe(1);
    expect(result.totalGaps).toBe(1);
    expect(result.alerts).toEqual([
      expect.objectContaining({
        tenantId: 'T1',
        deviceId: 'D1',
        userId: 'U1',
        gapStart: 12,
        gapEnd: 12,
      }),
    ]);
    expect(
      result.alerts.find((alert) => alert.tenantId === 'T2'),
    ).toBeUndefined();
    expect(alertRepository.insert).toHaveBeenCalledTimes(1);
    expect(alertRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'T1',
        device_id: 'D1',
        user_id: 'U1',
        gap_start: 12,
        gap_end: 12,
      }),
    );
    const firstInsert = alertRepository.insert.mock.calls[0]?.[0] as
      | { first_detected_at?: unknown; last_seen_at?: unknown }
      | undefined;
    expect(firstInsert?.first_detected_at).toBeInstanceOf(Date);
    expect(firstInsert?.last_seen_at).toBeInstanceOf(Date);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'identity.audit_integrity.gap_detected',
      expect.objectContaining({
        tenantId: 'T1',
        deviceId: 'D1',
        userId: 'U1',
        gapStart: 12,
        gapEnd: 12,
      }),
    );
  });

  it('ignores non-ACTIVE rows when mixed with ACTIVE rows for gap detection behavior', async () => {
    const mixedRows: GapRow[] = [
      {
        tenant_id: 'T1',
        device_id: 'D1',
        user_id: 'U1',
        gap_start: 103,
        gap_end: 103,
        forensic_status: 'ACTIVE',
      },
      {
        tenant_id: 'T1',
        device_id: 'D1',
        user_id: 'U1',
        gap_start: 205,
        gap_end: 205,
        forensic_status: 'QUARANTINED',
      },
    ];

    auditLogRepository.query.mockResolvedValue(mixedRows);
    alertRepository.findOneBy.mockResolvedValue(null);

    const result = await service.runNightly();

    expect(result.totalGaps).toBe(1);
    expect(result.newAlerts).toBe(1);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        gapStart: 103,
        gapEnd: 103,
      }),
    );
    expect(alertRepository.insert).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
  });

  it('does not insert duplicate evidence for unchanged gap and updates last_seen_at', async () => {
    const gaps: GapRow[] = [
      {
        tenant_id: 'T1',
        device_id: 'D1',
        user_id: 'U1',
        gap_start: 205,
        gap_end: 205,
      },
    ];

    auditLogRepository.query.mockResolvedValue(gaps);
    alertRepository.findOneBy.mockResolvedValue({ id: 'alert-existing' });

    const result = await service.runNightly();

    expect(result.newAlerts).toBe(0);
    expect(result.unchangedAlerts).toBe(1);
    expect(alertRepository.insert).not.toHaveBeenCalled();
    const updateCall = alertRepository.update.mock.calls[0];
    expect(updateCall?.[0]).toEqual({ id: 'alert-existing' });
    const updatePayload = updateCall?.[1];
    expect(updatePayload?.last_seen_at).toBeInstanceOf(Date);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('returns no alerts when continuity scan has no gaps', async () => {
    auditLogRepository.query.mockResolvedValue([]);

    const result = await service.runNightly();

    expect(result.totalGaps).toBe(0);
    expect(result.newAlerts).toBe(0);
    expect(result.unchangedAlerts).toBe(0);
    expect(result.alerts).toEqual([]);
    expect(alertRepository.insert).not.toHaveBeenCalled();
    expect(alertRepository.update).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('nightly cron hook delegates to runNightly', async () => {
    const runNightlySpy = jest.spyOn(service, 'runNightly').mockResolvedValue({
      totalGaps: 0,
      newAlerts: 0,
      unchangedAlerts: 0,
      alerts: [],
    });

    await service.handleNightlyAuditIntegrity();

    expect(runNightlySpy).toHaveBeenCalledTimes(1);
  });
});
