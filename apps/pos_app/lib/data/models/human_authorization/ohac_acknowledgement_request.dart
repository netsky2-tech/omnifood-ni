import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'field_guards.dart';
import 'ohac_delivery_entities.dart';
import 'staff_policy_epoch_v1.dart' show genesisDigest;

/// The OHAC acknowledgement request builder (design §5 step 3, §10).
///
/// The backend `POST /v1/sync/inbound/human-authorization/staff-policy/ack`
/// DTO (`human-authorization-ack.dto.ts`) requires ALL EIGHT fields with
/// strict formats, and identity (tenant/terminal) comes from the device
/// principal on the wire — never from the body. The terminal identity is
/// therefore an input only to the idempotency key derivation.
///
/// This file is pure: it decides nothing about failure recovery. The caller
/// fail-closes on a `null` body — the acknowledgement stays in
/// `ACK_SUBMITTING` and a later pull retries — because a partial body can
/// never be sent.

/// Derives the acknowledgement idempotency key from the claim itself
/// (design §5 step 3: "Same sequence+digest+request hash returns the
/// original receipt").
///
/// The derivation is deterministic so a retry after process death sends the
/// SAME key and replays the stored receipt (`OHAC_ACK_RESPONSE_LOST`,
/// §10), and it covers the full claim identity so two different claims can
/// never share a key — which would answer `IDEMPOTENCY_CONFLICT` (§10:
/// terminal except identical retry).
///
/// The canonical string is length-prefixed per variable-length field so no
/// pair of distinct inputs can produce the same preimage, then hashed with
/// SHA-256 and rendered lowercase hex.
String deriveOhacAckIdempotencyKey({
  required String tenantId,
  required String terminalId,
  required int sequence,
  required String digest,
}) {
  if (tenantId.isEmpty || terminalId.isEmpty) {
    throw ArgumentError(
      'OHAC ack idempotency key requires a tenant and a terminal identity',
    );
  }
  if (sequence < 1) {
    throw ArgumentError(
      'OHAC ack idempotency key requires a positive epoch sequence',
    );
  }
  if (digest.isEmpty) {
    throw ArgumentError(
      'OHAC ack idempotency key requires the claim digest',
    );
  }
  final canonical = 'ohac.ack.v1'
      '|${tenantId.length}:$tenantId'
      '|${terminalId.length}:$terminalId'
      '|$sequence'
      '|$digest';
  return sha256.convert(utf8.encode(canonical)).toString();
}

/// Builds the exact eight-field acknowledgement body (backend
/// `human-authorization-ack.dto.ts`) from the epoch row the terminal holds
/// as its candidate, the terminal identity, the POS's own build and the
/// negotiated assertion schema — or `null` when ANY input is unavailable or
/// malformed, which the caller answers by staying in `ACK_SUBMITTING`
/// (fail closed: a partial body is never sent).
///
/// Field sources (fixed decision for unit B2d):
/// - `schema` — the epoch entity's own schema column (what the backend
///   signed);
/// - `sequence` / `digest` — the candidate claim, wire-rendered as decimal
///   strings per the DTO regexes;
/// - `previousSequence` / `previousDigest` — the epoch row's chain link;
/// - `posBuild` — the caller's `readOhacPosBuild()` result, which may be
///   `null` when the read fails;
/// - `assertionSchema` — the terminal state's `negotiated_assertion_schema`;
/// - `idempotencyKey` — [deriveOhacAckIdempotencyKey] over the claim.
Map<String, String>? buildOhacAcknowledgementRequestBody({
  required OhacPolicyEpochEntity epoch,
  required String tenantId,
  required String terminalId,
  required String? posBuild,
  required String negotiatedAssertionSchema,
}) {
  // Fail closed on ANY unavailable or malformed input. Each check mirrors
  // one backend DTO constraint, so a body returned here always passes the
  // server-side field validation.
  if (posBuild == null || posBuild.isEmpty) return null;
  if (negotiatedAssertionSchema.isEmpty) return null;
  if (epoch.schema.isEmpty) return null;
  if (epoch.sequence < 1) return null;
  if (!isDigest(epoch.digest)) return null;
  final previousDigestIsValid = epoch.previousDigest == genesisDigest ||
      isDigest(epoch.previousDigest);
  if (!previousDigestIsValid) return null;
  if (epoch.previousSequence < 0) return null;
  if (tenantId.isEmpty || terminalId.isEmpty) return null;

  String idempotencyKey;
  try {
    idempotencyKey = deriveOhacAckIdempotencyKey(
      tenantId: tenantId,
      terminalId: terminalId,
      sequence: epoch.sequence,
      digest: epoch.digest,
    );
  } on ArgumentError {
    return null;
  }

  return <String, String>{
    'schema': epoch.schema,
    'sequence': epoch.sequence.toString(),
    'digest': epoch.digest,
    'previousSequence': epoch.previousSequence.toString(),
    'previousDigest': epoch.previousDigest,
    'posBuild': posBuild,
    'assertionSchema': negotiatedAssertionSchema,
    'idempotencyKey': idempotencyKey,
  };
}
