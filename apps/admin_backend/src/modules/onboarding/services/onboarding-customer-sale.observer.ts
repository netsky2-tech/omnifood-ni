import { Injectable, Logger } from '@nestjs/common';
import { OnboardingSessionService } from './onboarding-session.service';
import { OnboardingTelemetryService } from '../telemetry/onboarding-telemetry.service';
import { OnboardingTelemetryEventName } from '../telemetry/onboarding-telemetry.types';

export interface ObserveSaleDto {
  tenantId: string;
  ticketId: string;
  occurredAt: Date;
  isActivationVerificationSale?: boolean;
}

export interface ObserveSaleResult {
  observed: boolean;
  isFirstCustomerSale: boolean;
  firstCustomerSaleAt?: Date | null;
  firstSuccessfulSaleAt?: Date | null;
}

@Injectable()
export class OnboardingCustomerSaleObserver {
  private readonly logger = new Logger(OnboardingCustomerSaleObserver.name);

  constructor(
    private readonly sessionService: OnboardingSessionService,
    private readonly telemetryService: OnboardingTelemetryService,
  ) {}

  /**
   * Observes a sale event for the tenant.
   *
   * Normative Invariants (ONB1.9G):
   * 1. If firstSuccessfulSaleAt was a controlled verification sale during Activation (M6),
   *    firstCustomerSaleAt is observed separately for the first commercial customer sale.
   * 2. Crucial Invariant: The subsequent first customer sale NEVER modifies the consolidated
   *    historical TTFSS (firstSuccessfulSaleAt) or activatedAt.
   * 3. Write-once: Once firstCustomerSaleAt is recorded, subsequent commercial sales do not alter it.
   */
  async observeSale(dto: ObserveSaleDto): Promise<ObserveSaleResult> {
    const trimmedTenant = dto.tenantId?.trim();
    if (!trimmedTenant) {
      return { observed: false, isFirstCustomerSale: false };
    }

    // Verification sales during activation do not count as commercial customer sales
    if (dto.isActivationVerificationSale) {
      return { observed: false, isFirstCustomerSale: false };
    }

    const session = await this.sessionService.getSession(trimmedTenant);
    if (!session || !session.measurementEligible) {
      return { observed: false, isFirstCustomerSale: false };
    }

    // If first customer sale has already been recorded, do not overwrite (write-once)
    if (session.firstCustomerSaleAt) {
      return {
        observed: false,
        isFirstCustomerSale: false,
        firstCustomerSaleAt: session.firstCustomerSaleAt,
        firstSuccessfulSaleAt: session.firstSuccessfulSaleAt,
      };
    }

    const occurredAt = dto.occurredAt instanceof Date ? dto.occurredAt : new Date(dto.occurredAt);
    let isFirstSuccessfulSale = false;

    // If firstSuccessfulSaleAt is null, this commercial sale also claims TTFSS
    if (!session.firstSuccessfulSaleAt) {
      session.firstSuccessfulSaleAt = occurredAt;
      isFirstSuccessfulSale = true;
    }

    // Record firstCustomerSaleAt separately
    session.firstCustomerSaleAt = occurredAt;
    session.lastActivityAt = new Date();
    session.optimisticVersion = (session.optimisticVersion ?? 1) + 1;

    await this.sessionService.saveSession(session);

    this.logger.log(
      `Recorded First Customer Sale for tenant '${trimmedTenant}' (ticket: ${dto.ticketId}, occurredAt: ${occurredAt.toISOString()})`,
    );

    // Emit telemetry events
    if (isFirstSuccessfulSale) {
      await this.telemetryService.recordEvent({
        tenantId: trimmedTenant,
        eventName: OnboardingTelemetryEventName.FIRST_SUCCESSFUL_SALE,
        sessionId: session.id,
        occurredAt: occurredAt.toISOString(),
        properties: {
          ticketId: dto.ticketId,
          isDirectCommercialSale: true,
        },
      });
    }

    await this.telemetryService.recordEvent({
      tenantId: trimmedTenant,
      eventName: OnboardingTelemetryEventName.FIRST_CUSTOMER_SALE,
      sessionId: session.id,
      occurredAt: occurredAt.toISOString(),
      properties: {
        ticketId: dto.ticketId,
        historicalTtfssPreserved: !isFirstSuccessfulSale,
        firstSuccessfulSaleAt: session.firstSuccessfulSaleAt?.toISOString(),
      },
    });

    return {
      observed: true,
      isFirstCustomerSale: true,
      firstCustomerSaleAt: session.firstCustomerSaleAt,
      firstSuccessfulSaleAt: session.firstSuccessfulSaleAt,
    };
  }
}
