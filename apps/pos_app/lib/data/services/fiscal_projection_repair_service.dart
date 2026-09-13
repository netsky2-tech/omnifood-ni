import 'dart:async';
import 'dart:developer' as developer;
import '../database/app_database.dart';
import '../models/fiscal_config_local_entity.dart';
import 'fiscal_inbox_handler.dart';

enum FiscalProjectionRepairStatus {
  repaired,
  noOp,
  ambiguous,
  noSnapshots,
  failed,
}

class FiscalProjectionRepairException implements Exception {
  final String message;
  final Object? cause;

  const FiscalProjectionRepairException(this.message, [this.cause]);

  @override
  String toString() =>
      'FiscalProjectionRepairException: $message${cause != null ? ' (cause: $cause)' : ''}';
}

class FiscalProjectionRepairResult {
  final FiscalProjectionRepairStatus status;
  final String? tenantId;
  final int? revision;
  final String message;
  final Object? error;

  const FiscalProjectionRepairResult({
    required this.status,
    this.tenantId,
    this.revision,
    required this.message,
    this.error,
  });

  bool get isRepaired => status == FiscalProjectionRepairStatus.repaired;
  bool get isNoOp => status == FiscalProjectionRepairStatus.noOp;
  bool get isAmbiguous => status == FiscalProjectionRepairStatus.ambiguous;
  bool get isNoSnapshots => status == FiscalProjectionRepairStatus.noSnapshots;
  bool get isFailed => status == FiscalProjectionRepairStatus.failed;
}

class FiscalProjectionRepairRunner {
  final AppDatabase _database;
  final FiscalInboxHandler _inboxHandler;

  FiscalProjectionRepairRunner(
    this._database, {
    FiscalInboxHandler? inboxHandler,
  }) : _inboxHandler = inboxHandler ?? FiscalInboxHandler(_database);

  /// Scans fiscal_config_local offline and rebuilds incomplete/outdated projections.
  /// Does not require network, authentication, Force Sync, or incoming envelope.
  Future<FiscalProjectionRepairResult> runStartupRepair() async {
    return run();
  }

  Future<FiscalProjectionRepairResult> run() async {
    developer.log(
      '[FISCAL_PROJECTION] startup_scan_started=true',
      name: 'FiscalProjectionRepairRunner',
    );

    final List<FiscalConfigLocalEntity> snapshots;
    try {
      snapshots = await _database.fiscalConfigLocalDao.getAll();
    } catch (e, stack) {
      developer.log(
        '[FISCAL_PROJECTION] startup_scan_failed=true',
        name: 'FiscalProjectionRepairRunner',
        error: e,
        stackTrace: stack,
      );
      return FiscalProjectionRepairResult(
        status: FiscalProjectionRepairStatus.failed,
        message: 'Failed to read fiscal snapshots from database',
        error: e,
      );
    }

    developer.log(
      '[FISCAL_PROJECTION] startup_scan_completed=true snapshot_count=${snapshots.length}',
      name: 'FiscalProjectionRepairRunner',
    );

    if (snapshots.isEmpty) {
      return const FiscalProjectionRepairResult(
        status: FiscalProjectionRepairStatus.noSnapshots,
        message: 'No stored fiscal snapshots found',
      );
    }

    // Explicitly catch active-binding DAO read failures into failed status
    final dynamic activeTenantConfig;
    try {
      activeTenantConfig =
          await _database.localConfigDao.getConfigByKey(FiscalProjectionKeys.tenantId);
    } catch (e, stack) {
      developer.log(
        '[FISCAL_PROJECTION] active_binding_read_failed=true',
        name: 'FiscalProjectionRepairRunner',
        error: e,
        stackTrace: stack,
      );
      return FiscalProjectionRepairResult(
        status: FiscalProjectionRepairStatus.failed,
        message: 'Failed to read active tenant binding from local_configs',
        error: e,
      );
    }

    final activeTenantId = activeTenantConfig?.value?.toString().trim();
    final hasActiveTenant = activeTenantId != null && activeTenantId.isNotEmpty;

    final FiscalConfigLocalEntity targetSnapshot;
    if (snapshots.length == 1) {
      final singleSnapshot = snapshots.first;
      // If exactly one snapshot exists but an existing nonblank local tenant_id differs, do not overwrite; fail closed/ambiguous
      if (hasActiveTenant && singleSnapshot.tenantId != activeTenantId) {
        developer.log(
          '[FISCAL_PROJECTION] single_snapshot_tenant_mismatch_ambiguous=true',
          name: 'FiscalProjectionRepairRunner',
        );
        return const FiscalProjectionRepairResult(
          status: FiscalProjectionRepairStatus.ambiguous,
          message:
              'Single snapshot tenant does not match active local tenant binding',
        );
      }
      targetSnapshot = singleSnapshot;
    } else {
      // Multiple snapshots: check if an active tenant binding matches exactly one snapshot
      if (hasActiveTenant) {
        final matches =
            snapshots.where((s) => s.tenantId == activeTenantId).toList();
        if (matches.length == 1) {
          targetSnapshot = matches.first;
        } else {
          developer.log(
            '[FISCAL_PROJECTION] ambiguity_detected=true snapshot_count=${snapshots.length}',
            name: 'FiscalProjectionRepairRunner',
          );
          return FiscalProjectionRepairResult(
            status: FiscalProjectionRepairStatus.ambiguous,
            message:
                'Multiple snapshots found (${snapshots.length}) and active tenant match is ambiguous',
          );
        }
      } else {
        developer.log(
          '[FISCAL_PROJECTION] ambiguity_detected=true snapshot_count=${snapshots.length}',
          name: 'FiscalProjectionRepairRunner',
        );
        return FiscalProjectionRepairResult(
          status: FiscalProjectionRepairStatus.ambiguous,
          message:
              'Multiple snapshots found (${snapshots.length}) without active tenant binding',
        );
      }
    }

    developer.log(
      '[FISCAL_PROJECTION] evaluating_snapshot=true tenant_id=${sanitizeTenantId(targetSnapshot.tenantId)} revision=${targetSnapshot.revision}',
      name: 'FiscalProjectionRepairRunner',
    );

    try {
      final outcome =
          await _inboxHandler.repairProjectionFromSnapshot(targetSnapshot);

      if (outcome.isRepaired) {
        return FiscalProjectionRepairResult(
          status: FiscalProjectionRepairStatus.repaired,
          tenantId: targetSnapshot.tenantId,
          revision: targetSnapshot.revision,
          message: outcome.message ?? 'Projections repaired successfully',
        );
      } else if (outcome.isIdempotent) {
        return FiscalProjectionRepairResult(
          status: FiscalProjectionRepairStatus.noOp,
          tenantId: targetSnapshot.tenantId,
          revision: targetSnapshot.revision,
          message: outcome.message ?? 'Projections already up to date',
        );
      } else {
        return FiscalProjectionRepairResult(
          status: FiscalProjectionRepairStatus.failed,
          tenantId: targetSnapshot.tenantId,
          revision: targetSnapshot.revision,
          message: outcome.message ?? 'Projection repair failed',
        );
      }
    } catch (e, stack) {
      developer.log(
        '[FISCAL_PROJECTION] repair_error=true tenant_id=${sanitizeTenantId(targetSnapshot.tenantId)} revision=${targetSnapshot.revision}',
        name: 'FiscalProjectionRepairRunner',
        error: e,
        stackTrace: stack,
      );
      rethrow;
    }
  }
}

typedef FiscalProjectionRepairService = FiscalProjectionRepairRunner;

/// Small testable bootstrap runner boundary ensuring startup fiscal repair
/// completes before fiscal-dependent consumers (such as BusinessProfileViewModel)
/// are eagerly constructed or initialized.
///
/// Fails closed for actual repair failures and ambiguous states while preserving legitimate
/// empty-database and healthy projection no-op behavior.
class FiscalBootstrapRunner {
  final FiscalProjectionRepairRunner repairRunner;

  const FiscalBootstrapRunner({required this.repairRunner});

  factory FiscalBootstrapRunner.fromDatabase(
    AppDatabase database, {
    FiscalInboxHandler? inboxHandler,
  }) {
    return FiscalBootstrapRunner(
      repairRunner: FiscalProjectionRepairRunner(
        database,
        inboxHandler: inboxHandler,
      ),
    );
  }

  /// Runs startup fiscal repair and guards subsequent consumer initialization.
  ///
  /// If [initConsumers] is provided, it is invoked ONLY after repair completes successfully.
  /// Fails closed (throws [FiscalProjectionRepairException]) on repair failure, scan failure, or ambiguous tenant state.
  Future<FiscalProjectionRepairResult> run({
    FutureOr<void> Function(FiscalProjectionRepairResult repairResult)?
        initConsumers,
  }) async {
    developer.log(
      '[FISCAL_BOOTSTRAP] startup_repair_invoked=true',
      name: 'FiscalBootstrapRunner',
    );

    final FiscalProjectionRepairResult result;
    try {
      result = await repairRunner.runStartupRepair();
    } catch (e, stack) {
      developer.log(
        '[FISCAL_BOOTSTRAP] startup_repair_exception=true',
        name: 'FiscalBootstrapRunner',
        error: e,
        stackTrace: stack,
      );
      if (e is FiscalProjectionRepairException) {
        rethrow;
      }
      throw FiscalProjectionRepairException(
        'Startup fiscal repair threw an unhandled exception',
        e,
      );
    }

    if (result.isFailed || result.isAmbiguous) {
      developer.log(
        '[FISCAL_BOOTSTRAP] startup_repair_failed_or_ambiguous=true status=${result.status.name}',
        name: 'FiscalBootstrapRunner',
        error: result.error,
      );
      throw FiscalProjectionRepairException(
        result.message,
        result.error,
      );
    }

    developer.log(
      '[FISCAL_BOOTSTRAP] startup_repair_ready=true status=${result.status.name}',
      name: 'FiscalBootstrapRunner',
    );

    if (initConsumers != null) {
      await initConsumers(result);
    }

    return result;
  }

  /// Runs startup fiscal repair and returns the result of [initConsumers].
  ///
  /// Ensures fiscal repair is completed before [initConsumers] executes.
  /// Fails closed if repair fails or is ambiguous.
  Future<T> runWithConsumers<T>({
    required FutureOr<T> Function(FiscalProjectionRepairResult repairResult)
        initConsumers,
  }) async {
    final result = await run();
    return await initConsumers(result);
  }
}
