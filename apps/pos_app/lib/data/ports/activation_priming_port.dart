/// Thrown when the response for GET /onboarding/terminals/priming cannot be
/// parsed into a valid [TerminalPrimingPayload]: a non-object body, a missing
/// or non-object `deltas` object, an absent `products` or `catalogValues`
/// list (a partial payload), an entry without its identity fields, a missing
/// `currentVersion`, or a fiscal envelope that is not a JSON object.
///
/// A malformed or partial priming payload must never be silently applied:
/// the caller uses this named failure to block activation instead of
/// proceeding with a half-primed terminal.
class TerminalPrimingPayloadException implements Exception {
  /// Stable machine-readable error code (e.g. `TERMINAL_PRIMING_DELTAS_MISSING`).
  final String code;

  final String message;

  const TerminalPrimingPayloadException(this.code, this.message);

  @override
  String toString() => 'TerminalPrimingPayloadException($code): $message';
}

/// The parsed human-authenticated priming payload returned by
/// `GET /onboarding/terminals/priming`:
/// `{ status, serverTime, currentVersion, deltas: { products, catalogValues,
/// fiscalConfig }, fiscalConfig }`.
class TerminalPrimingPayload {
  final String status;
  final String serverTime;
  final int currentVersion;

  /// Raw product delta maps, already validated for entry identity (id, name).
  final List<Map<String, dynamic>> products;

  /// Raw catalog value delta maps, already validated for entry identity
  /// (id, catalogType, code, name).
  final List<Map<String, dynamic>> catalogValues;

  /// The fiscal snapshot envelope, resolved from `deltas.fiscalConfig` with a
  /// fallback to the top-level `fiscalConfig` (mirroring the device-path
  /// resolution in `SyncService`). Null when the tenant has no fiscal config.
  final Map<String, dynamic>? fiscalEnvelope;

  const TerminalPrimingPayload({
    required this.status,
    required this.serverTime,
    required this.currentVersion,
    required this.products,
    required this.catalogValues,
    required this.fiscalEnvelope,
  });

  /// Strict parse: a malformed or partial payload is a named failure, never a
  /// silently empty application.
  factory TerminalPrimingPayload.fromJson(Map<String, dynamic> data) {
    final status = data['status']?.toString().trim() ?? '';
    if (status.isEmpty) {
      throw const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_STATUS_MISSING',
        'Priming payload is missing or has a blank status',
      );
    }

    final serverTime = data['serverTime']?.toString().trim() ?? '';
    if (serverTime.isEmpty) {
      throw const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_SERVER_TIME_MISSING',
        'Priming payload is missing or has a blank serverTime',
      );
    }

    final rawCurrentVersion = data['currentVersion'];
    if (rawCurrentVersion is! num) {
      throw const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_CURRENT_VERSION_MISSING',
        'Priming payload is missing or has an invalid currentVersion',
      );
    }

    final rawDeltas = data['deltas'];
    if (rawDeltas is! Map) {
      throw const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_DELTAS_MISSING',
        'Priming payload is missing or has a non-object deltas object',
      );
    }

    final rawProducts = rawDeltas['products'];
    if (rawProducts is! List) {
      throw const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_DELTAS_PARTIAL',
        'Priming payload deltas is missing the products list',
      );
    }
    final products = <Map<String, dynamic>>[];
    for (final entry in rawProducts) {
      if (entry is! Map) {
        throw const TerminalPrimingPayloadException(
          'TERMINAL_PRIMING_PRODUCT_ENTRY_MALFORMED',
          'Priming payload contains a non-object product delta entry',
        );
      }
      final map = Map<String, dynamic>.from(entry);
      final id = map['id']?.toString().trim() ?? '';
      final name = map['name']?.toString().trim() ?? '';
      if (id.isEmpty || name.isEmpty) {
        throw const TerminalPrimingPayloadException(
          'TERMINAL_PRIMING_PRODUCT_ENTRY_MALFORMED',
          'Priming payload contains a product delta entry without id or name',
        );
      }
      products.add(map);
    }

    final rawCatalogValues = rawDeltas['catalogValues'];
    if (rawCatalogValues is! List) {
      throw const TerminalPrimingPayloadException(
        'TERMINAL_PRIMING_DELTAS_PARTIAL',
        'Priming payload deltas is missing the catalogValues list',
      );
    }
    final catalogValues = <Map<String, dynamic>>[];
    for (final entry in rawCatalogValues) {
      if (entry is! Map) {
        throw const TerminalPrimingPayloadException(
          'TERMINAL_PRIMING_CATALOG_ENTRY_MALFORMED',
          'Priming payload contains a non-object catalog delta entry',
        );
      }
      final map = Map<String, dynamic>.from(entry);
      final id = map['id']?.toString().trim() ?? '';
      final catalogType = map['catalogType']?.toString().trim() ?? '';
      final code = map['code']?.toString().trim() ?? '';
      final name = map['name']?.toString().trim() ?? '';
      if (id.isEmpty || catalogType.isEmpty || code.isEmpty || name.isEmpty) {
        throw const TerminalPrimingPayloadException(
          'TERMINAL_PRIMING_CATALOG_ENTRY_MALFORMED',
          'Priming payload contains a catalog delta entry without id, '
          'catalogType, code or name',
        );
      }
      catalogValues.add(map);
    }

    // The fiscal snapshot may legitimately be absent (a tenant without fiscal
    // setup yet), but when present it must be a JSON object in both locations.
    final rawDeltasFiscal = rawDeltas['fiscalConfig'];
    final rawTopLevelFiscal = data['fiscalConfig'];
    Map<String, dynamic>? fiscalEnvelope;
    if (rawDeltasFiscal != null || rawTopLevelFiscal != null) {
      final chosen = rawDeltasFiscal ?? rawTopLevelFiscal;
      if (chosen is! Map) {
        throw const TerminalPrimingPayloadException(
          'TERMINAL_PRIMING_FISCAL_ENVELOPE_MALFORMED',
          'Priming payload carries a fiscal config that is not a JSON object',
        );
      }
      fiscalEnvelope = Map<String, dynamic>.from(chosen);
    }

    return TerminalPrimingPayload(
      status: status,
      serverTime: serverTime,
      currentVersion: rawCurrentVersion.toInt(),
      products: products,
      catalogValues: catalogValues,
      fiscalEnvelope: fiscalEnvelope,
    );
  }
}

/// Fetches the human-authenticated terminal priming payload
/// (`GET onboarding/terminals/priming`, guarded by the same authenticated
/// Dio client used by [DioActivationSyncPort]).
abstract class ActivationPrimingPort {
  /// Fetches and strictly parses the priming payload. Network failures
  /// propagate (so the caller can block activation on an unreachable
  /// backend) and a malformed or partial payload raises
  /// [TerminalPrimingPayloadException] instead of being applied partially.
  Future<TerminalPrimingPayload> fetchPrimingPayload() {
    throw UnimplementedError();
  }
}
