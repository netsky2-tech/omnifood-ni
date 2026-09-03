import { Injectable } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { TopologyRevisionConflictError } from '../domain/topology-revision-conflict.error';

export interface CreateTenantTopologyRevision {
  tenantId: string;
  baseRevision: number;
  contractVersion: number;
  topology: Record<string, unknown>;
  hash: string;
}

export interface TenantTopologyRevisionState {
  provisioned: boolean;
  revision: number;
  tenantId?: string;
  contractVersion?: number;
  topology?: Record<string, unknown>;
  hash?: string;
}

interface TopologyRevisionRow {
  tenantId: string;
  contractVersion: number;
  revision: number;
  topology: Record<string, unknown>;
  hash: string;
}

@Injectable()
export class TenantTopologyRevisionService {
  constructor(private readonly dataSource: DataSource) {}

  async current(tenantId: string): Promise<TenantTopologyRevisionState> {
    this.assertTenantId(tenantId);
    return this.inTransaction(tenantId, async (runner) => {
      const current = await this.readCurrent(runner, tenantId);
      return current
        ? { provisioned: true, ...current }
        : { provisioned: false, revision: 0 };
    });
  }

  async create(
    input: CreateTenantTopologyRevision,
  ): Promise<TenantTopologyRevisionState> {
    this.assertTenantId(input.tenantId);
    return this.inTransaction(input.tenantId, async (runner) => {
      await runner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        input.tenantId,
      ]);
      const current = await this.readCurrent(runner, input.tenantId);
      const currentRevision = current?.revision ?? 0;
      if (input.baseRevision !== currentRevision)
        throw new TopologyRevisionConflictError(
          input.baseRevision,
          currentRevision,
        );
      const revision = currentRevision + 1;
      await runner.query(
        'INSERT INTO tenant_topology_revisions (tenant_id, contract_version, revision, topology, hash) VALUES ($1, $2, $3, $4, $5)',
        [
          input.tenantId,
          input.contractVersion,
          revision,
          input.topology,
          input.hash,
        ],
      );
      return {
        provisioned: true,
        tenantId: input.tenantId,
        contractVersion: input.contractVersion,
        revision,
        topology: input.topology,
        hash: input.hash,
      };
    });
  }

  private assertTenantId(tenantId: string): void {
    if (!tenantId.trim()) throw new Error('tenantId must not be blank');
  }

  private async readCurrent(
    runner: QueryRunner,
    tenantId: string,
  ): Promise<TopologyRevisionRow | undefined> {
    const rows = (await runner.query(
      'SELECT tenant_id AS "tenantId", contract_version AS "contractVersion", revision, topology, hash FROM tenant_topology_revisions WHERE tenant_id = $1 ORDER BY revision DESC LIMIT 1',
      [tenantId],
    )) as TopologyRevisionRow[];
    return rows[0];
  }

  private async inTransaction<T>(
    tenantId: string,
    action: (runner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      await runner.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
      const result = await action(runner);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
