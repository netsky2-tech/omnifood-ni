import { getMetadataArgsStorage } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';
import { HumanAuthPolicyEpoch } from './human-auth-policy-epoch.entity';
import { HumanAuthTerminalAckHistory } from './human-auth-terminal-ack-history.entity';
import { HumanAuthTerminalAckFloor } from './human-auth-terminal-ack-floor.entity';
import { HumanAuthRecoveryToken } from './human-auth-recovery-token.entity';
import { HumanAuthRecoveryEvent } from './human-auth-recovery-event.entity';
import { HumanAuthVerificationEvent } from './human-auth-verification-event.entity';
import { HumanAuthRolloutCohort } from './human-auth-rollout-cohort.entity';
import { HumanAuthPolicySnapshot } from './human-auth-policy-snapshot.entity';
import { HumanAuthTenantPublicationState } from './human-auth-tenant-publication-state.entity';

type ColumnExpectation = readonly [
  property: string,
  columnName: string,
  type: string,
  nullable: boolean,
];

type EntityClass = new (...args: never[]) => unknown;

interface EntityMapping {
  readonly entity: EntityClass;
  readonly table: string;
  readonly columns: readonly ColumnExpectation[];
  readonly primary: readonly string[];
  readonly unique?: Readonly<Record<string, readonly string[]>>;
  readonly indices?: Readonly<Record<string, readonly string[]>>;
}

const mappings: readonly EntityMapping[] = [
  {
    entity: HumanAuthPolicyEpoch,
    table: 'human_auth_policy_epochs',
    primary: ['id'],
    unique: {
      uq_human_auth_policy_epochs_sequence: [
        'tenantId',
        'terminalId',
        'sequence',
      ],
      uq_human_auth_policy_epochs_digest: ['tenantId', 'terminalId', 'digest'],
    },
    indices: {
      idx_human_auth_policy_epochs_tenant: ['tenantId'],
      idx_human_auth_policy_epochs_terminal_sequence: [
        'tenantId',
        'terminalId',
        'sequence',
      ],
    },
    columns: [
      ['id', 'id', 'uuid', false],
      ['tenantId', 'tenant_id', 'uuid', false],
      ['terminalId', 'terminal_id', 'varchar', false],
      ['schema', 'schema', 'varchar', false],
      ['sequence', 'sequence', 'bigint', false],
      ['previousSequence', 'previous_sequence', 'bigint', false],
      ['previousDigest', 'previous_digest', 'varchar', false],
      ['publisherBackendBuild', 'publisher_backend_build', 'varchar', false],
      ['targetPosBuild', 'target_pos_build', 'varchar', false],
      ['minimumAssertionSchema', 'minimum_assertion_schema', 'varchar', false],
      ['cohortDecision', 'cohort_decision', 'varchar', false],
      ['digest', 'digest', 'varchar', false],
      ['payload', 'payload', 'jsonb', false],
      ['publishedAt', 'published_at', 'timestamptz', false],
    ],
  },
  {
    entity: HumanAuthTerminalAckHistory,
    table: 'human_auth_terminal_ack_history',
    primary: ['id'],
    indices: {
      idx_human_auth_ack_history_terminal_received: [
        'tenantId',
        'terminalId',
        'receivedAt',
      ],
    },
    columns: [
      ['id', 'id', 'uuid', false],
      ['tenantId', 'tenant_id', 'uuid', false],
      ['terminalId', 'terminal_id', 'varchar', false],
      ['sequence', 'sequence', 'bigint', false],
      ['previousSequence', 'previous_sequence', 'bigint', false],
      ['digest', 'digest', 'varchar', false],
      ['previousDigest', 'previous_digest', 'varchar', false],
      ['status', 'status', 'varchar', false],
      ['resultCode', 'result_code', 'varchar', true],
      ['idempotencyKey', 'idempotency_key', 'varchar', false],
      ['requestHash', 'request_hash', 'varchar', false],
      ['posBuild', 'pos_build', 'varchar', false],
      ['assertionSchema', 'assertion_schema', 'varchar', false],
      ['ackReceiptId', 'ack_receipt_id', 'uuid', true],
      ['serverFloorSequence', 'server_floor_sequence', 'bigint', true],
      ['serverBuild', 'server_build', 'varchar', true],
      ['receivedAt', 'received_at', 'timestamptz', false],
      ['decidedAt', 'decided_at', 'timestamptz', true],
    ],
  },
  {
    entity: HumanAuthTerminalAckFloor,
    table: 'human_auth_terminal_ack_floor',
    primary: ['tenantId', 'terminalId'],
    columns: [
      ['tenantId', 'tenant_id', 'uuid', false],
      ['terminalId', 'terminal_id', 'varchar', false],
      ['sequence', 'sequence', 'bigint', false],
      ['digest', 'digest', 'varchar', false],
      ['revision', 'revision', 'bigint', false],
      ['updatedAt', 'updated_at', 'timestamptz', false],
    ],
  },
  {
    entity: HumanAuthRecoveryToken,
    table: 'human_auth_recovery_tokens',
    primary: ['tokenId'],
    indices: {
      uq_human_auth_recovery_tokens_hmac: ['tenantId', 'secretHmac'],
      idx_human_auth_recovery_tokens_tenant_terminal: [
        'tenantId',
        'terminalId',
      ],
      idx_human_auth_recovery_tokens_expiry: ['status', 'expiresAt'],
    },
    columns: [
      ['tokenId', 'token_id', 'uuid', false],
      ['tenantId', 'tenant_id', 'uuid', false],
      ['terminalId', 'terminal_id', 'varchar', false],
      ['secretHmac', 'secret_hmac', 'varchar', false],
      ['status', 'status', 'varchar', false],
      ['issuedByUserId', 'issued_by_user_id', 'uuid', false],
      ['issuanceReason', 'issuance_reason', 'varchar', false],
      ['issuedAt', 'issued_at', 'timestamptz', false],
      ['expiresAt', 'expires_at', 'timestamptz', false],
      ['revokedAt', 'revoked_at', 'timestamptz', true],
      ['revokedByUserId', 'revoked_by_user_id', 'uuid', true],
      ['revocationReason', 'revocation_reason', 'varchar', true],
      ['redeemedAt', 'redeemed_at', 'timestamptz', true],
      ['redemptionCredentialId', 'redemption_credential_id', 'uuid', true],
      ['idempotencyKey', 'idempotency_key', 'varchar', true],
      ['redemptionRequestHash', 'redemption_request_hash', 'varchar', true],
    ],
  },
  {
    entity: HumanAuthRecoveryEvent,
    table: 'human_auth_recovery_events',
    primary: ['id'],
    indices: {
      idx_human_auth_recovery_events_token: [
        'tenantId',
        'tokenId',
        'occurredAt',
      ],
    },
    columns: [
      ['id', 'id', 'uuid', false],
      ['tenantId', 'tenant_id', 'uuid', false],
      ['terminalId', 'terminal_id', 'varchar', false],
      ['tokenId', 'token_id', 'uuid', false],
      ['eventType', 'event_type', 'varchar', false],
      ['actorUserId', 'actor_user_id', 'uuid', true],
      ['principalType', 'principal_type', 'varchar', false],
      ['reasonCode', 'reason_code', 'varchar', true],
      ['correlationId', 'correlation_id', 'varchar', true],
      ['occurredAt', 'occurred_at', 'timestamptz', false],
    ],
  },
  {
    entity: HumanAuthVerificationEvent,
    table: 'human_auth_verification_events',
    primary: ['id'],
    indices: {
      idx_human_auth_verification_events_assertion: ['tenantId', 'assertionId'],
    },
    columns: [
      ['id', 'id', 'uuid', false],
      ['tenantId', 'tenant_id', 'varchar', false],
      ['terminalId', 'terminal_id', 'varchar', false],
      ['assertionId', 'assertion_id', 'uuid', false],
      ['credentialId', 'credential_id', 'uuid', false],
      ['credentialVersion', 'credential_version', 'integer', false],
      ['epochSequence', 'epoch_sequence', 'bigint', false],
      ['epochDigest', 'epoch_digest', 'varchar', false],
      ['authorizerUserId', 'authorizer_user_id', 'uuid', false],
      ['operatorUserId', 'operator_user_id', 'uuid', true],
      ['operationType', 'operation_type', 'varchar', false],
      ['operationSchema', 'operation_schema', 'varchar', false],
      ['operationDigest', 'operation_digest', 'varchar', false],
      ['localAuditId', 'local_audit_id', 'varchar', true],
      ['localSequence', 'local_sequence', 'bigint', true],
      ['trustLevel', 'trust_level', 'varchar', false],
      ['decision', 'decision', 'varchar', false],
      ['reasonCode', 'reason_code', 'varchar', true],
      ['correlationId', 'correlation_id', 'varchar', true],
      ['occurredAt', 'occurred_at', 'timestamptz', false],
    ],
  },
  {
    entity: HumanAuthRolloutCohort,
    table: 'human_auth_rollout_cohorts',
    primary: ['id'],
    unique: {
      uq_human_auth_rollout_cohorts_build_pair: [
        'tenantId',
        'posBuild',
        'backendBuild',
      ],
    },
    indices: {
      idx_human_auth_rollout_cohorts_tenant_enabled: ['tenantId', 'enabled'],
    },
    columns: [
      ['id', 'id', 'uuid', false],
      ['tenantId', 'tenant_id', 'varchar', false],
      ['posBuild', 'pos_build', 'varchar', false],
      ['backendBuild', 'backend_build', 'varchar', false],
      ['policySchema', 'policy_schema', 'varchar', false],
      ['assertionSchema', 'assertion_schema', 'varchar', false],
      ['enabled', 'enabled', 'boolean', false],
      ['ownerAcceptanceActorId', 'owner_acceptance_actor_id', 'uuid', true],
      ['ownerAcceptanceRef', 'owner_acceptance_ref', 'varchar', true],
      ['ownerAcceptanceAt', 'owner_acceptance_at', 'timestamptz', true],
      ['createdAt', 'created_at', 'timestamptz', false],
      ['updatedAt', 'updated_at', 'timestamptz', false],
    ],
  },
  {
    entity: HumanAuthPolicySnapshot,
    table: 'human_auth_policy_snapshots',
    primary: ['id'],
    unique: {
      uq_human_auth_policy_snapshots_sequence: ['tenantId', 'sequence'],
      uq_human_auth_policy_snapshots_digest: ['tenantId', 'digest'],
    },
    indices: {
      idx_human_auth_policy_snapshots_tenant_sequence: ['tenantId', 'sequence'],
    },
    columns: [
      ['id', 'id', 'uuid', false],
      ['tenantId', 'tenant_id', 'varchar', false],
      ['sequence', 'sequence', 'bigint', false],
      ['previousSequence', 'previous_sequence', 'bigint', false],
      ['schema', 'schema', 'varchar', false],
      ['previousDigest', 'previous_digest', 'varchar', false],
      ['publisherBackendBuild', 'publisher_backend_build', 'varchar', false],
      ['minimumAssertionSchema', 'minimum_assertion_schema', 'varchar', false],
      ['cohortDecision', 'cohort_decision', 'varchar', false],
      ['digest', 'digest', 'varchar', false],
      ['payload', 'payload', 'jsonb', false],
      ['publishedAt', 'published_at', 'timestamptz', false],
    ],
  },
  {
    entity: HumanAuthTenantPublicationState,
    table: 'human_auth_tenant_publication_state',
    primary: ['tenantId'],
    columns: [
      ['tenantId', 'tenant_id', 'varchar', false],
      ['dirty', 'dirty', 'boolean', false],
      ['revision', 'revision', 'bigint', false],
      ['markedAt', 'marked_at', 'timestamptz', false],
      ['publishedAt', 'published_at', 'timestamptz', true],
      ['updatedAt', 'updated_at', 'timestamptz', false],
    ],
  },
];

const entities = mappings.map((m) => m.entity);

describe('OHAC entity mapping vs migrations', () => {
  it.each(mappings.map((m) => [m.table, m] as const))(
    'maps %s exactly as the migration declares it',
    (_table, mapping) => {
      const storage = getMetadataArgsStorage();

      const table = storage.tables.find((t) => t.target === mapping.entity);
      expect(table?.name).toBe(mapping.table);

      const actualColumns = storage.columns
        .filter((c) => c.target === mapping.entity)
        .map(
          (c) =>
            [
              c.propertyName,
              c.options.name ?? c.propertyName,
              c.options.type,
              c.options.nullable ?? false,
            ] as const,
        );
      expect(actualColumns).toEqual(mapping.columns);

      const primary = storage.columns
        .filter((c) => c.target === mapping.entity && c.options.primary)
        .map((c) => c.propertyName)
        .sort();
      expect(primary).toEqual([...mapping.primary].sort());

      const actualUnique = Object.fromEntries(
        storage.uniques
          .filter((u) => u.target === mapping.entity)
          .map((u) => [u.name, u.columns]),
      );
      expect(actualUnique).toEqual(mapping.unique ?? {});

      const actualIndices = Object.fromEntries(
        storage.indices
          .filter((i) => i.target === mapping.entity)
          .map((i) => [i.name, i.columns]),
      );
      expect(actualIndices).toEqual(mapping.indices ?? {});
    },
  );

  it('keeps the terminal-agnostic snapshot free of per-terminal columns', () => {
    const declaredProperties = getMetadataArgsStorage()
      .columns.filter((column) => column.target === HumanAuthPolicySnapshot)
      .map((column) => column.propertyName);

    // Design §11.2 decision 17: terminal_id and target_pos_build are resolved on the
    // terminal's first pull, never stored on the terminal-agnostic snapshot. The
    // migration declares no such column and the entity must not invent one, which is
    // exactly the invariant that would silently drift if this assertion were dropped.
    expect(declaredProperties).not.toContain('terminalId');
    expect(declaredProperties).not.toContain('targetPosBuild');
    expect(declaredProperties).not.toContain('updatedAt');
  });

  it('preserves the varchar widths the migrations declare for the publisher tables', () => {
    const widthOf = (target: EntityClass, property: string) =>
      getMetadataArgsStorage().columns.find(
        (column) =>
          column.target === target && column.propertyName === property,
      )?.options.length;

    const widths: readonly (readonly [EntityClass, string, number])[] = [
      [HumanAuthPolicySnapshot, 'tenantId', 128],
      [HumanAuthPolicySnapshot, 'schema', 128],
      [HumanAuthPolicySnapshot, 'publisherBackendBuild', 128],
      [HumanAuthPolicySnapshot, 'minimumAssertionSchema', 128],
      [HumanAuthPolicySnapshot, 'cohortDecision', 32],
      [HumanAuthPolicySnapshot, 'previousDigest', 71],
      [HumanAuthPolicySnapshot, 'digest', 71],
      [HumanAuthTenantPublicationState, 'tenantId', 128],
    ];

    for (const [entity, property, length] of widths) {
      expect([entity.name, property, widthOf(entity, property)]).toEqual([
        entity.name,
        property,
        length,
      ]);
    }
  });

  it('starts the publication marker dirty at revision one', () => {
    // The publisher clears dirty and advances revision by compare-and-set, so a marker
    // that defaulted to clean or to revision zero would silently drop the first signal
    // or break monotonicity. The default is a schema property the mutation trigger
    // depends on, so it is asserted here rather than left to the migration alone.
    const primary = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === HumanAuthTenantPublicationState &&
        column.propertyName === 'tenantId',
    );
    expect(primary?.options).toMatchObject({ primary: true, length: 128 });

    const dirty = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === HumanAuthTenantPublicationState &&
        column.propertyName === 'dirty',
    );
    expect(dirty?.options).toMatchObject({ type: 'boolean', default: true });

    const revision = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === HumanAuthTenantPublicationState &&
        column.propertyName === 'revision',
    );
    expect(revision?.options).toMatchObject({ type: 'bigint', default: 1 });
    expect(revision?.options.transformer).toBe(BIGINT_STRING);
  });

  it('leaves the partial indexes owned by the migrations undeclared', () => {
    const entitySet = new Set<EntityClass>(entities);
    const declaredNames = [
      ...getMetadataArgsStorage().indices,
      ...getMetadataArgsStorage().uniques,
    ]
      .filter((entry) => entitySet.has(entry.target as EntityClass))
      .map((entry) => entry.name);

    expect(declaredNames).not.toContain(
      'uq_human_auth_ack_history_accepted_sequence',
    );
    expect(declaredNames).not.toContain(
      'uq_human_auth_ack_history_idempotency',
    );
    expect(declaredNames).not.toContain(
      'uq_human_auth_recovery_events_expiry_observed',
    );
  });

  it('maps every bigint column through the shared Int64-safe transformer', () => {
    const expectedBigintColumns = mappings.flatMap((mapping) =>
      mapping.columns
        .filter(([, , type]) => type === 'bigint')
        .map(([property]) => ({ target: mapping.entity, property })),
    );
    expect(expectedBigintColumns.length).toBeGreaterThan(0);

    const bigintColumns = getMetadataArgsStorage().columns.filter(
      (c) =>
        entities.includes(c.target as EntityClass) &&
        c.options.type === 'bigint',
    );

    // Derived from the expectation table above, so adding a bigint column to an entity without
    // adding it here, or adding one without the transformer, fails rather than drifting.
    expect(
      bigintColumns.map((c) => [
        (c.target as EntityClass).name,
        c.propertyName,
      ]),
    ).toEqual(expectedBigintColumns.map((c) => [c.target.name, c.property]));
    for (const column of bigintColumns) {
      expect(column.options.transformer).toBe(BIGINT_STRING);
    }
  });
});

describe('BigIntStringTransformer Int64 safety', () => {
  it('round-trips boundary and large-but-valid Int64 values as strings', () => {
    for (const value of ['0', '9223372036854775807', '9007199254740993']) {
      expect(BIGINT_STRING.to(value)).toBe(value);
      expect(BIGINT_STRING.from(value)).toBe(value);
    }
  });

  it('maps null through both directions for nullable bigint columns', () => {
    expect(BIGINT_STRING.to(null)).toBeNull();
    expect(BIGINT_STRING.to(undefined)).toBeNull();
    expect(BIGINT_STRING.from(null)).toBeNull();
  });

  it('rejects out-of-range values instead of losing precision', () => {
    expect(() => BIGINT_STRING.to('9223372036854775808')).toThrow(RangeError);
    expect(() => BIGINT_STRING.to('-9223372036854775809')).toThrow(RangeError);
  });

  it('rejects JS numbers, which silently round near the Int64 boundary', () => {
    const lossyNumber = Number('9223372036854775807');
    expect(lossyNumber).toBe(2 ** 63);
    expect(() => BIGINT_STRING.to(lossyNumber as unknown as string)).toThrow(
      TypeError,
    );
  });
});
