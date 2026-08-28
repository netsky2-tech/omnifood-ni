import { UnauthorizedException } from '@nestjs/common';
import { GovernanceApprovalService } from './governance-approval.service';

describe('GovernanceApprovalService', () => {
  let service: GovernanceApprovalService;

  beforeEach(() => {
    service = new GovernanceApprovalService();
  });

  it('auto-approves open-period deltas within C$1,500.00 threshold', () => {
    const result = service.evaluateApprovalRequirement(1200.0, false);
    expect(result.requiresApproval).toBe(false);
    expect(result.allowedRoles).toHaveLength(0);

    expect(() =>
      service.assertAuthorized({
        totalDeltaNio: 1200.0,
        isClosedPeriod: false,
        role: 'cashier',
      }),
    ).not.toThrow();
  });

  it('requires manager approval for open-period deltas between C$1,500.01 and C$10,000.00', () => {
    const result = service.evaluateApprovalRequirement(3500.0, false);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toBe('UMBRAL_EXCEDIDO');
    expect(result.allowedRoles).toContain('manager');

    expect(() =>
      service.assertAuthorized({
        totalDeltaNio: 3500.0,
        isClosedPeriod: false,
        role: 'manager',
      }),
    ).not.toThrow();

    expect(() =>
      service.assertAuthorized({
        totalDeltaNio: 3500.0,
        isClosedPeriod: false,
        role: 'cashier',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('requires accountant/admin/owner approval when delta exceeds C$10,000.00', () => {
    const result = service.evaluateApprovalRequirement(15000.0, false);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toBe('UMBRAL_SUPERVISOR_EXCEDIDO');
    expect(result.allowedRoles).not.toContain('manager');
    expect(result.allowedRoles).toContain('accountant');
    expect(result.allowedRoles).toContain('admin');

    expect(() =>
      service.assertAuthorized({
        totalDeltaNio: 15000.0,
        isClosedPeriod: false,
        role: 'manager',
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.assertAuthorized({
        totalDeltaNio: 15000.0,
        isClosedPeriod: false,
        role: 'accountant',
      }),
    ).not.toThrow();
  });

  it('strictly requires accountant/admin/owner for any closed period crossing regardless of delta amount', () => {
    const result = service.evaluateApprovalRequirement(50.0, true);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toBe('PERIODO_CERRADO');
    expect(result.allowedRoles).not.toContain('manager');

    expect(() =>
      service.assertAuthorized({
        totalDeltaNio: 50.0,
        isClosedPeriod: true,
        role: 'manager',
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      service.assertAuthorized({
        totalDeltaNio: 50.0,
        isClosedPeriod: true,
        role: 'admin',
      }),
    ).not.toThrow();
  });
});
