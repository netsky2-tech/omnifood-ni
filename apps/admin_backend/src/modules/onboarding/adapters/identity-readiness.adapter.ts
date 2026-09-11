import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IdentityReadinessPort,
  IdentityReadinessResult,
} from '../ports/identity-readiness.port';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { User, UserRole } from '../../identity/entities/user.entity';

@Injectable()
export class IdentityReadinessAdapter implements IdentityReadinessPort {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

    const owner = await this.userRepository.findOne({
      where: {
        tenant_id: tenantId,
        role: UserRole.OWNER,
        is_active: true,
      },
    });

    return {
      tenantExists: true,
      initialOwnerExists: Boolean(owner),
      ownerCanAuthenticate: Boolean(owner && owner.is_active),
      tenantContextValid: Boolean(tenant.is_active !== false),
    };
  }
}
