import 'dart:developer' as developer;

/// Allowlisted value types for observability fact fields (design §12):
/// strings (IDs, digests, enum wire values, reason tokens), ints (counts,
/// sequences) and bools. Everything else — maps, lists, doubles, arbitrary
/// objects such as an assertion body, a verifier or a request carrying a
/// PIN — is dropped by the serializer, never stringified into the log line.
bool isOhacFactSafeValue(Object? value) =>
    value is String || value is int || value is bool;

/// One structured observability fact (design §12, §16).
///
/// Facts carry IDs, digests, enumeration wire values, counts and booleans
/// ONLY. The builders below are the single small emitter surface: each
/// accepts only semantically typed scalar slots, so no PIN, verifier or
/// assertion body can flow into a fact by construction, and the serializer
/// enforces the value-type allowlist as defense in depth.
final class OhacObservabilityFact {
  final String event;
  final Map<String, Object> fields;

  const OhacObservabilityFact(this.event, this.fields);
}

/// Serializes a fact into one `name`-prefixed log line. Only allowlisted
/// value types survive; anything else is omitted.
String serializeOhacFact(OhacObservabilityFact fact) {
  final buffer = StringBuffer('ohac_fact event=${fact.event}');
  fact.fields.forEach((key, value) {
    if (isOhacFactSafeValue(value)) {
      buffer.write(' $key=$value');
    }
  });
  return buffer.toString();
}

/// Emits a fact. The injected [sink] wins (tests, collectors); the default
/// writes one `developer.log` line under the `OhacFacts` name.
void logOhacFact(
  OhacObservabilityFact fact, {
  void Function(String message)? sink,
}) {
  final message = serializeOhacFact(fact);
  if (sink != null) {
    sink(message);
    return;
  }
  developer.log(message, name: 'OhacFacts');
}

/// An integrity classification was applied to a terminal (§9). [reason] is
/// the short observation token; [applied] is whether the `markIntegrityLoss`
/// CAS won (revision race = false, retried next cycle).
OhacObservabilityFact ohacIntegrityClassifiedFact({
  required String tenantId,
  required String terminalId,
  required String classification,
  required String reason,
  required bool applied,
}) => OhacObservabilityFact('ohac_integrity_classified', {
  'tenantId': tenantId,
  'terminalId': terminalId,
  'classification': classification,
  'reason': reason,
  'applied': applied,
});

/// A drain-gate deferral or ack-retry observation (§5.1, §10): the
/// acknowledgement is being retried, not refused.
OhacObservabilityFact ohacAckDeferredFact({
  required String reason,
  required String phase,
  required int candidateSequence,
  required int deferralCount,
  required bool quarantineReview,
}) => OhacObservabilityFact('ohac_ack_deferred', {
  'reason': reason,
  'phase': phase,
  'candidateSequence': candidateSequence,
  'deferralCount': deferralCount,
  'quarantineReview': quarantineReview,
});

/// The outcome of one acknowledgement attempt: a retry-deferral reason, a
/// receipt-confirmed floor advance, or a rejection outcome.
OhacObservabilityFact ohacAckOutcomeFact({
  required String outcome,
  required String reason,
  required int sequence,
  required int floorSequence,
}) => OhacObservabilityFact('ohac_ack_outcome', {
  'outcome': outcome,
  'reason': reason,
  'sequence': sequence,
  'floorSequence': floorSequence,
});

/// One step of the ordered clear-data recovery lifecycle (design §9):
/// transport restore and the OHAC token redeem, in that order.
OhacObservabilityFact ohacRecoveryStepFact({
  required String step,
  required String outcome,
  required String classification,
  required String detail,
}) => OhacObservabilityFact('ohac_recovery_step', {
  'step': step,
  'outcome': outcome,
  'classification': classification,
  'detail': detail,
});

/// A local authorization decision (§6/§12): cohort/build gate results and
/// every denial reason, plus the authorized outcome.
OhacObservabilityFact ohacAuthorizationDecisionFact({
  required String outcome,
  required String reason,
  required String tenantId,
  required String terminalId,
  required int epochSequence,
  required String posBuild,
}) => OhacObservabilityFact('ohac_authorization_decision', {
  'outcome': outcome,
  'reason': reason,
  'tenantId': tenantId,
  'terminalId': terminalId,
  'epochSequence': epochSequence,
  'posBuild': posBuild,
});

/// An epoch publication outcome on the pull path (§5 step 1): accepted,
/// duplicate, or rejected with the contract code.
OhacObservabilityFact ohacEpochPublicationFact({
  required String action,
  required String sequence,
  required String detail,
}) => OhacObservabilityFact('ohac_epoch_publication', {
  'action': action,
  'sequence': sequence,
  'detail': detail,
});
