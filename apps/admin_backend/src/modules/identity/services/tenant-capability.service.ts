import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { UserRole } from '../entities/user.entity';

export interface CapabilityState {
  version: string;
  revision: number;
}
export interface AppendTenantCapability {
  tenantId: string;
  actorUserId: string;
  version: string;
  reason: string;
}
export interface CapabilityEventResult extends CapabilityState {
  previousVersion: string;
}

@Injectable()
export class TenantCapabilityService {
  constructor(private readonly dataSource: DataSource) {}

  async current(tenantId: string): Promise<CapabilityState> {
    return this.inTenantTransaction(tenantId, async (runner) =>
      this.readCurrent(runner),
    );
  }

  async append(input: AppendTenantCapability): Promise<CapabilityEventResult> {
    return this.inTenantTransaction(input.tenantId, async (runner) => {
      const actor = (await runner.query(
        'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND role = $3 AND is_active = true',
        [input.actorUserId, input.tenantId, UserRole.OWNER],
      )) as Array<{ id: string }>;
      if (!actor[0])
        throw new ForbiddenException(
          'Only an OWNER may change audit capability',
        );
      await runner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        input.tenantId,
      ]);
      const previous = await this.readCurrent(runner);
      const revision = previous.revision + 1;
      await runner.query(
        'INSERT INTO tenant_capability_event (tenant_id, actor_user_id, previous_version, new_version, contract_version, reason, revision) VALUES ($1, $2, $3, $4, 1, $5, $6)',
        [
          input.tenantId,
          input.actorUserId,
          previous.version,
          input.version,
          input.reason,
          revision,
        ],
      );
      return {
        version: input.version,
        previousVersion: previous.version,
        revision,
      };
    });
  }

  private async readCurrent(runner: QueryRunner): Promise<CapabilityState> {
    const rows = (await runner.query(
      'SELECT new_version AS version, revision FROM tenant_capability_event ORDER BY revision DESC LIMIT 1',
    )) as Array<{ version: string; revision: number }>;
    return rows[0] ?? { version: 'v2', revision: 0 };
  }

  private async inTenantTransaction<T>(
    tenantId: string,
    action: (runner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    if (!tenantId.trim())
      throw new UnauthorizedException('Tenant context is required');
    const runner = this.dataSource.createQueryRunner();
    let transactionActive = false;
    try {
      await runner.connect();
      await runner.startTransaction();
      transactionActive = true;
      await runner.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
      const result = await action(runner);
      await runner.commitTransaction();
      transactionActive = false;
      return result;
    } catch (error) {
      if (transactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
