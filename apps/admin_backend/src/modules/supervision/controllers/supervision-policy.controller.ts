import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { UserRole } from '../../identity/security/user-role.enum';
import { AppPermission } from '../../identity/security/permissions.enum';
import { SupervisionPolicyService } from '../services/supervision-policy.service';
import { SupervisionPolicyDto } from '../dto/supervision-policy.dto';

/**
 * The tenant's supervision policy.
 *
 * WHO MAY READ IT: the same permission that may CHANGE it. The policy is a
 * control configuration, not a report: there is no audience that would
 * read it and not act on it, and the backoffice renders nothing for a user
 * without the permission (the standard forbids permission placeholders).
 */
@Controller('supervision')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
export class SupervisionPolicyController {
  constructor(private readonly supervisionPolicyService: SupervisionPolicyService) {}

  @Get('policy')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.SUPERVISION_CONFIGURE)
  async getPolicy(@GetTenantId() tenantId?: string) {
    return this.supervisionPolicyService.getPolicy(tenantId ?? '');
  }

  /**
   * Writes the policy. The body is the WHOLE policy: a partial body would
   * silently widen what the till accepts. A `null` body clears the policy
   * so every terminal falls back to the default for its operation mode.
   */
  @Put('policy')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.SUPERVISION_CONFIGURE)
  async putPolicy(
    @GetTenantId() tenantId: string | undefined,
    @Body() body: SupervisionPolicyDto | null,
  ) {
    return this.supervisionPolicyService.configurePolicy(
      tenantId ?? '',
      body,
    );
  }
}
