import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Company identity parity P3, slice 1 (odd/tasks/identidad-empresa-paridad.md,
 * S5) — the tenant-scoped asset table that owns the company logo's ORIGINAL
 * bytes.
 *
 * Why this table exists at all: there is no multer, no server-side staging
 * and (before this table) not one bytea column in the repo. The bytes cannot
 * live on `tenants` — the fiscal snapshot builder reads the tenant row on
 * every snapshot construction, and a blob there would load the whole logo
 * each time — and they cannot ride the versioned fiscal payload as base64:
 * `fiscal_config_revisions` stores its payload whole per revision, so an
 * embedded logo would be one copy of the logo per revision. What travels in
 * the snapshot is the sha256 REFERENCE; the bytes live HERE and are served
 * on demand.
 *
 * One row per tenant (uq_tenant_brand_assets_tenant): THE original, not a
 * history. An upload replaces the row in place; a rejected upload leaves the
 * previous row untouched. There is no delete path in this slice — RLS
 * declares exactly S/I/U (migration 1809980000000 and the manifest).
 */
@Entity('tenant_brand_assets')
@Unique('uq_tenant_brand_assets_tenant', ['tenant_id'])
export class TenantBrandAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenant_id: string;

  /** IANA media type as stored — only 'image/png' passes validation. */
  @Column({ type: 'varchar' })
  content_type: string;

  /** Decoded byte length; the ceiling is enforced before the row is written. */
  @Column({ type: 'integer' })
  byte_length: number;

  /** sha256 of the DECODED bytes — the reference the fiscal snapshot carries. */
  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ type: 'bytea' })
  bytes: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
