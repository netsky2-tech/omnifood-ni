import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import {
  CustomerSyncBatchDto,
  CustomerSyncItemDto,
} from '../dto/customer-sync.dto';
import { parseFiscalTimestamp } from '../../sales/services/invoices.service';

export interface CustomerSyncRecordOutcome {
  id: string;
  status: 'ACCEPTED' | 'FAILED';
  code?: string;
  message?: string;
}

export interface CustomerSyncBatchOutcome {
  results: CustomerSyncRecordOutcome[];
}

@Injectable()
export class CustomerSyncIngestionService {
  private readonly logger = new Logger(CustomerSyncIngestionService.name);

  constructor(private readonly dataSource: DataSource) {}

  async ingestCustomerBatch(
    tenantId: string,
    dto: CustomerSyncBatchDto,
  ): Promise<CustomerSyncBatchOutcome> {
    const results: CustomerSyncRecordOutcome[] = [];

    await this.dataSource.transaction(async (manager: EntityManager) => {
      // Set RLS context for tenant
      await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);

      const repo = manager.getRepository(Customer);

      for (const item of dto.customers ?? []) {
        const outcome = await this.ingestSingleCustomer(tenantId, item, repo);
        results.push(outcome);
      }
    });

    return { results };
  }

  private async ingestSingleCustomer(
    tenantId: string,
    item: CustomerSyncItemDto,
    repo: Repository<Customer>,
  ): Promise<CustomerSyncRecordOutcome> {
    const id = item.id?.trim();
    if (!id) {
      return {
        id: item.id ?? 'unknown',
        status: 'FAILED',
        code: 'INVALID_PAYLOAD',
        message: 'Customer id is required',
      };
    }

    const name = item.name?.trim();
    if (!name) {
      return {
        id,
        status: 'FAILED',
        code: 'INVALID_PAYLOAD',
        message: 'Name cannot be empty',
      };
    }

    const existing = await repo.findOne({ where: { id } });
    if (existing && existing.tenant_id !== tenantId) {
      this.logger.warn(
        `[CUSTOMER-SYNC] customer id=${id} already belongs to another tenant`,
      );
      return {
        id,
        status: 'FAILED',
        code: 'TENANT_IDENTITY_CONFLICT',
        message: `Customer '${id}' already belongs to another tenant`,
      };
    }

    const taxId = (item.taxId ?? item.tax_id)?.trim() || null;
    const phone = item.phone?.trim() || null;
    const email = item.email?.trim() || null;
    const address = item.address?.trim() || null;

    const createdAtRaw = item.createdAt ?? item.created_at;
    const updatedAtRaw = item.updatedAt ?? item.updated_at;

    const createdAt = createdAtRaw
      ? parseFiscalTimestamp(createdAtRaw)
      : existing?.created_at ?? new Date();

    const updatedAt = updatedAtRaw
      ? parseFiscalTimestamp(updatedAtRaw)
      : new Date();

    const payload = {
      id,
      tenant_id: tenantId,
      name,
      tax_id: taxId,
      phone,
      email,
      address,
      points_balance: existing?.points_balance ?? 0.0,
      is_active: true,
      created_at: createdAt,
      updated_at: updatedAt,
    };

    await repo.upsert(payload, ['id']);

    return {
      id,
      status: 'ACCEPTED',
    };
  }
}
