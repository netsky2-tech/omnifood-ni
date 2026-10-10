import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AuthGuard } from '../guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../guards/authoritative-current-user.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { UserRole } from '../entities/user.entity';
import { AppPermission } from '../security/permissions.enum';
import { DeviceSyncCredentialService } from '../services/device-sync-credential.service';
import { RevokeDeviceCredentialDto } from '../dto/revoke-device-credential.dto';
import { TenantTerminalDto } from '../dto/tenant-terminal.dto';

/**
 * Human revocation surface for device sync credentials (B17-02, issue #832).
 *
 * An active OWNER revokes a terminal credential from the backoffice; the
 * next token renewal under the revoked credential fails with DEVICE_REVOKED.
 * Transport classification: human session JWT (not the device transport).
 */
@Controller('identity/device-sync')
@UseInterceptors(TenantInterceptor)
@UseGuards(
  AuthGuard,
  AuthoritativeCurrentUserGuard,
  RolesGuard,
  PermissionsGuard,
)
export class DeviceSyncRevocationController {
  constructor(
    private readonly deviceSyncCredentialService: DeviceSyncCredentialService,
  ) {}

  /**
   * OWNER/MANAGER terminal registry view for the device sync backoffice
   * (B17-03, Task 1). Read-only listing: it intentionally does not require
   * the DEVICE_SYNC_REVOKE permission, which stays scoped to revocation.
   */
  @Get('terminals')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async listTerminals(
    @GetTenantId() tenantId: string,
  ): Promise<TenantTerminalDto[]> {
    return this.deviceSyncCredentialService.listTenantTerminals(tenantId);
  }

  @Post('credentials/:id/revoke')
  @Roles(UserRole.OWNER)
  @RequirePermissions(AppPermission.DEVICE_SYNC_REVOKE)
  @HttpCode(HttpStatus.OK)
  async revoke(
    @GetTenantId() tenantId: string,
    @Param('id') credentialId: string,
    @Body() dto: RevokeDeviceCredentialDto,
  ) {
    return await this.deviceSyncCredentialService.revokeCredential(
      tenantId,
      credentialId,
      dto.reason,
    );
  }
}
