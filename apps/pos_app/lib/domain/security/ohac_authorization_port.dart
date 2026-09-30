import 'package:pos_app/data/models/human_authorization/assertion_v1.dart';

/// Stable local denial reasons for the §6/§7.1 authorization path (Slice C).
///
/// These are POS-local decision codes, distinct from the frozen wire-contract
/// codes in `OhacErrorCode`: they classify *why the local authorization
/// refused to create an assertion*, never a wire validation failure. They may
/// appear in observability (§12) but never carry PIN or verifier material.
abstract final class OhacAuthorizationDenialReason {
  /// A request field failed local shape validation (empty PIN, unsorted
  /// permissions, malformed digest...). Fail closed before anything is read.
  static const invalidRequest = 'OHAC_INVALID_REQUEST';

  /// No acknowledged ACTIVE epoch governs this terminal (state != `ACTIVE`,
  /// active sequence 0, or the epoch row is missing). Version alone never
  /// enables creation (§12, decision 24-29).
  static const noActiveEpoch = 'OHAC_NO_ACTIVE_EPOCH';

  /// The POS's own build (`readOhacPosBuild()`) does not exactly equal the
  /// governing epoch's `targetPosBuild` (exact-string cohort gate).
  static const buildMismatch = 'OHAC_BUILD_MISMATCH';

  /// R1-008 fail-closed coupler: the requesting outbox never registered as an
  /// assertion-bearing outbox, so its assertions would be invisible to the
  /// §5.1 drain gate.
  static const unregisteredOutbox = 'OHAC_UNREGISTERED_OUTBOX';

  /// The user has no policy entry in the governing epoch, or the entry is not
  /// `ACTIVE`. Reset never activates an ineligible user (§6).
  static const userNotEligible = 'OHAC_USER_NOT_ELIGIBLE';

  /// The operation's required permissions are not a subset of the entry's
  /// permissions.
  static const permissionDenied = 'OHAC_PERMISSION_DENIED';

  /// The durable attempt state still holds an unexpired lockout (§6). Denied
  /// without a bcrypt comparison.
  static const attemptLocked = 'OHAC_ATTEMPT_LOCKED';

  /// The bcrypt comparison failed; the failure is durably recorded in the
  /// rolling window (§6).
  static const pinMismatch = 'OHAC_PIN_MISMATCH';
}

/// One operation-bound authorization request (design §6, §7.1).
///
/// The plaintext [pin] lives in this object only for the duration of the
/// comparison inside the authorization transaction: it is never logged,
/// persisted, or passed into SQL.
final class OhacAuthorizationRequest {
  final String tenantId;
  final String terminalId;

  /// The PIN authorizer: the user whose epoch verifier is compared. Must be
  /// the id of an `ACTIVE` entry in the governing epoch.
  final String userId;

  /// The logged-in operator performing the protected operation. May equal
  /// [userId].
  final String operatorUserId;

  final String pin;

  /// The consumer outbox requesting the assertion. R1-008: it must already
  /// have registered with the drain-gate registry.
  final String outboxId;

  /// The transport credential material recorded on the assertion (§7.1).
  final String deviceCredentialId;
  final String deviceCredentialVersion;

  /// The permissions the operation uses; each must be covered by the
  /// authorizer's epoch entry. Sorted and unique, as the assertion requires.
  final List<String> permissionsUsed;

  /// The consumer-owned operation identity (§7.2: consumers own their
  /// operation schema and provide its already validated exact digest).
  final String operationType;
  final String operationSchema;
  final String operationDigest;

  const OhacAuthorizationRequest({
    required this.tenantId,
    required this.terminalId,
    required this.userId,
    required this.operatorUserId,
    required this.pin,
    required this.outboxId,
    required this.deviceCredentialId,
    required this.deviceCredentialVersion,
    required this.permissionsUsed,
    required this.operationType,
    required this.operationSchema,
    required this.operationDigest,
  });
}

/// The outcome of one operation-bound authorization attempt (§6): either an
/// immutable `ohac.assertion.v1` or a stable local denial reason — never a
/// partial assertion.
sealed class OhacAssertionResult {
  const OhacAssertionResult();
}

final class OhacAssertionAuthorized extends OhacAssertionResult {
  final OhacAssertionV1 assertion;

  const OhacAssertionAuthorized(this.assertion);
}

final class OhacAssertionDenied extends OhacAssertionResult {
  /// A stable [OhacAuthorizationDenialReason] value. Never a PIN, a verifier,
  /// or any assertion body material (§12 observability).
  final String reason;

  const OhacAssertionDenied(this.reason);
}

/// The domain port the application service implements (Slice C, design §6).
///
/// This is deliberately NOT the legacy `authorizeOverride` boundary
/// (C-REFACTOR): login and `AuthRepositoryImpl`'s volatile `_pinFailures`
/// remain untouched.
abstract interface class OhacAuthorizationPort {
  /// Verifies a fresh local PIN for one operation and, on success, returns
  /// the operation-bound assertion. Denials are returned, never thrown; an
  /// thrown exception is an infrastructure fault (§6 CAS retry exhaustion),
  /// not an authorization decision.
  Future<OhacAssertionResult> authorizeOperation(
    OhacAuthorizationRequest request,
  );
}
