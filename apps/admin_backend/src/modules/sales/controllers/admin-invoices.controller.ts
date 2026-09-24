import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { Roles } from '../../../core/decorators/roles.decorator';
import { RequirePermissions } from '../../identity/decorators/permissions.decorator';
import { AppPermission } from '../../identity/security/permissions.enum';
import { UserRole } from '../../identity/entities/user.entity';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { InvoicesService } from '../services/invoices.service';
import { CreateAdminCreditNoteDto } from '../dto/admin-credit-note.dto';

interface AdminRequestUser {
  sub?: string;
  id?: string;
  role?: UserRole | string;
  tenant_id?: string;
  tenantId?: string;
}

interface AdminRequest extends Request {
  user?: AdminRequestUser;
}

/**
 * B1c-2 slice A (D-14, #553 part 2): human-JWT transport for Backoffice
 * credit-note issuance. The device sync path has its own transport guard
 * (SyncTransportGuard) and stays untouched; this controller is the
 * interactive surface DSI-6 leaves out of its scope.
 */
@Controller('sales/admin')
@UseGuards(AuthGuard, RolesGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
export class AdminInvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  private requireTenantId(user: AdminRequestUser | undefined): string {
    const tenantId = user?.tenant_id ?? user?.tenantId;
    if (!tenantId?.trim()) {
      throw new UnauthorizedException('Tenant context is required');
    }
    return tenantId.trim();
  }

  private requireAuthorizerId(user: AdminRequestUser | undefined): string {
    const userId = user?.sub ?? user?.id;
    if (!userId?.trim()) {
      throw new UnauthorizedException('Authenticated principal is required');
    }
    return userId.trim();
  }

  /**
   * D-14: the Backoffice emits credit notes for cross-day corrections. The
   * authorizer is the JWT principal (OWNER/MANAGER via role + permission);
   * the DTO rejects any body-supplied authorizer with a named 400.
   */
  @Post('credit-notes')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.SALES_ISSUE_CREDIT_NOTE)
  async createCreditNote(
    @Req() request: AdminRequest,
    @Body() dto: CreateAdminCreditNoteDto,
  ) {
    const tenantId = this.requireTenantId(request.user);
    const authorizer = {
      userId: this.requireAuthorizerId(request.user),
      role: request.user?.role as UserRole,
    };
    return this.invoicesService.createAdminCreditNote(
      tenantId,
      dto,
      authorizer,
    );
  }

  /** Dashboard slice B reads issued credit notes through the same surface. */
  @Get('credit-notes')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @RequirePermissions(AppPermission.SALES_ISSUE_CREDIT_NOTE)
  async listCreditNotes(@Req() request: AdminRequest) {
    const tenantId = this.requireTenantId(request.user);
    return this.invoicesService.findAll(tenantId);
  }
}
