import { Test, TestingModule } from '@nestjs/testing';
import { LowStockListener, LowStockEvent } from './low-stock.listener';
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

  beforeEach(async () => {
    emailProvider = { send: jest.fn() };
    smsProvider = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LowStockListener,
        { provide: EMAIL_PORT, useValue: emailProvider },
        { provide: SMS_PORT, useValue: smsProvider },
      ],
    }).compile();

    listener = module.get<LowStockListener>(LowStockListener);
  });

  it('should send email when low stock event occurs', async () => {
    const event = new LowStockEvent('Café', 100, 200, 'tenant-1');
    await listener.handleLowStockEvent(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(emailProvider.send).toHaveBeenCalledWith(
      'owner@omnifood.ni',
      expect.stringContaining('Café'),
      expect.stringContaining('100'),
    );
  });

  it('should send SMS when stock is critically low (below 50% PAR)', async () => {
    const event = new LowStockEvent('Café', 40, 100, 'tenant-1');
    await listener.handleLowStockEvent(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(smsProvider.send).toHaveBeenCalled();
  });

  it('should NOT send SMS when stock is low but not critical', async () => {
    const event = new LowStockEvent('Café', 80, 100, 'tenant-1');
    await listener.handleLowStockEvent(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(smsProvider.send).not.toHaveBeenCalled();
  });
});
