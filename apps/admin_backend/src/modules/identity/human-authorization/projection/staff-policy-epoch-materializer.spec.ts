import {
  STAFF_POLICY_EPOCH_V1_SCHEMA,
  parseStaffPolicyEpochV1,
} from '../contracts/staff-policy-epoch.v1';
import { OHAC_ERROR_CODE, type OhacError } from '../contracts/error-codes';
import { materializeStaffPolicyEpochV1 } from './staff-policy-epoch-materializer';
import {
  projectStaffPolicySnapshotV1,
  type StaffPolicySnapshotProjectionMetadata,
  type StaffPolicySnapshotV1,
} from './staff-policy-snapshot-projector';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';
const USER_C = '55555555-5555-4555-8555-555555555555';

const metadata = (
  overrides: Partial<StaffPolicySnapshotProjectionMetadata> = {},
): StaffPolicySnapshotProjectionMetadata => ({
  tenantId: TENANT,
  sequence: '1',
  previousSequence: '0',
  previousDigest: 'GENESIS',
  publisherBackendBuild: 'backend-build-1',
  ...overrides,
});

const record = () => ({
  userId: USER_A,
  role: 'CASHIER',
  isActive: true,
  pinHash: '$2b$10$abcdefghijklmnopqrstuv',
  customPermissions: null,
  attemptResetGeneration: '0',
});

/**
 * A multi-entry snapshot. Entry canonicalization (sort, dedupe, permission
 * derivation) is owned upstream by the shared entry projection and enforced
 * again by the epoch parser, so this fixture cannot be unsorted or duplicated:
 * such a body would be rejected before the materializer ran. What a multi-entry
 * fixture does prove is that the materializer neither drops nor reorders
 * entries on the way through, which a single-entry fixture cannot show.
 */
const multiEntrySnapshot = () => {
  const result = projectStaffPolicySnapshotV1(metadata(), [
    recordWith({
      userId: USER_C,
      role: 'MANAGER',
      customPermissions: ['sales:void_invoice', 'sales:void_invoice'],
    }),
    recordWith({ userId: USER_A }),
    recordWith({ userId: USER_B, isActive: false }),
  ]);
  if (result.ok === false) throw new Error(result.error.code);
  return result.value;
};

const recordWith = (overrides: Partial<ReturnType<typeof record>> = {}) => ({
  ...record(),
  ...overrides,
});

const snapshot = (
  metadataOverrides: Partial<StaffPolicySnapshotProjectionMetadata> = {},
) => {
  const result = projectStaffPolicySnapshotV1(metadata(metadataOverrides), [
    record(),
  ]);
  if (result.ok === false) throw new Error(result.error.code);
  return result.value;
};

const terminal = (
  overrides: Partial<{
    targetTerminalId: string;
    targetPosBuild: string;
    previousSequence: string;
    previousDigest: string;
  }> = {},
) => ({
  targetTerminalId: 'pos-terminal-1',
  targetPosBuild: 'pos-build-1',
  previousSequence: '0',
  previousDigest: 'GENESIS',
  ...overrides,
});

const failure = (
  result: { ok: false; error: OhacError } | { ok: true },
): OhacError => {
  if (result.ok === false) return result.error;
  throw new Error('expected the materialization to fail');
};

describe('staff-policy-epoch-materializer', () => {
  it('materializes the first epoch for a terminal chaining from 0/GENESIS', () => {
    const snap = snapshot();
    const result = materializeStaffPolicyEpochV1(snap, terminal());
    if (result.ok === false) throw new Error(result.error.code);
    const epoch = result.value;
    expect(epoch.schema).toBe(STAFF_POLICY_EPOCH_V1_SCHEMA);
    expect(epoch.tenantId).toBe(TENANT);
    expect(epoch.targetTerminalId).toBe('pos-terminal-1');
    expect(epoch.sequence).toBe('1');
    expect(epoch.previousSequence).toBe('0');
    expect(epoch.previousDigest).toBe('GENESIS');
    expect(epoch.publisherBackendBuild).toBe('backend-build-1');
    expect(epoch.targetPosBuild).toBe('pos-build-1');
    expect(epoch.minimumAssertionSchema).toBe('ohac.assertion.v1');
    // Entries are carried through from the snapshot unchanged: no re-sort,
    // no re-dedup, no permission re-derivation (decision 23).
    expect(epoch.policyEntries).toEqual(snap.policyEntries);
    expect(epoch.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('chains a later epoch from the terminal own previous sequence and digest', () => {
    const first = snapshot();
    const epoch1 = materializeStaffPolicyEpochV1(first, terminal());
    if (epoch1.ok === false) throw new Error(epoch1.error.code);
    const second = snapshot({
      sequence: '2',
      previousSequence: '1',
      previousDigest: first.digest,
    });
    const epoch2 = materializeStaffPolicyEpochV1(
      second,
      terminal({ previousSequence: '1', previousDigest: epoch1.value.digest }),
    );
    if (epoch2.ok === false) throw new Error(epoch2.error.code);
    expect(epoch2.value.sequence).toBe('2');
    expect(epoch2.value.previousSequence).toBe('1');
    // The terminal chains from the digest it actually accepted for sequence
    // 1 — its own per-terminal epoch digest, not the tenant-level one.
    expect(epoch2.value.previousDigest).toBe(epoch1.value.digest);
  });

  it('ignores the snapshot tenant-level chain values instead of copying them', () => {
    const first = snapshot();
    const epoch1 = materializeStaffPolicyEpochV1(first, terminal());
    if (epoch1.ok === false) throw new Error(epoch1.error.code);
    const second = snapshot({
      sequence: '2',
      previousSequence: '1',
      previousDigest: first.digest,
    });
    const epoch2 = materializeStaffPolicyEpochV1(
      second,
      terminal({ previousSequence: '1', previousDigest: epoch1.value.digest }),
    );
    if (epoch2.ok === false) throw new Error(epoch2.error.code);
    // A late-joining terminal that copied the snapshot's tenant-level
    // previousDigest would break its own chain: the per-terminal digest for
    // sequence 1 differs from the terminal-agnostic snapshot digest.
    expect(second.previousDigest).not.toBe(epoch1.value.digest);
    expect(epoch2.value.previousDigest).toBe(epoch1.value.digest);
    expect(epoch2.value.previousDigest).not.toBe(second.previousDigest);
    // previousSequence cannot diverge for a valid snapshot (the projector
    // makes it sequence - 1, which is also what the terminal must be at),
    // so the previous digest is the field that proves the chain source.
  });

  it('yields different digests for different terminals and for different builds', () => {
    const snap = snapshot();
    const terminalA = materializeStaffPolicyEpochV1(
      snap,
      terminal({ targetTerminalId: 'pos-terminal-1' }),
    );
    const terminalB = materializeStaffPolicyEpochV1(
      snap,
      terminal({ targetTerminalId: 'pos-terminal-2' }),
    );
    const buildB = materializeStaffPolicyEpochV1(
      snap,
      terminal({ targetPosBuild: 'pos-build-2' }),
    );
    if (terminalA.ok === false) throw new Error(terminalA.error.code);
    if (terminalB.ok === false) throw new Error(terminalB.error.code);
    if (buildB.ok === false) throw new Error(buildB.error.code);
    expect(terminalB.value.digest).not.toBe(terminalA.value.digest);
    expect(buildB.value.digest).not.toBe(terminalA.value.digest);
  });

  it('rejects a foreign snapshot schema instead of silently accepting it', () => {
    // The cast mirrors persistence reality: a foreign artifact arrives as
    // untyped bytes, not as a `StaffPolicySnapshotV1` the compiler rejects.
    const foreignEpochSchema = {
      ...snapshot(),
      schema: STAFF_POLICY_EPOCH_V1_SCHEMA,
    } as unknown as StaffPolicySnapshotV1;
    const error = failure(
      materializeStaffPolicyEpochV1(foreignEpochSchema, terminal()),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA);
    expect(error.field).toBe('schema');

    const foreignOther = {
      ...snapshot(),
      schema: 'ohac.staff-policy-snapshot.v9',
    } as unknown as StaffPolicySnapshotV1;
    const otherError = failure(
      materializeStaffPolicyEpochV1(foreignOther, terminal()),
    );
    expect(otherError.code).toBe(OHAC_ERROR_CODE.UNSUPPORTED_SCHEMA);
    expect(otherError.field).toBe('schema');
  });

  it('fails closed on a missing, empty, or whitespace-only terminal id with the contract field name', () => {
    for (const targetTerminalId of [
      undefined,
      '',
      '   ',
    ] as readonly string[]) {
      const error = failure(
        materializeStaffPolicyEpochV1(
          snapshot(),
          terminal({ targetTerminalId }),
        ),
      );
      expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
      expect(error.field).toBe('targetTerminalId');
    }
  });

  it('fails closed on a missing, empty, or whitespace-only negotiated build with the contract field name', () => {
    for (const targetPosBuild of [undefined, '', '  '] as readonly string[]) {
      const error = failure(
        materializeStaffPolicyEpochV1(snapshot(), terminal({ targetPosBuild })),
      );
      // The epoch parser names the field `build` for any empty backend or
      // POS build, so the materializer reports exactly that name.
      expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
      expect(error.field).toBe('build');
    }
  });

  it('lets the contract parser reject a chain gap instead of a second rule', () => {
    // Snapshot sequence 2 against a terminal still at 0/GENESIS: the gap is
    // caught by parseStaffPolicyEpochV1 contiguity, not materializer logic.
    const second = snapshot({
      sequence: '2',
      previousSequence: '1',
      previousDigest: `sha256:${'a'.repeat(64)}`,
    });
    const error = failure(materializeStaffPolicyEpochV1(second, terminal()));
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('sequence');
  });

  it('lets the contract parser reject genesis chaining from a digest', () => {
    const snap = snapshot();
    const error = failure(
      materializeStaffPolicyEpochV1(
        snap,
        terminal({ previousDigest: `sha256:${'a'.repeat(64)}` }),
      ),
    );
    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('sequence');
  });

  it('carries the snapshot entries through unchanged, preserving every entry and its order', () => {
    // Canonical ordering is guaranteed upstream and re-checked by the parser, so
    // the property under test is that the materializer does not drop, duplicate,
    // or reorder entries on the way through — which a single-entry fixture cannot
    // demonstrate.
    const snap = multiEntrySnapshot();
    const result = materializeStaffPolicyEpochV1(snap, terminal());
    if (result.ok === false) throw new Error(result.error.code);

    expect(result.value.policyEntries).toEqual(snap.policyEntries);
    expect(result.value.policyEntries.map((entry) => entry.userId)).toEqual(
      snap.policyEntries.map((entry) => entry.userId),
    );
    expect(result.value.policyEntries).toHaveLength(3);
  });

  it('rejects a whitespace-only publisher backend build carried on the snapshot', () => {
    // Both the snapshot projector and the epoch parser check non-emptiness
    // without trimming, so this value reaches the materializer as an apparently
    // valid build. Accepting it would sign a blank build into the digest and
    // deliver it.
    const snap = { ...snapshot(), publisherBackendBuild: '   ' };
    const error = failure(materializeStaffPolicyEpochV1(snap, terminal()));

    expect(error.code).toBe(OHAC_ERROR_CODE.INVALID_FIELD);
    expect(error.field).toBe('build');
  });

  it('is deterministic under repeated invocation', () => {
    const snap = snapshot();
    const first = materializeStaffPolicyEpochV1(snap, terminal());
    const second = materializeStaffPolicyEpochV1(snap, terminal());
    if (first.ok === false) throw new Error(first.error.code);
    if (second.ok === false) throw new Error(second.error.code);
    expect(second.value).toEqual(first.value);
    expect(second.value.digest).toBe(first.value.digest);
  });

  it('returns a body that survives a round trip through parseStaffPolicyEpochV1', () => {
    const snap = snapshot();
    const result = materializeStaffPolicyEpochV1(snap, terminal());
    if (result.ok === false) throw new Error(result.error.code);
    const reparsed = parseStaffPolicyEpochV1(
      Buffer.from(JSON.stringify(result.value), 'utf8'),
    );
    if (reparsed.ok === false) throw new Error(reparsed.error.code);
    expect(reparsed.value).toEqual(result.value);
  });
});
