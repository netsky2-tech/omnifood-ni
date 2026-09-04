import { OnboardingCustomerSaleObserver } from './onboarding-customer-sale.observer';
import { OnboardingSessionService } from './onboarding-session.service';
import { OnboardingTelemetryService } from '../telemetry/onboarding-telemetry.service';
import { OnboardingTelemetryEventName } from '../telemetry/onboarding-telemetry.types';
import {
  OnboardingSession,
  OnboardingLifecycleState,
} from '../entities/onboarding-session.entity';

describe('OnboardingCustomerSaleObserver (Unit — ONB1.9G)', () => {
  let observer: OnboardingCustomerSaleObserver;
  let mockSessionService: any;
  let mockTelemetryService: any;
  let sessionState: OnboardingSession;

  const initialActivatedAt = new Date('2026-09-04T10:00:00.000Z');
  const initialVerificationSaleAt = new Date('2026-09-04T09:55:00.000Z');

  beforeEach(() => {
    sessionState = {
      id: 'session-uuid-1',
      tenantId: 'tenant-123',
      lifecycleState: OnboardingLifecycleState.ACTIVATED,
      onboardingStartedAt: new Date('2026-09-04T08:00:00.000Z'),
      saleReadyFirstAt: new Date('2026-09-04T08:30:00.000Z'),
      activationStartedAt: new Date('2026-09-04T09:00:00.000Z'),
      activatedAt: initialActivatedAt,
      firstSuccessfulSaleAt: initialVerificationSaleAt,
      firstCustomerSaleAt: null,
      lastActivityAt: initialActivatedAt,
      currentActivationAttemptId: 'attempt-uuid-1',
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSessionService = {
      getSession: jest.fn().mockImplementation(async (tenantId: string) => {
        if (tenantId === 'tenant-123') return { ...sessionState };
        return null;
      }),
      saveSession: jest.fn().mockImplementation(async (session: OnboardingSession) => {
        sessionState = { ...session };
        return session;
      }),
    };

    mockTelemetryService = {
      recordEvent: jest.fn().mockResolvedValue({ accepted: true }),
    };

    observer = new OnboardingCustomerSaleObserver(
      mockSessionService,
      mockTelemetryService,
    );
  });

  it('INVARIANT: Records firstCustomerSaleAt while preserving historical TTFSS (firstSuccessfulSaleAt) and activatedAt', async () => {
    const customerSaleAt = new Date('2026-09-04T14:30:00.000Z');

    const result = await observer.observeSale({
      tenantId: 'tenant-123',
      ticketId: 'ticket-commercial-1',
      occurredAt: customerSaleAt,
      isActivationVerificationSale: false,
    });

    expect(result.observed).toBe(true);
    expect(result.isFirstCustomerSale).toBe(true);
    expect(result.firstCustomerSaleAt).toEqual(customerSaleAt);

    // INVARIANT CHECK: firstSuccessfulSaleAt and activatedAt must remain identical to their historical value
    expect(sessionState.firstSuccessfulSaleAt).toEqual(initialVerificationSaleAt);
    expect(sessionState.activatedAt).toEqual(initialActivatedAt);
    expect(sessionState.firstCustomerSaleAt).toEqual(customerSaleAt);
    expect(sessionState.optimisticVersion).toBe(6);

    // Emits FIRST_CUSTOMER_SALE telemetry event
    expect(mockTelemetryService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-123',
        eventName: OnboardingTelemetryEventName.FIRST_CUSTOMER_SALE,
        properties: expect.objectContaining({
          ticketId: 'ticket-commercial-1',
          historicalTtfssPreserved: true,
        }),
      }),
    );
  });

  it('ignores activation verification sales for firstCustomerSaleAt', async () => {
    const verificationSaleAt = new Date('2026-09-04T09:55:00.000Z');

    const result = await observer.observeSale({
      tenantId: 'tenant-123',
      ticketId: 'ticket-verification-1',
      occurredAt: verificationSaleAt,
      isActivationVerificationSale: true,
    });

    expect(result.observed).toBe(false);
    expect(result.isFirstCustomerSale).toBe(false);
    expect(sessionState.firstCustomerSaleAt).toBeNull();
    expect(mockSessionService.saveSession).not.toHaveBeenCalled();
    expect(mockTelemetryService.recordEvent).not.toHaveBeenCalled();
  });

  it('INVARIANT: Write-once for firstCustomerSaleAt — subsequent commercial sales do not overwrite timestamp', async () => {
    // 1. First commercial sale
    const firstSaleAt = new Date('2026-09-04T12:00:00.000Z');
    await observer.observeSale({
      tenantId: 'tenant-123',
      ticketId: 'ticket-comm-1',
      occurredAt: firstSaleAt,
    });
    expect(sessionState.firstCustomerSaleAt).toEqual(firstSaleAt);

    // 2. Second commercial sale
    const secondSaleAt = new Date('2026-09-04T15:00:00.000Z');
    const result2 = await observer.observeSale({
      tenantId: 'tenant-123',
      ticketId: 'ticket-comm-2',
      occurredAt: secondSaleAt,
    });

    expect(result2.observed).toBe(false);
    expect(result2.isFirstCustomerSale).toBe(false);
    // Invariant: still matches the first sale timestamp
    expect(sessionState.firstCustomerSaleAt).toEqual(firstSaleAt);
    expect(sessionState.firstSuccessfulSaleAt).toEqual(initialVerificationSaleAt);
  });

  it('handles case where firstSuccessfulSaleAt was not yet recorded', async () => {
    sessionState.firstSuccessfulSaleAt = null;
    const directCommercialSaleAt = new Date('2026-09-04T11:00:00.000Z');

    const result = await observer.observeSale({
      tenantId: 'tenant-123',
      ticketId: 'ticket-direct-1',
      occurredAt: directCommercialSaleAt,
    });

    expect(result.observed).toBe(true);
    expect(sessionState.firstSuccessfulSaleAt).toEqual(directCommercialSaleAt);
    expect(sessionState.firstCustomerSaleAt).toEqual(directCommercialSaleAt);

    // Emits both FIRST_SUCCESSFUL_SALE and FIRST_CUSTOMER_SALE telemetry
    expect(mockTelemetryService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: OnboardingTelemetryEventName.FIRST_SUCCESSFUL_SALE,
      }),
    );
    expect(mockTelemetryService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: OnboardingTelemetryEventName.FIRST_CUSTOMER_SALE,
      }),
    );
  });
});
