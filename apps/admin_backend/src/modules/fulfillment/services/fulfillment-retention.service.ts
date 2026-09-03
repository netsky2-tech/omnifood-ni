import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantFulfillmentRecord } from '../entities/tenant-fulfillment-record.entity';
import { Invoice } from '../../sales/entities/invoice.entity';
import { InventoryMovement } from '../../inventory/entities/inventory-movement.entity';
import { SyncFulfillmentDto } from '../../sales/dto/sync-batch.dto';

export interface RetentionPurgeResult {
  purgedFulfillments: number;
  purgedReceipts: number;
  excludedInvoices: number;
  excludedKardex: number;
  cutoffDate: string;
}

@Injectable()
export class FulfillmentRetentionService {
  private readonly logger = new Logger(FulfillmentRetentionService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TenantFulfillmentRecord)
    private readonly fulfillmentRepo: Repository<TenantFulfillmentRecord>,
  ) {}

  private async bindTenantContext(
    manager: EntityManager,
    tenantId: string,
  ): Promise<void> {
    await manager.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      tenantId,
    ]);
  }

  async saveFulfillment(
    tenantId: string,
    dto: SyncFulfillmentDto,
    externalManager?: EntityManager,
  ): Promise<TenantFulfillmentRecord> {
    const execute = async (manager: EntityManager) => {
      await this.bindTenantContext(manager, tenantId);
      const repo = manager.getRepository(TenantFulfillmentRecord);
      const rawLines: unknown =
        dto.linesPayload != null
          ? typeof dto.linesPayload === 'string'
            ? (JSON.parse(dto.linesPayload) as unknown)
            : dto.linesPayload
          : dto.lines;
      const parsedLines =
        rawLines != null
          ? (rawLines as
              | Record<string, unknown>
              | Array<Record<string, unknown>>)
          : undefined;

      const record = repo.create({
        id: dto.id,
        tenant_id: tenantId,
        sale_id: dto.saleId,
        topology_snapshot_id: dto.topologySnapshotId,
        topology_revision: dto.topologyRevision,
        channel: dto.channel,
        route_state: dto.routeState,
        delivery_state: dto.deliveryState ?? 'PENDING',
        lines_payload: parsedLines,
        synced_at: new Date(),
      });

      await repo.upsert(record, ['id']);
      const saved = await repo.findOne({
        where: { id: dto.id, tenant_id: tenantId },
      });
      return saved ?? record;
    };

    if (externalManager) {
      return execute(externalManager);
    }
    return this.dataSource.transaction('SERIALIZABLE', execute);
  }

  async findFulfillmentRecord(
    tenantId: string,
    id: string,
  ): Promise<TenantFulfillmentRecord | null> {
    return this.dataSource.transaction(async (manager) => {
      await this.bindTenantContext(manager, tenantId);
      return manager.getRepository(TenantFulfillmentRecord).findOne({
        where: { id, tenant_id: tenantId },
      });
    });
  }

  async findFulfillmentRecordsBySaleId(
    tenantId: string,
    saleId: string,
  ): Promise<TenantFulfillmentRecord[]> {
    return this.dataSource.transaction(async (manager) => {
      await this.bindTenantContext(manager, tenantId);
      return manager.getRepository(TenantFulfillmentRecord).find({
        where: { tenant_id: tenantId, sale_id: saleId },
      });
    });
  }

  async purgeRetentionData(
    tenantId: string,
    cutoffDate: Date,
  ): Promise<RetentionPurgeResult> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      await this.bindTenantContext(manager, tenantId);

      const fulfillmentRepo = manager.getRepository(TenantFulfillmentRecord);
      const invoiceRepo = manager.getRepository(Invoice);
      const movementRepo = manager.getRepository(InventoryMovement);

      // 1. Identify records eligible for purge
      const eligibleFulfillments = await fulfillmentRepo.find({
        where: {
          tenant_id: tenantId,
          created_at: LessThan(cutoffDate),
        },
      });

      // 2. Perform purge of fulfillment records
      let purgedFulfillments = 0;
      const purgedReceipts = 0; // receipts are append-only audit log, preserved
      if (eligibleFulfillments.length > 0) {
        const ids = eligibleFulfillments.map((f) => f.id);
        const deleteRes = await manager
          .createQueryBuilder()
          .delete()
          .from(TenantFulfillmentRecord)
          .where('tenant_id = :tenantId AND id IN (:...ids)', {
            tenantId,
            ids,
          })
          .execute();
        purgedFulfillments = deleteRes.affected ?? 0;
      }

      // 3. Invariant Assertion: Invoices and Kardex/movements MUST NEVER be purged!
      let excludedInvoices = 0;
      let excludedKardex = 0;
      const targetSchema =
        (manager.connection.options as { schema?: string }).schema ?? 'public';

      const invoiceTableCheck = await manager.query<
        Array<Record<string, unknown>>
      >(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = $1`,
        [targetSchema],
      );
      if (invoiceTableCheck.length > 0) {
        excludedInvoices = await invoiceRepo.count({
          where: {
            tenant_id: tenantId,
            created_at: LessThan(cutoffDate),
          },
        });
      }

      const kardexTableCheck = await manager.query<
        Array<Record<string, unknown>>
      >(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_kardex' AND table_schema = $1`,
        [targetSchema],
      );
      if (kardexTableCheck.length > 0) {
        excludedKardex = await movementRepo.count({
          where: {
            tenant_id: tenantId,
            timestamp: LessThan(cutoffDate),
          },
        });
      }

      this.logger.log(
        `[RETENTION-PURGE] tenant=${tenantId} cutoff=${cutoffDate.toISOString()} purgedFulfillments=${purgedFulfillments} purgedReceipts=${purgedReceipts} excludedInvoices=${excludedInvoices} excludedKardex=${excludedKardex}`,
      );

      return {
        purgedFulfillments,
        purgedReceipts,
        excludedInvoices,
        excludedKardex,
        cutoffDate: cutoffDate.toISOString(),
      };
    });
  }
}
