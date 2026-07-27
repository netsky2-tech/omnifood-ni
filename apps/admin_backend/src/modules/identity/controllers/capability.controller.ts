import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  ServiceUnavailableException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import {
  ActivateCapabilityDto,
  AUDIT_CAPABILITY_VERSION,
  AuditCapabilityResponseDto,
  type AuditCapabilityVersionDto,
} from '../dto/identity.dto';
import { UserRole } from '../entities/user.entity';
import { AuthoritativeCurrentUserGuard } from '../guards/authoritative-current-user.guard';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { TenantCapabilityService } from '../services/tenant-capability.service';

const CONTRACT_VERSION = 1;
const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

interface AuthenticatedRequest {
  user: { sub: string };
}

const isAuditCapabilityVersion = (
  value: string,
): value is AuditCapabilityVersionDto =>
  Object.values(AUDIT_CAPABILITY_VERSION).includes(
    value as AuditCapabilityVersionDto,
  );

@Controller('identity/capabilities/audit')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CapabilityController {
  constructor(private readonly capabilityService: TenantCapabilityService) {}

  @Get()
  async getAuditCapability(
    @GetTenantId() tenantId: string,
  ): Promise<AuditCapabilityResponseDto> {
    const current = await this.capabilityService.current(tenantId);
    return this.toContract(
      tenantId,
      current.version,
      current.revision,
      current.contractVersion,
    );
  }

  @Post('activate')
  @Roles(UserRole.OWNER)
  async activateAuditCapability(
    @GetTenantId() tenantId: string,
    @Body() dto: ActivateCapabilityDto,
    @Request() request: AuthenticatedRequest,
  ): Promise<AuditCapabilityResponseDto> {
    const event = await this.capabilityService.append({
      tenantId,
      actorUserId: request.user.sub,
      version: dto.new_version,
      reason: dto.reason,
    });
    return this.toContract(
      tenantId,
      event.version,
      event.revision,
      event.contractVersion,
      event.previousVersion,
    );
  }

  private toContract(
    tenantId: string,
    activeVersion: string,
    revision: number,
    contractVersion: number,
    previousVersion?: string,
  ): AuditCapabilityResponseDto {
    if (
      !isAuditCapabilityVersion(activeVersion) ||
      contractVersion !== CONTRACT_VERSION ||
      (previousVersion !== undefined &&
        !isAuditCapabilityVersion(previousVersion))
    ) {
      throw new ServiceUnavailableException('Unsupported audit capability');
    }
    const issuedAt = new Date();
    return {
      tenant_id: tenantId,
      active_version: activeVersion,
      contract_version: contractVersion,
      revision,
      ...(previousVersion === undefined
        ? {}
        : {
            previous_version: previousVersion as AuditCapabilityVersionDto,
          }),
      server_issued_at: issuedAt.toISOString(),
      server_fetched_at: issuedAt.toISOString(),
      server_expires_at: new Date(
        issuedAt.getTime() + CAPABILITY_TTL_MS,
      ).toISOString(),
    };
  }
}
