import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

/**
 * R19 T3 (S4/S15) — the RESOLVED company identity a formal document consumes.
 *
 * The printable count list never reads the tenant row itself and never
 * decides field by field whether a value exists: it receives THIS shape,
 * where every field declares its own presence. That is the single decision
 * point required by S15 — a new identity column is added to the Tenant row,
 * to `resolveCompanyIdentity`, and to the fields the renderer iterates, and
 * the renderer's absence policy does not fork per field.
 *
 * `present: false` is not a defaulting error: nullable identity columns are
 * NULL BY DESIGN (company-identity parity, S3 absence discipline), and the
 * printed document must be told the value is absent rather than silently
 * handed `null`/`''`.
 */
export type CompanyIdentityField =
  | { readonly present: true; readonly value: string }
  | { readonly present: false };

export interface CompanyIdentity {
  readonly name: CompanyIdentityField;
  readonly ruc: CompanyIdentityField;
  readonly address: CompanyIdentityField;
  readonly phone: CompanyIdentityField;
  readonly email: CompanyIdentityField;
}

/** The Tenant columns that carry the printed identity. */
export type TenantIdentityColumns = Pick<
  Tenant,
  'name' | 'ruc' | 'address' | 'phone' | 'email'
>;

/**
 * THE absence decision (S15): a field prints when it holds non-blank text;
 * `null`, `undefined` and whitespace-only are all ABSENCE. Nothing else —
 * no per-field fallbacks, no invented placeholders here. What an absence
 * looks like ON PAPER is the renderer's single policy, applied uniformly
 * because this shape forces the same branch shape for every field.
 *
 * `name` is non-null in the schema, but the resolver does not trust that:
 * S15 demands the document survives ANY combination of absent fields, and a
 * defensively-absent name keeps the document signable instead of printing
 * an empty company line.
 */
export const resolveCompanyIdentity = (
  tenant: TenantIdentityColumns | null | undefined,
): CompanyIdentity => {
  const field = (raw: string | null | undefined): CompanyIdentityField => {
    const value = raw?.trim();
    return value ? { present: true, value } : { present: false };
  };
  return {
    name: field(tenant?.name),
    ruc: field(tenant?.ruc),
    address: field(tenant?.address),
    phone: field(tenant?.phone),
    email: field(tenant?.email),
  };
};

/**
 * Resolves the tenant's company identity for formal documents (S4: the
 * document consumes a resolved identity; the read lives HERE, where the
 * tenant data lives).
 *
 * `resolveWithinManager` runs inside a caller-owned transaction so a
 * document's identity read and its data read see the same snapshot; it
 * (re)binds the RLS context first, which is idempotent for an already-bound
 * transaction. `resolve` opens its own tenant-bound transaction, mirroring
 * the FiscalConfigVersionService read precedent.
 */
@Injectable()
export class CompanyIdentityService {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(tenantId: string): Promise<CompanyIdentity> {
    return runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      this.resolveWithinManager(manager, tenantId),
    );
  }

  async resolveWithinManager(
    manager: EntityManager,
    tenantId: string,
  ): Promise<CompanyIdentity> {
    const trimmed = tenantId?.trim();
    const tenant = trimmed
      ? await manager.getRepository(Tenant).findOne({ where: { id: trimmed } })
      : null;
    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantId ?? ''}' not found`);
    }
    return resolveCompanyIdentity(tenant);
  }
}
