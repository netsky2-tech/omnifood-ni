import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { LoyaltyProgram, LoyaltyProgramStatus } from '../entities/loyalty-program.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { LoyaltyTicketSnapshot, EarningResult } from '../domain/loyalty-ticket-snapshot';
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
  ) {}

  async handle(snapshot: LoyaltyTicketSnapshot): Promise<EarningResult[]> {
    if (!snapshot.customerId) return [];

    const customer = await this.customerRepo.findOne({
      where: { id: snapshot.customerId, tenant_id: snapshot.tenantId },
    });
    if (!customer || !customer.is_active) return [];

    const activePrograms = await this.programRepo.find({
      where: {
        tenant_id: snapshot.tenantId,
        status: LoyaltyProgramStatus.ACTIVE,
      },
    });

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
        this.logger.error(`Failed to process EARN for program ${program.id}: ${error}`);
      }
    }

    return results;
  }

  private isWithinEarningWindow(program: LoyaltyProgram, paidAt: Date): boolean {
    if (program.starts_at && paidAt < program.starts_at) return false;
    if (program.ends_at && paidAt >= program.ends_at) return false;
    return true;
  }
}
