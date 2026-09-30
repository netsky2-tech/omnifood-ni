import 'dart:convert';
import 'dart:typed_data';

import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

/// The mapped result of one delivered epoch (unit B2c-3b): the validated
/// value object plus the two immutable persistence shapes the atomic
/// candidate transaction R writes (design §4.2, §5 step 2).
final class OhacDeliveredEpochMapping {
  /// The parsed and fully validated epoch, ready for
  /// `evaluateDeliveredEpoch`.
  final StaffPolicyEpochV1 epoch;

  /// The immutable epoch row to insert into `human_auth_policy_epochs`.
  final OhacPolicyEpochEntity epochEntity;

  /// The immutable entry rows to insert into `human_auth_policy_entries`,
  /// in the epoch's own entry order (the contract sorts them by `userId`).
  final List<OhacPolicyEntryEntity> entryEntities;

  const OhacDeliveredEpochMapping({
    required this.epoch,
    required this.epochEntity,
    required this.entryEntities,
  });
}

/// Maps one received `epoch` JSON map of the `humanAuthorization` DELIVER
/// envelope onto the persistence shapes transaction R requires.
///
/// Pure: no database, no Dio, no clock — identity and receipt time arrive as
/// arguments. Every failure mode throws instead of degrading (fail closed):
/// a malformed or tampered envelope, an identity that does not match the
/// persisted terminal state, or a sequence the Int64 guard refuses never
/// reaches persistence.
///
/// Identity rule: `tenantId`/`terminalId` come from the **persisted terminal
/// state** (the arguments), never from the epoch map. The epoch's
/// `tenantId`/`targetTerminalId` are asserted against them and a mismatch
/// throws — keying the rows from the envelope would let a spoofed or
/// misdelivered epoch create state for a terminal it was never addressed to.
///
/// Payload provenance: the `payload` column stores the **canonical
/// envelope** — the OHAC-C14N-1 canonical bytes of the whole received epoch
/// object, `digest` field included — so the digest can be re-verified
/// directly from storage and re-canonicalizing the stored payload is
/// byte-identical.
OhacDeliveredEpochMapping mapDeliveredEpochForPersistence({
  required Map<String, dynamic> epochMap,
  required String tenantId,
  required String terminalId,
  required String receivedAt,
}) {
  final Uint8List rawEnvelope;
  try {
    rawEnvelope = Uint8List.fromList(utf8.encode(jsonEncode(epochMap)));
  } on JsonUnsupportedObjectError catch (e) {
    throw StateError(
      'OHAC delivered epoch is not JSON-encodable; refusing to persist: $e',
    );
  }

  // Parse and validate first: the transmitted digest is the only check that
  // detects byte-level mutation, and it runs inside the contract parser.
  final parsed = parseStaffPolicyEpochV1(rawEnvelope);
  if (parsed case final OhacFailure<StaffPolicyEpochV1> failure) {
    throw StateError(
      'OHAC delivered epoch rejected by the contract parser: ${failure.error}',
    );
  }
  final epoch = (parsed as OhacSuccess<StaffPolicyEpochV1>).value;

  if (epoch.tenantId != tenantId) {
    throw StateError(
      'OHAC delivered epoch tenant ${epoch.tenantId} does not match the '
      'persisted terminal-state tenant $tenantId; refusing to key rows from '
      'the epoch',
    );
  }
  if (epoch.targetTerminalId != terminalId) {
    throw StateError(
      'OHAC delivered epoch terminal ${epoch.targetTerminalId} does not '
      'match the persisted terminal identity $terminalId; refusing to key '
      'rows from the epoch',
    );
  }

  final payload = _canonicalEnvelope(rawEnvelope);
  // int.parse is safe without a second guard: the contract parser has
  // already required both fields to be Int64-canonical decimal strings
  // (isInt64DecimalString inside parseStaffPolicyEpochV1), so nothing can
  // reach this point that the guard would refuse. A re-guard here would be
  // dead code pretending to defend — the Int64 rejection is pinned at the
  // parser layer by the mapper test.
  final sequence = int.parse(epoch.sequence);
  final previousSequence = int.parse(epoch.previousSequence);

  final epochEntity = OhacPolicyEpochEntity(
    tenantId: tenantId,
    terminalId: terminalId,
    sequence: sequence,
    digest: epoch.digest,
    previousSequence: previousSequence,
    previousDigest: epoch.previousDigest,
    schema: epoch.schema,
    targetPosBuild: epoch.targetPosBuild,
    publisherBackendBuild: epoch.publisherBackendBuild,
    minimumAssertionSchema: epoch.minimumAssertionSchema,
    payload: payload,
    receivedAt: receivedAt,
  );

  final entryEntities = List<OhacPolicyEntryEntity>.unmodifiable(<
      OhacPolicyEntryEntity>[
    for (final entry in epoch.policyEntries)
      OhacPolicyEntryEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: sequence,
        userId: entry.userId,
        status: entry.status,
        role: entry.role,
        // The entity column is a JSON array string; the list itself is
        // already sorted and de-duplicated by the contract parser.
        permissions: jsonEncode(entry.permissions),
        verifierAlgorithm: entry.pinVerifier.algorithm,
        verifierFormatVersion: entry.pinVerifier.formatVersion,
        verifierEncoded: entry.pinVerifier.encoded,
        attemptResetGeneration: entry.attemptResetGeneration,
      ),
  ]);

  return OhacDeliveredEpochMapping(
    epoch: epoch,
    epochEntity: epochEntity,
    entryEntities: entryEntities,
  );
}

/// OHAC-C14N-1 canonical bytes of the received envelope, as a UTF-8 string
/// for the entity's `payload` column. Re-canonicalizing these bytes is
/// byte-identical (pinned by the mapper's idempotence test).
String _canonicalEnvelope(Uint8List rawEnvelope) {
  final canonical = canonicalizeOhac(rawEnvelope);
  if (canonical case final OhacFailure<Uint8List> failure) {
    throw StateError(
      'OHAC delivered epoch cannot be canonicalized: ${failure.error}',
    );
  }
  return utf8.decode((canonical as OhacSuccess<Uint8List>).value);
}
