import { ConfigService } from '@nestjs/config';
import {
  HumanAuthorizationPepperStartupGuard,
  MINIMUM_PEPPER_LENGTH,
  getHumanAuthorizationRecoveryPepperConfig,
} from './human-authorization-pepper.config';

const buildConfigService = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

const SAFE_PEPPER = 'deployment-only-recovery-pepper-0123456789abcdef';

describe('HumanAuthorizationRecoveryPepperConfig', () => {
  it('accepts a deployment pepper of at least the minimum length', () => {
    const config = getHumanAuthorizationRecoveryPepperConfig(
      buildConfigService({ HUMAN_AUTHORIZATION_RECOVERY_PEPPER: SAFE_PEPPER }),
    );
    expect(config).toEqual({ pepper: SAFE_PEPPER });
  });

  it('exposes the minimum pepper length as at least 32 bytes', () => {
    expect(MINIMUM_PEPPER_LENGTH).toBeGreaterThanOrEqual(32);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
  ])('fails fast when the pepper is %s', (_label, pepper) => {
    expect(() =>
      getHumanAuthorizationRecoveryPepperConfig(
        buildConfigService({ HUMAN_AUTHORIZATION_RECOVERY_PEPPER: pepper }),
      ),
    ).toThrow(/HUMAN_AUTHORIZATION_RECOVERY_PEPPER/);
  });

  it('fails fast when the pepper is shorter than the minimum length', () => {
    expect(() =>
      getHumanAuthorizationRecoveryPepperConfig(
        buildConfigService({
          HUMAN_AUTHORIZATION_RECOVERY_PEPPER: 'short-pepper',
        }),
      ),
    ).toThrow(/HUMAN_AUTHORIZATION_RECOVERY_PEPPER/);
  });

  it('rejects a weak pepper (single repeated character)', () => {
    expect(() =>
      getHumanAuthorizationRecoveryPepperConfig(
        buildConfigService({
          HUMAN_AUTHORIZATION_RECOVERY_PEPPER: 'a'.repeat(40),
        }),
      ),
    ).toThrow(/HUMAN_AUTHORIZATION_RECOVERY_PEPPER/);
  });

  it('rejects a weak pepper (a prohibited placeholder value)', () => {
    // 'changeme'.repeat(4) is 32 bytes, so it clears MINIMUM_PEPPER_LENGTH
    // and fails ONLY on the prohibited-value branch this test names.
    expect(() =>
      getHumanAuthorizationRecoveryPepperConfig(
        buildConfigService({
          HUMAN_AUTHORIZATION_RECOVERY_PEPPER: 'changeme'.repeat(4),
        }),
      ),
    ).toThrow(/HUMAN_AUTHORIZATION_RECOVERY_PEPPER/);
  });

  it('rejects an untrimmed pepper', () => {
    expect(() =>
      getHumanAuthorizationRecoveryPepperConfig(
        buildConfigService({
          HUMAN_AUTHORIZATION_RECOVERY_PEPPER: ` ${SAFE_PEPPER} `,
        }),
      ),
    ).toThrow(/HUMAN_AUTHORIZATION_RECOVERY_PEPPER/);
  });

  describe('HumanAuthorizationPepperStartupGuard (design §9 fail fast at startup)', () => {
    it('validates the deployment pepper during bootstrap', () => {
      const guard = new HumanAuthorizationPepperStartupGuard(
        buildConfigService({
          HUMAN_AUTHORIZATION_RECOVERY_PEPPER: SAFE_PEPPER,
        }),
      );
      expect(() => guard.onApplicationBootstrap()).not.toThrow();
    });

    it('aborts the bootstrap when the pepper is missing or empty', () => {
      for (const pepper of [undefined, '']) {
        const guard = new HumanAuthorizationPepperStartupGuard(
          buildConfigService({ HUMAN_AUTHORIZATION_RECOVERY_PEPPER: pepper }),
        );
        expect(() => guard.onApplicationBootstrap()).toThrow(
          /HUMAN_AUTHORIZATION_RECOVERY_PEPPER/,
        );
      }
    });

    it('aborts the bootstrap on a weak pepper', () => {
      const guard = new HumanAuthorizationPepperStartupGuard(
        buildConfigService({
          HUMAN_AUTHORIZATION_RECOVERY_PEPPER: 'a'.repeat(40),
        }),
      );
      expect(() => guard.onApplicationBootstrap()).toThrow(
        /HUMAN_AUTHORIZATION_RECOVERY_PEPPER/,
      );
    });
  });
});
