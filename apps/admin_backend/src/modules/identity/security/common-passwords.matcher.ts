import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Membership check for the bundled common-password corpus (S2).
 * Normalization is trim + lowercase: corpus entries are stored lowercase.
 */
export function isCommonPassword(candidate: string): boolean {
  return COMMON_PASSWORDS.has(candidate.trim().toLowerCase());
}
