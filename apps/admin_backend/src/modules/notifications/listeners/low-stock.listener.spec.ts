import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  LowStockListener,
  LowStockEvent,
  ALERT_EMAIL_RECIPIENTS_ENV,
  ALERT_SMS_RECIPIENTS_ENV,
} from './low-stock.listener';
import {
  EMAIL_PORT,
  EmailPort,
} from '../../../integrations/notifications/ports/email.port';
import {
  SMS_PORT,
  SmsPort,
} from '../../../integrations/notifications/ports/sms.port';

describe('LowStockListener', () => {
  let listener: LowStockListener;
  let emailProvider: jest.Mocked<EmailPort>;
  let smsProvider: jest.Mocked<SmsPort>;
  let env: Record<string, string | undefined>;

  beforeEach(async () => {
    emailProvider = { send: jest.fn() };
    smsProvider = { send: jest.fn() };
    env = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LowStockListener,
        { provide: EMAIL_PORT, useValue: emailProvider },
        { provide: SMS_PORT, useValue: smsProvider },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();

    listener = module.get<LowStockListener>(LowStockListener);
  });

  it('should send email when low stock event occurs', async () => {
    const event = new LowStockEvent('Café', 100, 200, 'tenant-1');
    await listener.handleLowStockEvent(event);

    expect(emailProvider.send).toHaveBeenCalledWith(
      'owner@omnifood.ni',
      expect.stringContaining('Café'),
      expect.stringContaining('100'),
    );
  });

  it('should send SMS when stock is critically low (below 50% PAR)', async () => {
    const event = new LowStockEvent('Café', 40, 100, 'tenant-1');
    await listener.handleLowStockEvent(event);

    expect(smsProvider.send).toHaveBeenCalled();
  });

  it('should NOT send SMS when stock is low but not critical', async () => {
    const event = new LowStockEvent('Café', 80, 100, 'tenant-1');
    await listener.handleLowStockEvent(event);

    expect(smsProvider.send).not.toHaveBeenCalled();
  });

  it('fans out to every configured email recipient', async () => {
    env[ALERT_EMAIL_RECIPIENTS_ENV] = 'ops@comercio.ni, dueno@comercio.ni';

    await listener.handleLowStockEvent(
      new LowStockEvent('Café', 100, 200, 'tenant-1'),
    );

    expect(emailProvider.send).toHaveBeenCalledTimes(2);
    expect(emailProvider.send).toHaveBeenCalledWith(
      'ops@comercio.ni',
      expect.any(String),
      expect.any(String),
    );
    expect(emailProvider.send).toHaveBeenCalledWith(
      'dueno@comercio.ni',
      expect.any(String),
      expect.any(String),
    );
  });

  it('fans out to every configured SMS recipient on critical stock', async () => {
    env[ALERT_SMS_RECIPIENTS_ENV] = '+50577777777,+50588888888';

    await listener.handleLowStockEvent(
      new LowStockEvent('Café', 40, 100, 'tenant-1'),
    );

    expect(smsProvider.send).toHaveBeenCalledTimes(2);
  });

  it('disables a channel when its recipients env is set to empty', async () => {
    env[ALERT_EMAIL_RECIPIENTS_ENV] = '';
    env[ALERT_SMS_RECIPIENTS_ENV] = ' , ';

    await listener.handleLowStockEvent(
      new LowStockEvent('Café', 40, 100, 'tenant-1'),
    );

    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(smsProvider.send).not.toHaveBeenCalled();
  });

  it('keeps the legacy defaults when no env is configured', async () => {
    await listener.handleLowStockEvent(
      new LowStockEvent('Café', 40, 100, 'tenant-1'),
    );

    expect(emailProvider.send).toHaveBeenCalledWith(
      'owner@omnifood.ni',
      expect.any(String),
      expect.any(String),
    );
    expect(smsProvider.send).toHaveBeenCalledWith(
      '+50512345678',
      expect.any(String),
    );
  });
});
