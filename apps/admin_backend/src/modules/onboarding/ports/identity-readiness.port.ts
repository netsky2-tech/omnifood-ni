export const IDENTITY_READINESS_PORT = 'IDENTITY_READINESS_PORT';

export interface IdentityReadinessResult {
  tenantExists: boolean;
  initialOwnerExists: boolean;
  ownerCanAuthenticate: boolean;
  tenantContextValid: boolean;
}

export interface IdentityReadinessPort {
  evaluateIdentityReadiness(tenantId: string): Promise<IdentityReadinessResult>;
}
