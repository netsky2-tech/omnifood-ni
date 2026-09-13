import 'package:floor/floor.dart';
import '../models/fiscal_config_local_entity.dart';
import '../models/local_config_entity.dart';
import '../models/sales/tax_config_entity.dart';

enum FiscalPreconditionReason {
  staleRevision,
  integrityConflict,
  duplicateSnapshot,
  snapshotMissing,
  snapshotReplaced,
}

class FiscalPreconditionException implements Exception {
  final String message;
  final FiscalPreconditionReason reason;

  const FiscalPreconditionException(this.message, this.reason);

  @override
  String toString() => 'FiscalPreconditionException($reason): $message';
}

@dao
abstract class FiscalConfigLocalDao {
  @Query('SELECT * FROM fiscal_config_local WHERE tenant_id = :tenantId')
  Future<FiscalConfigLocalEntity?> getByTenantId(String tenantId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertOrReplace(FiscalConfigLocalEntity entity);

  @Query('DELETE FROM fiscal_config_local WHERE tenant_id = :tenantId')
  Future<void> deleteByTenantId(String tenantId);

  @Query('SELECT * FROM fiscal_config_local')
  Future<List<FiscalConfigLocalEntity>> getAll();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertLocalConfig(LocalConfigEntity config);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertTaxConfig(TaxConfigEntity config);

  @Query('DELETE FROM local_configs WHERE `key` = :key')
  Future<void> deleteLocalConfigByKey(String key);

  /// Applies fiscal config transactionally.
  /// RULE: Methods annotated with @transaction MUST use positional arguments.
  @transaction
  Future<void> applyFiscalConfig(FiscalConfigLocalEntity entity) async {
    await insertOrReplace(entity);
  }

  /// Atomically executes fiscal config application or repair in a single SQLite transaction,
  /// evaluating decisive snapshot revision/fingerprint preconditions inside the transaction before writes.
  ///
  /// Positional arguments are mandatory for Floor `@transaction` methods:
  /// - [snapshot]: When non-null (new or higher revision), upserted into `fiscal_config_local`.
  ///   When null (same-revision repair), `fiscal_config_local` is NOT touched, preserving canonical state.
  /// - [tenantId]: Tenant identifier to verify against current database state.
  /// - [expectedRevision]: Expected incoming or repair revision for race/integrity check.
  /// - [expectedFingerprint]: Expected incoming or repair fingerprint for race/integrity check.
  /// - [projections]: Written to `local_configs` (derived values and legacy revision/fingerprint markers).
  /// - [keysToDelete]: Keys to delete from `local_configs` (e.g. absent optional fields).
  /// - [taxConfig]: Written to `tax_configurations` if non-null.
  /// - [completionMarker]: Written to `local_configs` LAST (`fiscal_projection_version`).
  ///
  /// If any precondition check or intermediate write fails, Floor rolls back the entire transaction.
  @transaction
  Future<void> executeFiscalEnvelopeTransaction(
    FiscalConfigLocalEntity? snapshot,
    String tenantId,
    int expectedRevision,
    String expectedFingerprint,
    List<LocalConfigEntity> projections,
    List<String> keysToDelete,
    TaxConfigEntity? taxConfig,
    LocalConfigEntity completionMarker,
  ) async {
    final current = await getByTenantId(tenantId);

    if (snapshot != null) {
      // New envelope application precondition
      if (current != null) {
        if (current.revision > snapshot.revision) {
          throw FiscalPreconditionException(
            'Cannot apply stale revision ${snapshot.revision} over current ${current.revision}',
            FiscalPreconditionReason.staleRevision,
          );
        }
        if (current.revision == snapshot.revision) {
          if (current.fingerprint != snapshot.fingerprint) {
            throw FiscalPreconditionException(
              'Integrity conflict: fingerprint mismatch for revision ${snapshot.revision}',
              FiscalPreconditionReason.integrityConflict,
            );
          } else {
            throw FiscalPreconditionException(
              'Duplicate snapshot for revision ${snapshot.revision}',
              FiscalPreconditionReason.duplicateSnapshot,
            );
          }
        }
      }
      await insertOrReplace(snapshot);
    } else {
      // Same-revision repair precondition: snapshot must exist and remain unchanged
      if (current == null) {
        throw const FiscalPreconditionException(
          'Target snapshot missing during repair',
          FiscalPreconditionReason.snapshotMissing,
        );
      }
      if (current.revision != expectedRevision ||
          current.fingerprint != expectedFingerprint) {
        throw FiscalPreconditionException(
          'Target snapshot changed during repair (expected rev $expectedRevision, found rev ${current.revision})',
          FiscalPreconditionReason.snapshotReplaced,
        );
      }
    }

    for (final key in keysToDelete) {
      await deleteLocalConfigByKey(key);
    }
    for (final projection in projections) {
      await insertLocalConfig(projection);
    }
    if (taxConfig != null) {
      await insertTaxConfig(taxConfig);
    }
    await insertLocalConfig(completionMarker);
  }
}
