import 'dart:convert';
import 'dart:typed_data';

import 'package:floor/floor.dart';
import 'package:uuid/uuid.dart';

import '../../../domain/security/ohac_attempt_policy.dart';
import '../../../domain/security/ohac_authorization_port.dart';
import '../../../domain/security/ohac_outbox_registry.dart';
import '../../models/human_authorization/canonical.dart';
import '../../models/human_authorization/error_codes.dart';
import '../../models/human_authorization/field_guards.dart';
import '../../models/human_authorization/ohac_delivery_entities.dart';
import '../../models/human_authorization/staff_policy_epoch_v1.dart';
import '../../models/human_authorization/terminal_state_machine.dart';

/// Consolidated DAO for the OHAC local delivery tables.
///
/// Grouping: the immutable policy tables (`human_auth_policy_epochs`,
/// `human_auth_policy_entries`), the mutable delivery state
/// (`human_auth_terminal_state`, `human_auth_attempt_state`), and the
/// append-only event log (`human_auth_local_events`).
///
/// A second terminal-state insert aborts rather than overwriting a state the
/// compare-and-set protects.
///
/// Transitions are compare-and-sets named after the design's transitions
/// (design §5): each one writes only the fields that transition owns.
///
/// The append-only tables declare no update and no delete at all: an epoch,
/// an entry and a local event are never rewritten in place, which the schema
/// enforces with triggers.
@dao
abstract class OhacDeliveryDao {
  // ---------------------------------------------------------------------------
  // Immutable policy tables: epochs and entries (append-only).
  // ---------------------------------------------------------------------------

  /// Append-only access to `human_auth_policy_epochs`.
  ///
  /// An epoch is what the backend signed; it is never rewritten in place, which
  /// the schema enforces with triggers. This DAO deliberately declares no
  /// `@Update`, no `@Delete` and no `DELETE` query.
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertEpoch(OhacPolicyEpochEntity epoch);

  @Query(
    'SELECT * FROM human_auth_policy_epochs '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence = :sequence '
    'LIMIT 1',
  )
  Future<OhacPolicyEpochEntity?> findEpoch(
    String tenantId,
    String terminalId,
    int sequence,
  );

  @Query(
    'SELECT * FROM human_auth_policy_epochs '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'ORDER BY sequence DESC LIMIT 1',
  )
  Future<OhacPolicyEpochEntity?> findNewestEpoch(
    String tenantId,
    String terminalId,
  );

  /// The contiguous-delivery read: every epoch after a known sequence,
  /// ascending, so the terminal can walk the tenant-global chain in order.
  @Query(
    'SELECT * FROM human_auth_policy_epochs '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence > :sequence '
    'ORDER BY sequence ASC',
  )
  Future<List<OhacPolicyEpochEntity>> findEpochsAfter(
    String tenantId,
    String terminalId,
    int sequence,
  );

  /// Append-only access to `human_auth_policy_entries`, and the only writer of
  /// entry rows.
  ///
  /// An entry is what its epoch says about a user; like the epoch it is never
  /// rewritten in place, which the schema enforces with triggers. This DAO
  /// deliberately declares no `@Update`, no `@Delete` and no `DELETE` query.
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertEntries(List<OhacPolicyEntryEntity> entries);

  /// Ordered by `user_id` ascending, because the epoch contract sorts entries
  /// by `userId`.
  @Query(
    'SELECT * FROM human_auth_policy_entries '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence = :sequence '
    'ORDER BY user_id ASC',
  )
  Future<List<OhacPolicyEntryEntity>> findEntries(
    String tenantId,
    String terminalId,
    int sequence,
  );

  /// The per-user lookup the authorization path needs. It resolves through the
  /// table's four-column primary key rather than through
  /// `index_human_auth_policy_entries_user`, because this query constrains all
  /// four of those columns and that index covers only the first three.
  @Query(
    'SELECT * FROM human_auth_policy_entries '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND sequence = :sequence '
    'AND user_id = :userId LIMIT 1',
  )
  Future<OhacPolicyEntryEntity?> findEntryForUser(
    String tenantId,
    String terminalId,
    int sequence,
    String userId,
  );

  // ---------------------------------------------------------------------------
  // Mutable state: terminal delivery state and per-user attempt state.
  // ---------------------------------------------------------------------------

  /// Access to `human_auth_terminal_state`, the terminal's mutable delivery
  /// state.
  ///
  /// A second insert for the same terminal aborts rather than silently
  /// overwriting a state that the revision compare-and-set protects.
  ///
  /// Transitions are compare-and-sets named after the design's transitions
  /// (design §5): each one writes only the fields that transition owns, keeps
  /// `revision = revision + 1` inside SQL, and returns the affected row count,
  /// where `0` means the expected revision did not match and nothing changed —
  /// including no partial application of the transition's own fields.
  @Query(
    'SELECT * FROM human_auth_terminal_state '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId LIMIT 1',
  )
  Future<OhacTerminalStateEntity?> findTerminalState(
    String tenantId,
    String terminalId,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertTerminalState(OhacTerminalStateEntity state);

  /// Creates the terminal's first state row when none exists, so the pull
  /// negotiation always has a floor to report (design §4.2).
  ///
  /// `human_auth_terminal_state` is a mutable singleton with NOT NULL columns
  /// and no DEFAULT on the fresh-install path, and no seeder creates the
  /// first row — without this, the `ohacFloorSequence` parameter has nothing
  /// to read. The row is keyed by caller-supplied [tenantId]/[terminalId]
  /// because the pull already sources identity from local config and the
  /// audit repository; deriving the row from an epoch envelope would let the
  /// row validate the envelope that created it.
  ///
  /// Idempotent by read-then-insert: an existing row — including one in any
  /// transition state — is left untouched, so this is safe to call on every
  /// pull. The sentinel values are the entity's own "absent" sentinels (see
  /// `OhacTerminalStateEntity`): `ACTIVE` at sequence 0 with the epoch
  /// chain's pre-epoch-1 floor, no candidate, no negotiated facts, no fault,
  /// no authorization history, revision 0, and the caller's timestamp.
  /// Positional arguments only: named arguments break Floor 1.5.0's
  /// generated `@transaction` code (AGENTS.md, design §13).
  @transaction
  Future<void> ensureTerminalState(
    String tenantId,
    String terminalId,
    String newUpdatedAt,
  ) async {
    final existing = await findTerminalState(tenantId, terminalId);
    if (existing != null) return;

    await insertTerminalState(
      OhacTerminalStateEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        state: OhacTerminalPhase.active.wire,
        activeSequence: 0,
        activeDigest: '',
        candidateSequence: 0,
        candidateDigest: '',
        serverFloorSequence: 0,
        serverFloorDigest: genesisDigest,
        negotiatedPosBuild: '',
        negotiatedBackendBuild: '',
        negotiatedPolicySchema: '',
        negotiatedAssertionSchema: '',
        integrityClassification: '',
        localAuthorizationSequence: 0,
        revision: 0,
        updatedAt: newUpdatedAt,
      ),
    );
  }

  /// Receive: the terminal takes the pending state and records the received
  /// candidate pair plus the four negotiated facts. This is the widest
  /// transition; it owns no other field — except the drain-gate deferral
  /// observation, which it RESETS: a new candidate (R's CAS) starts a new
  /// candidate lifetime, so the previous candidate's deferral reason and
  /// count are cleared here rather than anywhere downstream (design §5.1,
  /// B3).
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'RECEIVE_PENDING\', '
    'candidate_sequence = :candidateSequence, '
    'candidate_digest = :candidateDigest, '
    'negotiated_pos_build = :negotiatedPosBuild, '
    'negotiated_backend_build = :negotiatedBackendBuild, '
    'negotiated_policy_schema = :negotiatedPolicySchema, '
    'negotiated_assertion_schema = :negotiatedAssertionSchema, '
    'ack_deferral_reason = NULL, '
    'ack_deferral_count = NULL, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> receiveEpoch(
    String tenantId,
    String terminalId,
    int expectedRevision,
    int candidateSequence,
    String candidateDigest,
    String negotiatedPosBuild,
    String negotiatedBackendBuild,
    String negotiatedPolicySchema,
    String negotiatedAssertionSchema,
    String newUpdatedAt,
  );

  /// Submit: the acknowledgement is being sent; the candidate is untouched.
  /// A successful flip clears a prior drain-gate deferral reason; the
  /// deferral count persists as history (see `OhacTerminalStateEntity`).
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'ACK_SUBMITTING\', '
    'ack_deferral_reason = NULL, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> submitAcknowledgement(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String newUpdatedAt,
  );

  /// The §5.1 drain-gate deferral write (B3): record the §10 reason and
  /// bump the retry-bound counter in one CAS, WITHOUT flipping. The count is
  /// incremented inside SQL from whatever the row holds, so a concurrent
  /// transition can never lose an increment.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET ack_deferral_reason = :reasonCode, '
    'ack_deferral_count = COALESCE(ack_deferral_count, 0) + 1, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> deferAcknowledgement(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String reasonCode,
    String newUpdatedAt,
  );

  /// Confirm: the candidate is promoted to active and cleared back to its
  /// sentinels (`0` / `''`, design §4.2); the state becomes active.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'ACTIVE\', '
    'active_sequence = candidate_sequence, '
    'active_digest = candidate_digest, '
    'candidate_sequence = 0, '
    "candidate_digest = '', "
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> confirmAcknowledgement(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String newUpdatedAt,
  );

  /// Record floor: the server-confirmed position, both halves together.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET server_floor_sequence = :serverFloorSequence, '
    'server_floor_digest = :serverFloorDigest, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> recordServerFloor(
    String tenantId,
    String terminalId,
    int expectedRevision,
    int serverFloorSequence,
    String serverFloorDigest,
    String newUpdatedAt,
  );

  /// Transaction **C** of design §5 step 4: record the ack receipt and
  /// promote the candidate to ACTIVE in one atomic local write.
  ///
  /// §5 step 4: "The POS atomically records the receipt and promotes
  /// candidate to ACTIVE. Only then can it authorize. If the final local
  /// write fails, retrying the same ack returns the receipt." The receipt
  /// of record is one row after C: the governing pair, the server floor,
  /// the receipt ID and the negotiated backend build all read back from
  /// `human_auth_terminal_state` (the backend 201 response carries no
  /// `serverBuild`, so §5.4's server build is the negotiated
  /// `epoch.publisherBackendBuild` already persisted by R).
  ///
  /// The guards are read before anything is written: only a terminal in
  /// `ACK_SUBMITTING` may confirm, and only the exact server-confirmed
  /// candidate pair may be promoted — a confirmation of a claim the local
  /// candidate does not hold would promote a policy row the server never
  /// signed for this terminal. The revision CAS on the UPDATE itself is the
  /// atomicity: `0` affected rows means a concurrent transition won the row
  /// and NOTHING changed, which — like R and S — throws so the caller
  /// retries the identical acknowledgement instead of confirming a
  /// half-moved state.
  ///
  /// This transaction supersedes `confirmAcknowledgement` and
  /// `recordServerFloor` in production: the receipt, promotion, floor and
  /// CAS move belongs to ONE write, not three. The two frozen single-field
  /// transitions are kept untouched for their pinned tests; no production
  /// caller remains for either.
  ///
  /// One lifecycle fact is appended per confirmed ack (`OHAC_ACK_CONFIRMED`);
  /// the append-only log is forensic evidence, not the receipt of record.
  /// Positional arguments only: named arguments break Floor 1.5.0's
  /// generated `@transaction` code (AGENTS.md, design §13).
  @transaction
  Future<void> confirmAcknowledgementWithReceipt(
    String tenantId,
    String terminalId,
    int expectedRevision,
    int expectedSequence,
    String expectedDigest,
    String receiptId,
    int serverFloorSequence,
    String serverFloorDigest,
    String newUpdatedAt,
  ) async {
    final current = await findTerminalState(tenantId, terminalId);
    if (current == null) {
      throw StateError('OHAC terminal state is missing for $terminalId');
    }
    if (current.state != OhacTerminalPhase.ackSubmitting.wire) {
      throw StateError(
        'OHAC confirm requires ${OhacTerminalPhase.ackSubmitting.wire}, '
        'found ${current.state}',
      );
    }
    if (current.candidateSequence != expectedSequence ||
        current.candidateDigest != expectedDigest) {
      throw StateError(
        'OHAC confirm claim (sequence $expectedSequence) does not match the '
        'candidate on record '
        '(${current.candidateSequence})',
      );
    }

    final confirmed = await confirmWithReceipt(
      tenantId,
      terminalId,
      expectedRevision,
      serverFloorSequence,
      serverFloorDigest,
      receiptId,
      newUpdatedAt,
    );
    if (confirmed != 1) {
      throw StateError(
        'OHAC confirm lost terminal-state revision $expectedRevision',
      );
    }

    await appendEvent(
      OhacLocalEventEntity(
        id: const Uuid().v4(),
        tenantId: tenantId,
        terminalId: terminalId,
        eventType: OhacLocalEventType.ackConfirmed,
        sequence: expectedSequence,
        payload: jsonEncode({
          'receiptId': receiptId,
          'fromFloorSequence': current.serverFloorSequence,
          'toFloorSequence': serverFloorSequence,
        }),
        createdAt: newUpdatedAt,
      ),
    );
  }

  /// The CAS write behind [confirmAcknowledgementWithReceipt]: promotion,
  /// candidate clear, floor, receipt and revision move in one UPDATE whose
  /// WHERE pins the expected revision.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'ACTIVE\', '
    'active_sequence = candidate_sequence, '
    'active_digest = candidate_digest, '
    'candidate_sequence = 0, '
    "candidate_digest = '', "
    'server_floor_sequence = :serverFloorSequence, '
    'server_floor_digest = :serverFloorDigest, '
    'ack_receipt_id = :receiptId, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> confirmWithReceipt(
    String tenantId,
    String terminalId,
    int expectedRevision,
    int serverFloorSequence,
    String serverFloorDigest,
    String receiptId,
    String newUpdatedAt,
  );

  /// Mark integrity loss: the loss state and the classification together.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET state = \'INTEGRITY_LOSS\', '
    'integrity_classification = :integrityClassification, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'AND revision = :expectedRevision',
  )
  Future<int?> markIntegrityLoss(
    String tenantId,
    String terminalId,
    int expectedRevision,
    String integrityClassification,
    String newUpdatedAt,
  );

  /// Access to `human_auth_attempt_state`, the durable per-user PIN attempt
  /// state keyed the same way the backend keys its attempt reset generation.
  ///
  /// State changes go through `updateAttemptStateIfRevisionMatches`, whose
  /// affected-row count is the CAS contract: `0` means a lost race.
  @Query(
    'SELECT * FROM human_auth_attempt_state '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND user_id = :userId '
    'LIMIT 1',
  )
  Future<OhacAttemptStateEntity?> findAttemptState(
    String tenantId,
    String terminalId,
    String userId,
  );

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertAttemptState(OhacAttemptStateEntity state);

  /// Compare-and-set on `revision`. The increment is derived inside SQL so it
  /// cannot be applied wrongly; returns the affected row count, where `0`
  /// means the expected revision did not match and nothing changed.
  ///
  /// `locked_until` is nullable in the schema but Floor 1.5.0 forbids nullable
  /// query parameters, so the lock is cleared by passing an empty string
  /// (`NULLIF` stores `NULL`); `locked_until` is always an ISO-8601 instant,
  /// never an empty string, so the sentinel is unambiguous.
  @Query(
    'UPDATE human_auth_attempt_state '
    'SET failure_timestamps = :newFailureTimestamps, '
    'locked_until = NULLIF(:newLockedUntil, \'\'), '
    'reset_generation = :newResetGeneration, '
    'local_authorization_sequence = :newLocalAuthorizationSequence, '
    'revision = revision + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId AND user_id = :userId '
    'AND revision = :expectedRevision',
  )
  Future<int?> updateAttemptStateIfRevisionMatches(
    String tenantId,
    String terminalId,
    String userId,
    int expectedRevision,
    String newFailureTimestamps,
    String newLockedUntil,
    String newResetGeneration,
    int newLocalAuthorizationSequence,
    String newUpdatedAt,
  );

  // ---------------------------------------------------------------------------
  // The two halves of the atomic candidate (design §5 step 2), split because
  // §5.1's drain gate sits between them.
  // ---------------------------------------------------------------------------

  /// Transaction **R** of design §5 step 2: write the complete candidate and
  /// leave the terminal in `RECEIVE_PENDING` with its candidate pair and the
  /// four negotiated facts.
  ///
  /// Split from the submit half because a deferred terminal must **stay** in
  /// `RECEIVE_PENDING` with the old epoch still governing (§5.1), which is only
  /// possible if the receive is durable before the `ACK_SUBMITTING` flip is
  /// gated. Everything here is one Floor `@transaction` with positional
  /// arguments (§13 and `AGENTS.md`), so a crash leaves either the whole
  /// candidate plus the pending flip or nothing at all — never a half-written
  /// epoch presented for authorisation.
  ///
  /// The guard is read before anything is written: only a terminal in `ACTIVE`
  /// may receive, and only the exact next sequence may be accepted. Both rules
  /// belong to §5 step 1's acceptance contract; re-checking them at the write
  /// boundary is what keeps a caller that skipped `evaluateDeliveredEpoch` from
  /// clobbering a pending candidate or landing a gap.
  ///
  /// Verification is a read-back against what the caller already validated
  /// rather than a second parse of the envelope: the envelope's digest was
  /// checked by `parseStaffPolicyEpochV1` before this transaction opened, so
  /// this only fails when the persisted rows disagree with that verdict or when
  /// the flip loses its revision race.
  ///
  /// A duplicate receive is not this method's decision — `decideEpochReceive`
  /// returns `OhacReceiveDuplicate` for a candidate already on record — so a
  /// conflicting primary key here is a genuine conflict and throws.
  @transaction
  Future<void> receiveCandidateEpoch(
    OhacPolicyEpochEntity epoch,
    List<OhacPolicyEntryEntity> entries,
    int expectedEntryCount,
    String expectedDigest,
    int expectedRevision,
    String negotiatedPosBuild,
    String negotiatedBackendBuild,
    String negotiatedPolicySchema,
    String negotiatedAssertionSchema,
    String newUpdatedAt,
  ) async {
    final current = await findTerminalState(epoch.tenantId, epoch.terminalId);
    if (current == null) {
      throw StateError(
        'OHAC terminal state is missing for ${epoch.terminalId}; there is no '
        'state to put the candidate into',
      );
    }
    if (current.state != OhacTerminalPhase.active.wire) {
      throw StateError(
        'OHAC receive requires ${OhacTerminalPhase.active.wire}, found '
        '${current.state}',
      );
    }
    if (epoch.sequence != current.activeSequence + 1) {
      throw StateError(
        'OHAC candidate sequence ${epoch.sequence} is not the next sequence '
        'after ${current.activeSequence}',
      );
    }

    await insertEpoch(epoch);
    await insertEntries(entries);

    final stored = await findEpoch(
      epoch.tenantId,
      epoch.terminalId,
      epoch.sequence,
    );
    if (stored == null || stored.digest != expectedDigest) {
      throw StateError(
        'OHAC candidate for sequence ${epoch.sequence} was not written with '
        'the digest the caller verified',
      );
    }
    final storedEntries = await findEntries(
      epoch.tenantId,
      epoch.terminalId,
      epoch.sequence,
    );
    if (storedEntries.length != expectedEntryCount) {
      throw StateError(
        'OHAC candidate for sequence ${epoch.sequence} holds '
        '${storedEntries.length} entries, expected $expectedEntryCount',
      );
    }

    final flipped = await receiveEpoch(
      epoch.tenantId,
      epoch.terminalId,
      expectedRevision,
      epoch.sequence,
      expectedDigest,
      negotiatedPosBuild,
      negotiatedBackendBuild,
      negotiatedPolicySchema,
      negotiatedAssertionSchema,
      newUpdatedAt,
    );
    if (flipped != 1) {
      throw StateError(
        'OHAC receive lost terminal-state revision $expectedRevision',
      );
    }
  }

  /// Transaction **S** of design §5 step 2: flip to `ACK_SUBMITTING`, apply the
  /// epoch's explicit higher `attemptResetGeneration` resets, and append one
  /// local fact per applied reset.
  ///
  /// **The drain gate is this flip's last precondition (B3, design §5.1
  /// line 176, §11.5 decision 31, review-ledger R1-008).** The registry
  /// [ohacOutboxRegistry] is a positional parameter because Floor 1.5.0's
  /// generated `@transaction` code breaks on named arguments (§13 and
  /// `AGENTS.md`) — the same reason `appendForensicLog` takes its closure
  /// positionally. On a deferral the terminal stays `RECEIVE_PENDING` with
  /// the old epoch governing and authorization NOT frozen (§5.1 line 180):
  /// the deferral reason and retry-bound counter move in one CAS, the
  /// deferral event appends in the SAME transaction, and the method returns
  /// without flipping — the caller detects the deferral by re-reading the
  /// state and retries on the next sync cycle. On a pass (or over
  /// quarantine — §5.1 line 182 excludes quarantined items from the gate)
  /// the flip commits and clears any prior deferral reason; the count
  /// persists as history. Receiving a NEW candidate resets both in R's own
  /// CAS (`receiveEpoch`), because the count belongs to one candidate's
  /// lifetime.
  ///
  /// A replay while already submitted for the same candidate is a no-op rather
  /// than an error: re-flipping would bump the revision and re-append identical
  /// forensic facts. Any other precondition that does not hold throws, so the
  /// transaction rolls back whole — §5 requires recovery to converge on one
  /// complete state, never a partially applied epoch.
  ///
  /// A generation that cannot be ordered fails closed (see
  /// [_parseAttemptResetGeneration]) instead of being skipped, because a reset
  /// exists to release a lockout and a silently dropped one would leave an
  /// operator believing an authorised reset took effect.
  @transaction
  Future<void> submitCandidateAcknowledgement(
    String tenantId,
    String terminalId,
    int expectedRevision,
    int expectedCandidateSequence,
    String expectedCandidateDigest,
    String newUpdatedAt,
    OhacOutboxRegistry ohacOutboxRegistry,
  ) async {
    final current = await findTerminalState(tenantId, terminalId);
    if (current == null) {
      throw StateError('OHAC terminal state is missing for $terminalId');
    }
    if (current.state == OhacTerminalPhase.ackSubmitting.wire &&
        current.candidateSequence == expectedCandidateSequence &&
        current.candidateDigest == expectedCandidateDigest) {
      return;
    }
    if (current.state != OhacTerminalPhase.receivePending.wire) {
      throw StateError(
        'OHAC submit requires ${OhacTerminalPhase.receivePending.wire}, found '
        '${current.state}',
      );
    }
    if (current.candidateSequence != expectedCandidateSequence ||
        current.candidateDigest != expectedCandidateDigest) {
      throw StateError(
        'OHAC submit candidate sequence/digest does not match the candidate '
        'on record',
      );
    }

    // The §5.1 drain gate (B3, decision 31): the flip's LAST precondition.
    // "A terminal MUST NOT enter `ACK_SUBMITTING` ... while any local outbox
    // that emits `ohac.assertion.v1` payloads still holds an unconsumed
    // assertion attributed to any sequence ≤ n" (§5.1 line 176) — the gate
    // is consulted inside this same transaction, so the deferral record and
    // the deferral event commit atomically or not at all, and the pull path
    // cannot bypass the gate. With an empty registry the gate passes and the
    // flip behaves exactly as it did before B3 (decision 31's inert
    // structure; the census found no assertion-bearing outbox to register).
    final gate = await ohacOutboxRegistry.evaluate(
      candidateSequence: expectedCandidateSequence,
    );
    switch (gate.outcome) {
      case OhacDrainGateOutcome.deferred:
        // §5.1 line 180: the epoch stays RECEIVE/PENDING, epoch n continues
        // to govern, authorization is not frozen. Record the §10 reason and
        // bump the retry-bound counter, append the deferral fact, and return
        // WITHOUT flipping — the caller retries on the next sync cycle.
        final deferred = await deferAcknowledgement(
          tenantId,
          terminalId,
          expectedRevision,
          gate.reasonCode,
          newUpdatedAt,
        );
        if (deferred != 1) {
          throw StateError(
            'OHAC submit lost terminal-state revision $expectedRevision '
            'while deferring on the drain gate',
          );
        }
        await appendEvent(
          OhacLocalEventEntity(
            id: const Uuid().v4(),
            tenantId: tenantId,
            terminalId: terminalId,
            eventType: OhacLocalEventType.ackDeferredOutbox,
            sequence: expectedCandidateSequence,
            payload: jsonEncode({
              'candidateSequence': expectedCandidateSequence,
              'blockingOutboxIds': gate.blockingOutboxIds,
              'retryCount': (current.ackDeferralCount ?? 0) + 1,
              'retryBoundReached':
                  (current.ackDeferralCount ?? 0) + 1 >=
                      OhacOutboxRegistry.ohacAckDeferredRetryBound,
            }),
            createdAt: newUpdatedAt,
          ),
        );
        return;
      case OhacDrainGateOutcome.passed:
      case OhacDrainGateOutcome.quarantined:
        // §5.1 line 182: quarantined items are excluded from the gate, so
        // `quarantined` is an effective pass — the flip proceeds exactly as
        // `passed`; the distinct outcome is observability only ("never
        // silent"), consumed by the registry's decision, not persisted here.
        break;
    }

    final flipped = await submitAcknowledgement(
      tenantId,
      terminalId,
      expectedRevision,
      newUpdatedAt,
    );
    if (flipped != 1) {
      throw StateError(
        'OHAC submit lost terminal-state revision $expectedRevision',
      );
    }

    final entries = await findEntries(
      tenantId,
      terminalId,
      expectedCandidateSequence,
    );
    for (final entry in entries) {
      final attempt = await findAttemptState(
        tenantId,
        terminalId,
        entry.userId,
      );
      // No attempt row means no lockout to release: §6 resets attempts, it
      // does not create them.
      if (attempt == null) continue;

      final storedGeneration = _parseAttemptResetGeneration(
        attempt.resetGeneration,
        entry.userId,
      );
      final candidateGeneration = _parseAttemptResetGeneration(
        entry.attemptResetGeneration,
        entry.userId,
      );
      // Replays and out-of-order generations are no-ops (design §6); only an
      // explicit advance releases the lockout.
      if (candidateGeneration <= storedGeneration) continue;

      final updated = await updateAttemptStateIfRevisionMatches(
        tenantId,
        terminalId,
        entry.userId,
        attempt.revision,
        '[]',
        '',
        entry.attemptResetGeneration,
        attempt.localAuthorizationSequence,
        newUpdatedAt,
      );
      if (updated != 1) {
        throw StateError(
          'OHAC attempt reset lost the revision for ${entry.userId}',
        );
      }

      await appendEvent(
        OhacLocalEventEntity(
          id: const Uuid().v4(),
          tenantId: tenantId,
          terminalId: terminalId,
          eventType: OhacLocalEventType.adminAttemptResetApplied,
          sequence: expectedCandidateSequence,
          payload: jsonEncode({
            'userId': entry.userId,
            'fromGeneration': attempt.resetGeneration,
            'toGeneration': entry.attemptResetGeneration,
          }),
          createdAt: newUpdatedAt,
        ),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Durable PIN authorization transaction (design §6, Slice C).
  // ---------------------------------------------------------------------------

  /// The one §6 authorization transaction: verify ACTIVE state and entry
  /// eligibility, read the attempt row, enforce the lockout, compare the PIN
  /// through [pinMatches] (the plaintext PIN never leaves the caller's
  /// closure; it is never a SQL argument), record the outcome, increment the
  /// terminal-local authorization sequence, append the audit linkage, and
  /// return the assertion inputs — all in ONE atomic write.
  ///
  /// Positional arguments only: named arguments break Floor 1.5.0's generated
  /// `@transaction` code (§13, AGENTS.md). [now] is the caller's clock instant.
  /// [forceAttemptCasLoss] is a TEST-ONLY seam (never pass true in
  /// production): it makes the attempt-state write target a revision that
  /// cannot match, deterministically raising the REAL CAS loss inside the
  /// serialized transaction — the proof §13 requires that concurrency
  /// tests cannot provide.
  @transaction
  Future<OhacPinAuthorizationOutcome> authorizePinOperation(
    String tenantId,
    String terminalId,
    String userId,
    DateTime now,
    bool Function(String verifierEncoded) pinMatches,
    bool forceAttemptCasLoss,
  ) async {
    final state = await findTerminalState(tenantId, terminalId);
    if (state == null) {
      throw StateError(
        'OHAC authorization requires a terminal state for $terminalId',
      );
    }
    if (state.state != OhacTerminalPhase.active.wire ||
        state.activeSequence < 1 ||
        state.activeDigest.isEmpty) {
      throw StateError(
        'OHAC authorization requires an acknowledged ACTIVE epoch; found '
        '${state.state} at sequence ${state.activeSequence}',
      );
    }
    final epoch = await findEpoch(tenantId, terminalId, state.activeSequence);
    if (epoch == null) {
      throw StateError(
        'OHAC authorization requires the governing epoch '
        '${state.activeSequence} to be on record',
      );
    }
    final entry = await findEntryForUser(
      tenantId,
      terminalId,
      state.activeSequence,
      userId,
    );
    if (entry == null || entry.status != OhacPolicyStatus.active) {
      throw StateError(
        'OHAC authorization requires an ACTIVE epoch entry for $userId',
      );
    }

    final attempt = await findAttemptState(tenantId, terminalId, userId);
    final newUpdatedAt = now.toUtc().toIso8601String();

    // §6 backoff: a lockout still in force denies WITHOUT a bcrypt check and
    // without touching any state — the lockout already exists, and mutating
    // it here would be an unauthorized write.
    if (OhacAttemptPolicy.isLocked(attempt?.lockedUntil, now)) {
      return OhacPinAuthorizationOutcome.denied(
        OhacAuthorizationDenialReason.attemptLocked,
        currentLocalAuthorizationSequence: state.localAuthorizationSequence,
      );
    }

    // The plaintext PIN never leaves the caller's closure: this DAO receives
    // only the comparison verdict, so the PIN can never reach a SQL argument,
    // a log line, or a persisted field (design §6).
    final pinOk = pinMatches(entry.verifierEncoded);
    if (!pinOk) {
      final decision = OhacAttemptPolicy.recordFailure(
        storedFailureTimestamps: attempt?.failureTimestamps ?? '[]',
        now: now,
      );
      final resetGeneration =
          attempt?.resetGeneration ?? entry.attemptResetGeneration;
      await _upsertAttemptState(
        tenantId: tenantId,
        terminalId: terminalId,
        userId: userId,
        existing: attempt,
        newFailureTimestamps:
            OhacAttemptPolicy.encodeFailureTimestamps(
                decision.failureTimestamps),
        newLockedUntil: decision.lockedUntil?.toUtc().toIso8601String() ?? '',
        newResetGeneration: resetGeneration,
        newLocalAuthorizationSequence:
            attempt?.localAuthorizationSequence ?? 0,
        newUpdatedAt: newUpdatedAt,
        forceCasLoss: forceAttemptCasLoss,
      );
      return OhacPinAuthorizationOutcome.denied(
        OhacAuthorizationDenialReason.pinMismatch,
        currentLocalAuthorizationSequence: state.localAuthorizationSequence,
      );
    }

    // §6 success path: reset the window, increment the terminal-local
    // authorization sequence, and append the audit linkage — all inside this
    // same transaction, so the stamped sequence and the reset commit or roll
    // back together.
    final bumped = await bumpTerminalAuthorizationSequence(
      tenantId,
      terminalId,
      newUpdatedAt,
    );
    if (bumped != 1) {
      throw StateError(
        'OHAC authorization could not increment the terminal-local '
        'authorization sequence for $terminalId',
      );
    }
    final stampedState = await findTerminalState(tenantId, terminalId);
    if (stampedState == null) {
      throw StateError('OHAC terminal state vanished inside its own write');
    }
    final newSequence = stampedState.localAuthorizationSequence;

    // The audit linkage (§7.1 `localAuditId` / `localAuditEntryHash`): the
    // appended reset event's id and the digest over its canonical payload.
    // The payload carries ids and the stamped sequence only — never a PIN, a
    // verifier, or an assertion body (design §12).
    final eventId = const Uuid().v4();
    final payloadJson = jsonEncode({
      'userId': userId,
      'epochSequence': '${state.activeSequence}',
      'localAuthorizationSequence': '$newSequence',
    });
    final canonicalPayload = canonicalizeOhac(
      Uint8List.fromList(utf8.encode(payloadJson)),
    );
    if (canonicalPayload is! OhacSuccess<Uint8List>) {
      throw StateError(
        'OHAC audit payload failed canonicalization; refusing to append '
        'unlinked audit evidence',
      );
    }
    final entryHash = ohacDigest(canonicalPayload.value);
    await appendEvent(
      OhacLocalEventEntity(
        id: eventId,
        tenantId: tenantId,
        terminalId: terminalId,
        eventType: OhacLocalEventType.pinAttemptResetSuccess,
        sequence: state.activeSequence,
        payload: payloadJson,
        createdAt: newUpdatedAt,
      ),
    );

    await _upsertAttemptState(
      tenantId: tenantId,
      terminalId: terminalId,
      userId: userId,
      existing: attempt,
      newFailureTimestamps: '[]',
      newLockedUntil: '',
      newResetGeneration: attempt?.resetGeneration ??
          entry.attemptResetGeneration,
      newLocalAuthorizationSequence: newSequence,
      newUpdatedAt: newUpdatedAt,
      forceCasLoss: forceAttemptCasLoss,
    );

    return OhacPinAuthorizationOutcome.authorized(
      newLocalAuthorizationSequence: newSequence,
      auditId: eventId,
      auditEntryHash: entryHash,
    );
  }

  /// Inserts or compare-and-set updates the attempt row. A new row inserts
  /// with revision 0; an existing row CASes against its read revision. Both
  /// failures mean a concurrent writer moved the row inside this same
  /// serialized transaction window, so they surface as a CAS loss: the whole
  /// authorization transaction rolls back and the caller retries fresh
  /// (design §6, §11.5 decision 34).
  Future<void> _upsertAttemptState({
    required String tenantId,
    required String terminalId,
    required String userId,
    required OhacAttemptStateEntity? existing,
    required String newFailureTimestamps,
    required String newLockedUntil,
    required String newResetGeneration,
    required int newLocalAuthorizationSequence,
    required String newUpdatedAt,
    bool forceCasLoss = false,
  }) async {
    if (existing == null) {
      // Test-only forced loss: a fresh insert has no prior revision to CAS
      // against, so the only faithful simulation of a lost race is the
      // exception itself. Production never passes [forceCasLoss].
      if (forceCasLoss) throw OhacAttemptCasLostException(userId);
      try {
        await insertAttemptState(
          OhacAttemptStateEntity(
            tenantId: tenantId,
            terminalId: terminalId,
            userId: userId,
            failureTimestamps: newFailureTimestamps,
            lockedUntil: newLockedUntil.isEmpty ? null : newLockedUntil,
            resetGeneration: newResetGeneration,
            localAuthorizationSequence: newLocalAuthorizationSequence,
            revision: 0,
            updatedAt: newUpdatedAt,
          ),
        );
      } on Exception {
        throw OhacAttemptCasLostException(userId);
      }
      return;
    }

    final updated = await updateAttemptStateIfRevisionMatches(
      tenantId,
      terminalId,
      userId,
      // Test-only forced loss: writing against a revision that cannot match
      // makes the REAL CAS UPDATE return 0 and raise the REAL CAS-loss
      // exception — the same code path a concurrent writer would trigger,
      // reached deterministically inside the serialized transaction.
      forceCasLoss ? existing.revision + 999999 : existing.revision,
      newFailureTimestamps,
      newLockedUntil,
      newResetGeneration,
      newLocalAuthorizationSequence,
      newUpdatedAt,
    );
    if (updated != 1) {
      throw OhacAttemptCasLostException(userId);
    }
  }

  /// Atomically increments the authoritative terminal-local authorization
  /// sequence (design §6, tracker ruling 3/7) and returns the affected row
  /// count. The revision CAS of the epoch protocol is deliberately NOT
  /// touched: the counter is not a transition-owned field, and authorization
  /// must not interfere with the concurrent epoch state machine.
  @Query(
    'UPDATE human_auth_terminal_state '
    'SET local_authorization_sequence = local_authorization_sequence + 1, '
    'updated_at = :newUpdatedAt '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId',
  )
  Future<int?> bumpTerminalAuthorizationSequence(
    String tenantId,
    String terminalId,
    String newUpdatedAt,
  );

  // ---------------------------------------------------------------------------
  // Append-only event log (forensic evidence).
  // ---------------------------------------------------------------------------

  /// Append-only access to `human_auth_local_events`.
  ///
  /// The event log is forensic evidence; it is never rewritten or erased in
  /// place, which the schema enforces with triggers. This DAO deliberately
  /// declares no `@Update`, no `@Delete` and no `DELETE` query.
  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> appendEvent(OhacLocalEventEntity event);

  /// Ascending by `created_at` then `id`, so the order is deterministic when
  /// two events share a timestamp; served by
  /// `index_human_auth_local_events_terminal`.
  @Query(
    'SELECT * FROM human_auth_local_events '
    'WHERE tenant_id = :tenantId AND terminal_id = :terminalId '
    'ORDER BY created_at ASC, id ASC',
  )
  Future<List<OhacLocalEventEntity>> findEventsForTerminal(
    String tenantId,
    String terminalId,
  );
}

/// The immutable outcome of one authorization transaction (design §6):
/// either the stamped assertion inputs or a denial reason — never both, and
/// never PIN or verifier material.
final class OhacPinAuthorizationOutcome {
  /// Whether the PIN check passed and the transaction committed.
  final bool authorized;

  /// A stable `OhacAuthorizationDenialReason` value when [authorized] is
  /// false; `null` otherwise.
  final String? denialReason;

  /// The terminal-local authorization sequence stamped by this transaction
  /// (the incremented value on success; the untouched current value on a
  /// denial).
  final int localAuthorizationSequence;

  /// The audit linkage stamped into the assertion: the appended local event's
  /// id and the digest over its canonical payload (§7.1 `localAuditId` /
  /// `localAuditEntryHash`). Empty on a denial.
  final String localAuditId;
  final String localAuditEntryHash;

  const OhacPinAuthorizationOutcome._({
    required this.authorized,
    required this.denialReason,
    required this.localAuthorizationSequence,
    required this.localAuditId,
    required this.localAuditEntryHash,
  });

  const OhacPinAuthorizationOutcome.authorized({
    required int newLocalAuthorizationSequence,
    required String auditId,
    required String auditEntryHash,
  }) : this._(
          authorized: true,
          denialReason: null,
          localAuthorizationSequence: newLocalAuthorizationSequence,
          localAuditId: auditId,
          localAuditEntryHash: auditEntryHash,
        );

  const OhacPinAuthorizationOutcome.denied(
    String reason, {
    required int currentLocalAuthorizationSequence,
  }) : this._(
          authorized: false,
          denialReason: reason,
          localAuthorizationSequence: currentLocalAuthorizationSequence,
          localAuditId: '',
          localAuditEntryHash: '',
        );
}

/// Thrown when the attempt-state revision compare-and-set loses its race
/// (design §6, §11.5 decision 34). The whole authorization transaction rolls
/// back — the caller retries from a fresh read; there is no partial state to
/// resume.
class OhacAttemptCasLostException implements Exception {
  final String userId;

  const OhacAttemptCasLostException(this.userId);

  @override
  String toString() =>
      'OhacAttemptCasLostException: attempt-state revision lost for $userId';
}

/// Orders `attemptResetGeneration`, which the epoch contract defines as a a
/// decimal string (design §7.2).
///
/// A value that cannot be ordered fails closed instead of being skipped: the
/// reset exists to release a lockout, so dropping one silently would leave an
/// operator believing an authorised reset took effect when it did not. Nothing
/// written by the contract's own parser can reach this path — it already
/// requires `isDecimalString` — so a failure here means the stored row itself
/// is corrupt, which is exactly what must not be papered over.
BigInt _parseAttemptResetGeneration(String value, String userId) {
  if (!isDecimalString(value)) {
    throw StateError(
      'OHAC attempt reset generation for $userId is not a decimal string; '
      'refusing to drop an administrative reset rather than skip it',
    );
  }
  return BigInt.parse(value);
}
