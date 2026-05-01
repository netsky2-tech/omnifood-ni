import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EMAIL_PORT } from '../../../integrations/notifications/ports/email.port';
import type { EmailPort } from '../../../integrations/notifications/ports/email.port';
import { SMS_PORT } from '../../../integrations/notifications/ports/sms.port';
import type { SmsPort } from '../../../integrations/notifications/ports/sms.port';

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
  ) {}

  @OnEvent('inventory.low_stock')
  async handleLowStockEvent(event: LowStockEvent) {
    const subject = `[OmniFood NI] Alerta de Stock Bajo: ${event.insumoName}`;
    const body =
      `El insumo "${event.insumoName}" ha alcanzado un nivel crítico.\n` +
      `Stock Actual: ${event.currentStock}\n` +
      `Nivel PAR: ${event.parLevel}\n` +
      `Tenant ID: ${event.tenantId}`;

    await this.emailProvider.send('owner@omnifood.ni', subject, body);

    // SMS only for very low stock (stub priority logic)
    if (event.currentStock < event.parLevel * 0.5) {
      await this.smsProvider.send(
        '+50512345678',
        `ALERTA CRITICA: ${event.insumoName} en ${event.currentStock}.`,
      );
    }
  }
}
