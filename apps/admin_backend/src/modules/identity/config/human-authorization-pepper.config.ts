import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Recovery-token pepper configuration (design §9).
 *
 * The plaintext recovery token `ohr1.<tokenId>.<secret>` is stored only as
 * HMAC-SHA-256(secret, pepper). The pepper is a deployment secret with the
 * same handling rules as the JWT secrets: it has no default value, is never
 * committed in code, is never derived from tenant or user material, and the
 * service MUST fail fast at startup when it is missing or empty.
 *
 * Rotation rule (design §9): rotating the pepper makes tokens issued under
 * the previous pepper unverifiable — redemption of those tokens is denied
 * like any other verification failure. Rotation is an operational runbook
 * event, not a code path: outstanding unredeemed tokens are treated as dead
 * and new tokens are issued under the new pepper atomically with deployment.
 * Receipts of already-redeemed tokens are unaffected.
 */
export const MINIMUM_PEPPER_LENGTH = 32;

export interface HumanAuthorizationRecoveryPepperConfig {
  readonly pepper: string;
}

const PROHIBITED_PEPPER_VALUES = [
  'secret',
  'changeme',
  'replaceme',
  'pepper',
  'recoverypepper',
] as const;

const isUnsafePepper = (pepper: string): boolean => {
  const normalized = pepper.toLowerCase().replace(/[-_\s]/g, '');
  return (
    pepper !== pepper.trim() ||
    new Set(pepper).size === 1 ||
    PROHIBITED_PEPPER_VALUES.some((value) =>
      new RegExp(`^(?:${value})+$`).test(normalized),
    )
  );
};

const MISSING_PEPPER_MESSAGE =
  'HUMAN_AUTHORIZATION_RECOVERY_PEPPER is missing, empty, or unsafe: recovery tokens cannot be issued or redeemed without a deployment pepper (design §9 fail-fast)';

export function getHumanAuthorizationRecoveryPepperConfig(
  configService: ConfigService,
): HumanAuthorizationRecoveryPepperConfig {
  const pepper = configService.get<string>(
    'HUMAN_AUTHORIZATION_RECOVERY_PEPPER',
  );

  if (
    typeof pepper !== 'string' ||
    pepper.length === 0 ||
    Buffer.byteLength(pepper, 'utf8') < MINIMUM_PEPPER_LENGTH ||
    isUnsafePepper(pepper)
  ) {
    throw new Error(MISSING_PEPPER_MESSAGE);
  }

  return { pepper };
}

/**
 * Startup fail-fast (design §9). The pepper is validated when the process
 * boots — an invalid pepper aborts the bootstrap before the server listens —
 * while module compilation stays environment-free so dormant-module test
 * harnesses that never boot the app are not forced to carry deployment
 * secrets. The validation itself is `getHumanAuthorizationRecoveryPepperConfig`,
 * unit-tested directly in `human-authorization-pepper.config.spec.ts`.
 */
@Injectable()
export class HumanAuthorizationPepperStartupGuard implements OnApplicationBootstrap {
  constructor(private readonly configService: ConfigService) {}

  onApplicationBootstrap(): void {
    getHumanAuthorizationRecoveryPepperConfig(this.configService);
  }
}
