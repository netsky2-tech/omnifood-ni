import { Module, Global } from '@nestjs/common';
import { EMAIL_PORT } from '../../integrations/notifications/ports/email.port';
import { SMS_PORT } from '../../integrations/notifications/ports/sms.port';
import { ConsoleEmailAdapter } from '../../integrations/notifications/adapters/console-email.adapter';
import { ConsoleSmsAdapter } from '../../integrations/notifications/adapters/console-sms.adapter';
import { LowStockListener } from './listeners/low-stock.listener';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PORT,
      useClass: ConsoleEmailAdapter,
    },
    {
      provide: SMS_PORT,
      useClass: ConsoleSmsAdapter,
    },
    LowStockListener,
  ],
  exports: [EMAIL_PORT, SMS_PORT],
})
export class NotificationsModule {}
