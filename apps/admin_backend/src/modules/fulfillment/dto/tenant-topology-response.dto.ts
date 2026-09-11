export class TenantTopologyResponseDto {
  provisioned: boolean;
  revision: number;
  tenantId?: string;
  contractVersion?: number;
  topology?: Record<string, unknown>;
  hash?: string;
}
