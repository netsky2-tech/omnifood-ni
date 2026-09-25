import { DeviceLinkingCodeStatus } from '../entities/device-linking-code.entity';

/**
 * Safe projection of a device linking code for the dashboard listing
 * (issue #569 single linking flow). Deliberately excludes `codeHash` (the
 * bcrypt digest is never useful to a client and the plaintext is returned
 * exactly once at generation) and `tenantId` (the listing is already
 * tenant-scoped; echoing the id adds nothing and widens the surface).
 */
export class LinkingCodeResponseDto {
  id!: string;

  status!: DeviceLinkingCodeStatus;

  /** Bound device id once the POS claimed the code; null while ACTIVE. */
  deviceId!: string | null;

  expiresAt!: Date;

  /** Set when the code transitioned to CLAIMED; null otherwise. */
  claimedAt!: Date | null;

  createdAt!: Date;
}
