import { ActivationAttempt } from '../entities/activation-attempt.entity';

/**
 * DSI-3 response DTO for device sync credential provisioning.
 * Explicitly sanitizes entity internals and strictly prevents
 * leakage of renewalSecretHash, database IDs, or internal metadata.
 */
export class DeviceSyncCredentialResponseDto {
  credentialId!: string;
  tenantId!: string;
  // Issue #556 slice 11: the PERSISTED provisioning slug (stable identifier,
  // not the display name). The POS stores it as TenantConfig.tenantSlug for
  // the stage-2 optional cloud login context. Key stays `slug`, mirroring
  // the getMe response.
  slug!: string;
  deviceId!: string;
  scopes!: string[];
  credentialVersion!: number;
  renewalSecret?: string;
  renewalCredentialExpiresAt!: string;
  status?: string;
}

/**
 * Future activation finalization response DTO contract.
 */
export class FinalizeActivationResponseDto {
  attempt!: ActivationAttempt;
  deviceCredential?: DeviceSyncCredentialResponseDto;
}
