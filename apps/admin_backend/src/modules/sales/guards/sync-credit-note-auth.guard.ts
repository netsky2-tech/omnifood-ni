import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { bindTenantContext } from '../../../core/database/tenant-transaction';
import { User, UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { DeviceSyncPrincipal } from '../../identity/security/device-sync-principal';
import { SyncBatchEnvelopeDto } from '../dto/sync-batch.dto';

interface SyncAuthUser {
  tenant_id?: string;
  sub?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
}

interface RequestWithSyncUser extends Request {
  user?: SyncAuthUser;
  devicePrincipal?: DeviceSyncPrincipal;
  body: SyncBatchEnvelopeDto;
}

const SYNC_AUTHORIZED_ROLES = new Set<string>([
  UserRole.MANAGER,
  UserRole.OWNER,
]);

const CREDIT_NOTE_AUTH_ROLE_MAP = {
  manager: UserRole.MANAGER,
  owner: UserRole.OWNER,
} as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getCreditNoteRecords = (body: SyncBatchEnvelopeDto) =>
  Array.isArray(body?.records)
    ? body.records.filter((record) => record.documentType === 'CREDIT_NOTE')
    : [];

@Injectable()
export class SyncCreditNoteAuthGuard implements CanActivate {
  constructor(
    private readonly authGuard: AuthGuard,
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSyncUser>();
    const creditNoteRecords = getCreditNoteRecords(request.body);
    if (creditNoteRecords.length === 0) {
      return true;
    }

    if (request.devicePrincipal) {
      await this.assertDeviceCreditNoteSupervisorAuthorization(
        request.devicePrincipal,
        creditNoteRecords,
      );
      return true;
    }

    await this.authGuard.canActivate(context);

    // A CREDIT_NOTE may carry POS-side authorization metadata, but the backend
    // trust boundary is this authenticated same-tenant manager/owner context.
    const user = request.user;
    if (!user?.tenant_id?.trim()) {
      throw new UnauthorizedException('CREDIT_NOTE sync requires auth tenant');
    }

    if (
      user.is_active !== true ||
      !SYNC_AUTHORIZED_ROLES.has(user.role ?? '')
    ) {
      throw new ForbiddenException(
        'CREDIT_NOTE sync requires an active manager or owner auth context',
      );
    }

    return true;
  }

  private async assertDeviceCreditNoteSupervisorAuthorization(
    principal: DeviceSyncPrincipal,
    creditNoteRecords: SyncBatchEnvelopeDto['records'],
  ): Promise<void> {
    const tenantId = principal.tenantId?.trim();
    if (!tenantId) {
      throw new ForbiddenException(
        'CREDIT_NOTE sync requires an authenticated device tenant',
      );
    }

    const requiredAuthorizations: Array<{
      authorizedByUserId: string;
      expectedRole: UserRole;
    }> = [];

    for (const record of creditNoteRecords) {
      const invoice = record.invoice;
      if (!invoice) {
        throw new ForbiddenException(
          'CREDIT_NOTE sync requires invoice payload with supervisor authorization',
        );
      }

      const authorizedByUserId =
        typeof invoice.authorizedByUserId === 'string'
          ? invoice.authorizedByUserId.trim()
          : '';
      if (!authorizedByUserId || !UUID_REGEX.test(authorizedByUserId)) {
        throw new ForbiddenException(
          'CREDIT_NOTE sync requires a valid supervisor authorizedByUserId',
        );
      }

      const normalizedRole =
        typeof invoice.authorizedByRole === 'string'
          ? invoice.authorizedByRole.trim().toLowerCase()
          : '';
      if (normalizedRole !== 'manager' && normalizedRole !== 'owner') {
        throw new ForbiddenException(
          'CREDIT_NOTE sync requires manager or owner authorizedByRole',
        );
      }

      const originInvoiceId =
        typeof invoice.originInvoiceId === 'string'
          ? invoice.originInvoiceId.trim()
          : '';
      const refundReasonCode =
        typeof invoice.refundReasonCode === 'string'
          ? invoice.refundReasonCode.trim()
          : '';
      if (!originInvoiceId || !refundReasonCode) {
        throw new ForbiddenException(
          'CREDIT_NOTE sync requires originInvoiceId and refundReasonCode',
        );
      }

      requiredAuthorizations.push({
        authorizedByUserId,
        expectedRole: CREDIT_NOTE_AUTH_ROLE_MAP[normalizedRole],
      });
    }

    if (!this.dataSource) {
      throw new ForbiddenException(
        'CREDIT_NOTE sync requires database verification for device transport',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await bindTenantContext(manager, tenantId);
      const userRepo = manager.getRepository(User);
      const verifiedActors = new Map<string, User>();

      for (const {
        authorizedByUserId,
        expectedRole,
      } of requiredAuthorizations) {
        let actor = verifiedActors.get(authorizedByUserId);
        if (!actor) {
          const found = await userRepo.findOne({
            where: {
              id: authorizedByUserId,
              tenant_id: tenantId,
              is_active: true,
            },
          });
          if (!found || found.tenant_id !== tenantId || found.is_active !== true) {
            throw new ForbiddenException(
              'CREDIT_NOTE authorizing supervisor must be an active same-tenant manager or owner',
            );
          }
          verifiedActors.set(authorizedByUserId, found);
          actor = found;
        }

        if (
          !SYNC_AUTHORIZED_ROLES.has(actor.role) ||
          actor.role !== expectedRole
        ) {
          throw new ForbiddenException(
            'CREDIT_NOTE supervisor authorization role does not match backend user role',
          );
        }
      }
    });
  }
}
