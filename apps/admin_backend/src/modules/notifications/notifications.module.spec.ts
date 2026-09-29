import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EMAIL_PORT } from '../../integrations/notifications/ports/email.port';
import { SMS_PORT } from '../../integrations/notifications/ports/sms.port';
import { ConsoleEmailAdapter } from '../../integrations/notifications/adapters/console-email.adapter';
import { ConsoleSmsAdapter } from '../../integrations/notifications/adapters/console-sms.adapter';
import { createEmailPort } from '../../integrations/notifications/email-provider.factory';
import { NotificationsModule } from './notifications.module';

describe('NotificationsModule (Unit)', () => {
  const makeConfig = (env: Record<string, string | undefined>): ConfigService =>
    ({
      get: jest.fn((key: string) => env[key]),
    }) as unknown as ConfigService;

  describe('createEmailPort', () => {
    it('returns ConsoleEmailAdapter when EMAIL_PROVIDER is unset', () => {
      const adapter = createEmailPort(makeConfig({}));

      expect(adapter).toBeInstanceOf(ConsoleEmailAdapter);
    });

    it('returns ConsoleEmailAdapter when EMAIL_PROVIDER=console', () => {
      const adapter = createEmailPort(
        makeConfig({ EMAIL_PROVIDER: 'console' }),
      );

      expect(adapter).toBeInstanceOf(ConsoleEmailAdapter);
    });

    it('fails fast with a clear message for an unknown provider', () => {
      expect(() =>
        createEmailPort(makeConfig({ EMAIL_PROVIDER: 'resend' })),
      ).toThrow(
        /EMAIL_PROVIDER="resend".*integrations\/notifications\/adapters.*email-provider\.factory\.ts/s,
      );
    });
  });

  describe('module wiring', () => {
    it('resolves EMAIL_PORT to ConsoleEmailAdapter and keeps SMS_PORT untouched', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          NotificationsModule,
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ],
      })
        .overrideProvider(ConfigService)
        .useValue(makeConfig({ EMAIL_PROVIDER: 'console' }))
        .compile();

      expect(moduleRef.get(EMAIL_PORT)).toBeInstanceOf(ConsoleEmailAdapter);
      expect(moduleRef.get(SMS_PORT)).toBeInstanceOf(ConsoleSmsAdapter);
    });

    it('fails at bootstrap when an unknown provider is configured', async () => {
      const builder = Test.createTestingModule({
        imports: [
          NotificationsModule,
          ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ],
      }).overrideProvider(ConfigService);

      await expect(
        builder.useValue(makeConfig({ EMAIL_PROVIDER: 'resend' })).compile(),
      ).rejects.toThrow(
        /EMAIL_PROVIDER="resend".*integrations\/notifications\/adapters/s,
      );
    });
  });
});
