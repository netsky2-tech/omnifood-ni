import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IdentityReadinessPort,
  IdentityReadinessResult,
} from '../ports/identity-readiness.port';
import { DataSource } from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { User, UserRole } from '../../identity/entities/user.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

@Injectable()
export class IdentityReadinessAdapter implements IdentityReadinessPort {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    // Issue #556 stage 12d: `users` becomes FORCE-RLS-protected, so the
    // owner-existence read resolves through the tenant-bound transaction
    // manager; the pooled injection stays for module wiring compatibility
    // (slice-9 precedent).
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async evaluateIdentityReadiness(
    tenantId: string,
  ): Promise<IdentityReadinessResult> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        tenantExists: false,
        initialOwnerExists: false,
        ownerCanAuthenticate: false,
        tenantContextValid: false,
      };
    }

    // Issue #556 stage 12d: the owner read is tenant-bound (FORCE RLS on
    // users fails closed on a pooled connection, it does not leak).
    const owner = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(User).findOne({
          where: {
            tenant_id: tenantId,
            role: UserRole.OWNER,
            is_active: true,
          },
        }),
    );

    return {
      tenantExists: true,
      initialOwnerExists: Boolean(owner),
      ownerCanAuthenticate: Boolean(owner && owner.is_active),
      tenantContextValid: Boolean(tenant.is_active !== false),
    };
  }
}
