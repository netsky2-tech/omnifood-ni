import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /identity/device-sync/credentials/:id/revoke (B17-02).
 * The reason is mandatory and is persisted on the credential and the
 * revocation audit event (human accountability, DGI-neutral).
 */
export class RevokeDeviceCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}
