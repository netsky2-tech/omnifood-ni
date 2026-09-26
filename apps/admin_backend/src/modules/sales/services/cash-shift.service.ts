import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  CashShiftSession,
  CashShiftStatus,
} from '../entities/cash-shift.entity';
import {
  CashMovement,
  CashMovementType,
} from '../entities/cash-movement.entity';

export interface OpenShiftDto {
  terminalId: string;
  cashierId: string;
  cashierName: string;
  initialFloatNio: number;
  initialFloatUsd: number;
  notes?: string;
}

export interface RecordCashMovementDto {
  terminalId: string;
  type: CashMovementType;
  amountNio: number;
  amountUsd: number;
  reason: string;
  authorizedByUserId?: string;
}

export interface CloseShiftDto {
  finalCountedNio: number;
  finalCountedUsd: number;
  supervisorId?: string;
  notes?: string;
}

const round4 = (value: number): number =>
  Number((Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4));

@Injectable()
export class CashShiftService {
  constructor(
    @InjectRepository(CashShiftSession)
    private readonly shiftRepo: Repository<CashShiftSession>,
    @InjectRepository(CashMovement)
    private readonly movementRepo: Repository<CashMovement>,
    // Issue #512 slice 5: the cash tables are tenant-RLS protected, so the
    // tenant-bound transaction manager is the only access path to them; the
    // pooled repositories above stay declared for Nest DI compatibility only.
    private readonly dataSource: DataSource,
  ) {}

  async getActiveShiftByTerminal(
    tenantId: string,
    terminalId: string,
  ): Promise<CashShiftSession | null> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.findOpenShiftByTerminal(manager, tenantId, terminalId),
    );
  }

  async getCashShiftById(
    tenantId: string,
    shiftId: string,
  ): Promise<CashShiftSession> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const shift = await this.findShiftById(manager, tenantId, shiftId);
        if (!shift) {
          throw new NotFoundException(
            `Turno de caja ${shiftId} no encontrado.`,
          );
        }
        return shift;
      },
    );
  }

  async openShift(
    tenantId: string,
    dto: OpenShiftDto,
  ): Promise<CashShiftSession> {
    // One logical unit: the active-shift read and the create + save share
    // this transaction so the open check cannot race past a pooled read.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const active = await this.findOpenShiftByTerminal(
          manager,
          tenantId,
          dto.terminalId,
        );
        if (active) {
          throw new BadRequestException(
            'Ya existe un turno de caja abierto en este terminal',
          );
        }

        const initialNio = round4(dto.initialFloatNio ?? 0);
        const initialUsd = round4(dto.initialFloatUsd ?? 0);

        const shift = manager.getRepository(CashShiftSession).create({
          tenant_id: tenantId,
          terminal_id: dto.terminalId,
          cashier_id: dto.cashierId,
          cashier_name: dto.cashierName,
          status: CashShiftStatus.OPEN,
          initial_float_nio: initialNio,
          initial_float_usd: initialUsd,
          expected_cash_nio: initialNio,
          expected_cash_usd: initialUsd,
          notes: dto.notes,
        });

        return manager.getRepository(CashShiftSession).save(shift);
      },
    );
  }

  async recordCashMovement(
    tenantId: string,
    shiftId: string,
    dto: RecordCashMovementDto,
  ): Promise<CashMovement> {
    // One logical unit: the shift read, the movement create, the expected-cash
    // update and both saves share this transaction. The shift lookup uses the
    // manager-based helper directly, never the public read method, because a
    // tenant-bound transaction is never nested inside another one.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const shift = await this.findShiftById(manager, tenantId, shiftId);
        if (!shift) {
          throw new NotFoundException(
            `Turno de caja ${shiftId} no encontrado.`,
          );
        }
        if (shift.status !== CashShiftStatus.OPEN) {
          throw new BadRequestException('El turno de caja no está abierto.');
        }

        const nio = round4(dto.amountNio ?? 0);
        const usd = round4(dto.amountUsd ?? 0);

        const movement = manager.getRepository(CashMovement).create({
          tenant_id: tenantId,
          shift_id: shiftId,
          terminal_id: dto.terminalId,
          type: dto.type,
          amount_nio: nio,
          amount_usd: usd,
          reason: dto.reason,
          authorized_by_user_id: dto.authorizedByUserId,
        });

        // Update expected cash in shift
        const isCredit = dto.type === CashMovementType.CASH_IN;
        shift.expected_cash_nio = round4(
          isCredit
            ? Number(shift.expected_cash_nio) + nio
            : Number(shift.expected_cash_nio) - nio,
        );
        shift.expected_cash_usd = round4(
          isCredit
            ? Number(shift.expected_cash_usd) + usd
            : Number(shift.expected_cash_usd) - usd,
        );

        await manager.getRepository(CashShiftSession).save(shift);
        return manager.getRepository(CashMovement).save(movement);
      },
    );
  }

  async closeShiftWithZReport(
    tenantId: string,
    shiftId: string,
    dto: CloseShiftDto,
  ): Promise<CashShiftSession> {
    // One logical unit: the shift read, the closed-shift count that assigns
    // the Z sequence and the final save share this transaction.
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const shift = await this.findShiftById(manager, tenantId, shiftId);
        if (!shift) {
          throw new NotFoundException(
            `Turno de caja ${shiftId} no encontrado.`,
          );
        }
        if (shift.status !== CashShiftStatus.OPEN) {
          throw new BadRequestException('El turno de caja ya ha sido cerrado.');
        }

        const countedNio = round4(dto.finalCountedNio);
        const countedUsd = round4(dto.finalCountedUsd);

        const diffNio = round4(countedNio - Number(shift.expected_cash_nio));
        const diffUsd = round4(countedUsd - Number(shift.expected_cash_usd));

        const totalClosed = await manager
          .getRepository(CashShiftSession)
          .count({
            where: {
              tenant_id: tenantId,
              status: CashShiftStatus.CLOSED,
            },
          });

        shift.final_counted_nio = countedNio;
        shift.final_counted_usd = countedUsd;
        shift.difference_nio = diffNio;
        shift.difference_usd = diffUsd;
        shift.z_report_sequence = totalClosed + 1;
        shift.status = CashShiftStatus.CLOSED;
        shift.closed_at = new Date();
        shift.supervisor_id = dto.supervisorId ?? null;
        if (dto.notes) {
          shift.notes = shift.notes
            ? `${shift.notes}\n${dto.notes}`
            : dto.notes;
        }

        return manager.getRepository(CashShiftSession).save(shift);
      },
    );
  }

  /**
   * Manager-based read used inside an already-bound transaction. Every
   * `where` keeps the explicit `tenant_id` filter: binding is additive, it
   * never replaces the per-query tenant scoping.
   */
  private async findOpenShiftByTerminal(
    manager: EntityManager,
    tenantId: string,
    terminalId: string,
  ): Promise<CashShiftSession | null> {
    return manager.getRepository(CashShiftSession).findOne({
      where: {
        tenant_id: tenantId,
        terminal_id: terminalId,
        status: CashShiftStatus.OPEN,
      },
    });
  }

  private async findShiftById(
    manager: EntityManager,
    tenantId: string,
    shiftId: string,
  ): Promise<CashShiftSession | null> {
    return manager.getRepository(CashShiftSession).findOne({
      where: {
        tenant_id: tenantId,
        id: shiftId,
      },
    });
  }
}
