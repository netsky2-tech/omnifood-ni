import 'dart:convert';

import 'package:dio/dio.dart';

/// ENT-04 — pure classification of a cloud sync HTTP failure.
///
/// Extracted from `SyncService._runDomain` so the non-2xx decision (auth
/// block vs plan block vs retry vs permanent rejection) is unit-testable
/// without any repository, database or timer.
///
/// Plan refusals (catalog `docs/plans/entitlements/catalogo_capacidades_v1.md`
/// §6.3, product-owner decision) are NOT auth failures and NEVER drop
/// records: the operation stays pending in the local queue until the
/// entitlement snapshot grants the capability or quota.
class SyncFailureClassification {
  /// Exactly one of the four flags is true for any classification.
  const SyncFailureClassification({
    this.authBlocked = false,
    this.planBlocked = false,
    this.retryable = false,
    this.permanent = false,
  });

  const SyncFailureClassification.authBlocked()
      : this(authBlocked: true);

  const SyncFailureClassification.planBlocked() : this(planBlocked: true);

  const SyncFailureClassification.retryable() : this(retryable: true);

  const SyncFailureClassification.permanent() : this(permanent: true);

  /// Credentials problem (401, or 403 that is NOT a plan refusal): the whole
  /// sync pass is unauthorised, observability flags flip, records stay
  /// pending. Unchanged pre-ENT-04 behaviour.
  final bool authBlocked;

  /// Plan refusal: 403 `CAPABILITY_REQUIRED` or 409 `QUOTA_EXCEEDED`. The
  /// records stay pending, the domain stops being retried until the
  /// entitlement snapshot changes, and nothing is ever dropped (§6.3).
  final bool planBlocked;

  /// Transient (408/429/5xx/network): the normal retry cycle continues.
  final bool retryable;

  /// Permanent 4xx rejection (the record itself is wrong): existing
  /// per-domain drop paths may apply (e.g. purchases), but 401/403 are
  /// always excluded from this branch.
  final bool permanent;

  @override
  String toString() =>
      'SyncFailureClassification(auth: $authBlocked, plan: $planBlocked, '
      'retryable: $retryable, permanent: $permanent)';
}

/// Classifies [error] into exactly one of the four outcome flags.
///
/// Table (status → outcome):
/// - 403 with body `code: CAPABILITY_REQUIRED` → planBlocked
/// - 409 with body `code: QUOTA_EXCEEDED`      → planBlocked
/// - 401, and 403 without that code            → authBlocked
/// - any other 4xx (except 408/429)            → permanent
/// - 408 / 429 / 5xx / no status / network     → retryable
SyncFailureClassification classifySyncFailure(DioException error) {
  final statusCode = error.response?.statusCode;
  if (statusCode == 403 && _bodyCode(error) == 'CAPABILITY_REQUIRED') {
    return const SyncFailureClassification.planBlocked();
  }
  if (statusCode == 409 && _bodyCode(error) == 'QUOTA_EXCEEDED') {
    return const SyncFailureClassification.planBlocked();
  }
  if (statusCode == 401 || statusCode == 403) {
    return const SyncFailureClassification.authBlocked();
  }
  if (statusCode != null &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode != 408 &&
      statusCode != 429) {
    return const SyncFailureClassification.permanent();
  }
  return const SyncFailureClassification.retryable();
}

/// What the purchase drain must do with one refused row.
///
/// Extracted for the same reason as [classifySyncFailure]: the ORDER of these
/// decisions is the rule, and inlining it in a 5k-line service left it
/// effectively untested. Plan refusal wins over every drop path — catalog
/// §6.3 point 5 forbids discarding a captured operation.
enum PurchaseRejectionAction {
  /// Plan refusal: rethrow so `_runDomain` records the plan block. The row
  /// stays pending and NOTHING is dropped.
  rethrowForPlanBlock,

  /// The record itself is wrong (malformed id, duplicate, validation):
  /// record the refusal and move on, so one bad row cannot block the queue.
  markRejectedAndContinue,

  /// Transient: leave it pending for the next cycle.
  retry,
}

/// The purchase drain's decision, in rule order: plan block first, permanent
/// rejection second, retry otherwise.
PurchaseRejectionAction purchaseRejectionAction(DioException error) {
  final classification = classifySyncFailure(error);
  if (classification.planBlocked) {
    return PurchaseRejectionAction.rethrowForPlanBlock;
  }
  if (classification.permanent) {
    return PurchaseRejectionAction.markRejectedAndContinue;
  }
  return PurchaseRejectionAction.retry;
}

/// Reads the backend's own refusal `code` from the response body. Dio may
/// hand the body over as an already-parsed Map or as a raw JSON string; both
/// are accepted, and anything unreadable yields null (a 403 with an
/// unreadable body is an auth problem, not a plan refusal — fail closed to
/// the pre-ENT-04 behaviour).
String? _bodyCode(DioException error) {
  final data = error.response?.data;
  Object? body = data;
  if (data is String) {
    try {
      body = jsonDecode(data);
    } catch (_) {
      return null;
    }
  }
  if (body is Map) {
    final code = body['code'];
    if (code is String && code.trim().isNotEmpty) return code.trim();
  }
  return null;
}
