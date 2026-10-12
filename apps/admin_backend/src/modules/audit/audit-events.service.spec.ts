import { ReportingPeriodValidationError } from '../../core/reporting/reporting-period';
import { AuditEventsService } from './audit-events.service';
import { ChangeLog } from './entities/change-log.entity';

/**
 * Slice 6b (finding H6): GET /operations/audit/events read service. The
 * change_log access rides the ChangeLogService bound path (issue #512) —
 * asserted via the findEvents delegate — and the severity of every row is
 * resolved by the single AuditRiskClassifier (NULL history -> INFO).
 */
const TENANT_ID = 'tenant-test-123';

describe('AuditEventsService', () => {
  let service: AuditEventsService;
  let findEvents: jest.Mock;

  const bootstrapEvents = (rows: ChangeLog[]) => {
    findEvents = jest.fn().mockResolvedValue(rows);
    service = new AuditEventsService({ findEvents } as never);
  };


  describe('getEvents (slice 6b — GET /operations/audit/events)', () => {
    const makeRow = (overrides: Partial<Record<keyof ChangeLog, unknown>> = {}) =>
      ({
        id: 'log-1',
        tenant_id: TENANT_ID,
        user_id: 'user-uuid',
        actor_ref: null,
        user_email: 'owner@example.com',
        action: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
        target_type: 'ActivationAttempt',
        target_id: 'attempt-1',
        changes: { before: 'x', after: 'y' }, // forensic payload — must never leak
        severity: 'CRITICAL',
        created_at: new Date('2026-09-01T11:58:00.000Z'),
        ...overrides,
      }) as unknown as ChangeLog;

    it('delegates to the ChangeLogService bound path with the shared reporting bounds and default limit', async () => {
      bootstrapEvents([]);

      await service.getEvents(TENANT_ID, '2026-08-01', '2026-08-31');

      expect(findEvents).toHaveBeenCalledWith(TENANT_ID, {
        // America/Managua half-open bounds, same parser as the summary.
        startInclusiveUtc: new Date('2026-08-01T06:00:00.000Z'),
        endExclusiveUtc: new Date('2026-09-01T06:00:00.000Z'),
        severity: undefined,
        limit: 50,
      });
    });

    it('maps stored severity through the single classifier and never leaks the forensic changes payload', async () => {
      bootstrapEvents([
        makeRow(),
        makeRow({
          id: 'log-2',
          severity: null, // historical row
          action: 'UPDATE',
          user_email: null,
          user_id: null,
          actor_ref: 'SYSTEM_RECONCILER',
        }),
      ]);

      const result = await service.getEvents(TENANT_ID);

      expect(result.events).toHaveLength(2);
      expect(result.events[0]).toEqual({
        id: 'log-1',
        occurredAt: '2026-09-01T11:58:00.000Z',
        actorEmail: 'owner@example.com',
        actorRef: null,
        action: 'ONBOARDING_ACTIVATION_CHECK_FAILED',
        severity: 'CRITICAL',
        targetType: 'ActivationAttempt',
        targetId: 'attempt-1',
      });
      // Backfill-free rule: historical NULL severity surfaces as INFO.
      expect(result.events[1].severity).toBe('INFO');
      expect(result.events[1].actorEmail).toBeNull();
      expect(result.events[1].actorRef).toBe('SYSTEM_RECONCILER');
      for (const event of result.events) {
        expect(Object.keys(event).sort()).toEqual([
          'action',
          'actorEmail',
          'actorRef',
          'id',
          'occurredAt',
          'severity',
          'targetId',
          'targetType',
        ]);
      }
    });

    it('forwards the severity filter and clamps the page cap to the documented maximum', async () => {
      bootstrapEvents([]);

      await service.getEvents(TENANT_ID, undefined, undefined, 'WARNING', 250);

      expect(findEvents).toHaveBeenCalledWith(TENANT_ID, {
        startInclusiveUtc: null,
        endExclusiveUtc: null,
        severity: 'WARNING',
        limit: 100,
      });
    });

    it('returns an empty event list with generatedAt for a window without events', async () => {
      bootstrapEvents([]);

      const result = await service.getEvents(
        TENANT_ID,
        undefined,
        undefined,
        undefined,
        undefined,
        new Date('2026-09-01T12:00:00.000Z'),
      );

      expect(result).toEqual({
        events: [],
        generatedAt: '2026-09-01T12:00:00.000Z',
      });
    });

    it('propagates the shared period validation error for an inverted range', async () => {
      bootstrapEvents([]);

      await expect(
        service.getEvents(TENANT_ID, '2026-09-01', '2026-08-01'),
      ).rejects.toThrowError(ReportingPeriodValidationError);
    });
  });
});
