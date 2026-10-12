import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { ReportsController } from '../controllers/reports.controller';
import type { RequestWithPrincipalOrUser } from '../../../core/decorators/tenant.decorator';
import {
  REPORTS_PER_TENANT_LIMIT,
  REPORT_THROTTLE_TTL_MS,
  TENANT_REPORT_THROTTLER_NAME,
  reportThrottlers,
  tenantReportTracker,
} from './report-throttle.config';

const CALLER = 'ThrottlerException: Too Many Requests';

interface TrackerRequest {
  ip?: string;
  user?: { tenant_id?: string };
  devicePrincipal?: { tenantId?: string };
}

const asRequest = (partial: TrackerRequest): RequestWithPrincipalOrUser =>
  partial as unknown as RequestWithPrincipalOrUser;

function reportContext(
  request: TrackerRequest,
  handler: (...args: unknown[]) => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getClass: () => ReportsController,
    getHandler: () => handler,
  } as unknown as ExecutionContext;
}

describe('tenantReportTracker', () => {
  it('keys on the device principal tenant id (same source as @GetTenantId)', () => {
    expect(
      tenantReportTracker(
        asRequest({
          devicePrincipal: { tenantId: 'tenant-device' },
          user: { tenant_id: 'tenant-user' },
        } as TrackerRequest),
      ),
    ).toBe('tenant-device');
  });

  it('falls back to the authenticated user tenant id (same source as @GetTenantId)', () => {
    expect(
      tenantReportTracker(
        asRequest({
          user: { tenant_id: 'tenant-user' },
        } as TrackerRequest),
      ),
    ).toBe('tenant-user');
  });

  it('falls back to the client IP when no tenant context exists', () => {
    expect(tenantReportTracker(asRequest({ ip: '10.0.0.7' }))).toBe('10.0.0.7');
  });

  it('never returns an undefined tracker', () => {
    expect(tenantReportTracker(asRequest({}))).toBe('unknown');
  });
});

describe('reportThrottlers', () => {
  it(`registers the named tenant throttler at ${REPORTS_PER_TENANT_LIMIT} requests per ${REPORT_THROTTLE_TTL_MS}ms`, () => {
    const throttlers = reportThrottlers();
    expect(throttlers).toHaveLength(1);
    expect(throttlers[0].name).toBe(TENANT_REPORT_THROTTLER_NAME);
    expect(throttlers[0].limit).toBe(REPORTS_PER_TENANT_LIMIT);
    expect(throttlers[0].ttl).toBe(REPORT_THROTTLE_TTL_MS);
    expect(typeof throttlers[0].getTracker).toBe('function');
  });
});

describe('tenant report throttle (ThrottlerGuard over real route metadata)', () => {
  async function buildGuard() {
    // ReportsController is deliberately NOT registered as a controller: its
    // own guards (AuthGuard/RolesGuard) would demand full identity wiring.
    // The ThrottlerGuard only needs the @Throttle metadata, which Reflector
    // reads statically from the real decorated class and method below.
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(reportThrottlers())],
      providers: [ThrottlerGuard],
    }).compile();

    const guard = await moduleRef.resolve(ThrottlerGuard);
    // Outside a running app the lifecycle hook that loads the named
    // throttlers never fires; invoke it explicitly so the guard is fully
    // initialized.
    await guard.onModuleInit();
    return guard;
  }

  it(`allows ${REPORTS_PER_TENANT_LIMIT} requests per tenant then throttles the 31st across rotating IPs`, async () => {
    const guard = await buildGuard();
    for (let i = 0; i < REPORTS_PER_TENANT_LIMIT; i++) {
      const ctx = reportContext(
        { ip: `10.0.0.${i + 1}`, user: { tenant_id: 'tenant-1' } },
        ReportsController.prototype.exportSalesBook,
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
    // Same tenant, yet another fresh IP: the tenant bucket must trip —
    // food-park devices share one egress IP, so the key is the tenant.
    const next = reportContext(
      { ip: '10.0.0.99', user: { tenant_id: 'tenant-1' } },
      ReportsController.prototype.exportSalesBook,
    );
    await expect(guard.canActivate(next)).rejects.toThrow(ThrottlerException);
    await expect(guard.canActivate(next)).rejects.toThrow(CALLER);
  });

  it('keeps tenant buckets isolated behind one shared egress IP', async () => {
    const guard = await buildGuard();
    for (let i = 0; i < REPORTS_PER_TENANT_LIMIT; i++) {
      const ctx = reportContext(
        { ip: '10.1.0.1', user: { tenant_id: 'tenant-a' } },
        ReportsController.prototype.exportZReports,
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
    // A different tenant behind the SAME IP still has its own budget.
    const otherTenant = reportContext(
      { ip: '10.1.0.1', user: { tenant_id: 'tenant-b' } },
      ReportsController.prototype.exportZReports,
    );
    await expect(guard.canActivate(otherTenant)).resolves.toBe(true);
  });

  it('throttles the fiscal summary route under the same tenant bucket', async () => {
    const guard = await buildGuard();
    for (let i = 0; i < REPORTS_PER_TENANT_LIMIT; i++) {
      const ctx = reportContext(
        { ip: '10.2.0.1', user: { tenant_id: 'tenant-c' } },
        ReportsController.prototype.getMonthlyFiscalSummary,
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
    const exhausted = reportContext(
      { ip: '10.2.0.1', user: { tenant_id: 'tenant-c' } },
      ReportsController.prototype.getMonthlyFiscalSummary,
    );
    await expect(guard.canActivate(exhausted)).rejects.toThrow(
      ThrottlerException,
    );
  });
});
