import { ActivationAttempt } from '../entities/activation-attempt.entity';

/**
 * DSI-3 response DTO for device sync credential provisioning.
 * Explicitly sanitizes entity internals and strictly prevents
 * leakage of renewalSecretHash, database IDs, or internal metadata.
 */
export class DeviceSyncCredentialResponseDto {
  credentialId!: string;
  tenantId!: string;
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
