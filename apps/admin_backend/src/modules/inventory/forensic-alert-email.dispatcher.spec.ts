import { ConfigService } from '@nestjs/config';
import type { EmailPort } from '../../integrations/notifications/ports/email.port';
import {
  ALERT_EMAIL_RECIPIENTS_ENV,
  DEFAULT_ALERT_EMAIL_RECIPIENTS,
} from '../notifications/listeners/low-stock.listener';
import { ForensicAlertEmailDispatcher } from './forensic-alert-email.dispatcher';
import type { ForensicAlertInput } from './forensic-alert.service';

/**
 * R7 (H7): the HIGH_VALUE forensic alert was stored and never sent — the
 * dispatcher was a no-op while the operator notice claimed an admin had been
 * notified. These tests pin that the alert actually leaves the system.
 */
describe('ForensicAlertEmailDispatcher (R7)', () => {
  const send = jest.fn<Promise<void>, [string, string, string]>(
    async () => undefined,
  );
  const emailProvider: EmailPort = { send };

  const buildDispatcher = (env: Record<string, string> = {}) =>
    new ForensicAlertEmailDispatcher(emailProvider, new ConfigService(env));

  const alert: ForensicAlertInput = {
    tenantId: 'tenant-A',
    alertType: 'HIGH_VALUE_COUNT_ADJUSTMENT',
    severity: 'HIGH',
    actorRole: 'ADMIN',
    message: 'High-value shrinkage detected for Leche',
    metadata: {
      valuationNio: 1831.215,
      originDocumentRef: 'shrink-1',
      insumoName: 'Leche',
    },
  };

  beforeEach(() => {
    send.mockClear();
  });

  it('sends the alert to the default recipients when none is configured', async () => {
    await buildDispatcher().dispatchToAdmins(alert);

    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, body] = send.mock.calls[0];
    expect(to).toBe(DEFAULT_ALERT_EMAIL_RECIPIENTS);
    expect(subject).toContain('HIGH_VALUE_COUNT_ADJUSTMENT');
    expect(body).toContain('1831.215');
    expect(body).toContain('shrink-1');
  });

  it('fans out to a comma-separated recipient list from the environment', async () => {
    await buildDispatcher({
      [ALERT_EMAIL_RECIPIENTS_ENV]: 'a@x.ni, b@x.ni ,',
    }).dispatchToAdmins(alert);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([to]) => to)).toEqual(['a@x.ni', 'b@x.ni']);
  });
});
