import 'dart:convert';
import 'dart:developer' as developer;
import '../database/app_database.dart';
import '../models/fiscal_config_local_entity.dart';
import '../models/local_config_entity.dart';
import '../models/sales/tax_config_entity.dart';

enum FiscalInboxStatus {
  applied,
  idempotentNoOp,
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
}

class FiscalInboxHandler {
  final AppDatabase _database;

  FiscalInboxHandler(this._database);

  Future<FiscalInboxOutcome> handleFiscalEnvelope(
    Map<String, dynamic> rawEnvelope, {
    bool throwOnConflict = true,
  }) async {
    final tenantId = rawEnvelope['tenantId']?.toString().trim();
    if (tenantId == null || tenantId.isEmpty) {
      throw ArgumentError('Fiscal envelope missing tenantId');
    }

    final rawVersion = rawEnvelope['configVersion'];
    if (rawVersion is! Map) {
      throw ArgumentError('Fiscal envelope missing configVersion');
    }

    final incomingRevision = (rawVersion['revision'] as num).toInt();
    final incomingFingerprint =
        rawVersion['fingerprint']?.toString().trim() ?? '';

    if (incomingFingerprint.isEmpty) {
      throw ArgumentError('Fiscal envelope configVersion missing fingerprint');
    }

    final local = await _database.fiscalConfigLocalDao.getByTenantId(tenantId);

    if (local != null) {
      // 1. Idempotency: exact match { revision, fingerprint } is a no-op
      if (local.revision == incomingRevision &&
          local.fingerprint == incomingFingerprint) {
        developer.log(
          'Fiscal envelope is identical duplicate for tenant $tenantId (rev $incomingRevision) — no-op',
          name: 'FiscalInboxHandler',
        );
        return FiscalInboxOutcome(
          status: FiscalInboxStatus.idempotentNoOp,
          revision: incomingRevision,
          fingerprint: incomingFingerprint,
          message: 'Duplicate snapshot with identical revision and fingerprint',
          entity: local,
        );
      }

      // 2. Integrity conflict: same revision with different fingerprint blocks application
      if (local.revision == incomingRevision &&
          local.fingerprint != incomingFingerprint) {
        final errorMsg =
            'INTEGRITY_CONFLICT: Same revision $incomingRevision with altered fingerprint ($incomingFingerprint vs local ${local.fingerprint})';
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

        if (throwOnConflict) {
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

    // 4. Apply projection to SQLite
    final appliedAt = DateTime.now().toUtc().toIso8601String();
    final entity = FiscalConfigLocalEntity(
      tenantId: tenantId,
      revision: incomingRevision,
      fingerprint: incomingFingerprint,
      payload: jsonEncode(rawEnvelope),
      appliedAt: appliedAt,
    );

    await _database.fiscalConfigLocalDao.applyFiscalConfig(entity);

    // 5. Update local config sync markers
    await _database.localConfigDao.saveConfig(
      LocalConfigEntity(
        key: 'last_applied_fiscal_revision',
        value: incomingRevision.toString(),
      ),
    );
    await _database.localConfigDao.saveConfig(
      LocalConfigEntity(
        key: 'last_applied_fiscal_fingerprint',
        value: incomingFingerprint,
      ),
    );

    // 6. Project fiscal snapshot fields to local_configs for UI consumption
    final businessName = rawEnvelope['businessName']?.toString();
    final ruc = rawEnvelope['ruc']?.toString();
    final fiscalRegime = rawEnvelope['fiscalRegime']?.toString();
    final commercialFxSpread = rawEnvelope['commercialFxSpread'];

    if (businessName != null && businessName.isNotEmpty) {
      await _database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'business_name',
          value: businessName,
          description: 'Business name from fiscal config sync',
        ),
      );
    }
    if (ruc != null && ruc.isNotEmpty) {
      await _database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'ruc',
          value: ruc,
          description: 'RUC from fiscal config sync',
        ),
      );
    }
    if (fiscalRegime != null && fiscalRegime.isNotEmpty) {
      await _database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'tax_regime',
          value: fiscalRegime,
          description: 'Tax regime from fiscal config sync',
        ),
      );
    }
    if (commercialFxSpread != null) {
      await _database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'commercial_exchange_rate',
          value: commercialFxSpread.toString(),
          description: 'Commercial FX spread from fiscal config sync',
        ),
      );
    }
    if (tenantId.isNotEmpty) {
      await _database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'tenant_id',
          value: tenantId,
          description: 'Tenant ID from fiscal config sync',
        ),
      );
    }
    if (businessName != null && businessName.isNotEmpty) {
      await _database.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'tenant_name',
          value: businessName,
          description: 'Tenant name from fiscal config sync',
        ),
      );
    }

    // 7. Project to TaxConfigEntity if taxRate is present
    final taxRate = (rawEnvelope['taxRate'] as num?)?.toDouble();
    final regime = rawEnvelope['fiscalRegime']?.toString();
    if (taxRate != null) {
      final existingTaxes = await _database.taxConfigDao.getAllTaxConfigs();
      final existing = existingTaxes.cast<TaxConfigEntity?>().firstWhere(
        (t) => t?.id == 'fiscal-tax-$tenantId',
        orElse: () => null,
      );
      final newTax = TaxConfigEntity(
        id: 'fiscal-tax-$tenantId',
        name: regime ?? 'IVA',
        rate: taxRate,
        isActive: true,
        isDefault: true,
      );
      if (existing != null) {
        await _database.taxConfigDao.updateTaxConfig(newTax);
      } else {
        await _database.taxConfigDao.insertTaxConfig(newTax);
      }
    }

    developer.log(
      'Successfully projected fiscal config revision $incomingRevision ($incomingFingerprint) for tenant $tenantId'
      '${businessName != null ? ' (business: $businessName)' : ''}',
      name: 'FiscalInboxHandler',
    );

    return FiscalInboxOutcome(
      status: FiscalInboxStatus.applied,
      revision: incomingRevision,
      fingerprint: incomingFingerprint,
      entity: entity,
    );
  }
}
