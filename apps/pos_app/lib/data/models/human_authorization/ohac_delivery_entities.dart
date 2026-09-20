import 'package:floor/floor.dart';

/// Local OHAC delivery persistence (design §4.2, §5, §6).
///
/// The two policy tables are immutable: an epoch is what the backend signed
/// and an entry is what that epoch says about a user, so neither is ever
/// rewritten in place. The terminal state, the attempt state and the local
/// event log are the mutable and append-only edges of the same feature, and
/// the migration installs triggers that enforce the difference rather than
/// trusting callers to remember it.

/// One applied policy epoch per terminal and sequence.
@Entity(
  tableName: 'human_auth_policy_epochs',
  primaryKeys: ['tenant_id', 'terminal_id', 'sequence'],
)
class OhacPolicyEpochEntity {
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'terminal_id')
  final String terminalId;

  /// Tenant-global, contiguous, and the terminal walks it one epoch at a time.
  final int sequence;

  /// The digest the backend signed over this per-terminal envelope.
  final String digest;

  @ColumnInfo(name: 'previous_sequence')
  final int previousSequence;

  @ColumnInfo(name: 'previous_digest')
  final String previousDigest;

  final String schema;

  @ColumnInfo(name: 'target_pos_build')
  final String targetPosBuild;

  @ColumnInfo(name: 'publisher_backend_build')
  final String publisherBackendBuild;

  @ColumnInfo(name: 'minimum_assertion_schema')
  final String minimumAssertionSchema;

  /// The canonical envelope exactly as received, so the digest can be
  /// re-verified without reconstructing anything.
  final String payload;

  @ColumnInfo(name: 'received_at')
  final String receivedAt;

  const OhacPolicyEpochEntity({
    required this.tenantId,
    required this.terminalId,
    required this.sequence,
    required this.digest,
    required this.previousSequence,
    required this.previousDigest,
    required this.schema,
    required this.targetPosBuild,
    required this.publisherBackendBuild,
    required this.minimumAssertionSchema,
    required this.payload,
    required this.receivedAt,
  });
}

/// One policy entry of an epoch, immutable like its epoch.
@Entity(
  tableName: 'human_auth_policy_entries',
  primaryKeys: ['tenant_id', 'terminal_id', 'sequence', 'user_id'],
)
class OhacPolicyEntryEntity {
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'terminal_id')
  final String terminalId;

  final int sequence;

  @ColumnInfo(name: 'user_id')
  final String userId;

  /// Explicit `ACTIVE` or `INACTIVE`; the verifier requires active status.
  final String status;

  final String role;

  /// The entry's permissions, canonicalized and sorted, as a JSON array.
  final String permissions;

  @ColumnInfo(name: 'verifier_algorithm')
  final String verifierAlgorithm;

  @ColumnInfo(name: 'verifier_format_version')
  final String verifierFormatVersion;

  /// The portable bcrypt verifier, never transformed. It is selected only
  /// inside the local authorization path and never logged or exposed.
  @ColumnInfo(name: 'verifier_encoded')
  final String verifierEncoded;

  @ColumnInfo(name: 'attempt_reset_generation')
  final String attemptResetGeneration;

  const OhacPolicyEntryEntity({
    required this.tenantId,
    required this.terminalId,
    required this.sequence,
    required this.userId,
    required this.status,
    required this.role,
    required this.permissions,
    required this.verifierAlgorithm,
    required this.verifierFormatVersion,
    required this.verifierEncoded,
    required this.attemptResetGeneration,
  });
}

/// The terminal's mutable delivery state: which epoch it is asserting under
/// and where it is in the acknowledgement cycle.
@Entity(
  tableName: 'human_auth_terminal_state',
  primaryKeys: ['tenant_id', 'terminal_id'],
)
class OhacTerminalStateEntity {
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'terminal_id')
  final String terminalId;

  /// `ACTIVE`, `RECEIVE_PENDING`, `ACK_SUBMITTING`, `ACK_CONFIRMED`, or
  /// `INTEGRITY_LOSS` (design §5).
  final String state;

  /// The sequence the terminal is currently asserting under.
  @ColumnInfo(name: 'active_sequence')
  final int activeSequence;

  @ColumnInfo(name: 'active_digest')
  final String activeDigest;

  /// The epoch the terminal has received but not yet acknowledged, together
  /// with the four negotiated facts (design §4.2).
  ///
  /// The "absent" value of each of these columns is a sentinel rather than
  /// NULL: epoch sequences start at 1, so `candidate_sequence` 0 means no
  /// candidate; a digest is `sha256:` plus 64 hex, so `''` means none; the
  /// floor of a terminal that acknowledged nothing is 0 / `GENESIS`, the
  /// epoch chain's own representation of the position before epoch 1; and an
  /// empty build, schema or classification means "never negotiated" / "no
  /// integrity fault observed".
  ///
  /// There is deliberately no CHECK constraint tying, say,
  /// `candidate_sequence` 0 to `candidate_digest` `''`: a Floor @Entity
  /// cannot express one, so a fresh install (built from this entity DDL)
  /// would lack it while an upgraded database had it — exactly the
  /// install-versus-upgrade drift that 0264fde had to repair. The pairing is
  /// a documented invariant enforced by tests instead.
  @ColumnInfo(name: 'candidate_sequence')
  final int candidateSequence;

  @ColumnInfo(name: 'candidate_digest')
  final String candidateDigest;

  /// The highest fully confirmed position the server has acknowledged.
  @ColumnInfo(name: 'server_floor_sequence')
  final int serverFloorSequence;

  @ColumnInfo(name: 'server_floor_digest')
  final String serverFloorDigest;

  /// The builds and schemas agreed during the last negotiation. Empty means
  /// never negotiated.
  @ColumnInfo(name: 'negotiated_pos_build')
  final String negotiatedPosBuild;

  @ColumnInfo(name: 'negotiated_backend_build')
  final String negotiatedBackendBuild;

  @ColumnInfo(name: 'negotiated_policy_schema')
  final String negotiatedPolicySchema;

  @ColumnInfo(name: 'negotiated_assertion_schema')
  final String negotiatedAssertionSchema;

  /// The integrity fault class observed, or `''` when none was observed.
  @ColumnInfo(name: 'integrity_classification')
  final String integrityClassification;

  /// Terminal-local authorization sequence, forced by the authority (design
  /// §4.2, §6). Note: `human_auth_attempt_state` also carries a column of
  /// this name with a per-user meaning; that duplication is a known open
  /// question deliberately left alone here.
  @ColumnInfo(name: 'local_authorization_sequence')
  final int localAuthorizationSequence;

  /// Monotonic revision for compare-and-set, so a concurrent transition can
  /// never silently overwrite another.
  final int revision;

  @ColumnInfo(name: 'updated_at')
  final String updatedAt;

  const OhacTerminalStateEntity({
    required this.tenantId,
    required this.terminalId,
    required this.state,
    required this.activeSequence,
    required this.activeDigest,
    required this.candidateSequence,
    required this.candidateDigest,
    required this.serverFloorSequence,
    required this.serverFloorDigest,
    required this.negotiatedPosBuild,
    required this.negotiatedBackendBuild,
    required this.negotiatedPolicySchema,
    required this.negotiatedAssertionSchema,
    required this.integrityClassification,
    required this.localAuthorizationSequence,
    required this.revision,
    required this.updatedAt,
  });
}

/// Durable per-user PIN attempt state (design §6), keyed the same way the
/// backend keys its attempt reset generation.
@Entity(
  tableName: 'human_auth_attempt_state',
  primaryKeys: ['tenant_id', 'terminal_id', 'user_id'],
)
class OhacAttemptStateEntity {
  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'terminal_id')
  final String terminalId;

  @ColumnInfo(name: 'user_id')
  final String userId;

  /// Recent failure instants as a JSON array, the rolling window the policy
  /// evaluates instead of a bare counter.
  @ColumnInfo(name: 'failure_timestamps')
  final String failureTimestamps;

  /// Set while the user is locked out; cleared on a successful verification.
  @ColumnInfo(name: 'locked_until')
  final String? lockedUntil;

  /// The attempt reset generation the backend published for this user.
  @ColumnInfo(name: 'reset_generation')
  final String resetGeneration;

  /// Monotonic local authorization sequence, incremented on each verified
  /// operation so a replayed or reordered record is detectable.
  @ColumnInfo(name: 'local_authorization_sequence')
  final int localAuthorizationSequence;

  final int revision;

  @ColumnInfo(name: 'updated_at')
  final String updatedAt;

  const OhacAttemptStateEntity({
    required this.tenantId,
    required this.terminalId,
    required this.userId,
    required this.failureTimestamps,
    required this.lockedUntil,
    required this.resetGeneration,
    required this.localAuthorizationSequence,
    required this.revision,
    required this.updatedAt,
  });
}

/// Append-only local event log (design §4.2).
@Entity(tableName: 'human_auth_local_events')
class OhacLocalEventEntity {
  @primaryKey
  final String id;

  @ColumnInfo(name: 'tenant_id')
  final String tenantId;

  @ColumnInfo(name: 'terminal_id')
  final String terminalId;

  @ColumnInfo(name: 'event_type')
  final String eventType;

  final int sequence;

  /// Event payload as JSON; never a PIN, a verifier, or an assertion body.
  final String payload;

  @ColumnInfo(name: 'created_at')
  final String createdAt;

  const OhacLocalEventEntity({
    required this.id,
    required this.tenantId,
    required this.terminalId,
    required this.eventType,
    required this.sequence,
    required this.payload,
    required this.createdAt,
  });
}
