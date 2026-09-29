import { ConfigService } from '@nestjs/config';
import { ConsoleEmailAdapter } from './adapters/console-email.adapter';
import type { EmailPort } from './ports/email.port';

export const DEFAULT_EMAIL_PROVIDER = 'console';

/**
 * Resolves the EmailPort implementation from configuration (EMAIL_PROVIDER).
 *
 * Only "console" is implemented in this batch; vendor selection is deferred
 * to post go-live planning. Unknown values fail fast at bootstrap so a
 * misconfigured deployment never starts with a silently missing email path.
 *
 * Extension point: implement EmailPort in a new adapter under
 * integrations/notifications/adapters and register it here.
 */
export function createEmailPort(configService: ConfigService): EmailPort {
  const provider =
    configService.get<string>('EMAIL_PROVIDER') ?? DEFAULT_EMAIL_PROVIDER;

  if (provider === DEFAULT_EMAIL_PROVIDER) {
    return new ConsoleEmailAdapter();
  }

  throw new Error(
    `Unsupported EMAIL_PROVIDER="${provider}". Only "${DEFAULT_EMAIL_PROVIDER}" is implemented. ` +
      'To plug in a real email provider, implement EmailPort in a new adapter under ' +
      'src/integrations/notifications/adapters and register it in ' +
      'src/integrations/notifications/email-provider.factory.ts ' +
      '(wired from src/modules/notifications/notifications.module.ts).',
  );
}
