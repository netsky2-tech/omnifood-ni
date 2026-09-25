import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAccessPayload } from '../security/jwt-token.types';
import { User } from '../entities/user.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

export interface AuthoritativeCurrentUser {
  email: string;
  tenant_id: string;
  role: User['role'];
  is_active: boolean;
  security_version: number;
}

@Injectable()
export class CurrentUserAuthorizationService {
  // Issue #556 stage 12d: `users` is (about to be) FORCE-RLS-protected, so
  // the authoritative self read must run through the tenant-bound
  // transaction manager — on a pooled connection the read fails closed to
  // zero rows and every guarded request would 401. The tenant id comes from
  // the verified access token, never from client input.
  constructor(private readonly dataSource: DataSource) {}

  // Performance rationale: exactly one tenant-bound transaction per
  // authorize() call — one bind + one indexed lookup, nothing wider.
  async authorize(token: JwtAccessPayload): Promise<AuthoritativeCurrentUser> {
    try {
      const user = await runInTenantTransaction(
        this.dataSource,
        token.tenant_id,
        (manager) =>
          manager.getRepository(User).findOne({
            where: { id: token.sub, tenant_id: token.tenant_id },
            select: [
              'id',
              'email',
              'tenant_id',
              'role',
              'is_active',
              'security_version',
            ],
          }),
      );
      if (
        !user ||
        !user.is_active ||
        user.tenant_id !== token.tenant_id ||
        String(user.role) !== token.role ||
        user.security_version !== token.security_version
      ) {
        throw new UnauthorizedException();
      }

      return {
        email: user.email,
        tenant_id: user.tenant_id,
        role: user.role,
        is_active: user.is_active,
        security_version: user.security_version,
      };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
