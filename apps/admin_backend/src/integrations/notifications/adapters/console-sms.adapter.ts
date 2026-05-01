import { Injectable, Logger } from '@nestjs/common';
import { SmsPort } from '../ports/sms.port';

@Injectable()
export class ConsoleSmsAdapter implements SmsPort {
  private readonly logger = new Logger(ConsoleSmsAdapter.name);

  async send(to: string, message: string): Promise<void> {
    this.logger.log(`[STUB SMS] To: ${to}, Message: ${message}`);
    return Promise.resolve();
  }
}
