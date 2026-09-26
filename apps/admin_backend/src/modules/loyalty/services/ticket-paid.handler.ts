import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  LoyaltyProgram,
  LoyaltyProgramStatus,
} from '../entities/loyalty-program.entity';
import { Customer } from '../../customers/entities/customer.entity';
import {
  LoyaltyTicketSnapshot,
  EarningResult,
} from '../domain/loyalty-ticket-snapshot';
import { createStrategy } from '../domain/earning-strategy';
import { LoyaltyLedgerService } from './loyalty-ledger.service';

@Injectable()
export class TicketPaidHandler {
  private readonly logger = new Logger(TicketPaidHandler.name);

  constructor(
    @InjectRepository(LoyaltyProgram)
    private readonly programRepo: Repository<LoyaltyProgram>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly ledgerService: LoyaltyLedgerService,
    // Issue #512 slice 4: the tenant-bound transaction manager is the only
    // access path to the customers/loyalty tables; the pooled repositories
    // above stay declared for Nest DI compatibility only.
    private readonly dataSource: DataSource,
  ) {}

  async handle(snapshot: LoyaltyTicketSnapshot): Promise<EarningResult[]> {
    if (!snapshot.customerId) return [];

    // Unit A: the customer read and the active-programs read share one bound
    // transaction. Each per-program ledger append below opens its own unit so
    // one failed reversal/earn never poisons the rest (per-iteration catch).
    const { customer, activePrograms } = await runInTenantTransaction(
      this.dataSource,
      snapshot.tenantId,
      async (manager) => {
        const customer = await manager.getRepository(Customer).findOne({
          where: { id: snapshot.customerId, tenant_id: snapshot.tenantId },
        });
        if (!customer || !customer.is_active)
          return { customer: null, activePrograms: [] };

        const activePrograms = await manager
          .getRepository(LoyaltyProgram)
          .find({
            where: {
              tenant_id: snapshot.tenantId,
              status: LoyaltyProgramStatus.ACTIVE,
            },
          });
        return { customer, activePrograms };
      },
    );

    if (!customer) return [];

    const results: EarningResult[] = [];

    for (const program of activePrograms) {
      if (program.status !== LoyaltyProgramStatus.ACTIVE) continue;
      if (!this.isWithinEarningWindow(program, snapshot.paidAt)) continue;

      try {
        const strategy = createStrategy(program.program_type);
        const result = strategy.evaluate(snapshot, program);
        if (!result) continue;

        const idempotencyKey = `loyalty:earn:${snapshot.tenantId}:${snapshot.ticketId}:${program.id}`;

        await this.ledgerService.appendTransaction({
          tenantId: snapshot.tenantId,
          customerId: snapshot.customerId,
          loyaltyProgramId: program.id,
          ticketId: snapshot.ticketId,
          transactionType: 'EARN',
          units: result.units,
          idempotencyKey,
          sourceEventId: snapshot.ticketId,
          branchId: snapshot.branchId,
          terminalId: snapshot.terminalId,
          programVersion: result.programVersion,
          commercialSnapshot: result.commercialSnapshot,
          origin: 'POS',
          occurredAt: snapshot.paidAt,
        });

        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to process EARN for program ${program.id}: ${error}`,
        );
      }
    }

    return results;
  }

  private isWithinEarningWindow(
    program: LoyaltyProgram,
    paidAt: Date,
  ): boolean {
    if (program.starts_at && paidAt < program.starts_at) return false;
    if (program.ends_at && paidAt >= program.ends_at) return false;
    return true;
  }
}
