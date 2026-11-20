import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { EntityManager, IsNull } from 'typeorm';
import { TerminalRecoveryCode } from '../entities/terminal-recovery-code.entity';

export const RECOVERY_CODE_BCRYPT_COST = 10;

/**
 * Constant bcrypt digest used to equalize failure timing when no active
 * recovery code exists for a terminal.
 */
export const DUMMY_RECOVERY_CODE_HASH =
  '$2b$10$cDiMqnQfQvrz.sLEvTblHu1EcFmgKtpogYwqxTorCQk3ydgyu5Xc6';

export const HARDWARE_FINGERPRINT_HEX_REGEX = /^[a-fA-F0-9]{64}$/;
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeHardwareFingerprint(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

/**
 * Generates a cryptographically secure 6-digit numeric recovery code
 * (`000000`–`999999`).
 */
export function generateRecoveryCodeValue(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code, RECOVERY_CODE_BCRYPT_COST);
}

export async function verifyRecoveryCode(
  code: string,
  codeHash: string,
): Promise<boolean> {
  return bcrypt.compare(code, codeHash);
}

export interface IssueRecoveryCodeParams {
  readonly tenantId: string;
  readonly terminalId: string;
  readonly activationAttemptId?: string | null;
}

export interface IssuedRecoveryCodeResult {
  readonly recoveryCode: string;
  readonly record: TerminalRecoveryCode;
}

/**
 * Revokes any prior unused recovery codes for `(tenantId, terminalId)` and
 * issues a fresh one-time 6-digit recovery code within the caller's
 * tenant-bound transaction.
 */
export async function issueRecoveryCodeInTransaction(
  manager: EntityManager,
  params: IssueRecoveryCodeParams,
): Promise<IssuedRecoveryCodeResult> {
  const repo = manager.getRepository(TerminalRecoveryCode);
  const now = new Date();

  const existingUnused = await repo.find({
    where: {
      tenantId: params.tenantId,
      terminalId: params.terminalId,
      usedAt: IsNull(),
      revokedAt: IsNull(),
    },
  });

  if (existingUnused.length > 0) {
    for (const row of existingUnused) {
      row.revokedAt = now;
    }
    await repo.save(existingUnused);
  }

  const recoveryCode = generateRecoveryCodeValue();
  const codeHash = await hashRecoveryCode(recoveryCode);

  const entity = repo.create({
    tenantId: params.tenantId,
    terminalId: params.terminalId,
    activationAttemptId: params.activationAttemptId ?? null,
    codeHash,
    issuedAt: now,
    usedAt: null,
    revokedAt: null,
  });

  const saved = await repo.save(entity);
  return { recoveryCode, record: saved };
}
