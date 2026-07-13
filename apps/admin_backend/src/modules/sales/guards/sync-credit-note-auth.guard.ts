import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '../../identity/entities/user.entity';
import { AuthGuard } from '../../identity/guards/auth.guard';
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
  body: SyncBatchEnvelopeDto;
}

const SYNC_AUTHORIZED_ROLES = new Set<string>([
  UserRole.MANAGER,
  UserRole.OWNER,
]);

const hasCreditNoteRecord = (body: SyncBatchEnvelopeDto): boolean =>
  Array.isArray(body.records) &&
  body.records.some((record) => record.documentType === 'CREDIT_NOTE');

@Injectable()
export class SyncCreditNoteAuthGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSyncUser>();
    if (!hasCreditNoteRecord(request.body)) {
      return true;
    }

    await this.authGuard.canActivate(context);

    const user = request.user;
    if (!user?.tenant_id?.trim()) {
      throw new UnauthorizedException('CREDIT_NOTE sync requires auth tenant');
    }

    if (user.is_active !== true || !SYNC_AUTHORIZED_ROLES.has(user.role ?? '')) {
      throw new ForbiddenException(
        'CREDIT_NOTE sync requires an active manager or owner auth context',
      );
    }

    return true;
  }
}
