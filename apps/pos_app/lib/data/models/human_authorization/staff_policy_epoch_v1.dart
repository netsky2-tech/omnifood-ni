import 'dart:convert';
import 'dart:typed_data';

import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/field_guards.dart';

const staffPolicyEpochV1Schema = 'ohac.staff-policy-epoch.v1';
const genesisDigest = 'GENESIS';
const minimumAssertionSchema = 'ohac.assertion.v1';

/// Explicit policy statuses on the wire; nothing is inferred implicitly.
abstract final class OhacPolicyStatus {
  static const active = 'ACTIVE';
  static const inactive = 'INACTIVE';
  static const values = <String>{active, inactive};
}

/// Supported roles for epoch entries and assertion authorizers.
abstract final class OhacRole {
  static const owner = 'OWNER';
  static const manager = 'MANAGER';
  static const cashier = 'CASHIER';
  static const waiter = 'WAITER';
  static const values = <String>{owner, manager, cashier, waiter};
}

bool _isRole(Object? value) => isOhacRole(value);

/// Whether `value` is one of the supported OHAC wire roles. Shared with the
/// assertion contract for `authorizerRole` validation.
bool isOhacRole(Object? value) =>
    value is String && OhacRole.values.contains(value);

bool _isStatus(Object? value) =>
    value is String && OhacPolicyStatus.values.contains(value);

bool _isGenesisOrDigest(Object? value) =>
    value == genesisDigest || isDigest(value);

/// Portable one-way verifier copied verbatim from the epoch envelope.
/// Never transformed into a key, never logged, and never echoed back.
final class OhacPinVerifierV1 {
  final String algorithm;
  final String formatVersion;
  final String encoded;

  const OhacPinVerifierV1({
    required this.algorithm,
    required this.formatVersion,
    required this.encoded,
  });
}

/// One immutable staff-policy entry for a single user inside an epoch.
///
/// `permissions` is copied into an unmodifiable list at construction, so
/// callers cannot mutate validated data through the exposed reference and
/// later mutation of the original input list cannot alter this value object.
final class StaffPolicyEpochEntryV1 {
  final String userId;
  final String status;
  final String role;
  final List<String> permissions;
  final OhacPinVerifierV1 pinVerifier;
  final String attemptResetGeneration;

  StaffPolicyEpochEntryV1({
    required this.userId,
    required this.status,
    required this.role,
    required List<String> permissions,
    required this.pinVerifier,
    required this.attemptResetGeneration,
  }) : permissions = List<String>.unmodifiable(permissions);
}

/// Immutable `ohac.staff-policy-epoch.v1` value object.
///
/// `policyEntries` is copied into an unmodifiable list at construction so the
/// validated epoch cannot be mutated through any retained reference.
final class StaffPolicyEpochV1 {
  final String schema;
  final String tenantId;
  final String targetTerminalId;
  final String sequence;
  final String previousSequence;
  final String previousDigest;
  final String publisherBackendBuild;
  final String targetPosBuild;
  final String minimumAssertionSchema;
  final List<StaffPolicyEpochEntryV1> policyEntries;
  final String digest;

  StaffPolicyEpochV1({
    required this.schema,
    required this.tenantId,
    required this.targetTerminalId,
    required this.sequence,
    required this.previousSequence,
    required this.previousDigest,
    required this.publisherBackendBuild,
    required this.targetPosBuild,
    required this.minimumAssertionSchema,
    required List<StaffPolicyEpochEntryV1> policyEntries,
    required this.digest,
  }) : policyEntries =
          List<StaffPolicyEpochEntryV1>.unmodifiable(policyEntries);
}

const _epochKeys = <String>[
  'schema',
  'tenantId',
  'targetTerminalId',
  'sequence',
  'previousSequence',
  'previousDigest',
  'publisherBackendBuild',
  'targetPosBuild',
  'minimumAssertionSchema',
  'policyEntries',
  'digest',
];

const _entryKeys = <String>[
  'userId',
  'status',
  'role',
  'permissions',
  'pinVerifier',
  'attemptResetGeneration',
];

const _pinVerifierKeys = <String>['algorithm', 'formatVersion', 'encoded'];

OhacResult<OhacPinVerifierV1> _parsePinVerifier(Object? value) {
  final object = asObject(value);
  if (object == null) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'pinVerifier'));
  }
  final keys = requireExactKeys(object, _pinVerifierKeys);
  if (ohacFailureAs<OhacPinVerifierV1>(keys) case final keysFailure?) {
    return keysFailure;
  }
  if (object['algorithm'] != 'bcrypt') {
    return OhacFailure(
      OhacError(OhacErrorCode.invalidField, 'pinVerifier.algorithm'),
    );
  }
  if (!isNonEmptyString(object['formatVersion']) ||
      !isNonEmptyString(object['encoded'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'pinVerifier'));
  }
  return OhacSuccess(OhacPinVerifierV1(
    algorithm: 'bcrypt',
    formatVersion: object['formatVersion']! as String,
    encoded: object['encoded']! as String,
  ));
}

OhacResult<StaffPolicyEpochEntryV1> _parseEntry(Object? value) {
  final object = asObject(value);
  if (object == null) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'policyEntries'));
  }
  final keys = requireExactKeys(object, _entryKeys);
  if (ohacFailureAs<StaffPolicyEpochEntryV1>(keys) case final keysFailure?) {
    return keysFailure;
  }
  if (!isLowercaseUuid(object['userId'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'userId'));
  }
  if (!_isStatus(object['status'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'status'));
  }
  if (!_isRole(object['role'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'role'));
  }
  if (!isDecimalString(object['attemptResetGeneration'])) {
    return OhacFailure(
      OhacError(OhacErrorCode.invalidField, 'attemptResetGeneration'),
    );
  }
  final permissionsValue = object['permissions'];
  if (permissionsValue is! List ||
      permissionsValue.any((permission) => !isNonEmptyString(permission))) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'permissions'));
  }
  final permissions = permissionsValue.cast<String>();
  final sorted = requireSortedUnique(permissions, 'permissions');
  if (ohacFailureAs<StaffPolicyEpochEntryV1>(sorted) case final sortedFailure?) {
    return sortedFailure;
  }

  final pinVerifier = _parsePinVerifier(object['pinVerifier']);
  if (ohacFailureAs<StaffPolicyEpochEntryV1>(pinVerifier) case final failure?) {
    return failure;
  }

  return OhacSuccess(StaffPolicyEpochEntryV1(
    userId: object['userId']! as String,
    status: object['status']! as String,
    role: object['role']! as String,
    permissions: permissions,
    pinVerifier: (pinVerifier as OhacSuccess<OhacPinVerifierV1>).value,
    attemptResetGeneration: object['attemptResetGeneration']! as String,
  ));
}

/// Parses and validates an `ohac.staff-policy-epoch.v1` envelope carrying an
/// integrity digest.
///
/// Order mirrors the TypeScript contract: canonicalize, then digest equality
/// (the only check that detects byte-level mutation), then exact keys and
/// schema, then field-level validation, then the sequence chain.
OhacResult<StaffPolicyEpochV1> parseStaffPolicyEpochV1(Uint8List rawUtf8) {
  final canonical = canonicalizeOhac(rawUtf8);
  if (canonical case final OhacFailure<Uint8List> failure) {
    return OhacFailure<StaffPolicyEpochV1>(failure.error);
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

  // Digest first: it is the only check that detects byte-level mutation. The
  // digest covers the whole object except the digest field itself.
  final transmittedDigest =
      isDigest(object['digest']) ? object['digest']! as String : null;
  if (transmittedDigest == null) {
    return OhacFailure(OhacError(OhacErrorCode.missingField, 'digest'));
  }
  final verified = verifyBodyDigest(object);
  if (verified case final OhacFailure<Map<String, dynamic>> failure) {
    return OhacFailure<StaffPolicyEpochV1>(failure.error);
  }

  final keys = requireExactKeys(object, _epochKeys);
  if (keys case final OhacFailure<Map<String, dynamic>> failure) {
    return OhacFailure<StaffPolicyEpochV1>(failure.error);
  }

  if (object['schema'] != staffPolicyEpochV1Schema) {
    return OhacFailure(OhacError(OhacErrorCode.unsupportedSchema, 'schema'));
  }
  if (!isLowercaseUuid(object['tenantId'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'tenantId'));
  }
  if (!isNonEmptyString(object['targetTerminalId'])) {
    return OhacFailure(
      OhacError(OhacErrorCode.invalidField, 'targetTerminalId'),
    );
  }
  // Int64-bounded (exploration.md §7.3) so BigInt below never sees an
  // arbitrary-length or over-range value.
  if (!isInt64DecimalString(object['sequence'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'sequence'));
  }
  if (!isInt64DecimalString(object['previousSequence'])) {
    return OhacFailure(
      OhacError(OhacErrorCode.invalidField, 'previousSequence'),
    );
  }
  if (!_isGenesisOrDigest(object['previousDigest'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'previousDigest'));
  }
  if (!isNonEmptyString(object['publisherBackendBuild']) ||
      !isNonEmptyString(object['targetPosBuild']) ||
      !isNonEmptyString(object['minimumAssertionSchema'])) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'build'));
  }
  // The epoch pins the minimum assertion schema this POS build accepts:
  // only the supported assertion schema constant is valid. Unknown non-empty
  // schema ids are a schema-version problem, not a build/field problem.
  if (object['minimumAssertionSchema'] != minimumAssertionSchema) {
    return OhacFailure(
      OhacError(OhacErrorCode.unsupportedSchema, 'minimumAssertionSchema'),
    );
  }
  final policyEntries = object['policyEntries'];
  if (policyEntries is! List || policyEntries.isEmpty) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'policyEntries'));
  }

  final entries = <StaffPolicyEpochEntryV1>[];
  for (final candidate in policyEntries) {
    final entry = _parseEntry(candidate);
    if (entry case final OhacFailure<StaffPolicyEpochEntryV1> failure) {
      return OhacFailure<StaffPolicyEpochV1>(failure.error);
    }
    entries.add((entry as OhacSuccess<StaffPolicyEpochEntryV1>).value);
  }
  final sortedEntries = requireSortedUnique(
    entries.map((entry) => entry.userId).toList(),
    'policyEntries',
  );
  if (sortedEntries case final OhacFailure<List<String>> failure) {
    return OhacFailure<StaffPolicyEpochV1>(failure.error);
  }

  // Sequences are contiguous decimal strings; epoch 1 chains from GENESIS.
  final sequence = BigInt.parse(object['sequence']! as String);
  final previousSequence = BigInt.parse(object['previousSequence']! as String);
  if (sequence != previousSequence + BigInt.one ||
      (previousSequence == BigInt.zero &&
          object['previousDigest'] != genesisDigest) ||
      (previousSequence > BigInt.zero &&
          !isDigest(object['previousDigest']))) {
    return OhacFailure(OhacError(OhacErrorCode.invalidField, 'sequence'));
  }

  return OhacSuccess(StaffPolicyEpochV1(
    schema: staffPolicyEpochV1Schema,
    tenantId: object['tenantId']! as String,
    targetTerminalId: object['targetTerminalId']! as String,
    sequence: object['sequence']! as String,
    previousSequence: object['previousSequence']! as String,
    previousDigest: object['previousDigest']! as String,
    publisherBackendBuild: object['publisherBackendBuild']! as String,
    targetPosBuild: object['targetPosBuild']! as String,
    minimumAssertionSchema: object['minimumAssertionSchema']! as String,
    policyEntries: entries,
    digest: transmittedDigest,
  ));
}

/// Terminal-side acceptance inputs: identity and build expectation of the
/// receiving terminal plus its currently accepted epoch head.
final class OhacEpochAcceptanceInput {
  final StaffPolicyEpochV1 epoch;
  final String expectedTenantId;
  final String expectedTerminalId;
  final String acceptedSequence;
  final String acceptedDigest;
  final String supportedPosBuild;

  const OhacEpochAcceptanceInput({
    required this.epoch,
    required this.expectedTenantId,
    required this.expectedTerminalId,
    required this.acceptedSequence,
    required this.acceptedDigest,
    required this.supportedPosBuild,
  });
}

/// Order is deliberate. Identity and build first, then "is this strictly
/// newer", and only then the chain check: a stale epoch should report
/// staleness rather than a broken previous-digest, which would mislead an
/// operator.
OhacResult<StaffPolicyEpochV1> validateEpochAcceptance(
  OhacEpochAcceptanceInput input,
) {
  final epoch = input.epoch;
  if (epoch.tenantId != input.expectedTenantId) {
    return OhacFailure(OhacError(OhacErrorCode.tenantScopeMismatch, 'tenantId'));
  }
  if (epoch.targetTerminalId != input.expectedTerminalId) {
    return OhacFailure(
      OhacError(OhacErrorCode.tenantTerminalMismatch, 'targetTerminalId'),
    );
  }
  if (epoch.targetPosBuild != input.supportedPosBuild) {
    return OhacFailure(
      OhacError(OhacErrorCode.unsupportedBuildPair, 'targetPosBuild'),
    );
  }

  // Caller input: must be Int64-canonical or the BigInt comparisons below
  // would throw or silently misparse; reject with the stable field name.
  if (!isInt64DecimalString(input.acceptedSequence)) {
    return OhacFailure(
      OhacError(OhacErrorCode.invalidField, 'acceptedSequence'),
    );
  }
  final accepted = BigInt.parse(input.acceptedSequence);
  if (BigInt.parse(epoch.sequence) <= accepted) {
    return OhacFailure(OhacError(OhacErrorCode.sequenceNotNewer, 'sequence'));
  }
  // Caller input: must be exactly GENESIS or a canonical lowercase sha256
  // digest, or the chain comparison below would misattribute the caller's
  // malformed head to the epoch's previousDigest field.
  if (!_isGenesisOrDigest(input.acceptedDigest)) {
    return OhacFailure(
      OhacError(OhacErrorCode.invalidField, 'acceptedDigest'),
    );
  }
  if (epoch.previousSequence != input.acceptedSequence ||
      epoch.previousDigest != input.acceptedDigest) {
    return OhacFailure(
      OhacError(OhacErrorCode.invalidField, 'previousDigest'),
    );
  }
  return OhacSuccess(epoch);
}
