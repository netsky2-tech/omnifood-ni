import { Injectable, Logger } from '@nestjs/common';
import { EmailPort } from '../ports/email.port';

@Injectable()
export class ConsoleEmailAdapter implements EmailPort {
  private readonly logger = new Logger(ConsoleEmailAdapter.name);

  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(`[STUB EMAIL] To: ${to}, Subject: ${subject}`);
    this.logger.log(`[STUB EMAIL BODY] ${body}`);
    return Promise.resolve();
  }
}
