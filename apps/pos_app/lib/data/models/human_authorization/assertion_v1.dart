import 'dart:convert';
import 'dart:typed_data';

import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/field_guards.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

const assertionV1Schema = 'ohac.assertion.v1';

/// The only admissible trust level: software evidence from the enrolled
/// application sandbox. No hardware attestation is claimed in v1.
abstract final class OhacTrustLevel {
  static const applicationSandboxSoftware = 'APPLICATION_SANDBOX_SOFTWARE';
}

/// Immutable `ohac.assertion.v1` value object.
///
/// No `signature` field exists by design: the assertion is device-attributed
/// software evidence, never a claim of human non-repudiation. Because unknown
/// fields are rejected, adding one is a contract violation rather than a
/// silently ignored extra.
///
/// `permissionsUsed` is copied into an unmodifiable list at construction, so
/// callers cannot mutate validated data through the exposed reference and
/// later mutation of the original input list cannot alter this value object.
final class OhacAssertionV1 {
  final String schema;
  final String assertionId;
  final String tenantId;
  final String terminalId;
  final String deviceCredentialId;
  final String deviceCredentialVersion;
  final String epochSequence;
  final String epochDigest;
  final String authorizerUserId;
  final String operatorUserId;
  final String authorizerRole;
  final List<String> permissionsUsed;
  final String operationType;
  final String operationSchema;
  final String operationDigest;
  final String localAuthorizationSequence;
  final String localAuditId;
  final String localAuditEntryHash;
  final String posBuild;
  final String policySchema;
  final String trustLevel;
  final String authorizedAt;
  final String digest;

  OhacAssertionV1({
    required this.schema,
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
    required List<String> permissionsUsed,
    required this.operationType,
    required this.operationSchema,
    required this.operationDigest,
    required this.localAuthorizationSequence,
    required this.localAuditId,
    required this.localAuditEntryHash,
    required this.posBuild,
    required this.policySchema,
    required this.trustLevel,
    required this.authorizedAt,
    required this.digest,
  }) : permissionsUsed = List<String>.unmodifiable(permissionsUsed);
}

const _assertionKeys = <String>[
  'schema',
  'assertionId',
  'tenantId',
  'terminalId',
  'deviceCredentialId',
  'deviceCredentialVersion',
  'epochSequence',
  'epochDigest',
  'authorizerUserId',
  'operatorUserId',
  'authorizerRole',
  'permissionsUsed',
  'operationType',
  'operationSchema',
  'operationDigest',
  'localAuthorizationSequence',
  'localAuditId',
  'localAuditEntryHash',
  'posBuild',
  'policySchema',
  'trustLevel',
  'authorizedAt',
  'digest',
];

final _utcRfc3339 = RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$');

/// Parses and validates an `ohac.assertion.v1` payload carrying an integrity
/// digest.
///
/// Order mirrors the TypeScript contract: canonicalize, digest equality,
/// exact keys, schema/trust identity, then field-level validation.
OhacResult<OhacAssertionV1> parseAssertionV1(Uint8List rawUtf8) {
  final canonical = canonicalizeOhac(rawUtf8);
  if (canonical case final OhacFailure<Uint8List> failure) {
    return OhacFailure<OhacAssertionV1>(failure.error);
  }

  Object? parsed;
  try {
    parsed = jsonDecode(utf8.decode(rawUtf8));
  } on FormatException {
    return OhacFailure(OhacError(OhacErrorCode.invalidJson));
  }
  final object = asObject(parsed);
  if (object == null) {
    return OhacFailure(OhacError(OhacErrorCode.invalidJson));
  }

  final transmittedDigest =
      isDigest(object['digest']) ? object['digest']! as String : null;
  if (transmittedDigest == null) {
    return OhacFailure(OhacError(OhacErrorCode.missingField, 'digest'));
  }
  final verified = verifyBodyDigest(object);
  if (ohacFailureAs<Map<String, dynamic>>(verified) case final verifiedFailure?) {
    return OhacFailure<OhacAssertionV1>(verifiedFailure.error);
  }

  final keys = requireExactKeys(object, _assertionKeys);
  if (ohacFailureAs<Map<String, dynamic>>(keys) case final keysFailure?) {
    return OhacFailure<OhacAssertionV1>(keysFailure.error);
  }

  if (object['schema'] != assertionV1Schema) {
    return OhacFailure(OhacError(OhacErrorCode.unsupportedSchema, 'schema'));
  }
  if (object['policySchema'] != staffPolicyEpochV1Schema) {
    return OhacFailure(
      OhacError(OhacErrorCode.unsupportedSchema, 'policySchema'),
    );
  }
  if (object['trustLevel'] != OhacTrustLevel.applicationSandboxSoftware) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'trustLevel'));
  }

  const uuidFields = <String>[
    'assertionId',
    'tenantId',
    'deviceCredentialId',
    'authorizerUserId',
    'operatorUserId',
    'localAuditId',
  ];
  for (final field in uuidFields) {
    if (!isLowercaseUuid(object[field])) {
      return OhacFailure(OhacError(OhacErrorCode.invalidField, field));
    }
  }
  const nonEmptyFields = <String>[
    'terminalId',
    'operationType',
    'operationSchema',
    'posBuild',
  ];
  for (final field in nonEmptyFields) {
    if (!isNonEmptyString(object[field])) {
      return OhacFailure(OhacError(OhacErrorCode.invalidField, field));
    }
  }
  const decimalFields = <String>[
    'deviceCredentialVersion',
    'epochSequence',
    'localAuthorizationSequence',
  ];
  for (final field in decimalFields) {
    if (!isDecimalString(object[field])) {
      return OhacFailure(OhacError(OhacErrorCode.invalidField, field));
    }
  }
  const digestFields = <String>[
    'epochDigest',
    'operationDigest',
    'localAuditEntryHash',
  ];
  for (final field in digestFields) {
    if (!isDigest(object[field])) {
      return OhacFailure(OhacError(OhacErrorCode.invalidField, field));
    }
  }
  if (!isOhacRole(object['authorizerRole'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'authorizerRole'));
  }
  final authorizedAt = object['authorizedAt'];
  if (authorizedAt is! String || !_utcRfc3339.hasMatch(authorizedAt)) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'authorizedAt'));
  }
  final permissionsUsed = object['permissionsUsed'];
  if (permissionsUsed is! List ||
      permissionsUsed.isEmpty ||
      permissionsUsed.any((permission) => !isNonEmptyString(permission))) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'permissionsUsed'));
  }
  final permissions = permissionsUsed.cast<String>();
  final sorted = requireSortedUnique(permissions, 'permissionsUsed');
  if (ohacFailureAs<List<String>>(sorted) case final sortedFailure?) {
    return OhacFailure<OhacAssertionV1>(sortedFailure.error);
  }

  return OhacSuccess(OhacAssertionV1(
    schema: assertionV1Schema,
    assertionId: object['assertionId']! as String,
    tenantId: object['tenantId']! as String,
    terminalId: object['terminalId']! as String,
    deviceCredentialId: object['deviceCredentialId']! as String,
    deviceCredentialVersion: object['deviceCredentialVersion']! as String,
    epochSequence: object['epochSequence']! as String,
    epochDigest: object['epochDigest']! as String,
    authorizerUserId: object['authorizerUserId']! as String,
    operatorUserId: object['operatorUserId']! as String,
    authorizerRole: object['authorizerRole']! as String,
    permissionsUsed: permissions,
    operationType: object['operationType']! as String,
    operationSchema: object['operationSchema']! as String,
    operationDigest: object['operationDigest']! as String,
    localAuthorizationSequence:
        object['localAuthorizationSequence']! as String,
    localAuditId: object['localAuditId']! as String,
    localAuditEntryHash: object['localAuditEntryHash']! as String,
    posBuild: object['posBuild']! as String,
    policySchema: object['policySchema']! as String,
    trustLevel: object['trustLevel']! as String,
    authorizedAt: authorizedAt,
    digest: transmittedDigest,
  ));
}
