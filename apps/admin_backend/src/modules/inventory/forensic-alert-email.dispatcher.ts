import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PORT } from '../../integrations/notifications/ports/email.port';
import type { EmailPort } from '../../integrations/notifications/ports/email.port';
import {
  ALERT_EMAIL_RECIPIENTS_ENV,
  DEFAULT_ALERT_EMAIL_RECIPIENTS,
} from '../notifications/listeners/low-stock.listener';
import type {
  ForensicAlertDispatcher,
  ForensicAlertInput,
} from './forensic-alert.service';

/**
 * R7 (H7): the HIGH_VALUE forensic alert used to be stored and never sent.
 * `FORENSIC_ALERT_DISPATCHER` was provided as a no-op stub while the
 * operator-facing notice said "Admin has been notified for forensic review"
 * — a claim the system did not honour.
 *
 * This adapter sends the alert through the SAME email seam the low-stock
 * listener already uses (hexagonal `EmailPort`), and reuses its recipient
 * configuration so there is one source of truth for who gets operational
 * alerts. Delivery failures still never break the inventory transaction: the
 * caller fires this after the row is written and swallows the error.
 */
@Injectable()
export class ForensicAlertEmailDispatcher implements ForensicAlertDispatcher {
  constructor(
    @Inject(EMAIL_PORT) private readonly emailProvider: EmailPort,
    private readonly config: ConfigService,
  ) {}

  async dispatchToAdmins(input: ForensicAlertInput): Promise<void> {
    const subject = `[OmniFood NI] Alerta forense ${input.severity}: ${input.alertType}`;
    const meta = input.metadata ?? {};
    const valuation =
      typeof meta.valuationNio === 'number' ||
      typeof meta.valuationNio === 'string'
        ? String(meta.valuationNio)
        : 'n/d';
    const docRef =
      typeof meta.originDocumentRef === 'string'
        ? meta.originDocumentRef
        : 'n/d';
    const insumo =
      typeof meta.insumoName === 'string' ? meta.insumoName : 'n/d';

    const body = [
      input.message,
      `Tipo: ${input.alertType}`,
      `Severidad: ${input.severity}`,
      `Valor: C$${valuation}`,
      `Documento: ${docRef}`,
      `Insumo: ${insumo}`,
      `Tenant: ${input.tenantId}`,
    ].join('\n');

    for (const recipient of this.recipients()) {
      await this.emailProvider.send(recipient, subject, body);
    }
  }

  private recipients(): string[] {
    const raw =
      this.config.get<string>(ALERT_EMAIL_RECIPIENTS_ENV) ??
      DEFAULT_ALERT_EMAIL_RECIPIENTS;

    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
}
