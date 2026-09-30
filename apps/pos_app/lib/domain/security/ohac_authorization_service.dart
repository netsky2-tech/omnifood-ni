import 'dart:convert';

import 'package:bcrypt/bcrypt.dart';
import 'package:pos_app/data/models/human_authorization/assertion_v1.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/field_guards.dart';
import 'package:uuid/uuid.dart';

import '../../data/daos/human_authorization/ohac_delivery_dao.dart';
import 'ohac_assertion_emitter.dart';
import 'ohac_authorization_port.dart';
import 'ohac_observability.dart';
import 'ohac_outbox_registry.dart';

/// The POS application service for operation-bound local PIN authorization
/// (Slice C, design §6, spec `Fresh Local PIN Authorization`).
///
/// Orchestration order, all fail-closed:
///
/// 1. request shape validation;
/// 2. cohort/build gate — creation is disabled unless an acknowledged ACTIVE
///    epoch governs AND `readOhacPosBuild()` exactly equals the epoch's
///    `targetPosBuild` (§12, decisions 24-29; version alone never enables);
/// 3. R1-008 registry gate — the requesting outbox must be registered;
/// 4. epoch entry eligibility — `ACTIVE` status and required permissions;
/// 5. the durable attempt transaction (lockout check, bcrypt compare, state
///    update, sequence increment, audit linkage) with revision-CAS retry;
/// 6. assertion creation through the emitter.
///
/// This is deliberately NOT the legacy `authorizeOverride` boundary
/// (C-REFACTOR): login and `AuthRepositoryImpl`'s volatile `_pinFailures`
/// remain untouched.
class OhacAuthorizationService implements OhacAuthorizationPort {
  final OhacDeliveryDao ohacDeliveryDao;
  final OhacOutboxRegistry ohacOutboxRegistry;

  /// Reads the POS's own build (design §11.5 decision 30). A null answer —
  /// an unreadable build — fails the cohort gate closed.
  final Future<String?> Function() readPosBuild;

  /// Injectable clock for the attempt policy and assertion instant.
  final DateTime Function() clock;

  /// Injectable lowercase-UUID source for assertion and audit identity.
  final String Function() newId;

  /// The PIN comparison. Defaults to `BCrypt.checkpw`; the plaintext PIN
  /// exists only inside the comparison and is never logged, persisted, or
  /// passed into SQL (§6).
  final bool Function(String pin, String verifierEncoded) pinComparer;

  /// Bounded retries for the attempt-state revision CAS (design §6, §11.5
  /// decision 34). Each retry re-reads every fact; there is no partial
  /// application to resume.
  final int maxCasRetries;

  /// TEST-ONLY CAS-loss injection: when non-null, each attempt for which it
  /// returns true writes the attempt state against a revision that cannot
  /// match, so the REAL CAS loses and the REAL retry path runs — the proof
  /// §13 asks for that a `Future.wait` test cannot provide, because sqflite
  /// serializes transactions and a naive implementation would never lose the
  /// race. Production leaves it null.
  final bool Function()? debugForceAttemptCasLoss;

  /// Observability seam (design §12): receives one fact per authorization
  /// decision. Null (production default) emits nothing; facts carry
  /// IDs/digests/enums/counts only, never PIN/verifier/assertion material.
  final void Function(OhacObservabilityFact fact)? onFact;

  OhacAssertionEmitter get assertionEmitter =>
      OhacAssertionEmitter(ohacOutboxRegistry);

  OhacAuthorizationService({
    required this.ohacDeliveryDao,
    required this.ohacOutboxRegistry,
    required this.readPosBuild,
    DateTime Function()? clock,
    String Function()? newId,
    bool Function(String pin, String verifierEncoded)? pinComparer,
    this.maxCasRetries = 3,
    this.debugForceAttemptCasLoss,
    this.onFact,
  })  : clock = clock ?? DateTime.now,
        newId = newId ?? _defaultNewId,
        pinComparer = pinComparer ?? _defaultPinComparer;

  static String _defaultNewId() => const Uuid().v4();

  static bool _defaultPinComparer(String pin, String verifierEncoded) =>
      BCrypt.checkpw(pin, verifierEncoded);

  /// Emits one authorization-decision fact (design §12) when [onFact] is
  /// set; null emits nothing. Facts carry reason tokens and counts only.
  void _emitDecision(
    String outcome,
    String reason, {
    required String tenantId,
    required String terminalId,
    required int epochSequence,
    required String posBuild,
  }) {
    onFact?.call(ohacAuthorizationDecisionFact(
      outcome: outcome,
      reason: reason,
      tenantId: tenantId,
      terminalId: terminalId,
      epochSequence: epochSequence,
      posBuild: posBuild,
    ));
  }

  @override
  Future<OhacAssertionResult> authorizeOperation(
    OhacAuthorizationRequest request,
  ) async {
    // 1. Request shape validation — fail closed before anything is read and
    // before any durable state could be touched.
    final invalidFields = _validateRequest(request);
    if (invalidFields.isNotEmpty) {
      _emitDecision(
        'denied',
        OhacAuthorizationDenialReason.invalidRequest,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: 0,
        posBuild: '',
      );
      return const OhacAssertionDenied(
        OhacAuthorizationDenialReason.invalidRequest,
      );
    }

    // 2. Cohort/build gate (§12, decisions 24-29): creation is disabled
    // unless an acknowledged ACTIVE epoch governs AND the POS's own build
    // read at runtime exactly equals the epoch's target. Version alone
    // never enables; an unreadable build is a legacy client and denies.
    final posBuild = await readPosBuild();
    final terminalState = await ohacDeliveryDao.findTerminalState(
      request.tenantId,
      request.terminalId,
    );
    if (terminalState == null ||
        terminalState.state != 'ACTIVE' ||
        terminalState.activeSequence < 1 ||
        terminalState.activeDigest.isEmpty) {
      _emitDecision(
        'denied',
        OhacAuthorizationDenialReason.noActiveEpoch,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: 0,
        posBuild: posBuild ?? '',
      );
      return const OhacAssertionDenied(
        OhacAuthorizationDenialReason.noActiveEpoch,
      );
    }
    final epoch = await ohacDeliveryDao.findEpoch(
      request.tenantId,
      request.terminalId,
      terminalState.activeSequence,
    );
    if (epoch == null) {
      _emitDecision(
        'denied',
        OhacAuthorizationDenialReason.noActiveEpoch,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: 0,
        posBuild: posBuild ?? '',
      );
      return const OhacAssertionDenied(
        OhacAuthorizationDenialReason.noActiveEpoch,
      );
    }
    // The build gate (§12): an unreadable build is a legacy client and an
    // exact-string mismatch is a non-cohort build — both deny closed.
    // Version alone never enables.
    if (posBuild == null || epoch.targetPosBuild != posBuild) {
      _emitDecision(
        'denied',
        OhacAuthorizationDenialReason.buildMismatch,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: terminalState.activeSequence,
        posBuild: posBuild ?? '',
      );
      return const OhacAssertionDenied(
        OhacAuthorizationDenialReason.buildMismatch,
      );
    }

    // 3. R1-008 registry gate: an unregistered outbox's assertions would be
    // invisible to the §5.1 drain gate. Deny before any durable write.
    if (!ohacOutboxRegistry.isRegistered(request.outboxId)) {
      _emitDecision(
        'denied',
        OhacAuthorizationDenialReason.unregisteredOutbox,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: terminalState.activeSequence,
        posBuild: posBuild!,
      );
      return const OhacAssertionDenied(
        OhacAuthorizationDenialReason.unregisteredOutbox,
      );
    }

    // 4. Entry eligibility (§6): the authorizer must hold an ACTIVE entry in
    // the governing epoch, covering every permission the operation uses.
    // An ineligible user is refused before any PIN comparison.
    final entry = await ohacDeliveryDao.findEntryForUser(
      request.tenantId,
      request.terminalId,
      terminalState.activeSequence,
      request.userId,
    );
    if (entry == null || entry.status != 'ACTIVE') {
      _emitDecision(
        'denied',
        OhacAuthorizationDenialReason.userNotEligible,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: terminalState.activeSequence,
        posBuild: posBuild!,
      );
      return const OhacAssertionDenied(
        OhacAuthorizationDenialReason.userNotEligible,
      );
    }
    final List<dynamic> entryPermissions;
    try {
      entryPermissions = jsonDecode(entry.permissions) as List<dynamic>;
      // A payload that parses as JSON but holds non-string elements is the
      // same corruption the FormatException branch below exists for: it must
      // fail closed as StateError here, not escape as a raw TypeError from
      // the .cast<String>() at the granted-set construction.
      if (entryPermissions.any((element) => element is! String)) {
        throw const FormatException('non-string permission element');
      }
    } on FormatException {
      throw StateError(
        'OHAC policy entry ${request.userId} holds a corrupt permissions '
        'payload; refusing to authorize against it',
      );
    } on TypeError {
      // A JSON scalar (or object) is not a List: same corruption, same
      // fail-closed verdict.
      throw StateError(
        'OHAC policy entry ${request.userId} holds a corrupt permissions '
        'payload; refusing to authorize against it',
      );
    }
    final granted = entryPermissions.cast<String>().toSet();
    if (!request.permissionsUsed.every(granted.contains)) {
      _emitDecision(
        'denied',
        OhacAuthorizationDenialReason.permissionDenied,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: terminalState.activeSequence,
        posBuild: posBuild!,
      );
      return const OhacAssertionDenied(
        OhacAuthorizationDenialReason.permissionDenied,
      );
    }

    // 5. The durable attempt transaction (design §6, §11.5 decision 34):
    // lockout check, bcrypt compare, state update, sequence increment and
    // audit linkage move in ONE atomic write. A lost revision CAS rolls the
    // whole transaction back; the retry re-reads every fact from scratch —
    // there is no partial state to resume.
    OhacPinAuthorizationOutcome outcome;
    try {
      outcome = await _authorizeWithCasRetry(request);
    } on OhacAttemptCasLostException {
      // Retry budget exhausted: an infrastructure fault, not an authorization
      // decision (§6). The caller's sync/UX layer owns recovery.
      rethrow;
    }
    if (!outcome.authorized) {
      _emitDecision(
        'denied',
        outcome.denialReason!,
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        epochSequence: terminalState.activeSequence,
        posBuild: posBuild!,
      );
      return OhacAssertionDenied(outcome.denialReason!);
    }

    // 6. Assertion creation (§7.1). Every input field was validated in step
    // 1 and the emitter round-trips through parseAssertionV1, so a failure
    // here is an implementation fault, not an authorization decision: fail
    // closed by throwing instead of returning a half-built assertion.
    final creation = assertionEmitter.create(
      OhacAssertionCreationInput(
        outboxId: request.outboxId,
        assertionId: newId(),
        tenantId: request.tenantId,
        terminalId: request.terminalId,
        deviceCredentialId: request.deviceCredentialId,
        deviceCredentialVersion: request.deviceCredentialVersion,
        epochSequence: terminalState.activeSequence,
        epochDigest: epoch.digest,
        authorizerUserId: request.userId,
        operatorUserId: request.operatorUserId,
        authorizerRole: entry.role,
        permissionsUsed: request.permissionsUsed,
        operationType: request.operationType,
        operationSchema: request.operationSchema,
        operationDigest: request.operationDigest,
        localAuthorizationSequence: outcome.localAuthorizationSequence,
        localAuditId: outcome.localAuditId,
        localAuditEntryHash: outcome.localAuditEntryHash,
        posBuild: posBuild,
        authorizedAt: clock(),
      ),
    );
    if (creation case final OhacFailure failure) {
      throw StateError(
        'OHAC assertion creation failed for a validated input: '
        '${failure.error} — refusing to return a partial authorization',
      );
    }
    _emitDecision(
      'authorized',
      'pin_verified',
      tenantId: request.tenantId,
      terminalId: request.terminalId,
      epochSequence: terminalState.activeSequence,
      posBuild: posBuild!,
    );
    return OhacAssertionAuthorized(
      (creation as OhacSuccess<OhacAssertionV1>).value,
    );
  }

  /// Runs the §6 authorization transaction, retrying the whole operation on
  /// a lost attempt-state revision CAS (bounded by [maxCasRetries]).
  Future<OhacPinAuthorizationOutcome> _authorizeWithCasRetry(
    OhacAuthorizationRequest request,
  ) async {
    var attempt = 0;
    while (true) {
      attempt++;
      try {
        // The plaintext PIN exists only inside this closure and the
        // comparison it drives; it is never logged, persisted, or passed
        // into SQL (design §6).
      final casLossHook = debugForceAttemptCasLoss;
      final forceLoss = casLossHook != null && casLossHook();
      return await ohacDeliveryDao.authorizePinOperation(
        request.tenantId,
        request.terminalId,
        request.userId,
        clock(),
        (verifierEncoded) => pinComparer(request.pin, verifierEncoded),
        forceLoss,
      );
      } on OhacAttemptCasLostException {
        // The whole transaction rolled back; re-read every fact from scratch.
        if (attempt >= maxCasRetries) rethrow;
      }
    }
  }

  /// Request-shape validation mirroring the assertion contract's own field
  /// rules (§7.1). Returns the offending field names; empty means well-formed.
  List<String> _validateRequest(OhacAuthorizationRequest request) {
    final invalid = <String>[];
    void check(bool valid) {
      if (!valid) invalid.add('request');
    }

    check(isNonEmptyString(request.tenantId));
    check(isNonEmptyString(request.terminalId));
    check(isLowercaseUuid(request.userId));
    check(isLowercaseUuid(request.operatorUserId));
    check(isNonEmptyString(request.pin));
    check(isNonEmptyString(request.outboxId));
    check(isLowercaseUuid(request.deviceCredentialId));
    check(isDecimalString(request.deviceCredentialVersion));
    check(
      request.permissionsUsed.isNotEmpty &&
          request.permissionsUsed.every(isNonEmptyString) &&
          List<String>.of(request.permissionsUsed)
                  .join('\u0000') ==
              (List<String>.of(request.permissionsUsed)..sort())
                  .join('\u0000') &&
          request.permissionsUsed.toSet().length ==
              request.permissionsUsed.length,
    );
    check(isNonEmptyString(request.operationType));
    check(isNonEmptyString(request.operationSchema));
    check(isDigest(request.operationDigest));
    return invalid;
  }
}
