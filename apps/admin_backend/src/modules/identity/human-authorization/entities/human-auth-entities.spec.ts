import { getMetadataArgsStorage } from 'typeorm';
import { BIGINT_STRING } from './bigint-string.transformer';
import { HumanAuthPolicyEpoch } from './human-auth-policy-epoch.entity';
import { HumanAuthTerminalAckHistory } from './human-auth-terminal-ack-history.entity';
import { HumanAuthTerminalAckFloor } from './human-auth-terminal-ack-floor.entity';

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
      ['tenantId', 'tenant_id', 'varchar', false],
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
      ['tenantId', 'tenant_id', 'varchar', false],
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
      ['tenantId', 'tenant_id', 'varchar', false],
      ['terminalId', 'terminal_id', 'varchar', false],
      ['sequence', 'sequence', 'bigint', false],
      ['digest', 'digest', 'varchar', false],
      ['revision', 'revision', 'bigint', false],
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
