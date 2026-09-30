import 'dart:convert';
import 'dart:typed_data';

import 'package:pos_app/data/models/human_authorization/assertion_v1.dart';
import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/field_guards.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';
import 'package:pos_app/domain/security/ohac_authorization_port.dart';
import 'package:pos_app/domain/security/ohac_outbox_registry.dart';

/// Everything the emitter needs to build one operation-bound
/// `ohac.assertion.v1` (design §7.1).
///
/// Field names are pinned to the authoritative schema (`assertion.v1.ts` /
/// `assertion_v1.dart`): 22 body fields plus the stamped [digest]; there is
/// no `signature` field.
final class OhacAssertionCreationInput {
  final String outboxId;

  /// Replay identity (§7.1): a fresh caller-generated lowercase UUID v4.
  final String assertionId;

  final String tenantId;
  final String terminalId;
  final String deviceCredentialId;
  final String deviceCredentialVersion;

  /// The governing acknowledged epoch, as its decimal string on the wire.
  final int epochSequence;
  final String epochDigest;

  final String authorizerUserId;
  final String operatorUserId;
  final String authorizerRole;
  final List<String> permissionsUsed;

  final String operationType;
  final String operationSchema;
  final String operationDigest;

  /// The terminal-local counter value stamped into the assertion.
  final int localAuthorizationSequence;
  final String localAuditId;
  final String localAuditEntryHash;

  final String posBuild;

  /// The forensic-only instant, rendered as RFC3339 UTC with second
  /// precision by the emitter.
  final DateTime authorizedAt;

  const OhacAssertionCreationInput({
    required this.outboxId,
    required this.assertionId,
    required this.tenantId,
    required this.terminalId,
    required this.deviceCredentialId,
    required this.deviceCredentialVersion,
    required this.epochSequence,
    required this.epochDigest,
    required this.authorizerUserId,
    required this.operatorUserId,
    required this.authorizerRole,
    required this.permissionsUsed,
    required this.operationType,
    required this.operationSchema,
    required this.operationDigest,
    required this.localAuthorizationSequence,
    required this.localAuditId,
    required this.localAuditEntryHash,
    required this.posBuild,
    required this.authorizedAt,
  });
}

/// Builds operation-bound `ohac.assertion.v1` payloads (design §7.1).
///
/// The R1-008 fail-closed coupler lives here: [create] refuses to emit for an
/// outbox that has not registered with the §5.1 drain-gate registry, because
/// an unregistered emitter's assertions would be invisible to the gate.
///
/// Construction is fail-closed by round trip: the canonical body is stamped
/// with its OHAC digest and the full payload is re-validated through
/// `parseAssertionV1`, so the emitter can never return an assertion the
/// verifier-side parser would reject.
class OhacAssertionEmitter {
  final OhacOutboxRegistry outboxRegistry;

  const OhacAssertionEmitter(this.outboxRegistry);

  /// Builds and validates one assertion from [input].
  ///
  /// Fails closed with [OhacAuthorizationDenialReason.unregisteredOutbox]
  /// when [input]'s outbox has not registered (R1-008), and with
  /// [OhacAuthorizationDenialReason.invalidRequest] when any field fails the
  /// assertion contract's shape validation. The returned value has survived
  /// `parseAssertionV1` — the emitter can never produce an assertion the
  /// verifier-side parser would reject.
  OhacResult<OhacAssertionV1> create(OhacAssertionCreationInput input) {
    // R1-008 fail-closed coupler FIRST: an unregistered emitter's assertions
    // would be invisible to the §5.1 drain gate, so nothing is built at all.
    if (!outboxRegistry.isRegistered(input.outboxId)) {
      return const OhacFailure(
        OhacError(OhacAuthorizationDenialReason.unregisteredOutbox),
      );
    }

    final invalidFields = _validate(input);
    if (invalidFields.isNotEmpty) {
      return OhacFailure(
        OhacError(OhacErrorCode.invalidField, invalidFields.first),
      );
    }

    final body = <String, dynamic>{
      'schema': assertionV1Schema,
      'assertionId': input.assertionId,
      'tenantId': input.tenantId,
      'terminalId': input.terminalId,
      'deviceCredentialId': input.deviceCredentialId,
      'deviceCredentialVersion': input.deviceCredentialVersion,
      'epochSequence': input.epochSequence.toString(),
      'epochDigest': input.epochDigest,
      'authorizerUserId': input.authorizerUserId,
      'operatorUserId': input.operatorUserId,
      'authorizerRole': input.authorizerRole,
      'permissionsUsed': List<String>.of(input.permissionsUsed),
      'operationType': input.operationType,
      'operationSchema': input.operationSchema,
      'operationDigest': input.operationDigest,
      'localAuthorizationSequence':
          input.localAuthorizationSequence.toString(),
      'localAuditId': input.localAuditId,
      'localAuditEntryHash': input.localAuditEntryHash,
      'posBuild': input.posBuild,
      'policySchema': staffPolicyEpochV1Schema,
      'trustLevel': OhacTrustLevel.applicationSandboxSoftware,
      'authorizedAt': ohacFormatAuthorizedAt(input.authorizedAt),
    };

    // Stamp the digest over the canonical body WITHOUT the digest field
    // (design §7.1, §7.2) — the exact shape `verifyBodyDigest` re-verifies.
    final canonical = canonicalizeOhac(
      Uint8List.fromList(utf8.encode(jsonEncode(body))),
    );
    if (canonical case final OhacFailure<Uint8List> failure) {
      return OhacFailure<OhacAssertionV1>(failure.error);
    }
    final digest =
        ohacDigest((canonical as OhacSuccess<Uint8List>).value);

    // Construction IS the round trip: only an assertion the authoritative
    // parser accepts leaves this method, so the digest, key set, casing and
    // every field-level rule are re-proven against the frozen contract.
    final full = <String, dynamic>{...body, 'digest': digest};
    return parseAssertionV1(Uint8List.fromList(utf8.encode(jsonEncode(full))));
  }
}

/// The field-level shape validation shared by every construction attempt.
/// Returns the offending field names; empty means the input is well-formed.
List<String> _validate(OhacAssertionCreationInput input) {
  final invalid = <String>[];
  void check(bool valid, String field) {
    if (!valid) invalid.add(field);
  }

  check(isNonEmptyString(input.outboxId), 'outboxId');
  check(isLowercaseUuid(input.assertionId), 'assertionId');
  check(isLowercaseUuid(input.tenantId), 'tenantId');
  check(isNonEmptyString(input.terminalId), 'terminalId');
  check(isLowercaseUuid(input.deviceCredentialId), 'deviceCredentialId');
  check(isDecimalString(input.deviceCredentialVersion),
      'deviceCredentialVersion');
  check(isDecimalString(input.epochSequence.toString()), 'epochSequence');
  check(isDigest(input.epochDigest), 'epochDigest');
  check(isLowercaseUuid(input.authorizerUserId), 'authorizerUserId');
  check(isLowercaseUuid(input.operatorUserId), 'operatorUserId');
  check(isOhacRole(input.authorizerRole), 'authorizerRole');
  check(
    input.permissionsUsed.isNotEmpty &&
        input.permissionsUsed.every(isNonEmptyString) &&
        List<String>.of(input.permissionsUsed)
            .join('\u0000') ==
        (List<String>.of(input.permissionsUsed)..sort()).join('\u0000') &&
        input.permissionsUsed.toSet().length == input.permissionsUsed.length,
    'permissionsUsed',
  );
  check(isNonEmptyString(input.operationType), 'operationType');
  check(isNonEmptyString(input.operationSchema), 'operationSchema');
  check(isDigest(input.operationDigest), 'operationDigest');
  check(
    isDecimalString(input.localAuthorizationSequence.toString()),
    'localAuthorizationSequence',
  );
  check(isLowercaseUuid(input.localAuditId), 'localAuditId');
  check(isDigest(input.localAuditEntryHash), 'localAuditEntryHash');
  check(isNonEmptyString(input.posBuild), 'posBuild');
  return invalid;
}

/// Renders [instant] as RFC3339 UTC with second precision — the exact shape
/// `parseAssertionV1` requires (`2026-01-01T00:00:00Z`, no fractional
/// seconds).
String ohacFormatAuthorizedAt(DateTime instant) {
  final utc = instant.toUtc();
  String pad2(int value) => value.toString().padLeft(2, '0');
  return '${utc.year.toString().padLeft(4, '0')}-'
      '${pad2(utc.month)}-${pad2(utc.day)}'
      'T${pad2(utc.hour)}:${pad2(utc.minute)}:${pad2(utc.second)}Z';
}

/// The one admissible trust level, re-exported for call sites next to the
/// emitter that stamps it.
const String ohacAssertionTrustLevel = OhacTrustLevel.applicationSandboxSoftware;
