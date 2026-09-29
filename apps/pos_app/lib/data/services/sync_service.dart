import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../../domain/repositories/audit_repository.dart';
import '../../domain/repositories/sales/sales_repository.dart';
import '../../domain/models/inventory/inventory_movement.dart';
import '../../domain/repositories/inventory/inventory_repository.dart';
import '../../domain/models/inventory/purchase.dart';
import '../../domain/models/inventory/count_session_document.dart';
import '../../domain/models/inventory/recipe_version_document.dart';
import '../../domain/models/inventory/production_order_document.dart';
import '../../domain/security/cloud_auth_unavailable_exception.dart';
import '../../domain/security/device_sync_exceptions.dart';
import '../../domain/services/inventory/authority_hydration_status.dart';
import '../database/app_database.dart';
import '../models/inventory/product_entity.dart';
import '../models/catalog/catalog_value_entity.dart';
import '../models/inventory/insumo_entity.dart';
import '../models/inventory/recipe_entity.dart';
import '../models/user_entity.dart';
import '../models/security_profile_entity.dart';
import '../models/local_config_entity.dart';
import '../models/customer/customer_entity.dart';
import '../models/customer/customer_point_transaction_entity.dart';
import '../models/loyalty/loyalty_program_entity.dart';
import '../models/loyalty/loyalty_reward_entity.dart';
import '../models/sales/promotion_entity.dart';
import '../models/sales/cashier_session_entity.dart';
import '../models/sales/cash_movement_entity.dart';
import 'fiscal_inbox_handler.dart';
import 'authority_delta_adapter.dart';
import 'authority_hydration_service.dart';
import 'package:pos_app/data/models/inventory/authority_ingestion_verdict_entity.dart';
import 'network_connectivity_service.dart';

const Map<String, String> syncRole = {
  'EDGE_SERVER': 'EDGE_SERVER',
  'STANDALONE': 'STANDALONE',
};

typedef SyncRole = String;

enum CloudSyncStatus { idle, syncing, offline, error, success }

/// #613 Unit B — informational read model for the inert-recipe ingestion
/// verdicts, rendered by the cloud sync badge's detail dialog.
///
/// [verdictCount] is the append-only verdict row count on this device (the
/// DAO's `countVerdicts()`, never recomputed from projections or the UI);
/// [productNames] are the display names of the affected products so the
/// operator can act in Catálogo. Verdicts are facts about ingestion, not
/// errors: this model never flips `CloudSyncStatus` and never blocks a sale.
class AuthorityInertRecipeReport {
  final int verdictCount;

  /// Display-ready, deduplicated and ordered; falls back to the raw product
  /// id when the product is unknown to the terminal's own catalog.
  final List<String> productNames;

  const AuthorityInertRecipeReport({
    required this.verdictCount,
    required this.productNames,
  });
}

/// A per-record sales result that was NOT accepted by the backend
/// (anything other than ACCEPTED/APPLIED/DUPLICATE/SUCCESS).
///
/// Surfaced so operators can distinguish a terminal per-record rejection
/// (e.g. `retryable: false` with `code: CRITICAL_PAYLOAD_MISMATCH`) from a
/// transient transport failure: the record intentionally stays pending and
/// no retry loop is driven here (issue #506).
class SalesRecordRejection {
  final String invoiceId;
  final String idempotencyKey;
  final String status;
  final String? code;
  final String? message;

  /// Raw `retryable` flag returned by the backend, when present.
  final bool? retryable;

  const SalesRecordRejection({
    required this.invoiceId,
    required this.idempotencyKey,
    required this.status,
    required this.retryable,
    this.code,
    this.message,
  });
}

class InboundSyncResult {
  final int productsCount;
  final int catalogValuesCount;
  final int insumosCount;
  final int recipesCount;
  final int usersCount;
  final int alertsCount;
  final int? appliedFiscalRevision;
  final String? appliedFiscalFingerprint;

  /// Authority projection rows delivered for hydration from the
  /// `recipeVersions` delta (#519 U3). Insert-if-absent: these are rows
  /// delivered, not rows newly written.
  final int authorityInsumosCount;
  final int authorityVersionsCount;
  final int authorityComponentsCount;

  /// True when the authority hydration was refused or threw. Hydration
  /// trouble NEVER fails the pull nor blocks a sale (Q80); the outcome is
  /// surfaced here for the caller instead.
  final bool authorityHydrationFailed;
  final String? authorityHydrationFailureReason;
  final String timestamp;

  const InboundSyncResult({
    this.productsCount = 0,
    this.catalogValuesCount = 0,
    this.insumosCount = 0,
    this.recipesCount = 0,
    this.usersCount = 0,
    this.alertsCount = 0,
    this.appliedFiscalRevision,
    this.appliedFiscalFingerprint,
    this.authorityInsumosCount = 0,
    this.authorityVersionsCount = 0,
    this.authorityComponentsCount = 0,
    this.authorityHydrationFailed = false,
    this.authorityHydrationFailureReason,
    required this.timestamp,
  });
}

enum SyncRunStatus { complete, partial, failed }

class SyncRunOutcome {
  const SyncRunOutcome(this.status);

  const SyncRunOutcome.complete() : this(SyncRunStatus.complete);
  const SyncRunOutcome.partial() : this(SyncRunStatus.partial);
  const SyncRunOutcome.failed() : this(SyncRunStatus.failed);

  final SyncRunStatus status;
}

class SyncService {
  final AuditRepository _auditRepository;
  // ignore: unused_field
  final SalesRepository _salesRepository;
  final InventoryRepository _inventoryRepository;
  final Dio _dio;
  static const int _batchEnvelopeLimit = 500;
  final SyncRole _role;
  final AppDatabase? _database;
  final NetworkConnectivityService? _connectivityService;
  final FiscalInboxHandler? _fiscalInboxHandler;

  final StreamController<InboundSyncResult> _inboundSyncController =
      StreamController<InboundSyncResult>.broadcast();

  Stream<InboundSyncResult> get onInboundSync => _inboundSyncController.stream;

  final StreamController<CloudSyncStatus> _statusController =
      StreamController<CloudSyncStatus>.broadcast();

  Stream<CloudSyncStatus> get onStatusChanged => _statusController.stream;

  final StreamController<SalesRecordRejection> _salesRejectionController =
      StreamController<SalesRecordRejection>.broadcast();

  /// Per-record sales results that were NOT accepted by the backend.
  /// Emits for every non-accepted per-record result so terminal rejections
  /// (retryable:false, e.g. CRITICAL_PAYLOAD_MISMATCH) surface to the
  /// operator panel instead of failing silently (issue #506).
  Stream<SalesRecordRejection> get onSalesRecordRejected =>
      _salesRejectionController.stream;

  CloudSyncStatus _status = CloudSyncStatus.idle;
  CloudSyncStatus get status => _status;

  DateTime? _lastSyncTime;
  DateTime? get lastSyncTime => _lastSyncTime;

  String? _lastSyncError;
  String? get lastSyncError => _lastSyncError;

  int _consecutiveFailures = 0;
  int get consecutiveFailures => _consecutiveFailures;

  Timer? _timer;
  StreamSubscription<bool>? _connectivitySubscription;
  bool _isSyncing = false;
  bool _hasPendingSyncRequest = false;
  bool _authBlocked = false;
  String? _syncBlockedReason;
  bool get isAuthBlocked => _authBlocked;
  String? get syncBlockedReason => _syncBlockedReason;
  bool get isCloudAuthRequired => _authBlocked;

  SyncService(
    this._auditRepository,
    this._salesRepository,
    this._inventoryRepository,
    this._dio, {
    SyncRole role = 'STANDALONE',
    AppDatabase? database,
    NetworkConnectivityService? connectivityService,
    FiscalInboxHandler? fiscalInboxHandler,
  }) : _role = role,
       _database = database,
       _connectivityService = connectivityService,
       _fiscalInboxHandler =
           fiscalInboxHandler ??
           (database != null ? FiscalInboxHandler(database) : null);

  void _updateStatus(CloudSyncStatus newStatus) {
    if (_status != newStatus) {
      _status = newStatus;
      if (!_statusController.isClosed) {
        _statusController.add(newStatus);
      }
    }
  }

  void start() {
    // Listen to network transitions for immediate auto-sync
    _connectivitySubscription?.cancel();
    if (_connectivityService != null) {
      _connectivitySubscription = _connectivityService!.onConnectivityChanged
          .listen((isOnline) {
            if (isOnline) {
              developer.log(
                'Network recovered! Triggering automatic sync...',
                name: 'SyncService',
              );
              triggerManualSync();
            } else {
              _updateStatus(CloudSyncStatus.offline);
            }
          });
    }

    // Sync every 5 minutes
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 5), (_) async {
      await triggerManualSync();
    });
    developer.log('SyncService started', name: 'SyncService');
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _connectivitySubscription?.cancel();
    _connectivitySubscription = null;
    developer.log('SyncService stopped', name: 'SyncService');
  }

  void dispose() {
    stop();
    _inboundSyncController.close();
    _statusController.close();
  }

  Duration getNextBackoffDelay() {
    if (_consecutiveFailures == 0) return Duration.zero;
    final seconds = min(300, (pow(2, _consecutiveFailures - 1) * 5).toInt());
    return Duration(seconds: seconds);
  }

  /// Finding H1 (slice 5a): each per-domain outbox count query used to fail
  /// silently, leaving operators unable to tell which domain undercounted
  /// the sync badge. Fault isolation is preserved: a failure only removes
  /// the affected domain from the total, never breaks the count and never
  /// propagates.
  void _logOutboxCountFailure(
    String domain,
    Object error,
    StackTrace stackTrace,
  ) {
    developer.log(
      '[OUTBOX_COUNT] warning: pending count query failed for domain '
      "'$domain'; excluding it from the pending count",
      name: 'SyncService',
      error: error,
      stackTrace: stackTrace,
    );
  }

  Future<int> getPendingOutboxCount() async {
    int count = 0;
    try {
      final sales = await _salesRepository.getUnsyncedAggregates();
      count += sales.length;
    } catch (e, st) {
      _logOutboxCountFailure('sales', e, st);
    }

    try {
      final purchases = await _inventoryRepository.getUnsyncedPurchases();
      count += purchases.length;
    } catch (e, st) {
      _logOutboxCountFailure('purchases', e, st);
    }

    try {
      final counts = await _inventoryRepository
          .getUnsyncedCountSessionDocuments();
      count += counts.length;
    } catch (e, st) {
      _logOutboxCountFailure('count sessions', e, st);
    }

    try {
      final recipes = await _inventoryRepository
          .getUnsyncedRecipeVersionDocuments();
      count += recipes.length;
    } catch (e, st) {
      _logOutboxCountFailure('recipe versions', e, st);
    }

    try {
      final orders = await _inventoryRepository.getUnsyncedProductionOrders();
      count += orders.length;
    } catch (e, st) {
      _logOutboxCountFailure('production orders', e, st);
    }

    try {
      final movements = await _inventoryRepository.getUnsyncedMovements();
      count += movements.length;
    } catch (e, st) {
      _logOutboxCountFailure('movements', e, st);
    }

    return count;
  }

  /// #613 Unit B — best-effort read of the inert-recipe ingestion verdicts
  /// for the sync detail dialog. Informational only: null means "nothing to
  /// report OR the read failed" — the dialog renders exactly as before in
  /// both cases, never a new error state and never a blocked sale. The
  /// count comes from the verdict DAO (Unit A); product names are joined
  /// from the terminal's own catalog so the operator can act in Catálogo.
  /// Existing hydration telemetry and catch blocks are untouched: this is a
  /// read-only, additive accessor.
  Future<AuthorityInertRecipeReport?> getInertRecipeVerdictReport() async {
    try {
      final database = _database;
      if (database == null) return null;
      final count =
          await database.authorityIngestionVerdictDao.countVerdicts() ?? 0;
      if (count <= 0) return null;
      final rows = await database.database.rawQuery(
        'SELECT v.product_id AS product_id, p.name AS product_name '
        'FROM authority_ingestion_verdicts v '
        'LEFT JOIN products p ON p.id = v.product_id '
        'ORDER BY p.name',
      );
      final names = <String>{};
      for (final row in rows) {
        final name = row['product_name'];
        if (name is String && name.trim().isNotEmpty) {
          names.add(name.trim());
          continue;
        }
        final productId = row['product_id'];
        if (productId is String && productId.trim().isNotEmpty) {
          names.add(productId.trim());
        }
      }
      return AuthorityInertRecipeReport(
        verdictCount: count,
        productNames: names.toList(growable: false),
      );
    } catch (_) {
      // Report the absence, never the failure: the verdict table is
      // diagnostic material and its unreadability must not surface as a
      // sync error (#613 decision 5).
      return null;
    }
  }

  Future<SyncRunOutcome> triggerManualSync() async {
    if (_isSyncing) {
      _hasPendingSyncRequest = true;
      return const SyncRunOutcome.partial();
    }

    _isSyncing = true;
    _authBlocked = false;
    _syncBlockedReason = null;
    _updateStatus(CloudSyncStatus.syncing);
    developer.log('[SYNC_MANUAL] triggered=true', name: 'SyncService');

    final List<String> domainErrors = [];

    try {
      developer.log(
        'Starting sync pass with fault isolation...',
        name: 'SyncService',
      );

      var auditOutcome = const AuditSyncOutcome.retryable(failedStreams: 1);
      var hasFailure = !await _runDomain('audit', () async {
        auditOutcome = await _auditRepository.syncLogs();
      });
      hasFailure |= auditOutcome.status != AuditSyncStatus.complete;
      if (hasFailure) domainErrors.add('AuditLogs');

      // 1a. Sync recipe versions first so backend has recipe data
      // before sales validation runs (validateInvoiceRecipeVersions).
      final recipeSuccess = await _runDomain(
        'recipe',
        _syncRecipeVersionDocuments,
      );
      if (!recipeSuccess) {
        hasFailure = true;
        domainErrors.add('Recetas');
      }

      // 1b. Sync fiscal sales documents, including offline credit notes, before
      // inventory movements so backend replay sees sale -> credit-note ordering.
      final salesSuccess = await _runDomain('sales', _syncSalesDocuments);
      if (!salesSuccess) {
        hasFailure = true;
        domainErrors.add('Sales');
      }

      final fulfillmentSuccess =
          await _runDomain('fulfillment', _syncFulfillmentEvents);
      if (!fulfillmentSuccess) {
        hasFailure = true;
        domainErrors.add('Fulfillment');
      }

      // 1c. Push loyalty point transactions (Batch 5 slice 5b, finding H2):
      // offline point mutations are the source of truth and must reach the
      // cloud ledger so balances converge across terminals. Fault-isolated
      // like every other domain: a failure never aborts later domains.
      final loyaltySuccess = await _runDomain(
        'loyalty',
        _syncLoyaltyPointTransactions,
      );
      if (!loyaltySuccess) {
        hasFailure = true;
        domainErrors.add('Loyalty');
      }

      // 1d. Push cash shift sessions and cash movements (Batch 5 slice 5c,
      // finding H3): the offline shift lifecycle is the source of truth and
      // must reach the cloud so the dashboard sees cash data. Fault-isolated
      // like every other domain: a failure never aborts later domains.
      final cashShiftSuccess = await _runDomain(
        'cashshift',
        _syncCashShifts,
      );
      if (!cashShiftSuccess) {
        hasFailure = true;
        domainErrors.add('CashShifts');
      }

      // 2. Sync inventory outbox deltas
      var productionLinkedMovementIds = const <String>{};
      final purchaseSuccess = await _runDomain(
        'purchase',
        _syncPurchaseDocuments,
      );
      if (!purchaseSuccess) {
        hasFailure = true;
        domainErrors.add('Compras');
      }
      final prodSuccess = await _runDomain('production', () async {
        productionLinkedMovementIds = await _syncProductionOrderDocuments();
      });
      if (!prodSuccess) {
        hasFailure = true;
        domainErrors.add('Producción');
      }
      final countSuccess = await _runDomain(
        'count',
        _syncCountSessionDocuments,
      );
      if (!countSuccess) {
        hasFailure = true;
        domainErrors.add('Conteos físicos');
      }
      final kardexSuccess = await _runDomain(
        'kardex corrections',
        _syncKardexCorrections,
      );
      if (!kardexSuccess) {
        hasFailure = true;
        domainErrors.add('Kardex');
      }
      final invOutboxSuccess = await _runDomain(
        'inventory',
        () => _syncInventoryOutbox(
          blockedMovementIds: productionLinkedMovementIds,
        ),
      );
      if (!invOutboxSuccess) {
        hasFailure = true;
        domainErrors.add('Movimientos de stock');
      }
      // 3. Pull Master Catalog & Security Inbound Deltas
      // ST-05: forensic alerts ride this pull as a one-way cloud-to-POS
      // projection; the retired /inventory/alerts GET/POST surfaces are no
      // longer contacted and local lifecycle state stays terminal-local.
      final inboundSuccess = await _runDomain(
        'inbound deltas',
        _pullInboundDeltas,
      );
      if (!inboundSuccess) {
        hasFailure = true;
        domainErrors.add('Catálogo');
      }

      if (!hasFailure) {
        _consecutiveFailures = 0;
        _lastSyncTime = DateTime.now();
        _lastSyncError = null;
        _updateStatus(CloudSyncStatus.success);
        _updateStatus(CloudSyncStatus.idle);
        developer.log(
          '[SYNC_MANUAL] completed=true reason=success',
          name: 'SyncService',
        );
        return const SyncRunOutcome.complete();
      } else {
        _consecutiveFailures++;
        final domainErrorSummary = domainErrors.join('; ');
        if (_authBlocked) {
          final authMessage = _syncBlockedReason == 'DEVICE_REVOKED'
              ? 'DEVICE_REVOKED'
              : 'AUTH_BLOCKED: Reautenticación requerida con el servidor nube (HTTP 401/403)';
          _lastSyncError = domainErrorSummary.isEmpty
              ? authMessage
              : '$authMessage; $domainErrorSummary';
        } else {
          _lastSyncError = domainErrorSummary;
        }
        _updateStatus(CloudSyncStatus.error);
        developer.log(
          '[SYNC_MANUAL] completed=false reason=$_lastSyncError',
          name: 'SyncService',
        );
        return const SyncRunOutcome.partial();
      }
    } catch (e, stackTrace) {
      _consecutiveFailures++;
      _lastSyncError = e.toString();
      _updateStatus(CloudSyncStatus.error);
      developer.log(
        'Fatal sync failure',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
      return const SyncRunOutcome.failed();
    } finally {
      _isSyncing = false;
      if (_hasPendingSyncRequest) {
        _hasPendingSyncRequest = false;
        scheduleMicrotask(() => triggerManualSync());
      }
    }
  }

  bool _isAuthError(dynamic e) {
    if (e is DeviceSyncException) return true;
    if (e is DioException) {
      if (e.error is DeviceSyncException) return true;
      final code = e.response?.statusCode;
      if (code == 401 || code == 403) return true;
    }
    return false;
  }

  Future<bool> _runDomain(
    String domain,
    Future<void> Function() operation,
  ) async {
    // Auth failures are domain-scoped (issue #473): they set the pass-wide
    // _authBlocked observability flags but must not suppress independent
    // later domains in the same pass.
    try {
      await operation();
      return true;
    } on DioException catch (dioErr, stackTrace) {
      final statusCode = dioErr.response?.statusCode;
      if (dioErr.error is DeviceSyncRevokedException ||
          (dioErr.response?.data is Map &&
              (dioErr.response?.data['code'] == 'DEVICE_REVOKED' ||
                  dioErr.response?.data['error'] == 'DEVICE_REVOKED'))) {
        _authBlocked = true;
        _syncBlockedReason = 'DEVICE_REVOKED';
        developer.log(
          '[SYNC_AUTH] credential_revoked=true — device sync credential revoked',
          name: 'SyncService',
        );
      } else if (statusCode == 401 ||
          statusCode == 403 ||
          dioErr.error is DeviceSyncUnavailableException) {
        _authBlocked = true;
        _syncBlockedReason = 'AUTH_BLOCKED';
        developer.log(
          '[SYNC_AUTH] credential_blocked=true — device sync auth unavailable or blocked (HTTP $statusCode)',
          name: 'SyncService',
        );
      } else {
        developer.log(
          'Sync $domain failed with network error',
          name: 'SyncService',
          error: dioErr,
          stackTrace: stackTrace,
        );
      }
      return false;
    } on DeviceSyncRevokedException catch (e) {
      _authBlocked = true;
      _syncBlockedReason = 'DEVICE_REVOKED';
      developer.log('[SYNC_AUTH] credential_revoked=true: $e', name: 'SyncService');
      return false;
    } on DeviceSyncUnavailableException catch (e) {
      _authBlocked = true;
      _syncBlockedReason = 'AUTH_BLOCKED';
      developer.log('[SYNC_AUTH] credential_blocked=true: $e', name: 'SyncService');
      return false;
    } catch (error, stackTrace) {
      developer.log(
        'Sync $domain failed; later domains will continue.',
        name: 'SyncService',
        error: error,
        stackTrace: stackTrace,
      );
      return false;
    }
  }

  Future<void> _syncSalesDocuments() async {
    try {
      developer.log(
        'Sales sync: fetching unsynced aggregates...',
        name: 'SyncService',
      );
      final aggregates = await _salesRepository.getUnsyncedAggregates();
      developer.log(
        'Sales sync: found ${aggregates.length} unsynced aggregates',
        name: 'SyncService',
      );
      if (aggregates.isEmpty) return;

      final records = aggregates.map(_buildSalesRecord).toList(growable: false)
        ..sort((a, b) {
          final seqA = (a['sourceSequence'] is int)
              ? a['sourceSequence'] as int
              : 1;
          final seqB = (b['sourceSequence'] is int)
              ? b['sourceSequence'] as int
              : 1;
          final bySequence = seqA.compareTo(seqB);
          if (bySequence != 0) return bySequence;
          final keyA = (a['idempotencyKey'] as String?) ?? '';
          final keyB = (b['idempotencyKey'] as String?) ?? '';
          return keyA.compareTo(keyB);
        });
      // DSI-6 (openspec/changes/device-sync-credit-note-authorization):
      // while device-batch CREDIT_NOTE authorization auditing is
      // unimplemented, the backend fails closed — SyncCreditNoteAuthGuard
      // 403s the ENTIRE envelope containing any CREDIT_NOTE record
      // (sync-credit-note-auth.guard.ts:38-73), which stalls unrelated
      // sales and trips the misleading AUTH_BLOCKED flag (see
      // AP_KNOWN_LIMITATIONS.md L3). Local credit notes are therefore HELD
      // OUT of outbound device batches — same exclusion pattern as
      // _isCreditNoteRestockMovement in the inventory outbox — and remain
      // pending locally until DSI-6 re-enables their transport. Nothing in
      // the backend guard is weakened.
      final deviceSafeRecords = records
          .where((record) => record['documentType'] != 'CREDIT_NOTE')
          .toList(growable: false);
      final sentRecords = deviceSafeRecords
          .take(_batchEnvelopeLimit)
          .toList(growable: false);
      if (sentRecords.isEmpty) {
        // Everything pending was held back (DSI-6 hold): never post an
        // empty envelope.
        return;
      }
      developer.log(
        'Sales sync: posting ${sentRecords.length} records to /v1/sync/batch',
        name: 'SyncService',
      );
      final response = await _dio.post(
        '/v1/sync/batch',
        data: {'records': sentRecords},
        options: Options(
          headers: {HttpHeaders.contentTypeHeader: 'application/json'},
        ),
      );
      developer.log(
        'Sales sync: response status=${response.statusCode}',
        name: 'SyncService',
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        final resultsByKey = _parseSyncResults(response.data);
        final legacyAcceptedIds = <String>[];

        for (final record in sentRecords) {
          final invoiceId = record['invoiceId'] as String?;
          final idempotencyKey = record['idempotencyKey'] as String?;
          if (invoiceId == null || idempotencyKey == null) continue;

          final result = resultsByKey[idempotencyKey];
          if (result != null && result.shouldMarkSalesSynced(record)) {
            if (result.acknowledgedMovementCorrelationIds != null ||
                result.inventoryOutcome != null) {
              try {
                await _salesRepository.acknowledgeSaleSync(
                  invoiceId: invoiceId,
                  outcome: result.inventoryOutcome,
                  acknowledgedCorrelationIds:
                      result.acknowledgedMovementCorrelationIds ??
                      const <String>[],
                );
              } catch (e, st) {
                developer.log(
                  'Sales sync integrity failure for $invoiceId: $e',
                  name: 'SyncService',
                  error: e,
                  stackTrace: st,
                );
              }
            } else {
              legacyAcceptedIds.add(invoiceId);
            }
          } else if (result != null) {
            // Issue #506: a per-record result that is neither accepted nor
            // retried must not stay silent. Do NOT change acceptance
            // semantics here: the record intentionally stays pending.
            final rejection = SalesRecordRejection(
              invoiceId: invoiceId,
              idempotencyKey: idempotencyKey,
              status: result.status,
              code: result.code,
              message: result.message,
              retryable: result.retryable,
            );
            developer.log(
              '[SYNC_SALES_REJECTED] per-record rejection (record stays '
              'pending): invoiceId=$invoiceId status=${result.status} '
              'code=${result.code ?? '<none>'} '
              'retryable=${result.retryable ?? '<absent>'} '
              'message=${result.message ?? ''}',
              name: 'SyncService',
            );
            _salesRejectionController.add(rejection);
          }
        }

        if (legacyAcceptedIds.isNotEmpty) {
          await _salesRepository.markAsSynced(legacyAcceptedIds);
        } else if (resultsByKey.isEmpty) {
          final acceptedInvoiceIds = _acceptedSalesInvoiceIds(
            sentRecords,
            response.data,
          );
          if (acceptedInvoiceIds.isNotEmpty) {
            await _salesRepository.markAsSynced(acceptedInvoiceIds);
          }
        }
      }
    } catch (e, st) {
      developer.log(
        'Sales sync: EXCEPTION',
        name: 'SyncService',
        error: e,
        stackTrace: st,
      );
      rethrow;
    }
  }

  /// Batch 5 slice 5b (finding H2): pushes pending loyalty point
  /// transactions to the cloud ledger in bounded batches. Rows stay
  /// 'pending' on any failure and are retried on the next sync pass;
  /// rows the backend reports as FAILED per-record (e.g. an idempotency
  /// integrity conflict) also stay pending instead of being lost.
  Future<void> _syncLoyaltyPointTransactions() async {
    final database = _database;
    if (database == null) return;
    final dao = database.customerPointTransactionDao;
    final pending = await dao.getTransactionsBySyncStatus('pending');
    if (pending.isEmpty) return;

    final batch = pending.take(_batchEnvelopeLimit).toList(growable: false);
    final tenantConfig = await database.localConfigDao.getConfigByKey(
      'tenant_id',
    );
    final tenantId = tenantConfig?.value ?? 'tenant-1';

    developer.log(
      'Loyalty sync: posting ${batch.length} point transactions',
      name: 'SyncService',
    );
    final response = await _dio.post(
      '/loyalty/point-transactions/sync',
      data: {
        'transactions': batch
            .map((tx) => _buildLoyaltyPointTransactionPayload(tx, tenantId))
            .toList(growable: false),
      },
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      final failedKeys = _failedLoyaltySyncKeys(response.data);
      for (final tx in batch) {
        final idempotencyKey =
            tx.idempotencyKey ?? 'loyalty:sync:$tenantId:${tx.id}';
        if (failedKeys.contains(idempotencyKey)) continue;
        await dao.markSyncedById(tx.id);
      }
    }
  }

  /// Maps a local point-transaction row onto the cloud ingestion contract
  /// (LoyaltyPointTransactionSyncItemDto). Legacy rows without program
  /// attribution or units are sent with best-effort equivalents: units fall
  /// back to the rounded points delta and a stable idempotency key is
  /// derived from the immutable local row id so retries dedupe server-side.
  Map<String, Object?> _buildLoyaltyPointTransactionPayload(
    CustomerPointTransactionEntity tx,
    String tenantId,
  ) {
    Object? commercialSnapshot;
    if (tx.commercialSnapshot != null) {
      try {
        commercialSnapshot = jsonDecode(tx.commercialSnapshot!);
      } catch (_) {
        commercialSnapshot = null;
      }
    }

    return {
      'idempotencyKey':
          tx.idempotencyKey ?? 'loyalty:sync:$tenantId:${tx.id}',
      'customerId': tx.customerId,
      if (tx.loyaltyProgramId != null) 'loyaltyProgramId': tx.loyaltyProgramId,
      'transactionType': tx.transactionType ?? tx.type,
      'units': tx.units ?? tx.points.round(),
      if (tx.ticketId != null) 'ticketId': tx.ticketId,
      if (tx.invoiceId != null && tx.ticketId == null)
        'ticketId': tx.invoiceId,
      if (tx.rewardId != null) 'rewardId': tx.rewardId,
      if (tx.reason != null) 'reason': tx.reason,
      if (tx.reversalOfTransactionId != null)
        'reversalOfTransactionId': tx.reversalOfTransactionId,
      if (tx.sourceEventId != null) 'sourceEventId': tx.sourceEventId,
      if (tx.actorUserId != null) 'actorUserId': tx.actorUserId,
      if (tx.branchId != null) 'branchId': tx.branchId,
      if (tx.terminalId != null) 'terminalId': tx.terminalId,
      if (tx.programVersion != null) 'programVersion': tx.programVersion,
      if (tx.rewardVersion != null) 'rewardVersion': tx.rewardVersion,
      // Floor's pinned analyzer (6.4.1) cannot parse null-aware map elements
      // (`?x`) during build_runner codegen, so keep the collection-if form
      // and silence the newer lint that prefers `?`.
      // ignore: use_null_aware_elements
      if (commercialSnapshot != null)
        'commercialSnapshot': commercialSnapshot,
      'origin': tx.origin ?? 'POS',
      'occurredAt': DateTime.fromMillisecondsSinceEpoch(
        tx.occurredAt ?? tx.createdAt,
        isUtc: true,
      ).toIso8601String(),
    };
  }

  Set<String> _failedLoyaltySyncKeys(dynamic responseData) {
    if (responseData is! Map) return const <String>{};
    final results = responseData['results'];
    if (results is! List) return const <String>{};
    return {
      for (final item in results)
        if (item is Map &&
            item['status'] == 'FAILED' &&
            item['idempotencyKey'] is String)
          item['idempotencyKey'] as String,
    };
  }

  /// Batch 5 slice 5c (finding H3): pushes pending cash shift sessions and
  /// cash movements to the cloud in bounded batches. Rows stay 'pending' on
  /// any failure and are retried on the next sync pass; rows the backend
  /// reports as FAILED per-record also stay pending instead of being lost.
  ///
  /// Pending state reuses the existing `sync_status` columns — no schema
  /// change. A still-OPEN session intentionally stays pending after an
  /// accepted push: only closed sessions are marked 'synced', so the later
  /// closure (counted totals, difference, Z report) is pushed as well. The
  /// backend upserts sessions by id, so re-pushing an open session is an
  /// idempotent no-op server-side.
  Future<void> _syncCashShifts() async {
    final database = _database;
    if (database == null) return;
    final sessionDao = database.cashierSessionDao;
    final movementDao = database.cashMovementDao;
    // No dedicated DAO query exists for pending sessions; the sessions table
    // is small (one row per shift), so filtering the existing read avoids a
    // Floor codegen change.
    final pendingSessions = (await sessionDao.getAllSessions())
        .where((session) => session.syncStatus == 'pending')
        .toList(growable: false);
    final pendingMovements =
        await movementDao.getMovementsBySyncStatus('pending');
    if (pendingSessions.isEmpty && pendingMovements.isEmpty) return;

    final tenantConfig = await database.localConfigDao.getConfigByKey(
      'tenant_id',
    );
    final tenantId = tenantConfig?.value ?? 'tenant-1';

    final sessionBatch =
        pendingSessions.take(_batchEnvelopeLimit).toList(growable: false);
    final movementBatch =
        pendingMovements.take(_batchEnvelopeLimit).toList(growable: false);

    developer.log(
      'Cash shift sync: posting ${sessionBatch.length} sessions and '
      '${movementBatch.length} movements',
      name: 'SyncService',
    );
    final response = await _dio.post(
      '/sales/shifts/sync',
      data: {
        'sessions': sessionBatch
            .map(_buildCashShiftSessionPayload)
            .toList(growable: false),
        'movements': movementBatch
            .map(_buildCashMovementPayload)
            .toList(growable: false),
      },
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      final failedKeys = _failedCashShiftSyncKeys(response.data);
      for (final session in sessionBatch) {
        if (failedKeys.contains(session.id)) continue;
        if (session.isClosed) {
          await sessionDao.updateSession(
            _copySessionWithSyncStatus(session, 'synced'),
          );
        }
      }
      for (final movement in movementBatch) {
        if (failedKeys.contains(movement.id)) continue;
        await movementDao.updateSyncStatus(movement.id, 'synced');
      }
    }
  }

  /// Maps a local shift session row onto the cloud ingestion contract
  /// (CashShiftSessionSyncItemDto). Terminal rows carry no cashier name, so
  /// the backend falls back to the cashier id for its NOT NULL column.
  Map<String, Object?> _buildCashShiftSessionPayload(
    CashierSessionEntity session,
  ) {
    return {
      'id': session.id,
      'terminalId': session.terminalId,
      'cashierId': session.userId,
      'openedAt': DateTime.fromMillisecondsSinceEpoch(
        session.openedAt,
        isUtc: true,
      ).toIso8601String(),
      if (session.closedAt != null)
        'closedAt': DateTime.fromMillisecondsSinceEpoch(
          session.closedAt!,
          isUtc: true,
        ).toIso8601String(),
      'status': session.isClosed ? 'CLOSED' : 'OPEN',
      'initialFloatNio': session.openingBalanceNio,
      'initialFloatUsd': session.openingBalanceUsd,
      if (session.closingCountedNio != null)
        'finalCountedNio': session.closingCountedNio,
      if (session.closingCountedUsd != null)
        'finalCountedUsd': session.closingCountedUsd,
      'expectedCashNio': session.expectedNio,
      'expectedCashUsd': session.expectedUsd,
      if (session.differenceNio != null)
        'differenceNio': session.differenceNio,
      if (session.differenceUsd != null)
        'differenceUsd': session.differenceUsd,
      if (session.zReportSequence != null)
        'zReportSequence': session.zReportSequence,
      if (session.supervisorId != null) 'supervisorId': session.supervisorId,
      if (session.notes != null) 'notes': session.notes,
    };
  }

  /// Maps a local cash movement row onto the cloud ingestion contract
  /// (CashMovementSyncItemDto).
  Map<String, Object?> _buildCashMovementPayload(CashMovementEntity movement) {
    return {
      'id': movement.id,
      'shiftId': movement.shiftId,
      'terminalId': movement.terminalId,
      'type': movement.type,
      'amountNio': movement.amountNio,
      'amountUsd': movement.amountUsd,
      'reason': movement.reason,
      if (movement.authorizedByUserId != null)
        'authorizedByUserId': movement.authorizedByUserId,
      'timestamp': DateTime.fromMillisecondsSinceEpoch(
        movement.timestamp,
        isUtc: true,
      ).toIso8601String(),
    };
  }

  /// Immutable entity copy that only flips `sync_status`.
  CashierSessionEntity _copySessionWithSyncStatus(
    CashierSessionEntity session,
    String syncStatus,
  ) {
    return CashierSessionEntity(
      id: session.id,
      userId: session.userId,
      terminalId: session.terminalId,
      openedAt: session.openedAt,
      tipoModelo: session.tipoModelo,
      closedAt: session.closedAt,
      openingBalanceNio: session.openingBalanceNio,
      openingBalanceUsd: session.openingBalanceUsd,
      closingCountedNio: session.closingCountedNio,
      closingCountedUsd: session.closingCountedUsd,
      expectedNio: session.expectedNio,
      expectedUsd: session.expectedUsd,
      differenceNio: session.differenceNio,
      differenceUsd: session.differenceUsd,
      zReportSequence: session.zReportSequence,
      isClosed: session.isClosed,
      supervisorId: session.supervisorId,
      notes: session.notes,
      syncStatus: syncStatus,
    );
  }

  Set<String> _failedCashShiftSyncKeys(dynamic responseData) {
    if (responseData is! Map) return const <String>{};
    final results = responseData['results'];
    if (results is! List) return const <String>{};
    return {
      for (final item in results)
        if (item is Map &&
            item['status'] == 'FAILED' &&
            item['idempotencyKey'] is String)
          item['idempotencyKey'] as String,
    };
  }

  Future<void> _syncFulfillmentEvents() async {
    final db = _database;
    if (db == null) return;
    try {
      final tenantConfig =
          await db.localConfigDao.getConfigByKey('tenant_id');
      final tenantId = tenantConfig?.value ?? 'tenant-1';

      final pendingEvents = await db.fulfillmentPersistenceDao
          .findPendingOutboxEvents(tenantId);
      if (pendingEvents.isEmpty) return;

      final records = <Map<String, Object?>>[];
      for (final event in pendingEvents.take(_batchEnvelopeLimit)) {
        final fulfillment = await db.fulfillmentPersistenceDao
            .findFulfillment(event.aggregateId, event.tenantId);

        records.add({
          'idempotencyKey': event.idempotencyKey,
          'sourceDeviceId': event.deviceId,
          'sourceSequence': event.sourceSequence,
          'flowType': 'fulfillment',
          'documentType': 'FULFILLMENT',
          'aggregateType': event.aggregateType,
          'aggregateId': event.aggregateId,
          'eventId': event.eventId,
          'topologyRevision': event.topologyRevision,
          if (fulfillment != null)
            'fulfillment': {
              'id': fulfillment.id,
              'saleId': fulfillment.saleId,
              'topologySnapshotId': fulfillment.topologySnapshotId,
              'topologyRevision': fulfillment.topologyRevision,
              'channel': fulfillment.channel,
              'routeState': fulfillment.routeState,
              'deliveryState': fulfillment.deliveryState,
              'linesPayload': fulfillment.linesPayload,
            },
        });
      }

      if (records.isEmpty) return;

      developer.log(
        'Fulfillment sync: posting ${records.length} records to /v1/sync/batch',
        name: 'SyncService',
      );
      final response = await _dio.post(
        '/v1/sync/batch',
        data: {'records': records},
        options: Options(
          headers: {HttpHeaders.contentTypeHeader: 'application/json'},
        ),
      );
      developer.log(
        'Fulfillment sync: response status=${response.statusCode}',
        name: 'SyncService',
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        for (final event in pendingEvents.take(_batchEnvelopeLimit)) {
          await db.fulfillmentPersistenceDao.updateOutboxEventState(
            event.eventId,
            event.tenantId,
            'SENT',
          );
        }
      }
    } catch (e, st) {
      developer.log(
        'Fulfillment sync: EXCEPTION',
        name: 'SyncService',
        error: e,
        stackTrace: st,
      );
      rethrow;
    }
  }

  List<String> _acceptedSalesInvoiceIds(
    List<Map<String, Object?>> sentRecords,
    dynamic responseData,
  ) {
    final resultsByKey = _parseSyncResults(responseData);
    if (resultsByKey.isEmpty) {
      if (responseData is Map &&
          (responseData['status'] == 'success' ||
              (responseData['processed'] != null &&
                  (responseData['processed'] as num) > 0))) {
        return sentRecords
            .map((r) => r['invoiceId'])
            .whereType<String>()
            .toList();
      }
      return const [];
    }

    final acceptedInvoiceIds = <String>[];
    for (final record in sentRecords) {
      final invoiceId = record['invoiceId'];
      final idempotencyKey = record['idempotencyKey'];
      if (invoiceId is! String || idempotencyKey is! String) continue;
      final result = resultsByKey[idempotencyKey];
      if (result != null && result.shouldMarkSalesSynced(record)) {
        acceptedInvoiceIds.add(invoiceId);
      }
    }
    return acceptedInvoiceIds;
  }

  Map<String, Object?> _buildSalesRecord(Map<String, dynamic> aggregate) {
    return buildSalesSyncRecord(
      aggregate,
      fallbackTerminalId: () => _auditRepository.deviceId,
    );
  }

  /// Builds the sales record sent to `/v1/sync/batch` for one sale aggregate.
  ///
  /// Issue #506: the activation verification-sale path
  /// (ActivationControlledSaleRunner) MUST build its record through this
  /// exact function. The backend derives a payload hash over these fields;
  /// if the two paths send a different shape under the same idempotencyKey
  /// (historically a stray `movements: []` key only present on the
  /// activation path), the backend answers IDEMPOTENCY_MISMATCH /
  /// CRITICAL_PAYLOAD_MISMATCH with retryable:false and the local ticket
  /// stays pending forever while HTTP stays 200. Keep both paths in
  /// lockstep through this single builder; never fork the shape.
  static Map<String, Object?> buildSalesSyncRecord(
    Map<String, dynamic> aggregate, {
    String? Function()? fallbackTerminalId,
  }) {
    final invoiceId =
        aggregate['id']?.toString() ?? '00000000-0000-0000-0000-000000000000';
    final documentType = aggregate['documentType']?.toString() ?? 'SALE';
    final terminalId =
        aggregate['terminalId']?.toString() ?? fallbackTerminalId?.call();
    final sourceSequence =
        (aggregate['sourceSequence'] is int &&
            (aggregate['sourceSequence'] as int) > 0)
        ? aggregate['sourceSequence'] as int
        : 1;
    // Byte-identical record shape for both the push path and the
    // activation verification-sale path (see doc comment above).
    final idempotencyKey =
        (aggregate['idempotencyKey'] is String &&
            (aggregate['idempotencyKey'] as String).isNotEmpty)
        ? aggregate['idempotencyKey'] as String
        : 'sale:$terminalId:$invoiceId';

    return {
      'invoiceId': invoiceId,
      'idempotencyKey': idempotencyKey,
      'terminalId': terminalId,
      'sourceDeviceId': terminalId,
      'flowType': 'sales',
      'sourceSequence': sourceSequence,
      'documentType': documentType,
      'invoice': aggregate,
    };
  }

  Future<void> _syncInventoryOutbox({
    Set<String> blockedMovementIds = const <String>{},
  }) async {
    try {
      developer.log(
        'Inventory outbox: fetching unsynced movements...',
        name: 'SyncService',
      );
      final allUnsynced = await _inventoryRepository.getUnsyncedMovements();
      developer.log(
        'Inventory outbox: found ${allUnsynced.length} total unsynced movements',
        name: 'SyncService',
      );
      final unsynced = allUnsynced
          .where(
            (movement) =>
                movement.deliveryOwner == 'GENERIC_INVENTORY' &&
                movement.deliveryState != 'QUARANTINED' &&
                movement.deliveryState != 'CLOUD_ACKNOWLEDGED' &&
                movement.type != MovementType.sale &&
                movement.sourceDocumentType != 'SALE' &&
                movement.sourceDocumentType != 'SALE_CANCEL' &&
                movement.type != MovementType.purchase &&
                !(movement.reason?.startsWith('COUNT_SESSION:') ?? false) &&
                !(movement.reason?.startsWith('Anulación Factura:') ?? false) &&
                !_isProductionLinkedMovement(movement) &&
                !_isCreditNoteRestockMovement(movement) &&
                !blockedMovementIds.contains(movement.id),
          )
          .toList(growable: false);
      developer.log(
        'Inventory outbox: ${unsynced.length} movements after filtering',
        name: 'SyncService',
      );
      if (unsynced.isEmpty) return;

      final replayCandidates = _orderByReplaySemantics(unsynced);
      final candidatesForSend = replayCandidates
          .take(_batchEnvelopeLimit)
          .toList(growable: false);
      developer.log(
        'Inventory outbox: reserving metadata for ${candidatesForSend.length} candidates',
        name: 'SyncService',
      );
      final metadata = await _reserveMovementSyncMetadata(candidatesForSend);
      final metadataByMovementId = {
        for (final item in metadata) item.movementId: item,
      };
      final orderedBatch = _orderByReservedMetadata(
        candidatesForSend,
        metadataByMovementId,
      );
      developer.log(
        'Inventory outbox: posting ${orderedBatch.length} records',
        name: 'SyncService',
      );

      try {
        final response = _role == syncRole['EDGE_SERVER']
            ? await _postBatchEnvelope(orderedBatch, metadataByMovementId)
            : await _postStandaloneDeltas(orderedBatch, metadataByMovementId);
        developer.log(
          'Inventory outbox: response status=${response.statusCode}',
          name: 'SyncService',
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          developer.log(
            'Synced ${orderedBatch.length} inventory deltas to cloud',
            name: 'SyncService',
          );
          await _applyInventorySyncResults(
            orderedBatch,
            metadataByMovementId,
            response.data,
          );
        }
      } on DioException catch (e) {
        developer.log(
          'Inventory outbox: DioException: ${e.type} - ${e.message}',
          name: 'SyncService',
          error: e,
        );
        if (!_isAuthError(e)) {
          await _markMovementsAsFailed(orderedBatch, error: e.message);
        }
        rethrow;
      } catch (e, stackTrace) {
        developer.log(
          'Inventory outbox: EXCEPTION in build/post',
          name: 'SyncService',
          error: e,
          stackTrace: stackTrace,
        );
        if (!_isAuthError(e)) {
          await _markMovementsAsFailed(orderedBatch, error: e.toString());
        }
        rethrow;
      }
    } catch (e, st) {
      developer.log(
        'Inventory outbox: TOP-LEVEL EXCEPTION',
        name: 'SyncService',
        error: e,
        stackTrace: st,
      );
      rethrow;
    }
  }

  bool _isProductionLinkedMovement(dynamic movement) {
    return _tryReadField(movement, 'sourceDocumentType') == 'PRODUCTION_CLOSE';
  }

  bool _isCreditNoteRestockMovement(dynamic movement) {
    return _tryReadField(movement, 'sourceDocumentType') ==
        'CREDIT_NOTE_RESTOCK';
  }

  Future<void> _syncPurchaseDocuments() async {
    final unsyncedPurchases = await _inventoryRepository.getUnsyncedPurchases();
    if (unsyncedPurchases.isEmpty) return;

    for (final purchase in unsyncedPurchases) {
      try {
        _assertPurchaseDocumentReady(purchase);
        final response = await _dio.post(
          '/inventory/purchases',
          data: _buildPurchasePayload(purchase),
        );

        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markPurchaseAsSynced(purchase.id);
          await _inventoryRepository.markMovementAsSynced(purchase.id);
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync purchase ${purchase.id}: ${e.message}',
          name: 'SyncService',
        );
        if (!_isAuthError(e)) {
          await _inventoryRepository.markMovementAsFailed(
            purchase.id,
            error: e.message,
          );
        }
        rethrow;
      } catch (e, stackTrace) {
        developer.log(
          'Skipped purchase ${purchase.id}: $e',
          name: 'SyncService',
          error: e,
          stackTrace: stackTrace,
        );
        if (!_isAuthError(e)) {
          await _inventoryRepository.markMovementAsFailed(
            purchase.id,
            error: e.toString(),
          );
        }
        rethrow;
      }
    }
  }

  void _assertPurchaseDocumentReady(Purchase purchase) {
    if (purchase.supplierId.trim().isEmpty) {
      throw StateError('Purchase ${purchase.id} is missing supplierId.');
    }

    if (purchase.invoiceNumber.trim().isEmpty) {
      throw StateError('Purchase ${purchase.id} is missing invoiceNumber.');
    }

    if (_requiresExplicitBcnRate(purchase) && purchase.bcnRate <= 0) {
      throw StateError(
        'Purchase ${purchase.id} is missing an explicit USD bcnRate.',
      );
    }
  }

  bool _requiresExplicitBcnRate(Purchase purchase) {
    return purchase.currency == 'USD' &&
        purchase.fxRateMode != purchaseFxRateModeOfficial;
  }

  Future<void> _syncRecipeVersionDocuments() async {
    final unsynced = await _inventoryRepository
        .getUnsyncedRecipeVersionDocuments();
    if (unsynced.isEmpty) {
      return;
    }

    for (final document in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/recipes/versions',
          data: _buildRecipeVersionPayload(document),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markRecipeVersionDocumentAsSynced(
            document.id,
          );
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync recipe version ${document.id}: ${e.message}',
          name: 'SyncService',
        );
        rethrow;
      }
    }
  }

  Future<Set<String>> _syncProductionOrderDocuments() async {
    final unsynced = await _inventoryRepository.getUnsyncedProductionOrders();
    if (unsynced.isEmpty) {
      return const <String>{};
    }

    final linkedMovementIds = unsynced
        .expand((document) => document.movementReferences)
        .toSet();

    for (final document in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/production-orders/close',
          data: _buildProductionOrderPayload(document),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          for (final movementId in document.movementReferences) {
            await _inventoryRepository.markMovementAsSynced(movementId);
          }
          await _inventoryRepository.markProductionOrderDocumentAsSynced(
            document.id,
          );
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync production order ${document.id}: ${e.message}',
          name: 'SyncService',
        );
        if (!_isAuthError(e)) {
          await _markMovementIdsAsFailed(
            document.movementReferences,
            error: e.message,
          );
        }
        rethrow;
      } catch (e) {
        if (!_isAuthError(e)) {
          await _markMovementIdsAsFailed(
            document.movementReferences,
            error: e.toString(),
          );
        }
        rethrow;
      }
    }
    return linkedMovementIds;
  }

  Future<void> _syncCountSessionDocuments() async {
    final unsynced = await _inventoryRepository
        .getUnsyncedCountSessionDocuments();
    if (unsynced.isEmpty) {
      return;
    }

    for (final document in unsynced) {
      try {
        final response = await _dio.post(
          '/inventory/count-sessions',
          data: _buildCountSessionPayload(document),
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          await _inventoryRepository.markCountSessionDocumentAsSynced(
            document.id,
          );
          for (final movementId in document.movementReferences) {
            await _inventoryRepository.markMovementAsSynced(movementId);
          }
        }
      } on DioException catch (e) {
        developer.log(
          'Failed to sync count session ${document.id}: ${e.message}',
          name: 'SyncService',
        );
        if (!_isAuthError(e)) {
          await _markMovementIdsAsFailed(
            document.movementReferences,
            error: e.message,
          );
        }
        rethrow;
      } catch (e) {
        if (!_isAuthError(e)) {
          await _markMovementIdsAsFailed(
            document.movementReferences,
            error: e.toString(),
          );
        }
        rethrow;
      }
    }
  }

  Future<void> _markMovementsAsFailed(
    Iterable<dynamic> movements, {
    String? error,
  }) async {
    for (final movement in movements) {
      await _inventoryRepository.markMovementAsFailed(
        movement.id,
        error: error,
      );
    }
  }

  Future<void> _markMovementIdsAsFailed(
    Iterable<String> movementIds, {
    String? error,
  }) async {
    for (final movementId in movementIds) {
      await _inventoryRepository.markMovementAsFailed(movementId, error: error);
    }
  }

  Map<String, Object?> _buildPurchasePayload(Purchase purchase) {
    final payload = <String, Object?>{
      'id': purchase.id,
      'insumoId': purchase.insumoId,
      'supplierId': purchase.supplierId,
      'invoiceNumber': purchase.invoiceNumber,
      'quantity': purchase.quantity,
      'unitCost': purchase.unitCost,
      'invoiceDate': purchase.invoiceDate.toIso8601String().split('T').first,
      'entryTimestamp': purchase.timestamp.toUtc().toIso8601String(),
      'currency': purchase.currency,
    };

    if (purchase.fiscalAuthorizationCode != null &&
        purchase.fiscalAuthorizationCode!.trim().isNotEmpty) {
      payload['fiscalAuthorizationCode'] = purchase.fiscalAuthorizationCode!
          .trim();
    }

    if (purchase.fxRateMode != null && purchase.fxRateMode!.trim().isNotEmpty) {
      payload['fxRateMode'] = purchase.fxRateMode!.trim();
    }

    if (_requiresExplicitBcnRate(purchase)) {
      payload['bcnRate'] = purchase.bcnRate;
    }

    if (purchase.lotCode != null && purchase.lotCode!.trim().isNotEmpty) {
      payload['lotCode'] = purchase.lotCode!.trim();
    }

    if (purchase.receivedDate != null) {
      payload['receivedDate'] = purchase.receivedDate!.toIso8601String();
    }

    if (purchase.expirationDate != null) {
      payload['expirationDate'] = purchase.expirationDate!.toIso8601String();
    }

    return payload;
  }

  Map<String, Object?> _buildRecipeVersionPayload(
    RecipeVersionDocument document,
  ) {
    return {
      'id': document.id,
      'productId': document.productId,
      'productName': document.productName,
      'versionNumber': document.versionNumber,
      'yieldQuantity': document.yieldQuantity,
      'technicalShrinkPct': document.technicalShrinkPct,
      'versionNote': document.versionNote,
      'createdAt': document.createdAt.toIso8601String(),
      'publishedAt': document.publishedAt?.toIso8601String(),
      'components': document.components
          .map(
            (component) => {
              'ingredientId': component.ingredientId,
              'ingredientName': component.ingredientName,
              'ingredientType': component.ingredientType,
              'grossQuantity': component.grossQuantity,
              'technicalShrinkPct': component.technicalShrinkPct,
              'referenceVersionId': component.referenceVersionId,
              'componentUom': component.componentUom ?? 'UND',
            },
          )
          .toList(growable: false),
    };
  }

  Map<String, Object?> _buildProductionOrderPayload(
    ProductionOrderDocument document,
  ) {
    return {
      'id': document.id,
      'recipeVersionId': document.recipeVersionId,
      'producedInsumoId': document.producedInsumoId,
      'producedBatchNumber': document.producedBatchNumber,
      'producedExpirationDate': document.producedExpirationDate
          .toIso8601String(),
      'plannedQuantity': document.plannedQuantity,
      'actualQuantity': document.actualQuantity,
      'outcome': document.outcome,
      'failureReason': document.failureReason,
      'terminalId': document.terminalId,
      'sourceSequence': document.sourceSequence,
      'idempotencyKey': document.idempotencyKey,
      'payloadHash': document.payloadHash,
      'totalConsumedCostNio': document.totalConsumedCostNio,
      'producedUnitCostNio': document.producedUnitCostNio,
      'varianceReason': document.varianceReason,
      'operationDate': document.operationDate.toIso8601String(),
      'movementReferences': document.movementReferences,
    };
  }

  Map<String, Object?> _buildCountSessionPayload(
    CountSessionDocument document,
  ) {
    return {
      'id': document.id,
      'warehouseId': document.warehouseId,
      'warehouseName': document.warehouseName,
      'cutoffAt': document.cutoffAt.toIso8601String(),
      'status': document.status,
      'createdAt': document.createdAt.toIso8601String(),
      'updatedAt': document.updatedAt.toIso8601String(),
      'postedAt': document.postedAt?.toIso8601String(),
      'notes': document.notes,
      'movementReferences': document.movementReferences,
      'lines': document.lines
          .map(
            (line) => {
              'id': line.id,
              'insumoId': line.insumoId,
              'insumoName': line.insumoName,
              'uom': line.uom,
              'theoreticalQuantity': line.theoreticalQuantity,
              'approvedEntryIndex': line.approvedEntryIndex,
              'entries': line.entries
                  .map(
                    (entry) => {
                      'countedQuantity': entry.countedQuantity,
                      'countedAt': entry.countedAt?.toIso8601String(),
                      'notes': entry.notes,
                      'actorLabel': entry.actorLabel,
                      'disputed': entry.disputed,
                    },
                  )
                  .toList(growable: false),
            },
          )
          .toList(growable: false),
    };
  }

  Future<Response<dynamic>> _postBatchEnvelope(
    List<dynamic> unsynced,
    Map<String, MovementSyncMetadata> metadataByMovementId,
  ) {
    final envelope = _buildBatchEnvelope(unsynced, metadataByMovementId);
    return _dio.post(
      '/v1/sync/batch',
      data: gzip.encode(utf8.encode(jsonEncode(envelope))),
      options: Options(
        headers: {
          HttpHeaders.contentTypeHeader: 'application/json',
          HttpHeaders.contentEncodingHeader: 'gzip',
        },
      ),
    );
  }

  Future<Response<dynamic>> _postStandaloneDeltas(
    List<dynamic> unsynced,
    Map<String, MovementSyncMetadata> metadataByMovementId,
  ) {
    final records = _buildBatchEnvelope(
      unsynced,
      metadataByMovementId,
    )['records'];
    return _dio.post(
      '/v1/sync/batch',
      data: {'records': records},
      options: Options(
        headers: {HttpHeaders.contentTypeHeader: 'application/json'},
      ),
    );
  }

  static const String _inventoryFlowType = 'inventory';

  Map<String, Object> _buildBatchEnvelope(
    List<dynamic> unsynced, [
    Map<String, MovementSyncMetadata> metadataByMovementId = const {},
  ]) {
    final records = unsynced.take(_batchEnvelopeLimit).toList(growable: false);

    final mappedRecords = records
        .asMap()
        .entries
        .map((entry) {
          final index = entry.key;
          final movement = entry.value;
          final movementId = movement.id.toString();
          final movementType = _enumName(movement.type).toUpperCase();
          final syncMetadata = metadataByMovementId[movementId];
          final terminalId =
              syncMetadata?.terminalId ?? _auditRepository.deviceId;
          final flowType = syncMetadata?.flowType ?? _inventoryFlowType;
          final sourceSequence =
              syncMetadata?.localSequence ??
              _resolveSourceSequence(movement, fallbackSequence: index + 1);
          final idempotencyKey =
              syncMetadata?.idempotencyKey ??
              '$flowType:$terminalId:$movementId';

          return {
            'idempotencyKey': idempotencyKey,
            'terminalId': terminalId,
            'sourceDeviceId': terminalId,
            'flowType': flowType,
            'sourceSequence': sourceSequence,
            'documentType': movementType,
            'movements': [
              {
                'insumoId': movement.insumoId,
                'quantity': movement.quantity,
                ..._valuationFields(movement),
              },
            ],
          };
        })
        .toList(growable: false);

    return {'records': mappedRecords};
  }

  int _resolveSourceSequence(
    dynamic movement, {
    required int fallbackSequence,
  }) {
    final persistedSequence =
        _tryReadField(movement, 'sourceSequence') ??
        _tryReadField(movement, 'localSequence');
    if (persistedSequence is int) {
      return persistedSequence;
    }
    if (persistedSequence is String) {
      return int.tryParse(persistedSequence) ?? fallbackSequence;
    }
    return fallbackSequence;
  }

  List<dynamic> _orderByReplaySemantics(List<dynamic> unsynced) {
    final indexed = unsynced
        .asMap()
        .entries
        .map(
          (entry) => _OrderedMovement(
            movement: entry.value,
            originalIndex: entry.key,
            sequence: _tryParsePersistedSequence(entry.value),
          ),
        )
        .toList(growable: false);

    final hasPersistedSequence = indexed.any((entry) => entry.sequence != null);
    if (!hasPersistedSequence) {
      return unsynced;
    }

    indexed.sort((a, b) {
      final aSeq = a.sequence;
      final bSeq = b.sequence;
      if (aSeq != null && bSeq != null) {
        final bySeq = aSeq.compareTo(bSeq);
        if (bySeq != 0) return bySeq;
      }
      if (aSeq != null) return -1;
      if (bSeq != null) return 1;
      return a.originalIndex.compareTo(b.originalIndex);
    });

    return indexed.map((entry) => entry.movement).toList(growable: false);
  }

  List<dynamic> _orderByReservedMetadata(
    List<dynamic> movements,
    Map<String, MovementSyncMetadata> metadataByMovementId,
  ) {
    final indexed = movements
        .asMap()
        .entries
        .map(
          (entry) => _OrderedMovement(
            movement: entry.value,
            originalIndex: entry.key,
            sequence:
                metadataByMovementId[entry.value.id.toString()]?.localSequence,
          ),
        )
        .toList(growable: false);

    indexed.sort((a, b) {
      final aSeq = a.sequence;
      final bSeq = b.sequence;
      if (aSeq != null && bSeq != null) {
        final bySeq = aSeq.compareTo(bSeq);
        if (bySeq != 0) return bySeq;
      }
      if (aSeq != null) return -1;
      if (bSeq != null) return 1;
      return a.originalIndex.compareTo(b.originalIndex);
    });

    return indexed.map((entry) => entry.movement).toList(growable: false);
  }

  int? _tryParsePersistedSequence(dynamic movement) {
    final persistedSequence =
        _tryReadField(movement, 'sourceSequence') ??
        _tryReadField(movement, 'localSequence');
    if (persistedSequence is int) {
      return persistedSequence;
    }
    if (persistedSequence is String) {
      return int.tryParse(persistedSequence);
    }
    return null;
  }

  String _enumName(dynamic value) {
    try {
      return value.name as String;
    } catch (_) {
      return value.toString().split('.').last;
    }
  }

  /// Parses a cloud timestamp into epoch millis for the Floor entities that
  /// store integer timestamps. Accepts epoch-millis numbers and ISO-8601
  /// strings; returns null for anything unparsable (callers fall back to the
  /// local row's value or a safe default).
  int? _tryParseEpochMillis(dynamic value) {
    if (value is num) return value.toInt();
    if (value is String && value.trim().isNotEmpty) {
      final parsed = DateTime.tryParse(value.trim());
      return parsed?.millisecondsSinceEpoch;
    }
    return null;
  }

  Map<String, Object> _valuationFields(dynamic movement) {
    final unitCostNio = _tryReadField(movement, 'unitCostNio');
    final sourceDocumentType = _tryReadField(movement, 'sourceDocumentType');
    final sourceDocumentId = _tryReadField(movement, 'sourceDocumentId');

    final fields = <String, Object>{};
    if (unitCostNio != null) {
      fields['unitCostNio'] = unitCostNio;
    }
    if (sourceDocumentType != null) {
      fields['sourceDocumentType'] = sourceDocumentType;
    }
    if (sourceDocumentId != null) {
      fields['sourceDocumentId'] = sourceDocumentId;
    }
    return fields;
  }

  dynamic _tryReadField(dynamic target, String fieldName) {
    if (target is Map<String, dynamic>) {
      return target[fieldName];
    }
    try {
      switch (fieldName) {
        case 'sourceSequence':
          return target.sourceSequence;
        case 'localSequence':
          return target.localSequence;
        case 'unitCostNio':
          return target.unitCostNio;
        case 'sourceDocumentType':
          return target.sourceDocumentType;
        case 'sourceDocumentId':
          return target.sourceDocumentId;
        case 'timestamp':
          return target.timestamp;
        case 'id':
          return target.id;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  @visibleForTesting
  Map<String, Object> buildOrderedBatchEnvelopeForTest(List<dynamic> unsynced) {
    return _buildBatchEnvelope(_orderByReplaySemantics(unsynced));
  }

  Future<void> _applyInventorySyncResults(
    List<dynamic> ordered,
    Map<String, MovementSyncMetadata> metadataByMovementId,
    dynamic responseData,
  ) async {
    final resultsByKey = _parseSyncResults(responseData);
    final isImplicitSuccess =
        resultsByKey.isEmpty &&
        responseData is Map &&
        (responseData['status'] == 'success' ||
            (responseData['processed'] != null &&
                (responseData['processed'] as num) > 0));

    for (final movement in ordered) {
      final movementId = movement.id.toString();
      final metadata = metadataByMovementId[movementId];
      final result = resultsByKey[metadata?.idempotencyKey];

      if (isImplicitSuccess) {
        await _inventoryRepository.markMovementAsSynced(movementId);
        continue;
      }

      if (metadata == null || result == null) {
        await _recordMovementRetryState(
          movementId,
          resultCode: 'MISSING_RESULT',
          error: 'Backend did not return a result for movement $movementId',
        );
        continue;
      }

      if (result.shouldMarkSynced(metadata)) {
        await _inventoryRepository.markMovementAsSynced(movementId);
      } else {
        await _recordMovementRetryState(
          movementId,
          resultCode: result.code ?? result.status,
          error: result.message,
        );
      }
    }
  }

  Future<List<MovementSyncMetadata>> _reserveMovementSyncMetadata(
    List<dynamic> ordered,
  ) async {
    final repository = _inventoryRepository;
    if (repository is InventorySyncMetadataRepository) {
      return (repository as InventorySyncMetadataRepository)
          .reserveMovementSyncMetadata(
            ordered
                .map((movement) => movement.id.toString())
                .toList(growable: false),
            terminalId: _auditRepository.deviceId,
            flowType: _inventoryFlowType,
          );
    }

    return ordered
        .asMap()
        .entries
        .map((entry) {
          final movementId = entry.value.id.toString();
          return MovementSyncMetadata(
            movementId: movementId,
            terminalId: _auditRepository.deviceId,
            flowType: _inventoryFlowType,
            localSequence: entry.key + 1,
            idempotencyKey:
                '$_inventoryFlowType:${_auditRepository.deviceId}:$movementId',
          );
        })
        .toList(growable: false);
  }

  Future<void> _recordMovementRetryState(
    String movementId, {
    required String resultCode,
    String? error,
  }) async {
    final repository = _inventoryRepository;
    if (repository is InventorySyncMetadataRepository) {
      await (repository as InventorySyncMetadataRepository)
          .recordMovementRetryState(
            movementId,
            resultCode: resultCode,
            error: error,
          );
      return;
    }
    await _inventoryRepository.markMovementAsFailed(
      movementId,
      error: error ?? resultCode,
    );
  }

  Map<String, _SyncBatchResultItem> _parseSyncResults(dynamic responseData) {
    if (responseData is! Map) return const {};
    final rawResults = responseData['results'];
    if (rawResults is! List) return const {};

    final parsed = <String, _SyncBatchResultItem>{};
    for (final raw in rawResults) {
      if (raw is! Map) continue;
      final result = _SyncBatchResultItem.tryFromJson(
        Map<String, dynamic>.from(raw),
      );
      if (result == null) continue;
      parsed[result.idempotencyKey] = result;
    }
    return parsed;
  }

  Future<void> _syncKardexCorrections() async {
    final corrections = await _inventoryRepository.getKardexCorrections();
    if (corrections.isEmpty) return;

    final payload = {
      'corrections': corrections
          .map(
            (c) => {
              'id': c.id,
              'insumoId': c.insumoId,
              'originMovementId': c.originMovementId,
              'triggerMovementId': c.triggerMovementId,
              'previousUnitCostNio': c.previousUnitCostNio,
              'recalculatedUnitCostNio': c.recalculatedUnitCostNio,
              'deltaUnitCostNio': c.deltaUnitCostNio,
              'totalDeltaCostNio': c.totalDeltaCostNio,
              'affectedQuantity': c.affectedQuantity,
              'lineageHash': c.lineageHash,
              'authorizedByUserId': c.authorizedByUserId,
              'authorizedByRole': c.authorizedByRole,
              'authorizationMethod': c.authorizationMethod,
              'createdAt': c.createdAt,
            },
          )
          .toList(growable: false),
    };

    try {
      final response = await _dio.post(
        '/inventory/regularization/sync',
        data: payload,
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        developer.log(
          'Synced ${corrections.length} kardex corrections to cloud',
          name: 'SyncService',
        );
      }
    } on DioException catch (e) {
      developer.log(
        'Failed to sync kardex corrections: ${e.message}',
        name: 'SyncService',
      );
    }
  }

  Future<InboundSyncResult?> pullInboundDeltas() => _pullInboundDeltas();

  Future<InboundSyncResult?> _pullInboundDeltas() async {
    if (_database == null) return null;

    developer.log('[SYNC_PULL] started=true', name: 'SyncService');

    try {
      final lastSyncConfig = await _database!.localConfigDao.getConfigByKey(
        'last_inbound_sync_version',
      );
      final sinceVersion = lastSyncConfig?.value;

      final queryParams = <String, dynamic>{
        if (sinceVersion != null && sinceVersion.trim().isNotEmpty)
          'sinceVersion': sinceVersion.trim(),
        'terminalId': _auditRepository.deviceId,
      };

      final response = await _dio.get(
        '/v1/sync/inbound/deltas',
        queryParameters: queryParams,
      );

      developer.log(
        '[SYNC_PULL] status=${response.statusCode}',
        name: 'SyncService',
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data;
        if (data is! Map) {
          developer.log(
            '[SYNC_PULL] response_keys=[] reason=non_map',
            name: 'SyncService',
          );
          return null;
        }

        final rawDeltas = data['deltas'];
        if (rawDeltas is! Map) {
          developer.log(
            '[SYNC_PULL] response_keys=[${data.keys.join(",")}] reason=no_deltas',
            name: 'SyncService',
          );
          return null;
        }

        developer.log(
          '[SYNC_PULL] response_keys=[${data.keys.join(",")}] delta_keys=[${rawDeltas.keys.join(",")}]',
          name: 'SyncService',
        );

        // 1. Products
        final rawProducts = rawDeltas['products'] as List<dynamic>? ?? const [];
        final productEntities = <ProductEntity>[];
        for (final p in rawProducts) {
          final map = Map<String, dynamic>.from(p as Map);
          final id = map['id'] as String;
          final existing = await _database!.productDao.findProductById(id);
          final rawType = map['productType'] as String?;
          final pType = (rawType == 'COMPOUND' || rawType == 'PREPARED')
              ? rawType!
              : 'SIMPLE';
          productEntities.add(
            ProductEntity(
              id: id,
              name: map['name'] as String,
              uom: map['uom'] as String? ?? 'UND',
              stock: (map['stock'] as num?)?.toDouble() ?? 0.0,
              averageCost: (map['averageCost'] as num?)?.toDouble() ?? 0.0,
              sellPrice: (map['sellPrice'] as num?)?.toDouble() ?? 0.0,
              isActive: map['isActive'] as bool? ?? true,
              sku: map['sku'] as String? ?? existing?.sku,
              barcode: map['barcode'] as String? ?? existing?.barcode,
              category: map['category'] as String? ?? existing?.category,
              isPrepared: pType == 'PREPARED' || pType == 'COMPOUND',
              productType: pType,
              mappingVersionId: map['mappingVersionId'] as String?,
              insumoId: map['insumoId'] as String?,
              createdAt: map['createdAt']?.toString() ?? existing?.createdAt,
              tenantId: map['tenantId'] as String? ?? existing?.tenantId,
              taxRate: (map['taxRate'] as num?)?.toDouble() ?? 0.0,
              isTaxExempt: map['isTaxExempt'] as bool? ?? false,
              inventoryPolicy: map['inventoryPolicy'] as String? ?? existing?.inventoryPolicy,
              directStockInsumoId: map['directStockInsumoId'] as String? ?? existing?.directStockInsumoId,
            ),
          );
        }

        if (productEntities.isNotEmpty) {
          await _database!.productDao.insertProducts(productEntities);
        }

        // 2. Catalog Values
        final rawCatalogValues =
            rawDeltas['catalogValues'] as List<dynamic>? ?? const [];
        final catalogEntities = rawCatalogValues
            .map((c) {
              final map = Map<String, dynamic>.from(c as Map);
              return CatalogValueEntity(
                id: map['id'] as String,
                catalogType: map['catalogType'] as String,
                code: map['code'] as String,
                name: map['name'] as String,
                isActive: map['isActive'] as bool? ?? true,
                sortOrder: (map['sortOrder'] as num?)?.toInt() ?? 0,
              );
            })
            .toList(growable: false);

        if (catalogEntities.isNotEmpty) {
          await _database!.catalogValueDao.insertCatalogValues(catalogEntities);
        }

        // 3. Insumos
        final rawInsumos = rawDeltas['insumos'] as List<dynamic>? ?? const [];
        final insumoEntities = rawInsumos
            .map<InsumoEntity>((i) {
              final map = Map<String, dynamic>.from(i as Map);
              return InsumoEntity(
                id: map['id'] as String,
                name: map['name'] as String,
                consumptionUom:
                    (map['consumptionUom'] ?? map['purchaseUom']) as String? ??
                    'UND',
                stock: (map['stock'] as num?)?.toDouble() ?? 0.0,
                averageCost: (map['averageCost'] as num?)?.toDouble() ?? 0.0,
                isActive: map['isActive'] as bool? ?? true,
                isPerishable: map['isPerishable'] as bool? ?? false,
                // Issue #521 S1: stock alert thresholds from the backend
                // delta; absent keys stay null (never 0).
                parLevel: (map['parLevel'] as num?)?.toDouble(),
                stockMin: (map['minStock'] as num?)?.toDouble(),
                stockMax: (map['maxStock'] as num?)?.toDouble(),
              );
            })
            .toList(growable: false);

        if (insumoEntities.isNotEmpty) {
          await _database!.insumoDao.insertInsumos(insumoEntities);
        }

        // 4. Recipes
        final rawRecipes = rawDeltas['recipes'] as List<dynamic>? ?? const [];
        final recipeEntities = rawRecipes
            .map((r) {
              final map = Map<String, dynamic>.from(r as Map);
              return RecipeEntity(
                id: map['id'] as String,
                productId: map['productId'] as String,
                ingredientId: map['ingredientId'] as String,
                ingredientType: map['ingredientType'] as String? ?? 'INSUMO',
                quantity: (map['quantity'] as num?)?.toDouble() ?? 0.0,
              );
            })
            .toList(growable: false);

        if (recipeEntities.isNotEmpty) {
          await _database!.recipeDao.insertRecipes(recipeEntities);
        }

        // 4b. Recipe version authority hydration (#519 U3). Runs after the
        // products (1) and insumos (3) handlers: the hydrator's projection
        // is insert-if-absent, so ordering only matters for consumers, not
        // for correctness of the writes themselves. The nested delta is
        // adapted into the flat AuthorityHydrationPayload the hydrator
        // expects. Standing invariant: hydration trouble must never fail
        // the pull nor block a sale (Q80) — catch, log with a reason, and
        // surface the outcome in InboundSyncResult.
        var authorityInsumosCount = 0;
        var authorityVersionsCount = 0;
        var authorityComponentsCount = 0;
        var authorityHydrationFailed = false;
        String? authorityHydrationFailureReason;
        // #519 U4: the verdict written to local_configs. Null until this
        // attempt reached a verdict; a legacy response without the
        // `recipeVersions` key must never stamp the keys.
        String? authorityHydrationVerdict;
        String? authorityHydrationVerdictReason;
        final rawRecipeVersions = rawDeltas['recipeVersions'] as List<dynamic>?;
        // #613 Unit A: resolve the product type RECORDED in the terminal's
        // own catalog for every product referenced by this page's recipe
        // versions. Step 1 above has already persisted this pull's products
        // delta, so the local table is fresh for products on this page and
        // authoritative for products referenced from earlier pages. Only an
        // explicitly recorded 'SIMPLE' classifies inert; an unknown product
        // stays on the hydrate path (conservative, behaviour-preserving).
        final productTypesByProductId = <String, String>{};
        if (rawRecipeVersions != null) {
          final referencedProductIds = <String>{
            for (final raw in rawRecipeVersions)
              if (raw is Map &&
                  raw['productId'] is String &&
                  (raw['productId'] as String).isNotEmpty)
                raw['productId'] as String,
          };
          for (final productId in referencedProductIds) {
            final product =
                await _database!.productDao.findProductById(productId);
            if (product != null &&
                product.productType == AuthorityInertRecipe.inertProductType) {
              productTypesByProductId[productId] = product.productType;
            }
          }
        }
        if (rawRecipeVersions == null) {
          // Legacy backend response without the key: a no-op, not an error.
          developer.log(
            '[SYNC_PULL] authority_hydration_skipped reason=no_recipe_versions_key',
            name: 'SyncService',
          );
        } else {
          try {
            final adaptation = adaptAuthorityDelta(
              rawRecipeVersions,
              productTypes: productTypesByProductId,
            );
            if (!adaptation.isSuccess) {
              authorityHydrationFailed = true;
              authorityHydrationFailureReason = adaptation.failureReason;
              authorityHydrationVerdict = 'refused';
              authorityHydrationVerdictReason = adaptation.failureReason;
              developer.log(
                '[SYNC_PULL] authority_hydration_refused reason=${adaptation.failureReason}',
                name: 'SyncService',
              );
            } else {
              await AuthorityHydrationService(
                _database!.authorityProjectionDao,
                verdictDao: _database!.authorityIngestionVerdictDao,
              ).hydrate(
                adaptation.payload!,
                inertRecipes: adaptation.inertRecipes,
              );
              authorityInsumosCount = adaptation.insumoCount;
              authorityVersionsCount = adaptation.versionCount;
              authorityComponentsCount = adaptation.componentCount;
              authorityHydrationVerdict = 'applied';
              developer.log(
                '[SYNC_PULL] authority_hydration_applied '
                'insumos=$authorityInsumosCount '
                'versions=$authorityVersionsCount '
                'components=$authorityComponentsCount '
                'tenant=${adaptation.tenantId}',
                name: 'SyncService',
              );
            }
          } catch (e, stackTrace) {
            // The adapter reports refusals as values; reaching here means
            // the hydration itself threw (e.g. a DAO error). Still never
            // fails the pull.
            authorityHydrationFailed = true;
            authorityHydrationFailureReason = 'authority_hydration_threw';
            authorityHydrationVerdict = 'failed';
            authorityHydrationVerdictReason = 'authority_hydration_threw';
            developer.log(
              '[SYNC_PULL] authority_hydration_failed '
              'reason=authority_hydration_threw',
              name: 'SyncService',
              error: e,
              stackTrace: stackTrace,
            );
          }

          // 4c. Persist the hydration verdict (#519 U4): local_configs
          // keys so the #519 U5 three-state guard can distinguish "never
          // hydrated" from "genuinely empty". Per-attempt telemetry keys
          // (last_at/result/reason) describe the pull; the applied_at key is
          // stamped ONLY on an applied verdict and is never overwritten by
          // a later refusal — it is the "ever succeeded" marker.
          // Diagnostic only: this is a local health signal that never
          // enters an invoice or a snapshot (snapshot reasonCode whitelist
          // untouched). And it is best-effort in the strict sense: the write
          // gets its own guard, because telemetry failing must never reach
          // backwards and undo a pull whose hydration already succeeded.
          try {
            await _database!.localConfigDao.saveConfig(
              LocalConfigEntity(
                key: AuthorityHydrationStatus.lastAtKey,
                value: DateTime.now().toUtc().toIso8601String(),
              ),
            );
            await _database!.localConfigDao.saveConfig(
              LocalConfigEntity(
                key: AuthorityHydrationStatus.resultKey,
                value: authorityHydrationVerdict!,
              ),
            );
            await _database!.localConfigDao.saveConfig(
              LocalConfigEntity(
                key: AuthorityHydrationStatus.reasonKey,
                // Cleared/empty when applied.
                value: authorityHydrationVerdictReason ?? '',
              ),
            );
            if (authorityHydrationVerdict ==
                AuthorityHydrationStatus.appliedVerdict) {
              await _database!.localConfigDao.saveConfig(
                LocalConfigEntity(
                  key: AuthorityHydrationStatus.appliedAtKey,
                  value: DateTime.now().toUtc().toIso8601String(),
                ),
              );
            }
          } catch (e, stackTrace) {
            // The verdict could not be persisted. Report the absence, never
            // the failure: the hydration outcome above stands on its own, and
            // the classifier reads row presence as primary evidence precisely
            // so a missing telemetry row degrades to "unknown", not to a
            // broken pull.
            developer.log(
              '[SYNC_PULL] authority_hydration_verdict_not_persisted',
              name: 'SyncService',
              error: e,
              stackTrace: stackTrace,
            );
          }

          // #613 Unit A: aggregate inert-recipe telemetry (#613 decision 6).
          // local_configs keys so pilot tooling can read the count without
          // parsing UI: the number of distinct ingestion verdict rows on this
          // device (across pulls), plus the verdict code they carry. Own
          // best-effort guard, exactly like the hydration telemetry above:
          // telemetry failing must never reach backwards and undo a pull
          // whose hydration already succeeded.
          try {
            final verdictCount = await _database!
                    .authorityIngestionVerdictDao.countVerdicts() ??
                0;
            await _database!.localConfigDao.saveConfig(
              LocalConfigEntity(
                key: AuthorityIngestionVerdicts.inertCountKey,
                value: '$verdictCount',
              ),
            );
            await _database!.localConfigDao.saveConfig(
              LocalConfigEntity(
                key: AuthorityIngestionVerdicts.inertReasonKey,
                // Cleared/empty when there is nothing to report.
                value: verdictCount > 0
                    ? AuthorityIngestionVerdicts.inertSimpleProductCode
                    : '',
              ),
            );
          } catch (e, stackTrace) {
            developer.log(
              '[SYNC_PULL] authority_inert_verdict_telemetry_not_persisted',
              name: 'SyncService',
              error: e,
              stackTrace: stackTrace,
            );
          }
        }

        // 5. Users & Security Profiles
        final rawUsers = rawDeltas['users'] as List<dynamic>? ?? const [];
        final userEntities = <UserEntity>[];
        final profileEntities = <SecurityProfileEntity>[];

        for (final u in rawUsers) {
          final map = Map<String, dynamic>.from(u as Map);
          final userId = map['id'] as String;
          final secProfile = map['securityProfile'] as Map<String, dynamic>?;
          final pinHash = (secProfile?['pinHash'] as String?) ?? '';

          userEntities.add(
            UserEntity(
              id: userId,
              name: map['name'] as String,
              role: map['role'] as String,
              pinHash: pinHash,
              isActive: map['isActive'] as bool? ?? true,
              email: map['email'] as String?,
            ),
          );

          if (secProfile != null) {
            profileEntities.add(
              SecurityProfileEntity(
                userId: userId,
                pinHash: pinHash.isNotEmpty ? pinHash : null,
                isPinEnabled: secProfile['isPinEnabled'] as bool? ?? true,
                isTotpEnabled: secProfile['isTotpEnabled'] as bool? ?? false,
              ),
            );
          }
        }

        if (userEntities.isNotEmpty) {
          await _database!.userDao.insertUsers(userEntities);
        }
        if (profileEntities.isNotEmpty) {
          await _database!.securityProfileDao.insertProfiles(profileEntities);
        }

        // 5b. Forensic alerts — one-way cloud-to-POS projection (ST-05).
        // Every row is applied insert-if-absent so a cloud replay can never
        // overwrite a locally acknowledged/resolved alert. Lifecycle state
        // comes only from the backend's `resolvedAt` (derived status) and
        // `actorRole` (mapped to the terminal's actor label); anything the
        // backend does not carry is not fabricated.
        final rawAlerts = rawDeltas['alerts'] as List<dynamic>? ?? const [];
        var alertsCount = 0;
        for (final row in rawAlerts) {
          if (row is! Map) continue;
          final map = Map<String, dynamic>.from(row);
          final id = map['id']?.toString();
          final alertType = map['alertType']?.toString();
          final severity = map['severity']?.toString();
          final message = map['message']?.toString();
          final createdAt = map['createdAt'] != null
              ? DateTime.tryParse(map['createdAt'].toString())
              : null;

          // Strict parsing: a row without its identity, type, severity,
          // message, or cursor timestamp is skipped, never defaulted.
          if (id == null ||
              id.isEmpty ||
              alertType == null ||
              alertType.isEmpty ||
              severity == null ||
              severity.isEmpty ||
              message == null ||
              createdAt == null) {
            developer.log(
              '[SYNC_ALERTS] skipped malformed cloud alert row (id=$id)',
              name: 'SyncService',
            );
            continue;
          }

          final resolvedRaw = map['resolvedAt'];
          final hasResolvedRaw = resolvedRaw != null;
          final resolvedAt = hasResolvedRaw
              ? DateTime.tryParse(resolvedRaw.toString())
              : null;
          // A non-null but unparsable resolvedAt is malformed, never a
          // downgrade to "active": skipping the row keeps the terminal from
          // recording a lifecycle state the cloud did not state.
          if (hasResolvedRaw && resolvedAt == null) {
            developer.log(
              '[SYNC_ALERTS] skipped cloud alert row with unparsable resolvedAt (id=$id)',
              name: 'SyncService',
            );
            continue;
          }
          final actorRole = map['actorRole']?.toString();

          // The existing DAO insert-if-absent statement cannot carry the
          // actor label without Floor codegen, so the projection runs one
          // parameterized INSERT OR IGNORE directly: a cloud row is written
          // only when its id is absent, never overwriting terminal-local
          // lifecycle state. `is_synced = 1` because nothing is uploaded.
          await _database!.database.execute(
            'INSERT OR IGNORE INTO forensic_alerts '
            '(id, alert_type, severity, message, created_at, status, '
            'actor_label, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              id,
              alertType,
              severity,
              message,
              createdAt.toIso8601String(),
              resolvedAt != null ? 'resolved' : 'active',
              actorRole,
              1,
            ],
          );
          // alertsCount must report rows actually inserted, not rows
          // received. rawInsert cannot be used here: its ignored-insert
          // result diverges per platform (sqflite_common_ffi returns null,
          // iOS FMDB returns a stale lastInsertRowid), while execute() has
          // no result. SQLite's changes() is exact and platform-independent,
          // and sqflite serializes every operation on the same database
          // through one queue, so no other statement can run between the
          // INSERT and this read.
          final changedRows = await _database!.database
              .rawQuery('SELECT changes() AS changed');
          final inserted =
              (changedRows.first['changed'] as int? ?? 0) > 0;
          if (inserted) {
            alertsCount++;
          }
        }

        // 5c. Loyalty programs & rewards (slice 5d, finding M1). Each
        // program row carries its FULL reward closure from the backend; the
        // DAOs upsert with conflict-replace, so re-delivery is idempotent.
        // Malformed rows are skipped individually and never abort the pull.
        final rawLoyaltyPrograms =
            rawDeltas['loyaltyPrograms'] as List<dynamic>? ?? const [];
        final programEntities = <LoyaltyProgramEntity>[];
        final rewardEntities = <LoyaltyRewardEntity>[];
        for (final row in rawLoyaltyPrograms) {
          if (row is! Map) continue;
          final map = Map<String, dynamic>.from(row);
          final id = map['id']?.toString();
          final name = map['name']?.toString();
          final programType = map['programType']?.toString();
          final tenantId = map['tenantId']?.toString();
          // Strict identity parsing: a row without id, name, type or tenant
          // is skipped, never defaulted.
          if (id == null ||
              id.isEmpty ||
              name == null ||
              name.isEmpty ||
              programType == null ||
              programType.isEmpty ||
              tenantId == null ||
              tenantId.isEmpty) {
            developer.log(
              '[SYNC_LOYALTY] skipped malformed cloud loyalty program row (id=$id)',
              name: 'SyncService',
            );
            continue;
          }
          programEntities.add(
            LoyaltyProgramEntity(
              id: id,
              tenantId: tenantId,
              name: name,
              programType: programType,
              status: map['status']?.toString() ?? 'DRAFT',
              startsAt: _tryParseEpochMillis(map['startsAt']),
              endsAt: _tryParseEpochMillis(map['endsAt']),
              earningRuleJson: jsonEncode(map['earningRule'] ?? const {}),
              eligibilityRuleJson: jsonEncode(
                map['eligibilityRule'] ?? const {},
              ),
              configVersion: (map['configVersion'] as num?)?.toInt() ?? 1,
              createdAt: _tryParseEpochMillis(map['createdAt']) ?? 0,
              updatedAt: _tryParseEpochMillis(map['updatedAt']) ?? 0,
            ),
          );
          final rawRewards = map['rewards'] as List<dynamic>? ?? const [];
          for (final rewardRow in rawRewards) {
            if (rewardRow is! Map) continue;
            final rewardMap = Map<String, dynamic>.from(rewardRow);
            final rewardId = rewardMap['id']?.toString();
            final rewardName = rewardMap['name']?.toString();
            final rewardType = rewardMap['rewardType']?.toString();
            if (rewardId == null ||
                rewardId.isEmpty ||
                rewardName == null ||
                rewardName.isEmpty ||
                rewardType == null ||
                rewardType.isEmpty) {
              developer.log(
                '[SYNC_LOYALTY] skipped malformed cloud loyalty reward row (id=$rewardId)',
                name: 'SyncService',
              );
              continue;
            }
            rewardEntities.add(
              LoyaltyRewardEntity(
                id: rewardId,
                tenantId: rewardMap['tenantId']?.toString() ?? tenantId,
                loyaltyProgramId:
                    rewardMap['loyaltyProgramId']?.toString() ?? id,
                name: rewardName,
                rewardType: rewardType,
                costUnits: (rewardMap['costUnits'] as num?)?.toInt() ?? 0,
                benefitConfigJson: jsonEncode(
                  rewardMap['benefitConfig'] ?? const {},
                ),
                status: rewardMap['status']?.toString() ?? 'INACTIVE',
                startsAt: _tryParseEpochMillis(rewardMap['startsAt']),
                endsAt: _tryParseEpochMillis(rewardMap['endsAt']),
                presentationOrder:
                    (rewardMap['presentationOrder'] as num?)?.toInt() ?? 0,
                configVersion:
                    (rewardMap['configVersion'] as num?)?.toInt() ?? 1,
                createdAt: _tryParseEpochMillis(rewardMap['createdAt']) ?? 0,
                updatedAt: _tryParseEpochMillis(rewardMap['updatedAt']) ?? 0,
              ),
            );
          }
        }
        if (programEntities.isNotEmpty) {
          await _database!.loyaltyProgramDao.savePrograms(programEntities);
        }
        if (rewardEntities.isNotEmpty) {
          await _database!.loyaltyRewardDao.saveRewards(rewardEntities);
        }

        // 5d. Promotions (slice 5d, finding M2). The cloud record is
        // authoritative for every promotion attribute; malformed rows are
        // skipped individually.
        final rawPromotions =
            rawDeltas['promotions'] as List<dynamic>? ?? const [];
        final promotionEntities = <PromotionEntity>[];
        for (final row in rawPromotions) {
          if (row is! Map) continue;
          final map = Map<String, dynamic>.from(row);
          final id = map['id']?.toString();
          final name = map['name']?.toString();
          final type = map['type']?.toString();
          if (id == null ||
              id.isEmpty ||
              name == null ||
              name.isEmpty ||
              type == null ||
              type.isEmpty) {
            developer.log(
              '[SYNC_PROMOTIONS] skipped malformed cloud promotion row (id=$id)',
              name: 'SyncService',
            );
            continue;
          }
          final rawDaysOfWeek = map['daysOfWeek'] as List<dynamic>?;
          promotionEntities.add(
            PromotionEntity(
              id: id,
              name: name,
              type: type,
              targetProductId: map['targetProductId']?.toString(),
              targetCategoryId: map['targetCategoryId']?.toString(),
              buyQuantity: (map['buyQuantity'] as num?)?.toInt() ?? 0,
              getQuantity: (map['getQuantity'] as num?)?.toInt() ?? 0,
              discountValue:
                  (map['discountValue'] as num?)?.toDouble() ?? 0.0,
              minOrderAmount:
                  (map['minOrderAmount'] as num?)?.toDouble() ?? 0.0,
              daysOfWeek: rawDaysOfWeek
                  ?.map((day) => day.toString())
                  .join(','),
              startTime: map['startTime']?.toString(),
              endTime: map['endTime']?.toString(),
              startDate: (map['startDate'] as num?)?.toInt(),
              endDate: (map['endDate'] as num?)?.toInt(),
              priority: (map['priority'] as num?)?.toInt() ?? 0,
              isStackable: map['isStackable'] as bool? ?? true,
              isActive: map['isActive'] as bool? ?? true,
            ),
          );
        }
        if (promotionEntities.isNotEmpty) {
          await _database!.promotionDao.savePromotions(promotionEntities);
        }

        // 5e. Customers (slice 5d, finding M3) — per-row merge, following the
        // products-handler local-only-field precedent.
        final rawCustomers =
            rawDeltas['customers'] as List<dynamic>? ?? const [];
        final customerEntities = <CustomerEntity>[];
        for (final row in rawCustomers) {
          if (row is! Map) continue;
          final map = Map<String, dynamic>.from(row);
          final id = map['id']?.toString();
          final name = map['name']?.toString();
          if (id == null || id.isEmpty || name == null || name.isEmpty) {
            developer.log(
              '[SYNC_CUSTOMERS] skipped malformed cloud customer row (id=$id)',
              name: 'SyncService',
            );
            continue;
          }
          final existing = await _database!.customerDao.getCustomerById(id);

          // Merge decision (slice 5d): the cloud record is authoritative for
          // the synced attributes (name, taxId, phone, email, address,
          // isActive). POS-local fields absent from the cloud contract are
          // preserved: `customerCode` (terminal-local code generation) and
          // `syncStatus` while the local row is still unsynced
          // ('pending'/'error') — stamping 'synced' would claim a push that
          // never happened.
          // `pointsBalance` is driven from both sides: when the customer has
          // locally unsynced point transactions (slice 5b ledger), the local
          // balance is the truth — the cloud has not ingested those rows yet
          // and an incremental pull may even carry a stale cloud balance.
          // Otherwise the cloud value wins.
          var hasUnsyncedPointTransactions = false;
          if (existing != null) {
            final pointTransactions = await _database!
                .customerPointTransactionDao
                .getTransactionsByCustomer(id);
            hasUnsyncedPointTransactions = pointTransactions.any(
              (tx) => tx.syncStatus != 'synced',
            );
          }
          final localSyncStatus = existing?.syncStatus;
          final keepLocalSyncStatus =
              localSyncStatus == 'pending' || localSyncStatus == 'error';
          final resolvedPointsBalance =
              existing != null && hasUnsyncedPointTransactions
                  ? existing.pointsBalance
                  : (map['pointsBalance'] as num?)?.toDouble() ??
                      existing?.pointsBalance ??
                      0.0;

          customerEntities.add(
            CustomerEntity(
              id: id,
              name: name,
              taxId: map['taxId']?.toString(),
              phone: map['phone']?.toString(),
              email: map['email']?.toString(),
              address: map['address']?.toString(),
              pointsBalance: resolvedPointsBalance,
              isActive: map['isActive'] as bool? ?? true,
              createdAt: _tryParseEpochMillis(map['createdAt']) ??
                  existing?.createdAt ??
                  DateTime.now().millisecondsSinceEpoch,
              updatedAt: _tryParseEpochMillis(map['updatedAt']) ??
                  existing?.updatedAt ??
                  DateTime.now().millisecondsSinceEpoch,
              syncStatus: keepLocalSyncStatus ? localSyncStatus! : 'synced',
              customerCode: existing?.customerCode,
            ),
          );
        }
        if (customerEntities.isNotEmpty) {
          await _database!.customerDao.saveCustomers(customerEntities);
        }

        // 6. Fiscal Configuration projection
        int? appliedFiscalRevision;
        String? appliedFiscalFingerprint;
        final rawFiscal = rawDeltas['fiscalConfig'] ?? data['fiscalConfig'];
        final fiscalPresent = rawFiscal is Map;
        final businessNameRaw = fiscalPresent ? rawFiscal['businessName'] : null;
        final businessNamePresent =
            businessNameRaw != null && businessNameRaw.toString().isNotEmpty;
        developer.log(
          '[SYNC_FISCAL] fiscal_config_present=$fiscalPresent business_name_present=$businessNamePresent',
          name: 'SyncService',
        );
        if (fiscalPresent && _database != null) {
          final handler = _fiscalInboxHandler ?? FiscalInboxHandler(_database!);
          try {
            final outcome = await handler.handleFiscalEnvelope(
              Map<String, dynamic>.from(rawFiscal),
              throwOnConflict: false,
            );
            if (outcome.status == FiscalInboxStatus.applied) {
              appliedFiscalRevision = outcome.revision;
              appliedFiscalFingerprint = outcome.fingerprint;
              if (outcome.entity != null) {
                await _sendFiscalAck(
                  tenantId: outcome.entity!.tenantId,
                  revision: outcome.revision,
                  fingerprint: outcome.fingerprint,
                  appliedAt: outcome.entity!.appliedAt,
                );
              }
            } else if (outcome.status == FiscalInboxStatus.idempotentNoOp) {
              appliedFiscalRevision = outcome.revision;
              appliedFiscalFingerprint = outcome.fingerprint;
            }
          } catch (e) {
            developer.log(
              'Failed to process fiscal envelope: $e',
              name: 'SyncService',
            );
          }
        }

        // Update local sync watermark version
        final currentVersion = data['currentVersion'];
        if (currentVersion != null) {
          await _database!.localConfigDao.saveConfig(
            LocalConfigEntity(
              key: 'last_inbound_sync_version',
              value: currentVersion.toString(),
            ),
          );
        }

        final result = InboundSyncResult(
          productsCount: productEntities.length,
          catalogValuesCount: catalogEntities.length,
          insumosCount: insumoEntities.length,
          recipesCount: recipeEntities.length,
          usersCount: userEntities.length,
          alertsCount: alertsCount,
          appliedFiscalRevision: appliedFiscalRevision,
          appliedFiscalFingerprint: appliedFiscalFingerprint,
          authorityInsumosCount: authorityInsumosCount,
          authorityVersionsCount: authorityVersionsCount,
          authorityComponentsCount: authorityComponentsCount,
          authorityHydrationFailed: authorityHydrationFailed,
          authorityHydrationFailureReason: authorityHydrationFailureReason,
          timestamp:
              data['serverTime']?.toString() ??
              DateTime.now().toIso8601String(),
        );

        if (!_inboundSyncController.isClosed) {
          _inboundSyncController.add(result);
        }
        return result;
      }
    } on DioException catch (e) {
      developer.log(
        'Failed to pull inbound catalog deltas: ${e.message}',
        name: 'SyncService',
      );
      rethrow;
    } catch (e, stackTrace) {
      developer.log(
        'Error pulling inbound catalog deltas',
        name: 'SyncService',
        error: e,
        stackTrace: stackTrace,
      );
      rethrow;
    }
    return null;
  }

  Future<void> _sendFiscalAck({
    required String tenantId,
    required int revision,
    required String fingerprint,
    required String appliedAt,
  }) async {
    try {
      await _dio.post(
        '/v1/sync/inbound/fiscal/ack',
        data: {
          'tenantId': tenantId,
          'terminalId': _auditRepository.deviceId,
          'revision': revision,
          'fingerprint': fingerprint,
          'appliedAt': appliedAt,
        },
      );
    } on DioException catch (e) {
      developer.log(
        'Fiscal ACK delivery failed: ${e.message}',
        name: 'SyncService',
      );
    } catch (e) {
      developer.log('Fiscal ACK error: $e', name: 'SyncService');
    }
  }
}

class _SyncBatchResultItem {
  const _SyncBatchResultItem({
    required this.idempotencyKey,
    required this.terminalId,
    required this.flowType,
    required this.sourceSequence,
    required this.status,
    this.retryable,
    this.code,
    this.message,
    this.inventoryOutcome,
    this.acknowledgedMovementCorrelationIds,
  });

  final String idempotencyKey;
  final String terminalId;
  final String flowType;
  final int sourceSequence;
  final String status;
  final String? code;
  final String? message;
  final String? inventoryOutcome;
  final List<String>? acknowledgedMovementCorrelationIds;

  /// Raw `retryable` flag returned by the backend, when present.
  final bool? retryable;

  static _SyncBatchResultItem? tryFromJson(Map<String, dynamic> json) {
    final idempotencyKey = json['idempotencyKey'];
    final terminalId = json['terminalId'] ?? json['sourceDeviceId'];
    final flowType = json['flowType'];
    final sourceSequence = json['sourceSequence'];
    final status = json['status'];
    if (idempotencyKey is! String ||
        terminalId is! String ||
        flowType is! String ||
        sourceSequence is! int ||
        status is! String) {
      return null;
    }
    final code = json['code'];
    final message = json['message'];
    if ((code != null && code is! String) ||
        (message != null && message is! String)) {
      return null;
    }

    final inventoryOutcome = json['inventoryOutcome'] as String?;
    final rawAckIds =
        json['acknowledgedMovementCorrelationIds'] ??
        json['acknowledgedCorrelationIds'];
    final acknowledgedMovementCorrelationIds = (rawAckIds is List)
        ? rawAckIds.map((e) => e.toString()).toList(growable: false)
        : null;

    return _SyncBatchResultItem(
      idempotencyKey: idempotencyKey,
      terminalId: terminalId,
      flowType: flowType,
      sourceSequence: sourceSequence,
      status: status,
      code: code,
      message: message,
      retryable: json['retryable'] is bool ? json['retryable'] as bool : null,
      inventoryOutcome: inventoryOutcome,
      acknowledgedMovementCorrelationIds: acknowledgedMovementCorrelationIds,
    );
  }

  bool shouldMarkSynced(MovementSyncMetadata metadata) {
    if (idempotencyKey != metadata.idempotencyKey) return false;
    final normalizedStatus = status.toUpperCase();
    return normalizedStatus == 'ACCEPTED' ||
        normalizedStatus == 'APPLIED' ||
        normalizedStatus == 'DUPLICATE' ||
        normalizedStatus == 'SUCCESS';
  }

  bool shouldMarkSalesSynced(Map<String, Object?> record) {
    if (idempotencyKey != record['idempotencyKey']) return false;
    final normalizedStatus = status.toUpperCase();
    return normalizedStatus == 'ACCEPTED' ||
        normalizedStatus == 'APPLIED' ||
        normalizedStatus == 'DUPLICATE' ||
        normalizedStatus == 'SUCCESS';
  }
}

class _OrderedMovement {
  final dynamic movement;
  final int originalIndex;
  final int? sequence;

  _OrderedMovement({
    required this.movement,
    required this.originalIndex,
    required this.sequence,
  });
}
