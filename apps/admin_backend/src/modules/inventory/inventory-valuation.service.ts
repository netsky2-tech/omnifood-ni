import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  isCalendarDay,
  toCalendarDay,
} from '../../core/database/calendar-day';
import { runInTenantTransaction } from '../../core/database/tenant-transaction';
import { Insumo } from './entities/insumo.entity';
import { InsumoMarketPrice } from './entities/insumo-market-price.entity';
import {
  InventoryMovement,
  MovementType,
} from './entities/inventory-movement.entity';

/**
 * R-01 (Ley 822 art. 44) — value inventory at the LOWER of acquisition cost or
 * market price, and keep the evidence of which reference was used.
 *
 * S9 (L33) fixed the two variants the reference may come from:
 *
 *   1. MARKET_PRICE                  — the client defined a market price, so the
 *                                      reference is the one in force at the
 *                                      closing date. This is the variant that
 *                                      satisfies the law on its own terms.
 *   2. LAST_PURCHASE_COST_FALLBACK   — the client defined none for that date, so
 *                                      the reference is the last purchase cost
 *                                      from the ledger. The row SAYS SO, because
 *                                      the approximation is the client's
 *                                      responsibility for lack of its own
 *                                      information — it is not a system
 *                                      limitation presented as compliance.
 *
 * Why the writedown is a compensating movement rather than an edit. The kardex
 * is append-only by trigger, and a lower-of adjustment changes VALUE while
 * leaving QUANTITY untouched. So the row carries `quantity = 0` with a negative
 * `total_cost_nio`, and the running-balance trigger accepts it
 * (`stock_after = stock_before + 0`).
 *
 * Why it also lowers the projection (`insumos.costo_promedio_nio`) to the
 * reference. The valuation report reads `insumo.stock x averageCost` — that is,
 * the projection, not the ledger. Lowering the unit value keeps the projection
 * and the ledger in lockstep, which is the project's invariant: projections are
 * rebuildable FROM the ledger. Holding the writedown in a separate reserve
 * account would leave the report and the ledger disagreeing.
 *
 * The sales cost of what was ALREADY sold is not rewritten: only the value of
 * what remains on hand moves. Restating a past period is IAS 8 retrospective
 * work and belongs to the reporting layer, not here.
 */

/** The variant that resolved a reference. Persisted; never inferred later. */
export type ValuationReferenceVariant =
  | 'MARKET_PRICE'
  | 'LAST_PURCHASE_COST_FALLBACK';

export interface ValuationReference {
  variant: ValuationReferenceVariant;
  referenceNio: number;
  /** The REFERENCE's own date — never the closing date. */
  referenceDate: string;
  /** The market-price row id, or the purchase movement id. */
  originId: string;
}

export interface SetMarketPriceInput {
  tenantId: string;
  insumoId: string;
  marketPriceNio: number | string;
  effectiveDate: string;
  sourceNote?: string | null;
  createdByUserId?: string | null;
}

export interface WritedownLine {
  insumoId: string;
  stock: number;
  costBefore: number;
  referenceNio: number;
  variant: ValuationReferenceVariant;
  referenceDate: string;
  originId: string;
  writedownNio: number;
  movementId: string;
}

export interface WritedownResult {
  asOfDate: string;
  lines: WritedownLine[];
  totalWritedownNio: number;
  /** Already written down for this date; the exact-match idempotency check. */
  skippedExisting: string[];
  /** Cost is at or below the reference: nothing to write down. */
  notAboveReference: string[];
  /**
   * Holding stock, but NO reference could be resolved (no market price and no
   * purchase). Deliberately left alone: there is no reference to speak of, and
   * inventing one would be worse than doing nothing.
   */
  withoutReference: string[];
}

/** File-local twin of the reports service' helper (kept private there). */
const round4 = (value: number): number =>
  Number((Math.round(value * 10000) / 10000).toFixed(4));

/**
 * The kardex `occurred_at` of a period close. `occurred_at` is a `timestamptz`
 * while a closing date is a calendar day, so the zone is picked HERE and
 * explicitly (calendar-day.ts deliberately refuses to guess): the close is
 * recorded as the end of the closing day in UTC.
 *
 * This is an explicit approximation, not an accident. Reconciling the kardex's
 * instants with local business days is R9's job; what matters today is that the
 * choice is written down where the value is produced.
 */
const closingInstantUtc = (asOfDate: string): string =>
  `${asOfDate}T23:59:59.999Z`;

@Injectable()
export class InventoryValuationService {
  private readonly logger = new Logger(InventoryValuationService.name);

  /** Document prefix that gives a writedown row its exact-match identity. */
  static readonly WRITEDOWN_DOCUMENT_PREFIX = 'valuation-writedown';

  static writedownDocumentId(asOfDate: string, insumoId: string): string {
    return `${InventoryValuationService.WRITEDOWN_DOCUMENT_PREFIX}:${asOfDate}:${insumoId}`;
  }

  constructor(private readonly dataSource: DataSource) {}

  /**
   * S9.1 — the client defines its own market price, with its date.
   *
   * Re-defining the same (tenant, insumo, date) CORRECTS it rather than adding
   * a second row: the table's uniqueness says one price per day, and a mis-keyed
   * price has to be fixable.
   */
  async setMarketPrice(input: SetMarketPriceInput): Promise<InsumoMarketPrice> {
    const { tenantId, insumoId } = input;

    if (!isCalendarDay(input.effectiveDate)) {
      throw new BadRequestException(
        `effectiveDate must be a calendar day (YYYY-MM-DD), received '${input.effectiveDate}'`,
      );
    }

    const marketPriceNio = Number(input.marketPriceNio);
    if (!Number.isFinite(marketPriceNio) || marketPriceNio < 0) {
      throw new BadRequestException(
        'marketPriceNio must be a finite number greater than or equal to zero',
      );
    }

    const effectiveDate = toCalendarDay(input.effectiveDate);

    return runInTenantTransaction(this.dataSource, tenantId, async (manager) => {
      const insumo = await manager.getRepository(Insumo).findOne({
        where: { id: insumoId, tenant_id: tenantId },
        select: ['id'],
      });
      if (!insumo) {
        throw new NotFoundException(`Insumo ${insumoId} not found`);
      }

      const rows = (await manager.query(
        `INSERT INTO insumo_market_prices
           (tenant_id, insumo_id, market_price_nio, effective_date, source_note, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, insumo_id, effective_date)
         DO UPDATE SET market_price_nio = EXCLUDED.market_price_nio,
                       source_note = EXCLUDED.source_note,
                       created_by_user_id = EXCLUDED.created_by_user_id
         RETURNING id, tenant_id, insumo_id, market_price_nio, effective_date,
                   source_note, created_by_user_id, created_at`,
        [
          tenantId,
          insumoId,
          marketPriceNio,
          effectiveDate,
          input.sourceNote ?? null,
          input.createdByUserId ?? null,
        ],
      )) as Array<Record<string, unknown>>;

      const row = rows[0];
      return {
        id: String(row.id),
        tenant_id: String(row.tenant_id),
        insumo_id: String(row.insumo_id),
        market_price_nio: Number(row.market_price_nio),
        effective_date: String(row.effective_date),
        source_note: (row.source_note as string | null) ?? null,
        created_by_user_id: (row.created_by_user_id as string | null) ?? null,
        created_at: row.created_at as Date,
      } as InsumoMarketPrice;
    });
  }

  /**
   * S9 — which reference applies to this insumo as of a closing date.
   *
   * Returns `null` when neither variant has anything to say. That is a real
   * answer, not a failure: a writedown needs a reference, and this method
   * refuses to fabricate one.
   */
  async resolveValuationReference(
    tenantId: string,
    insumoId: string,
    asOfDate: string,
    executor?: EntityManager,
  ): Promise<ValuationReference | null> {
    const run = async (manager: EntityManager) => {
      // Variant 1 — the client's own market price in force at the closing
      // date: the most recent one that does NOT come after it. ISO calendar
      // days compare correctly as strings.
      //
      // `effective_date` is cast to text ON PURPOSE. This is a raw query, so it
      // bypasses the entities' `type: 'date'` mapping that the rest of the
      // codebase relies on to keep calendar days as ISO strings
      // (src/core/database/calendar-day.ts). Without the cast the driver hands
      // back a JS Date and `String(date)` yields "Thu Oct 15 2026 00:00:00
      // GMT-0600" — a locale string that is neither the day the client typed
      // nor comparable to one. The spec caught exactly this.
      const market = (await manager.query(
        `SELECT id, market_price_nio,
                to_char(effective_date, 'YYYY-MM-DD') AS effective_date
           FROM insumo_market_prices
          WHERE tenant_id = $1 AND insumo_id = $2 AND effective_date <= $3
          ORDER BY effective_date DESC, created_at DESC
          LIMIT 1`,
        [tenantId, insumoId, asOfDate],
      )) as Array<Record<string, unknown>>;

      if (market.length > 0) {
        return {
          variant: 'MARKET_PRICE' as const,
          referenceNio: round4(Number(market[0].market_price_nio)),
          referenceDate: String(market[0].effective_date),
          originId: String(market[0].id),
        };
      }

      // Variant 2 — the DECLARED fallback: the last purchase cost from the
      // ledger. The day is derived with an explicit zone (UTC) because a
      // timestamptz is an instant and this is a calendar day; picking the zone
      // silently is how one-day shifts happen.
      const purchase = (await manager.query(
        `SELECT id, unit_cost_nio,
                to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS purchase_day
           FROM inventory_kardex
          WHERE tenant_id = $1
            AND insumo_id = $2
            AND movement_type = 'ENTRADA_COMPRA'
            AND occurred_at <= $3
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1`,
        [tenantId, insumoId, closingInstantUtc(asOfDate)],
      )) as Array<Record<string, unknown>>;

      if (purchase.length > 0) {
        return {
          variant: 'LAST_PURCHASE_COST_FALLBACK' as const,
          referenceNio: round4(Number(purchase[0].unit_cost_nio)),
          referenceDate: String(purchase[0].purchase_day),
          originId: String(purchase[0].id),
        };
      }

      return null;
    };

    if (executor) {
      return run(executor);
    }
    return runInTenantTransaction(this.dataSource, tenantId, run);
  }

  /**
   * R-01 / S9 — the writedown itself, for one closing date.
   *
   * Idempotent per (closing date, insumo) through the row's document identity:
   * a re-run skips what is already written down instead of lowering the value
   * twice. Valuing the same period twice must not be a way to lose value.
   */
  async applyLowerOfCostWritedown(params: {
    tenantId: string;
    asOfDate: string;
  }): Promise<WritedownResult> {
    const { tenantId } = params;

    if (!isCalendarDay(params.asOfDate)) {
      throw new BadRequestException(
        `asOfDate must be a calendar day (YYYY-MM-DD), received '${params.asOfDate}'`,
      );
    }
    const asOfDate = toCalendarDay(params.asOfDate);

    return runInTenantTransaction(this.dataSource, tenantId, async (manager) => {
      const candidates = (await manager.query(
        `SELECT id, stock, costo_promedio_nio
           FROM insumos
          WHERE tenant_id = $1 AND stock > 0
          ORDER BY id`,
        [tenantId],
      )) as Array<Record<string, unknown>>;

      const result: WritedownResult = {
        asOfDate,
        lines: [],
        totalWritedownNio: 0,
        skippedExisting: [],
        notAboveReference: [],
        withoutReference: [],
      };

      for (const row of candidates) {
        const insumoId = String(row.id);
        const stock = round4(Number(row.stock));
        const costBefore = round4(Number(row.costo_promedio_nio ?? 0));
        const documentId = InventoryValuationService.writedownDocumentId(
          asOfDate,
          insumoId,
        );

        const existing = await manager.getRepository(InventoryMovement).findOne({
          where: { sourceDocumentId: documentId },
          select: ['id'],
        });
        if (existing) {
          result.skippedExisting.push(insumoId);
          continue;
        }

        const reference = await this.resolveValuationReference(
          tenantId,
          insumoId,
          asOfDate,
          manager,
        );
        if (!reference) {
          result.withoutReference.push(insumoId);
          continue;
        }

        if (costBefore <= reference.referenceNio) {
          result.notAboveReference.push(insumoId);
          continue;
        }

        const writedownNio = round4(
          stock * (costBefore - reference.referenceNio),
        );
        if (writedownNio <= 0) {
          result.notAboveReference.push(insumoId);
          continue;
        }

        const basis = JSON.stringify({
          variant: reference.variant,
          referenceNio: reference.referenceNio,
          referenceDate: reference.referenceDate,
          originId: reference.originId,
          closingDate: asOfDate,
          stock,
          costBefore,
          writedownNio,
        });

        const movement = manager.create(InventoryMovement, {
          tenant_id: tenantId,
          // NOT `insumo_id`: this entity names the reference `insumoId` while
          // its tenant column stays `tenant_id`. A wrong property name is not
          // an error TypeORM reports — it silently drops the column and the
          // insert fails on NOT NULL, which is how a whole afternoon goes.
          insumoId,
          // A valuation act, never a quantity adjustment: `quantity = 0` and a
          // negative value are the point, not an oversight.
          type: MovementType.VALUATION_WRITEDOWN,
          quantity: 0,
          unitCostNio: reference.referenceNio,
          totalCostNio: -writedownNio,
          // The entity calls the running-balance columns previousStock /
          // newStock while the columns are stock_before / stock_after.
          previousStock: stock,
          newStock: stock,
          averageCostAfterNio: reference.referenceNio,
          sourceDocumentType: MovementType.VALUATION_WRITEDOWN,
          sourceDocumentId: documentId,
          // The entity calls this `timestamp` (a @CreateDateColumn mapped to
          // occurred_at), NOT `occurredAt`: an unmatched key is dropped without
          // a word, so the name has to be right as well as the value.
          timestamp: new Date(closingInstantUtc(asOfDate)),
          valuationBasis: basis,
        });
        const saved = await manager.getRepository(InventoryMovement).save(movement);

        // NOTE: there is no second chance to stamp this row. `inventory_kardex`
        // is append-only BY TRIGGER — an UPDATE is rejected with
        // "inventory_kardex is append-only and cannot be updated or deleted" —
        // so `occurred_at` is right at insert time or it is wrong forever. A
        // first version of this code tried to enforce it with a follow-up
        // UPDATE and was refused by the ledger itself, which is the ledger
        // doing exactly what it was built to do. The spec asserts the closing
        // instant rather than trusting the decorator.

        // The projection has to move with the ledger, or the valuation report
        // (`stock x averageCost`) would keep reporting the pre-writedown value.
        await manager.query(
          `UPDATE insumos
              SET costo_promedio_nio = $1, updated_at = now()
            WHERE tenant_id = $2 AND id = $3`,
          [reference.referenceNio, tenantId, insumoId],
        );

        result.lines.push({
          insumoId,
          stock,
          costBefore,
          referenceNio: reference.referenceNio,
          variant: reference.variant,
          referenceDate: reference.referenceDate,
          originId: reference.originId,
          writedownNio,
          movementId: String(saved.id),
        });
        result.totalWritedownNio = round4(result.totalWritedownNio + writedownNio);
      }

      this.logger.log(
        `lower-of-cost writedown as of ${asOfDate}: ${result.lines.length} insumo(s), ${result.totalWritedownNio} NIO, ${result.skippedExisting.length} already applied, ${result.withoutReference.length} without reference`,
      );

      return result;
    });
  }
}
