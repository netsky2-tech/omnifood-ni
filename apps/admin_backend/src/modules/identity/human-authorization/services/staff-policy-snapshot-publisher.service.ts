import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { GENESIS_DIGEST } from '../contracts/staff-policy-epoch.v1';
import { type OhacError } from '../contracts/error-codes';
import {
  projectStaffPolicySnapshotV1,
  STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
} from '../projection/staff-policy-snapshot-projector';
import {
  readStaffPolicySourceRecords,
  resolveTenantCohortDecision,
} from './staff-policy-source-reader';
import { OhacTenantTransaction } from '../rls/ohac-tenant-transaction';
import {
  readOrMaterializeMarker,
  type TenantPublicationMarkerRow,
} from './tenant-publication-marker';

/**
 * Discriminated publication outcomes. Expected states are returned, never
 * thrown: a publication failure (decision 18) must leave the marker dirty so
 * the previously published snapshot keeps governing, and the caller observes
 * that as data rather than by catching exceptions.
 */
export type StaffPolicySnapshotPublicationOutcome =
  | { readonly status: 'noop' }
  | {
      readonly status: 'published';
      readonly sequence: string;
      readonly digest: string;
      /** false means the tenant was re-marked during publication: the CAS row count was zero, so the marker was deliberately left dirty. */
      readonly markerCleared: boolean;
    }
  | {
      readonly status: 'unchanged';
      readonly digest: string;
      readonly reason: 'replay-identical' | 'already-published';
      readonly markerCleared: boolean;
    }
  | { readonly status: 'failed'; readonly error: OhacError };

export interface PublishStaffPolicySnapshotInput {
  readonly tenantId: string;
  readonly publisherBackendBuild: string;
}

interface NewestSnapshotRow {
  readonly sequence: string;
  readonly previousSequence: string;
  readonly previousDigest: string;
  readonly digest: string;
  readonly cohortDecision: string;
}

/**
 * Serialized staff-policy snapshot publisher (design §4.1 rule 6, §11.2
 * decisions 16-19). Runs entirely inside the `OhacTenantTransaction` seam so
 * `app.tenant_id` is bound before the first statement, holds
 * `pg_advisory_xact_lock(hashtext(tenant_id))` while deriving the tenant
 * sequence, and projects through the pure `projectStaffPolicySnapshotV1`.
 * Every value is bound as a query parameter; nothing is interpolated.
 */
@Injectable()
export class StaffPolicySnapshotPublisher {
  constructor(private readonly transaction: OhacTenantTransaction) {}

  async publish(
    input: PublishStaffPolicySnapshotInput,
  ): Promise<StaffPolicySnapshotPublicationOutcome> {
    return await this.transaction.run(
      input.tenantId,
      async (manager) =>
        await this.publishWithin(
          input.tenantId,
          input.publisherBackendBuild,
          manager,
        ),
    );
  }

  private async publishWithin(
    tenantId: string,
    publisherBackendBuild: string,
    manager: EntityManager,
  ): Promise<StaffPolicySnapshotPublicationOutcome> {
    // Serialize publishers per tenant before reading any state, so the
    // derived sequence is contiguous (decision 19) and no other publisher
    // can interleave between the marker read and the snapshot insert.
    //
    // Measured redundancy, recorded so nobody mistakes this lock for the only
    // guarantee: removing this statement entirely leaves every real-database
    // assertion green, including the concurrent-publication test that asserts
    // one `published` and one `noop` outcome. The reason is the marker upsert
    // below — a single INSERT ... ON CONFLICT takes a row lock on the tenant's
    // marker, so a competing publisher blocks there until the winner commits
    // and then observes the marker already cleared. The lock is therefore
    // defensive belt-and-braces rather than the mechanism the concurrency test
    // proves, and it stays because decision 16 mandates an advisory lock on the
    // tenant sequence and because relying on a row lock taken as a side effect
    // of marker materialization would be an undocumented dependency.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      tenantId,
    ]);

    // Marker materialization is owned by the marker module (a single upsert
    // with a no-op conflict branch and RETURNING): a read-then-INSERT here
    // could race a concurrent markTenantPublicationDirty — which inserts
    // marker rows too and does not hold this advisory lock — and abort
    // publication with a unique violation between SELECT and INSERT.
    const marker: TenantPublicationMarkerRow = await readOrMaterializeMarker(
      manager,
      tenantId,
    );
    if (!marker.dirty) return { status: 'noop' };

    const newest = await this.readNewestSnapshot(tenantId, manager);
    const cohortDecision = await resolveTenantCohortDecision(
      manager,
      tenantId,
      publisherBackendBuild,
    );
    const records = await readStaffPolicySourceRecords(manager, tenantId);

    // Replay-based idempotence (design §11.2 decisions 16, 23): the snapshot
    // digest covers its whole chain (sequence, previousSequence,
    // previousDigest), so a projection chained from the newest snapshot can
    // never equal the newest snapshot's own digest — a direct comparison
    // could never match. The freshly loaded records are therefore
    // reprojected under the newest snapshot's own chain metadata: equal
    // digests mean equal canonical bodies, i.e. the source policy is
    // unchanged. The cohort decision is compared too: it is persisted per
    // publication (design §4.1 rule 2), so a decision flip is a genuine
    // change — skipping it would leave the stored gate state stale.
    if (newest) {
      const replay = projectStaffPolicySnapshotV1(
        {
          tenantId,
          sequence: newest.sequence,
          previousSequence: newest.previousSequence,
          previousDigest: newest.previousDigest,
          publisherBackendBuild,
        },
        records,
      );
      // A replay projection failure means the current records fail entry
      // projection; the publish projection below fails identically, so
      // falling through keeps the fail-closed outcome in one place.
      if (
        replay.ok &&
        replay.value.digest === newest.digest &&
        cohortDecision === newest.cohortDecision
      ) {
        const markerCleared = await this.clearMarker(
          marker.revision,
          tenantId,
          manager,
        );
        return {
          status: 'unchanged',
          reason: 'replay-identical',
          digest: newest.digest,
          markerCleared,
        };
      }
    }

    const previousSequence = newest?.sequence ?? '0';
    const previousDigest = newest?.digest ?? GENESIS_DIGEST;
    const sequence = (BigInt(previousSequence) + 1n).toString();
    const projection = projectStaffPolicySnapshotV1(
      {
        tenantId,
        sequence,
        previousSequence,
        previousDigest,
        publisherBackendBuild,
      },
      records,
    );
    // Fail closed (decision 18): nothing is inserted and the marker stays
    // dirty, so the previously published snapshot keeps governing.
    if (projection.ok === false)
      return { status: 'failed', error: projection.error };

    const body = projection.value;
    try {
      await manager.query(
        `INSERT INTO human_auth_policy_snapshots
           (tenant_id, sequence, previous_sequence, schema, previous_digest,
            publisher_backend_build, minimum_assertion_schema, cohort_decision,
            digest, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tenantId,
          body.sequence,
          body.previousSequence,
          STAFF_POLICY_SNAPSHOT_V1_SCHEMA,
          body.previousDigest,
          body.publisherBackendBuild,
          body.minimumAssertionSchema,
          cohortDecision,
          body.digest,
          body as unknown as Record<string, unknown>,
        ],
      );
    } catch (error) {
      // A unique violation means the identical (tenant, sequence) or
      // (tenant, digest) snapshot already exists: the signal was already
      // satisfied, so it is the idempotent already-published case (decision
      // 16), not a hard failure. Anything else propagates and aborts the
      // transaction, leaving the marker untouched.
      if ((error as { code?: string }).code === '23505') {
        const markerCleared = await this.clearMarker(
          marker.revision,
          tenantId,
          manager,
        );
        return {
          status: 'unchanged',
          reason: 'already-published',
          digest: body.digest,
          markerCleared,
        };
      }
      throw error;
    }

    // Compare-and-set on the marker revision: a zero row count means the
    // tenant was re-marked with a new revision during publication, so the
    // marker is deliberately left dirty and the outcome reports it instead
    // of silently swallowing the new signal.
    const markerCleared = await this.clearMarker(
      marker.revision,
      tenantId,
      manager,
    );
    return {
      status: 'published',
      sequence: body.sequence,
      digest: body.digest,
      markerCleared,
    };
  }

  private async readNewestSnapshot(
    tenantId: string,
    manager: EntityManager,
  ): Promise<NewestSnapshotRow | undefined> {
    const rows: NewestSnapshotRow[] = await manager.query(
      `SELECT sequence,
              previous_sequence AS "previousSequence",
              previous_digest AS "previousDigest",
              digest,
              cohort_decision AS "cohortDecision"
         FROM human_auth_policy_snapshots
        WHERE tenant_id = $1
        ORDER BY sequence DESC
        LIMIT 1`,
      [tenantId],
    );
    return rows[0];
  }

  private async clearMarker(
    revision: string,
    tenantId: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const result: unknown[] = await manager.query(
      `UPDATE human_auth_tenant_publication_state
          SET dirty = FALSE,
              revision = revision + 1,
              published_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND revision = $2`,
      [tenantId, revision],
    );
    // The postgres driver returns `[rows, rowCount]` for UPDATE through
    // EntityManager.query; a falsy shape means nothing was matched.
    return Array.isArray(result) && Number(result[1]) > 0;
  }
}
