import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { EMAIL_PORT } from '../../../integrations/notifications/ports/email.port';
import type { EmailPort } from '../../../integrations/notifications/ports/email.port';
import { SMS_PORT } from '../../../integrations/notifications/ports/sms.port';
import type { SmsPort } from '../../../integrations/notifications/ports/sms.port';

/**
 * Legacy defaults preserved for backward compatibility: before the
 * recipient seam existed these two addresses were hardcoded in this file
 * (re-audit gap #8). Set the env var to an empty string to disable a
 * channel entirely; set it to a comma-separated list to fan out.
 */
export const DEFAULT_ALERT_EMAIL_RECIPIENTS = 'owner@omnifood.ni';
export const DEFAULT_ALERT_SMS_RECIPIENTS = '+50512345678';
export const ALERT_EMAIL_RECIPIENTS_ENV = 'NOTIFICATION_ALERT_EMAIL_RECIPIENTS';
export const ALERT_SMS_RECIPIENTS_ENV = 'NOTIFICATION_ALERT_SMS_RECIPIENTS';

export class LowStockEvent {
  constructor(
    public readonly insumoName: string,
    public readonly currentStock: number,
    public readonly parLevel: number,
    public readonly tenantId: string,
  ) {}
}

@Injectable()
export class LowStockListener {
  constructor(
    @Inject(EMAIL_PORT) private readonly emailProvider: EmailPort,
    @Inject(SMS_PORT) private readonly smsProvider: SmsPort,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('inventory.low_stock')
  async handleLowStockEvent(event: LowStockEvent) {
    const subject = `[OmniFood NI] Alerta de Stock Bajo: ${event.insumoName}`;
    const body =
      `El insumo "${event.insumoName}" ha alcanzado un nivel crítico.\n` +
      `Stock Actual: ${event.currentStock}\n` +
      `Nivel PAR: ${event.parLevel}\n` +
      `Tenant ID: ${event.tenantId}`;

    for (const recipient of this.recipients(
      ALERT_EMAIL_RECIPIENTS_ENV,
      DEFAULT_ALERT_EMAIL_RECIPIENTS,
    )) {
      await this.emailProvider.send(recipient, subject, body);
    }

    // SMS only for very low stock (stub priority logic)
    if (event.currentStock < event.parLevel * 0.5) {
      const message = `ALERTA CRITICA: ${event.insumoName} en ${event.currentStock}.`;
      for (const recipient of this.recipients(
        ALERT_SMS_RECIPIENTS_ENV,
        DEFAULT_ALERT_SMS_RECIPIENTS,
      )) {
        await this.smsProvider.send(recipient, message);
      }
    }
  }

  private recipients(envKey: string, fallback: string): string[] {
    const raw = this.config.get<string>(envKey) ?? fallback;
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
}
