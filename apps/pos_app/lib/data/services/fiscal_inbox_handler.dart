import 'dart:convert';
import 'dart:developer' as developer;
import '../daos/fiscal_config_local_dao.dart';
import '../database/app_database.dart';
import '../models/fiscal_config_local_entity.dart';
import '../models/local_config_entity.dart';
import '../models/sales/tax_config_entity.dart';

enum FiscalInboxStatus {
  applied,
  idempotentNoOp,
  projectionRepaired,
  integrityConflict,
  staleRevision,
}

class FiscalIntegrityConflictException implements Exception {
  final String message;
  final int revision;
  final String localFingerprint;
  final String incomingFingerprint;

  FiscalIntegrityConflictException({
    required this.message,
    required this.revision,
    required this.localFingerprint,
    required this.incomingFingerprint,
  });

  @override
  String toString() => 'FiscalIntegrityConflictException: $message';
}

class StaleFiscalRevisionException implements Exception {
  final String message;
  final int localRevision;
  final int incomingRevision;

  StaleFiscalRevisionException({
    required this.message,
    required this.localRevision,
    required this.incomingRevision,
  });

  @override
  String toString() => 'StaleFiscalRevisionException: $message';
}

class FiscalInboxOutcome {
  final FiscalInboxStatus status;
  final int revision;
  final String fingerprint;
  final String? message;
  final FiscalConfigLocalEntity? entity;

  const FiscalInboxOutcome({
    required this.status,
    required this.revision,
    required this.fingerprint,
    this.message,
    this.entity,
  });

  bool get isApplied => status == FiscalInboxStatus.applied;
  bool get isIdempotent => status == FiscalInboxStatus.idempotentNoOp;
  bool get isRepaired => status == FiscalInboxStatus.projectionRepaired;
}

class FiscalProjectionKeys {
  /// A persisted projection version equal to [currentVersion] means the current
  /// fiscal snapshot was validated and every mandatory local projection for
  /// this version was applied successfully in the same transaction.
  ///
  /// Increment this version whenever a mandatory local projection is added,
  /// removed, or changes semantics so existing installations are repaired.
  static const int currentVersion = 1;
  static const String fiscalProjectionVersion = 'fiscal_projection_version';
  static const String businessName = 'business_name';
  static const String tenantName = 'tenant_name';
  static const String tenantId = 'tenant_id';
  static const String taxRegime = 'tax_regime';
  static const String ruc = 'ruc';
  static const String commercialExchangeRate = 'commercial_exchange_rate';
  static const String lastAppliedFiscalRevision = 'last_applied_fiscal_revision';
  static const String lastAppliedFiscalFingerprint = 'last_applied_fiscal_fingerprint';
  static const String pricesIncludeTax = 'prices_include_tax';

  /// D-21 (#554): DGI authorization letter data projected from the fiscal
  /// snapshot (U1 backend fields). Optional mirrors: present in the snapshot
  /// -> written; absent/null/blank -> the local key is NOT written (absence
  /// looks like absence). They are never deleted here — the POS form remains
  /// the offline master of its locally-entered authorization values.
  static const String dgiAuthorizationCode = 'dgi_authorization_code';
  static const String dgiAuthorizationIssuedAt = 'dgi_authorization_issued_at';
  static const String dgiAuthorizationExpiresAt = 'dgi_authorization_expires_at';

  /// BXW-007 U3 (#734): business profile modes projected from the fiscal
  /// snapshot. Conditional mirrors, same shape as the DGI authorization
  /// fields above: non-blank in the snapshot -> written; absent/null -> the
  /// local key is NOT written and NOT deleted (the POS form stays the
  /// offline master for modes the office has not configured).
  static const String operationMode = 'operation_mode';
  static const String checkoutFxMode = 'checkout_fx_mode';

  /// SOHO-P3 S1b: owner-configured manual discount caps mirrored from the
  /// fiscal snapshot. FULL snapshot semantics, unlike the DGI/mode mirrors
  /// above: the snapshot is complete, so `null`/absent means "no cap" and the
  /// local key is DELETED — a stale cap must never survive a revision that
  /// cleared it. A valid finite number sets the local value (amount >= 0,
  /// where 0 forbids manual discounts entirely; percent in (0, 100]); a
  /// corrupt value normalizes to "no cap" (delete), never stored.
  static const String maxDiscountAmount = 'max_discount_amount';
  static const String maxDiscountPercent = 'max_discount_percent';

  /// Comma-joined local key names the cloud currently asserts for the
  /// business profile (deterministic order, no spaces, matched by token).
  /// Written in the SAME fiscal projection transaction as the asserted
  /// mirrors; removed when no field is asserted. Not a mandatory projection:
  /// never validated by [FiscalInboxHandler.isProjectionComplete].
  static const String businessProfileManagedKeys = 'business_profile_managed_keys';
}

final RegExp _fingerprintRegex = RegExp(r'^[a-zA-Z0-9_\-\.]{8,}$');

String sanitizeTenantId(String? tenantId) {
  if (tenantId == null || tenantId.isEmpty) return '<none>';
  if (tenantId.length <= 4) return '***';
  return '${tenantId.substring(0, 2)}***${tenantId.substring(tenantId.length - 2)}';
}

String sanitizeFingerprint(String? fp) {
  if (fp == null || fp.isEmpty) return '<none>';
  if (fp.length <= 8) return '***';
  return '${fp.substring(0, 4)}...${fp.substring(fp.length - 4)}';
}

class FiscalInboxHandler {
  final AppDatabase _database;

  FiscalInboxHandler(this._database);

  Future<FiscalInboxOutcome> handleFiscalEnvelope(
    Map<String, dynamic> rawEnvelope, {
    bool throwOnConflict = true,
  }) async {
    final throwOnStale = throwOnConflict;

    // Validate truly REQUIRED fields according to contract
    final tenantId = rawEnvelope['tenantId']?.toString().trim();
    if (tenantId == null || tenantId.isEmpty) {
      throw ArgumentError('Fiscal envelope missing or empty tenantId');
    }

    final businessName = rawEnvelope['businessName']?.toString().trim();
    if (businessName == null || businessName.isEmpty) {
      throw ArgumentError('Fiscal envelope missing or empty businessName');
    }

    final fiscalRegime = rawEnvelope['fiscalRegime']?.toString().trim();
    if (fiscalRegime == null || fiscalRegime.isEmpty) {
      throw ArgumentError('Fiscal envelope missing or empty fiscalRegime');
    }

    final rawVersion = rawEnvelope['configVersion'];
    if (rawVersion is! Map) {
      throw ArgumentError('Fiscal envelope missing configVersion');
    }

    final rawRevision = rawVersion['revision'];
    if (rawRevision == null) {
      throw ArgumentError('Fiscal envelope configVersion missing revision');
    }
    if (rawRevision is! int) {
      throw ArgumentError('Fiscal envelope configVersion revision must be an integer');
    }
    if (rawRevision < 0) {
      throw ArgumentError('Fiscal envelope configVersion revision cannot be negative');
    }
    final incomingRevision = rawRevision;

    final rawFingerprint = rawVersion['fingerprint'];
    if (rawFingerprint == null || rawFingerprint is! String) {
      throw ArgumentError('Fiscal envelope configVersion missing fingerprint');
    }
    final incomingFingerprint = rawFingerprint.trim();
    if (!_fingerprintRegex.hasMatch(incomingFingerprint)) {
      throw ArgumentError('Fiscal envelope configVersion invalid fingerprint format');
    }

    final rawTaxRate = rawEnvelope['taxRate'];
    if (rawTaxRate == null) {
      throw ArgumentError('Fiscal envelope missing or null taxRate');
    }
    if (rawTaxRate is! num || rawTaxRate < 0) {
      throw ArgumentError('Fiscal envelope taxRate must be a non-negative number');
    }

    final rawPricesIncludeTax = rawEnvelope['pricesIncludeTax'];
    if (rawPricesIncludeTax == null) {
      throw ArgumentError('Fiscal envelope missing or null pricesIncludeTax');
    }
    if (rawPricesIncludeTax is! bool) {
      throw ArgumentError('Fiscal envelope pricesIncludeTax must be a boolean');
    }

    // Issue #75: strict FX range — a commercial rate is C$ per USD, so a
    // value below 10 or above 100 is a data-entry error (or the old
    // dangerous 0.5 default). Fail closed at the envelope boundary.
    if (rawEnvelope.containsKey('commercialFxSpread') && rawEnvelope['commercialFxSpread'] != null) {
      final rawSpread = rawEnvelope['commercialFxSpread'];
      if (rawSpread is! num || rawSpread < 10 || rawSpread > 100) {
        throw ArgumentError(
            'Fiscal envelope commercialFxSpread must be a number between 10 and 100 if present');
      }
    }

    // SOHO-P3 S1b: manual discount caps. Mirrors the commercialFxSpread
    // boundary contract: a present, non-null cap must be a finite number in
    // range (amount >= 0, where 0 forbids manual discounts entirely; percent
    // in (0, 100]). Wire nonsense is REJECTED here, never stored; the
    // projection body additionally normalizes any non-cap value to "no cap"
    // for stored snapshots written before this validation existed.
    if (rawEnvelope.containsKey('maxDiscountAmount') && rawEnvelope['maxDiscountAmount'] != null) {
      final rawCap = rawEnvelope['maxDiscountAmount'];
      if (rawCap is! num || !rawCap.isFinite || rawCap < 0) {
        throw ArgumentError(
            'Fiscal envelope maxDiscountAmount must be a finite number >= 0 or null if present');
      }
    }
    if (rawEnvelope.containsKey('maxDiscountPercent') && rawEnvelope['maxDiscountPercent'] != null) {
      final rawCap = rawEnvelope['maxDiscountPercent'];
      if (rawCap is! num || !rawCap.isFinite || rawCap <= 0 || rawCap > 100) {
        throw ArgumentError(
            'Fiscal envelope maxDiscountPercent must be a finite number in (0, 100] or null if present');
      }
    }

    developer.log(
      '[FISCAL_INBOX] handler_started=true tenant=${sanitizeTenantId(tenantId)} revision=$incomingRevision',
      name: 'FiscalInboxHandler',
    );

    const maxRetries = 2;
    for (int attempt = 0; attempt <= maxRetries; attempt++) {
      final local = await _database.fiscalConfigLocalDao.getByTenantId(tenantId);

      if (local != null) {
        // 1. Idempotency & Projection Repair: exact match { revision, fingerprint }
        if (local.revision == incomingRevision &&
            local.fingerprint == incomingFingerprint) {
          return repairProjectionFromSnapshot(local);
        }

        // 2. Integrity conflict: same revision with different fingerprint blocks application
        if (local.revision == incomingRevision &&
            local.fingerprint != incomingFingerprint) {
          final errorMsg =
              'INTEGRITY_CONFLICT: Same revision $incomingRevision with altered fingerprint';
          developer.log(errorMsg, name: 'FiscalInboxHandler', error: errorMsg);

          if (throwOnConflict) {
            throw FiscalIntegrityConflictException(
              message: errorMsg,
              revision: incomingRevision,
              localFingerprint: local.fingerprint,
              incomingFingerprint: incomingFingerprint,
            );
          }
          return FiscalInboxOutcome(
            status: FiscalInboxStatus.integrityConflict,
            revision: incomingRevision,
            fingerprint: incomingFingerprint,
            message: errorMsg,
            entity: local,
          );
        }

        // 3. Anti-downgrade: incoming revision < local.revision is rejected
        if (incomingRevision < local.revision) {
          final errorMsg =
              'STALE_REVISION: Cannot downgrade from local revision ${local.revision} to $incomingRevision';
          developer.log(errorMsg, name: 'FiscalInboxHandler', error: errorMsg);

          if (throwOnStale) {
            throw StaleFiscalRevisionException(
              message: errorMsg,
              localRevision: local.revision,
              incomingRevision: incomingRevision,
            );
          }
          return FiscalInboxOutcome(
            status: FiscalInboxStatus.staleRevision,
            revision: incomingRevision,
            fingerprint: incomingFingerprint,
            message: errorMsg,
            entity: local,
          );
        }
      }

      // 4. Atomically persist snapshot, legacy markers, derived projections, typed tax, and completion marker LAST
      final appliedAt = DateTime.now().toUtc().toIso8601String();
      final entity = FiscalConfigLocalEntity(
        tenantId: tenantId,
        revision: incomingRevision,
        fingerprint: incomingFingerprint,
        payload: jsonEncode(rawEnvelope),
        appliedAt: appliedAt,
      );

      try {
        await _commitFiscalProjectionTransaction(
          snapshot: entity,
          tenantId: tenantId,
          revision: incomingRevision,
          fingerprint: incomingFingerprint,
          rawEnvelope: rawEnvelope,
        );

        developer.log(
          '[FISCAL_PROJECTION] projection_applied=true revision=$incomingRevision version=${FiscalProjectionKeys.currentVersion}',
          name: 'FiscalInboxHandler',
        );

        return FiscalInboxOutcome(
          status: FiscalInboxStatus.applied,
          revision: incomingRevision,
          fingerprint: incomingFingerprint,
          entity: entity,
        );
      } on FiscalPreconditionException catch (e) {
        developer.log(
          '[FISCAL_PROJECTION] transaction_precondition_conflict=true reason=${e.reason.name} attempt=$attempt',
          name: 'FiscalInboxHandler',
        );
        if (attempt >= maxRetries) {
          rethrow;
        }
        // State changed concurrently; re-evaluate against freshly committed state in SQLite.
      } catch (e, stack) {
        developer.log(
          '[FISCAL_PROJECTION] transaction_rollback=true revision=$incomingRevision reason=${e.runtimeType}',
          name: 'FiscalInboxHandler',
          error: e,
          stackTrace: stack,
        );
        rethrow;
      }
    }

    throw StateError('Exceeded max retries in handleFiscalEnvelope');
  }

  /// Evaluates and repairs projections for the given stored snapshot.
  /// Preserves snapshot revision, fingerprint, and appliedAt.
  Future<FiscalInboxOutcome> repairProjectionFromSnapshot(
    FiscalConfigLocalEntity entity, {
    int maxRetries = 2,
  }) async {
    final dynamic decoded;
    try {
      decoded = jsonDecode(entity.payload);
    } catch (_) {
      developer.log(
        '[FISCAL_PROJECTION] corrupt_snapshot_payload=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Corrupt fiscal snapshot payload for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    if (decoded is! Map<String, dynamic>) {
      developer.log(
        '[FISCAL_PROJECTION] non_object_payload=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Fiscal snapshot payload is not a JSON object for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }
    final Map<String, dynamic> rawEnvelope = decoded;

    // Snapshot integrity verification against canonical FiscalConfigLocalEntity
    final payloadTenantId = rawEnvelope['tenantId']?.toString().trim();
    if (payloadTenantId != entity.tenantId) {
      developer.log(
        '[FISCAL_PROJECTION] snapshot_tenant_mismatch=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Snapshot payload tenantId does not match canonical entity for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    final rawVersion = rawEnvelope['configVersion'];
    if (rawVersion is! Map) {
      throw FormatException(
        'Snapshot payload missing or invalid configVersion for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    final payloadRevision = rawVersion['revision'];
    if (payloadRevision is! int || payloadRevision != entity.revision) {
      throw FormatException(
        'Snapshot payload revision does not match canonical entity for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    if (entity.revision < 0 || payloadRevision < 0) {
      developer.log(
        '[FISCAL_PROJECTION] negative_snapshot_revision=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Snapshot revision cannot be negative for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    final payloadFingerprint = rawVersion['fingerprint']?.toString().trim();
    if (payloadFingerprint != entity.fingerprint) {
      throw FormatException(
        'Snapshot payload fingerprint does not match canonical entity for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    if (payloadFingerprint == null || !_fingerprintRegex.hasMatch(payloadFingerprint)) {
      developer.log(
        '[FISCAL_PROJECTION] invalid_snapshot_fingerprint=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Snapshot payload fingerprint format is invalid for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    final businessName = rawEnvelope['businessName']?.toString().trim();
    if (businessName == null || businessName.isEmpty) {
      throw FormatException(
        'Snapshot payload missing or empty businessName for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    final fiscalRegime = rawEnvelope['fiscalRegime']?.toString().trim();
    if (fiscalRegime == null || fiscalRegime.isEmpty) {
      throw FormatException(
        'Snapshot payload missing or empty fiscalRegime for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    final rawTaxRate = rawEnvelope['taxRate'];
    if (rawTaxRate == null) {
      developer.log(
        '[FISCAL_PROJECTION] missing_snapshot_tax_rate=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Snapshot payload missing or null taxRate for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }
    if (rawTaxRate is! num || rawTaxRate < 0) {
      developer.log(
        '[FISCAL_PROJECTION] invalid_snapshot_tax_rate=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Snapshot payload taxRate must be a non-negative number for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    final rawPricesIncludeTax = rawEnvelope['pricesIncludeTax'];
    if (rawPricesIncludeTax == null) {
      developer.log(
        '[FISCAL_PROJECTION] missing_snapshot_prices_include_tax=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Snapshot payload missing or null pricesIncludeTax for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }
    if (rawPricesIncludeTax is! bool) {
      developer.log(
        '[FISCAL_PROJECTION] invalid_snapshot_prices_include_tax=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
        name: 'FiscalInboxHandler',
      );
      throw FormatException(
        'Snapshot payload pricesIncludeTax must be a boolean for tenant ${sanitizeTenantId(entity.tenantId)}',
      );
    }

    // Issue #75: strict FX range, same contract as the envelope boundary —
    // a stored snapshot carrying a rate outside 10..100 is corrupt.
    if (rawEnvelope.containsKey('commercialFxSpread') && rawEnvelope['commercialFxSpread'] != null) {
      final rawFx = rawEnvelope['commercialFxSpread'];
      if (rawFx is! num || rawFx < 10 || rawFx > 100) {
        developer.log(
          '[FISCAL_PROJECTION] invalid_snapshot_commercial_fx_spread=true tenant_id=${sanitizeTenantId(entity.tenantId)}',
          name: 'FiscalInboxHandler',
        );
        throw FormatException(
          'Snapshot payload commercialFxSpread must be a number between 10 and 100 for tenant ${sanitizeTenantId(entity.tenantId)}',
        );
      }
    }

    final tenantId = entity.tenantId;

    for (int attempt = 0; attempt <= maxRetries; attempt++) {
      final isComplete = await isProjectionComplete(rawEnvelope, tenantId);
      if (isComplete) {
        developer.log(
          '[FISCAL_PROJECTION] replay_noop=true revision=${entity.revision}',
          name: 'FiscalInboxHandler',
        );
        return FiscalInboxOutcome(
          status: FiscalInboxStatus.idempotentNoOp,
          revision: entity.revision,
          fingerprint: entity.fingerprint,
          message: 'Duplicate snapshot with identical revision and fingerprint',
          entity: entity,
        );
      }

      developer.log(
        '[FISCAL_PROJECTION] repair_started=true revision=${entity.revision}',
        name: 'FiscalInboxHandler',
      );

      try {
        await _commitFiscalProjectionTransaction(
          snapshot: null, // Snapshot is NOT rewritten during repair!
          tenantId: tenantId,
          revision: entity.revision,
          fingerprint: entity.fingerprint,
          rawEnvelope: rawEnvelope,
        );

        developer.log(
          '[FISCAL_PROJECTION] repair_completed=true revision=${entity.revision} version=${FiscalProjectionKeys.currentVersion}',
          name: 'FiscalInboxHandler',
        );

        return FiscalInboxOutcome(
          status: FiscalInboxStatus.projectionRepaired,
          revision: entity.revision,
          fingerprint: entity.fingerprint,
          message: 'Derived projections repaired for identical snapshot',
          entity: entity,
        );
      } on FiscalPreconditionException catch (e) {
        developer.log(
          '[FISCAL_PROJECTION] repair_precondition_conflict=true reason=${e.reason.name} attempt=$attempt',
          name: 'FiscalInboxHandler',
        );
        if (attempt >= maxRetries) {
          rethrow;
        }
        final current = await _database.fiscalConfigLocalDao.getByTenantId(tenantId);
        if (current == null) {
          throw const FiscalPreconditionException(
            'Target snapshot missing during repair',
            FiscalPreconditionReason.snapshotMissing,
          );
        }
        if (current.revision > entity.revision) {
          return repairProjectionFromSnapshot(current, maxRetries: maxRetries - 1);
        }
      } catch (e, stack) {
        developer.log(
          '[FISCAL_PROJECTION] repair_transaction_rollback=true revision=${entity.revision} reason=${e.runtimeType}',
          name: 'FiscalInboxHandler',
          error: e,
          stackTrace: stack,
        );
        rethrow;
      }
    }

    throw StateError('Exceeded max retries in repairProjectionFromSnapshot');
  }

  /// Single private transaction assembly helper for both new apply and repair.
  Future<void> _commitFiscalProjectionTransaction({
    required FiscalConfigLocalEntity? snapshot,
    required String tenantId,
    required int revision,
    required String fingerprint,
    required Map<String, dynamic> rawEnvelope,
  }) async {
    final businessName = rawEnvelope['businessName'].toString().trim();
    final fiscalRegime = rawEnvelope['fiscalRegime'].toString().trim();

    final projections = <LocalConfigEntity>[
      LocalConfigEntity(
        key: FiscalProjectionKeys.lastAppliedFiscalRevision,
        value: revision.toString(),
        description: 'Last applied fiscal revision marker',
      ),
      LocalConfigEntity(
        key: FiscalProjectionKeys.lastAppliedFiscalFingerprint,
        value: fingerprint,
        description: 'Last applied fiscal fingerprint marker',
      ),
      LocalConfigEntity(
        key: FiscalProjectionKeys.businessName,
        value: businessName,
        description: 'Projected business name from fiscal snapshot',
      ),
      LocalConfigEntity(
        key: FiscalProjectionKeys.tenantName,
        value: businessName,
        description: 'Legacy projected tenant name from businessName',
      ),
      LocalConfigEntity(
        key: FiscalProjectionKeys.taxRegime,
        value: fiscalRegime,
        description: 'Projected fiscal regime from fiscal snapshot',
      ),
      LocalConfigEntity(
        key: FiscalProjectionKeys.tenantId,
        value: tenantId,
        description: 'Projected tenant ID from fiscal snapshot',
      ),
      LocalConfigEntity(
        key: FiscalProjectionKeys.pricesIncludeTax,
        value: rawEnvelope['pricesIncludeTax'].toString(),
        description: 'Projected prices include tax flag from fiscal snapshot',
      ),
    ];

    final keysToDelete = <String>[];

    // Optional RUC: project if non-blank, delete key atomically if absent/empty
    final ruc = rawEnvelope['ruc']?.toString().trim();
    if (ruc != null && ruc.isNotEmpty) {
      projections.add(LocalConfigEntity(
        key: FiscalProjectionKeys.ruc,
        value: ruc,
        description: 'Projected RUC from fiscal snapshot',
      ));
    } else {
      keysToDelete.add(FiscalProjectionKeys.ruc);
    }

    // Optional commercialFxSpread: project if present, delete key atomically if absent
    final fxSpread = rawEnvelope['commercialFxSpread'];
    if (fxSpread != null) {
      projections.add(LocalConfigEntity(
        key: FiscalProjectionKeys.commercialExchangeRate,
        value: fxSpread.toString().trim(),
        description: 'Projected commercial exchange rate from fiscal snapshot',
      ));
    } else {
      keysToDelete.add(FiscalProjectionKeys.commercialExchangeRate);
    }

    // SOHO-P3 S1b: manual discount caps. FULL snapshot mirrors (unlike the
    // DGI/mode mirrors below): a valid finite number in range SETS the local
    // key; null, absent, or a corrupt value CLEARS it, because the snapshot
    // is complete and a missing cap means NO CAP. A stale cap must never
    // survive a revision that cleared it. The envelope boundary already
    // rejects wire nonsense; this normalization also protects repair replays
    // of stored snapshots written before that validation existed.
    final rawMaxDiscountAmount = rawEnvelope['maxDiscountAmount'];
    if (_resolveManualDiscountCap(rawMaxDiscountAmount, allowZero: true) != null) {
      projections.add(LocalConfigEntity(
        key: FiscalProjectionKeys.maxDiscountAmount,
        value: rawMaxDiscountAmount.toString(),
        description: 'Projected manual discount amount cap from fiscal snapshot',
      ));
    } else {
      keysToDelete.add(FiscalProjectionKeys.maxDiscountAmount);
    }
    final rawMaxDiscountPercent = rawEnvelope['maxDiscountPercent'];
    if (_resolveManualDiscountCap(rawMaxDiscountPercent, allowZero: false, maxInclusive: 100) != null) {
      projections.add(LocalConfigEntity(
        key: FiscalProjectionKeys.maxDiscountPercent,
        value: rawMaxDiscountPercent.toString(),
        description: 'Projected manual discount percent cap from fiscal snapshot',
      ));
    } else {
      keysToDelete.add(FiscalProjectionKeys.maxDiscountPercent);
    }

    // D-21 (#554): optional DGI authorization mirrors. Written only when the
    // snapshot carries a non-blank value; never deleted when absent, so an
    // operator-entered local value (POS form master) is preserved.
    final dgiAuthorizationMirrors = <String, String>{
      FiscalProjectionKeys.dgiAuthorizationCode:
        rawEnvelope['dgiAuthorizationCode']?.toString().trim() ?? '',
      FiscalProjectionKeys.dgiAuthorizationIssuedAt:
        rawEnvelope['dgiAuthorizationIssuedAt']?.toString().trim() ?? '',
      FiscalProjectionKeys.dgiAuthorizationExpiresAt:
        rawEnvelope['dgiAuthorizationExpiresAt']?.toString().trim() ?? '',
    };
    dgiAuthorizationMirrors.forEach((key, value) {
      if (value.isNotEmpty) {
        projections.add(LocalConfigEntity(
          key: key,
          value: value,
          description: 'Projected DGI authorization field from fiscal snapshot',
        ));
      }
    });

    // BXW-007 U3 (#734): conditional business profile mode mirrors, same
    // shape as the DGI authorization mirrors above. Written only when the
    // snapshot carries a non-blank value; never deleted when absent, so a
    // locally-configured mode (POS form master) is preserved (R-1/R-2).
    final businessProfileMirrors = <String, String>{
      FiscalProjectionKeys.operationMode:
          rawEnvelope['operationMode']?.toString().trim() ?? '',
      FiscalProjectionKeys.checkoutFxMode:
          rawEnvelope['checkoutFxMode']?.toString().trim() ?? '',
    };
    final assertedBusinessProfileKeys = <String>[];
    // D-11: when the snapshot asserts commercialFxSpread, the office (owner
    // dashboard POST /onboarding/fiscal-setup) is the authoritative writer of
    // the commercial exchange rate too, so the rate key rides the SAME marker
    // in the SAME transaction (R-3): marker and value can never diverge. When
    // the snapshot does not carry it, the key is NOT asserted and the POS
    // field stays locally editable (fail-safe).
    if (fxSpread != null) {
      assertedBusinessProfileKeys.add(FiscalProjectionKeys.commercialExchangeRate);
    }
    businessProfileMirrors.forEach((key, value) {
      if (value.isNotEmpty) {
        projections.add(LocalConfigEntity(
          key: key,
          value: value,
          description: 'Projected business profile mode from fiscal snapshot',
        ));
        assertedBusinessProfileKeys.add(key);
      }
    });

    if (assertedBusinessProfileKeys.isEmpty) {
      // R-3: no field asserted -> remove any stale marker so absence looks
      // like absence. The local values themselves are never deleted.
      keysToDelete.add(FiscalProjectionKeys.businessProfileManagedKeys);
    } else {
      assertedBusinessProfileKeys.sort();
      projections.add(LocalConfigEntity(
        key: FiscalProjectionKeys.businessProfileManagedKeys,
        value: assertedBusinessProfileKeys.join(','),
        description:
            'Business profile keys cloud-managed by the latest fiscal snapshot',
      ));
    }

    final taxConfig = _buildTaxConfig(
      rawEnvelope: rawEnvelope,
      tenantId: tenantId,
      fiscalRegime: fiscalRegime,
    );

    final completionMarker = LocalConfigEntity(
      key: FiscalProjectionKeys.fiscalProjectionVersion,
      value: FiscalProjectionKeys.currentVersion.toString(),
      description: 'Fiscal projection version marker',
    );

    await _database.fiscalConfigLocalDao.executeFiscalEnvelopeTransaction(
      snapshot,
      tenantId,
      revision,
      fingerprint,
      projections,
      keysToDelete,
      taxConfig,
      completionMarker,
    );
  }

  /// Evaluates whether all required projections exist, match the canonical payload,
  /// optional keys are present or absent as expected,
  /// and projection version marker matches [FiscalProjectionKeys.currentVersion].
  Future<bool> isProjectionComplete(
    Map<String, dynamic> rawEnvelope,
    String tenantId,
  ) async {
    final versionConfig =
        await _database.localConfigDao.getConfigByKey(FiscalProjectionKeys.fiscalProjectionVersion);
    final versionMatches =
        versionConfig?.value == FiscalProjectionKeys.currentVersion.toString();

    // 0. configVersion revision and fingerprint must match canonical snapshot
    final rawVersion = rawEnvelope['configVersion'];
    if (rawVersion is! Map) return false;

    final rawRevision = rawVersion['revision'];
    if (rawRevision is! int || rawRevision < 0) return false;

    final rawFingerprint = rawVersion['fingerprint'];
    if (rawFingerprint is! String) return false;
    final expectedFingerprint = rawFingerprint.trim();
    if (!_fingerprintRegex.hasMatch(expectedFingerprint)) return false;

    final localRev = await _database.localConfigDao
        .getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalRevision);
    final revisionMatches =
        localRev != null && localRev.value.trim() == rawRevision.toString();

    final localFp = await _database.localConfigDao
        .getConfigByKey(FiscalProjectionKeys.lastAppliedFiscalFingerprint);
    final fingerprintMatches =
        localFp != null && localFp.value.trim() == expectedFingerprint;

    // 1. tenant_id is REQUIRED
    final localTenantId =
        await _database.localConfigDao.getConfigByKey(FiscalProjectionKeys.tenantId);
    final tenantMatches =
        localTenantId != null && localTenantId.value.trim() == tenantId.trim();

    // 2. business_name is REQUIRED and must match trimmed payload
    final rawBusinessName = rawEnvelope['businessName'];
    if (rawBusinessName is! String) return false;
    final businessName = rawBusinessName.trim();
    if (businessName.isEmpty) return false;

    final localBn =
        await _database.localConfigDao.getConfigByKey(FiscalProjectionKeys.businessName);
    final businessMatches =
        localBn != null && localBn.value.trim() == businessName;

    // 3. tenant_name is REQUIRED and derived from validated businessName
    final localTn =
        await _database.localConfigDao.getConfigByKey(FiscalProjectionKeys.tenantName);
    final tenantNameMatches =
        localTn != null && localTn.value.trim() == businessName;

    // 4. tax_regime is REQUIRED and must match trimmed payload
    final rawFiscalRegime = rawEnvelope['fiscalRegime'];
    if (rawFiscalRegime is! String) return false;
    final fiscalRegime = rawFiscalRegime.trim();
    if (fiscalRegime.isEmpty) return false;

    final localRegime =
        await _database.localConfigDao.getConfigByKey(FiscalProjectionKeys.taxRegime);
    final regimeMatches =
        localRegime != null && localRegime.value.trim() == fiscalRegime;

    // 5. prices_include_tax is REQUIRED and must match payload boolean
    final rawPricesIncludeTax = rawEnvelope['pricesIncludeTax'];
    if (rawPricesIncludeTax is! bool) {
      developer.log(
        '[FISCAL_PROJECTION] malformed_prices_include_tax_in_completeness_check=true tenant_id=${sanitizeTenantId(tenantId)}',
        name: 'FiscalInboxHandler',
      );
      return false;
    }
    final localPit = await _database.localConfigDao
        .getConfigByKey(FiscalProjectionKeys.pricesIncludeTax);
    final pricesIncludeTaxMatches = localPit != null &&
        localPit.value.trim().toLowerCase() == rawPricesIncludeTax.toString();

    // 6. ruc is OPTIONAL:
    // If present in payload -> local must exist and match trimmed value.
    // If absent in payload -> local MUST NOT exist (stale key check).
    final rawRuc = rawEnvelope['ruc'];
    final String? ruc;
    if (rawRuc is String) {
      ruc = rawRuc.trim();
    } else if (rawRuc == null) {
      ruc = null;
    } else {
      ruc = rawRuc.toString().trim();
    }
    final hasRuc = ruc != null && ruc.isNotEmpty;
    final localRuc =
        await _database.localConfigDao.getConfigByKey(FiscalProjectionKeys.ruc);
    final bool rucMatches;
    if (hasRuc) {
      rucMatches = localRuc != null && localRuc.value.trim() == ruc;
    } else {
      rucMatches = localRuc == null;
    }

    // 7. commercial_exchange_rate is OPTIONAL:
    // If present in payload -> local must exist and match.
    // If absent in payload -> local MUST NOT exist (stale key check).
    // Issue #75: strict FX range — an out-of-range rate in the payload is
    // malformed and can never satisfy projection completeness.
    final rawFxSpread = rawEnvelope['commercialFxSpread'];
    if (rawFxSpread != null &&
        (rawFxSpread is! num || rawFxSpread < 10 || rawFxSpread > 100)) {
      developer.log(
        '[FISCAL_PROJECTION] malformed_fx_spread_in_completeness_check=true tenant_id=${sanitizeTenantId(tenantId)}',
        name: 'FiscalInboxHandler',
      );
      return false;
    }
    final hasFx = rawFxSpread != null;
    final localFx = await _database.localConfigDao
        .getConfigByKey(FiscalProjectionKeys.commercialExchangeRate);
    final bool fxMatches;
    if (hasFx) {
      fxMatches =
          localFx != null && localFx.value.trim() == rawFxSpread.toString().trim();
    } else {
      fxMatches = localFx == null;
    }

    // 7b. Manual discount caps (SOHO-P3 S1b): conditional REQUIRED mirrors
    // with full snapshot semantics. A valid cap in the payload -> the local
    // key must exist and match; null/absent or a corrupt payload value ->
    // the local key MUST NOT exist (stale key check: a cleared cap must
    // never survive its own clearing revision).
    final rawMaxDiscountAmount = rawEnvelope['maxDiscountAmount'];
    final amountCap =
        _resolveManualDiscountCap(rawMaxDiscountAmount, allowZero: true);
    final localAmountCap = await _database.localConfigDao
        .getConfigByKey(FiscalProjectionKeys.maxDiscountAmount);
    final bool amountCapMatches;
    if (amountCap != null) {
      amountCapMatches = localAmountCap != null &&
          localAmountCap.value.trim() == rawMaxDiscountAmount.toString();
    } else {
      amountCapMatches = localAmountCap == null;
    }

    final rawMaxDiscountPercent = rawEnvelope['maxDiscountPercent'];
    final percentCap = _resolveManualDiscountCap(
      rawMaxDiscountPercent,
      allowZero: false,
      maxInclusive: 100,
    );
    final localPercentCap = await _database.localConfigDao
        .getConfigByKey(FiscalProjectionKeys.maxDiscountPercent);
    final bool percentCapMatches;
    if (percentCap != null) {
      percentCapMatches = localPercentCap != null &&
          localPercentCap.value.trim() == rawMaxDiscountPercent.toString();
    } else {
      percentCapMatches = localPercentCap == null;
    }

    // 8. Typed tax config is REQUIRED
    final rawTaxRate = rawEnvelope['taxRate'];
    if (rawTaxRate is! num || rawTaxRate < 0) {
      developer.log(
        '[FISCAL_PROJECTION] malformed_tax_rate_in_completeness_check=true tenant_id=${sanitizeTenantId(tenantId)}',
        name: 'FiscalInboxHandler',
      );
      return false;
    }
    final taxRate = rawTaxRate.toDouble();
    final expectedTaxName = fiscalRegime;
    final existingTaxes = await _database.taxConfigDao.getAllTaxConfigs();
    final existing = existingTaxes.cast<TaxConfigEntity?>().firstWhere(
      (t) => t?.id == 'fiscal-tax-$tenantId',
      orElse: () => null,
    );
    final taxMatches = existing != null &&
        existing.rate == taxRate &&
        existing.name == expectedTaxName &&
        existing.isActive &&
        existing.isDefault;

    final isComplete = versionMatches &&
        revisionMatches &&
        fingerprintMatches &&
        tenantMatches &&
        businessMatches &&
        tenantNameMatches &&
        regimeMatches &&
        pricesIncludeTaxMatches &&
        rucMatches &&
        fxMatches &&
        amountCapMatches &&
        percentCapMatches &&
        taxMatches;

    developer.log(
      '[FISCAL_PROJECTION] evaluated=true complete=$isComplete '
      'version_match=$versionMatches revision_match=$revisionMatches '
      'fingerprint_match=$fingerprintMatches tenant_match=$tenantMatches '
      'business_match=$businessMatches tenant_name_match=$tenantNameMatches '
      'regime_match=$regimeMatches prices_include_tax_match=$pricesIncludeTaxMatches '
      'ruc_match=$rucMatches fx_match=$fxMatches '
      'amount_cap_match=$amountCapMatches percent_cap_match=$percentCapMatches '
      'tax_match=$taxMatches',
      name: 'FiscalInboxHandler',
    );

    return isComplete;
  }

  /// SOHO-P3 S1b: resolves a manual discount cap from a snapshot value.
  /// Returns the value as a double when it is a valid cap (a finite number,
  /// >= 0 when [allowZero] — 0 forbids manual discounts entirely — and in
  /// (0, [maxInclusive]] when not), or null when the snapshot carries no cap
  /// (absent, JSON null, non-numeric, non-finite, or out of range). Null
  /// means the caller must treat the cap as CLEARED (delete the local key):
  /// the snapshot is complete, so anything that is not a valid cap means no
  /// cap, never "keep the previous value".
  static double? _resolveManualDiscountCap(
    dynamic raw, {
    required bool allowZero,
    double? maxInclusive,
  }) {
    if (raw == null || raw is! num || !raw.isFinite) return null;
    final value = raw.toDouble();
    if (allowZero ? value < 0 : value <= 0) return null;
    if (maxInclusive != null && value > maxInclusive) return null;
    return value;
  }

  TaxConfigEntity _buildTaxConfig({
    required Map<String, dynamic> rawEnvelope,
    required String tenantId,
    required String fiscalRegime,
  }) {
    final rawTaxRate = rawEnvelope['taxRate'];
    if (rawTaxRate == null || rawTaxRate is! num || rawTaxRate < 0) {
      throw FormatException(
        'Snapshot payload taxRate must be a non-negative number for tenant ${sanitizeTenantId(tenantId)}',
      );
    }
    final taxRate = rawTaxRate.toDouble();
    return TaxConfigEntity(
      id: 'fiscal-tax-$tenantId',
      name: fiscalRegime,
      rate: taxRate,
      isActive: true,
      isDefault: true,
    );
  }
}
