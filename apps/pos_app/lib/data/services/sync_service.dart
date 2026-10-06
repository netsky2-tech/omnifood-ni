import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../../domain/repositories/audit_repository.dart';
import '../../domain/security/ohac_integrity_classifier.dart';
import '../../domain/security/ohac_observability.dart';
import '../../domain/security/ohac_outbox_registry.dart';
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
import '../models/inventory/authority_projection_entities.dart';
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
import '../models/modifiers/modifier_group_entity.dart';
import '../models/modifiers/modifier_option_entity.dart';
import '../models/modifiers/category_modifier_group_entity.dart';
import '../models/modifiers/product_modifier_group_entity.dart';
import '../models/sales/cashier_session_entity.dart';
import '../models/sales/cash_movement_entity.dart';
import '../models/sales/payment_entity.dart';
import 'fiscal_inbox_handler.dart';
import 'authority_delta_adapter.dart';
import '../../core/utils/numeric_utils.dart';
import 'authority_hydration_service.dart';
import 'ohac_negotiation_parameters.dart';
import '../models/human_authorization/field_guards.dart';
import '../models/human_authorization/ohac_acknowledgement_request.dart';
import '../models/human_authorization/ohac_delivery_entities.dart';
import '../models/human_authorization/ohac_epoch_persistence_mapper.dart';
import '../models/human_authorization/ohac_terminal_snapshot_adapter.dart';
import '../models/human_authorization/staff_policy_epoch_v1.dart';
import '../models/human_authorization/terminal_state_machine.dart';
import 'package:pos_app/data/models/inventory/authority_ingestion_verdict_entity.dart';
import 'network_connectivity_service.dart';

const Map<String, String> syncRole = {
  'EDGE_SERVER': 'EDGE_SERVER',
  'STANDALONE': 'STANDALONE',
};

typedef SyncRole = String;

enum CloudSyncStatus { idle, syncing, offline, error, success, auditDegraded }

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
  /// R-16: the scheduler runs every 5 minutes ([start]). A pending item left
  /// unconfirmed for more than three full sync cycles while the device is
  /// online means the sync pipeline is stalled even when the last pass
  /// "succeeded" — the exact condition that kept the badge green for 68
  /// minutes while cash work never reached the backend. The badge uses this
  /// threshold together with [getOldestPendingItemAge] to render the
  /// "Sync detenido" state instead of green.
  static const Duration pendingStallThreshold = Duration(minutes: 15);

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

  /// The §5.1 assertion drain gate registry (B3, design §5.1, §11.5
  /// decision 31). Constructor-injected so tests can register a test
  /// registrant; defaults to a fresh EMPTY registry, which always passes —
  /// the inert decision-31 behavior. No production registrations exist:
  /// all 11 existing outbox structures in this app carry no assertion and
  /// no epoch sequence (measured while landing this unit), and none emits
  /// `ohac.assertion.v1`; DSI-6's credit-note outbox registers the first
  /// real assertions.
  final OhacOutboxRegistry _ohacOutboxRegistry;

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

  /// D-18: the audit stream is recorded separately from the business
  /// domains so a locally durable audit backlog (or a PIN-only pre-send
  /// rejection like `CloudAuthUnavailableException`) surfaces as a degraded
  /// signal instead of a sync error. Reset at the start of every sync pass.
  bool _auditStreamDegraded = false;

  /// D-18: human-readable name of the last audit `AuditSyncStatus` (or
  /// `retryable` as the seeded fallback when the audit repository throws
  /// before returning). Null before the first audit domain run of a pass.
  String? _lastAuditOutcome;

  /// True when the last completed pass left the audit stream not fully
  /// synced (degraded outcome) or with rows still pending. Never implies a
  /// business failure; drives the amber `CloudSyncStatus.auditDegraded`
  /// state instead of `CloudSyncStatus.error`.
  bool get isAuditStreamDegraded => _auditStreamDegraded;

  /// Last audit outcome as an `AuditSyncStatus.name` string, for
  /// diagnostics; never part of [lastSyncError].
  String? get lastAuditOutcome => _lastAuditOutcome;

  SyncService(
    this._auditRepository,
    this._salesRepository,
    this._inventoryRepository,
    this._dio, {
    SyncRole role = 'STANDALONE',
    AppDatabase? database,
    NetworkConnectivityService? connectivityService,
    FiscalInboxHandler? fiscalInboxHandler,
    OhacOutboxRegistry? ohacOutboxRegistry,
    void Function(OhacObservabilityFact fact)? ohacFactObserver,
  }) : _role = role,
       _database = database,
       _connectivityService = connectivityService,
       _fiscalInboxHandler =
           fiscalInboxHandler ??
           (database != null ? FiscalInboxHandler(database) : null),
       _ohacOutboxRegistry = ohacOutboxRegistry ?? OhacOutboxRegistry(),
       _ohacFactObserver = ohacFactObserver;

  /// Test/production seam for OHAC observability facts (design §12): when
  /// null, facts go to `developer.log` via [logOhacFact].
  final void Function(OhacObservabilityFact fact)? _ohacFactObserver;

  /// Emits one OHAC observability fact (design §12/§16): the injected
  /// observer wins (tests); the default writes a `developer.log` line.
  void _emitOhacFact(OhacObservabilityFact fact) {
    final observer = _ohacFactObserver;
    if (observer != null) {
      observer(fact);
      return;
    }
    logOhacFact(fact);
  }

  void _updateStatus(CloudSyncStatus newStatus) {
    if (_status != newStatus) {
      _status = newStatus;
      if (!_statusController.isClosed) {
        _statusController.add(newStatus);
      }
    }
  }

  bool _isRunning = false;

  void start() {
    _isRunning = true;
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

    _scheduleNextSync(const Duration(minutes: 5));
    developer.log('SyncService started', name: 'SyncService');
  }

  void _scheduleNextSync([Duration? delay]) {
    _timer?.cancel();
    if (!_isRunning) return;
    final nextDelay = delay ??
        (_consecutiveFailures > 0
            ? getNextBackoffDelay()
            : const Duration(minutes: 5));
    _timer = Timer(nextDelay, () async {
      await triggerManualSync();
      if (_isRunning) {
        _scheduleNextSync();
      }
    });
  }

  void stop() {
    _isRunning = false;
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

  void notifyAuthBlocked([String reason = 'AUTH_BLOCKED']) {
    _authBlocked = true;
    _syncBlockedReason = reason;
    _updateStatus(CloudSyncStatus.error);
    _lastSyncError = reason == 'DEVICE_REVOKED'
        ? 'DEVICE_REVOKED'
        : 'AUTH_BLOCKED: Reautenticación requerida con el servidor nube (HTTP 401/403)';
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
      // DSI-6 (openspec/changes/device-sync-credit-note-authorization):
      // credit notes are deliberately HELD OUT of outbound device batches
      // until DSI-6 re-enables their transport, so they are not actionable
      // pending work. Counting them would keep the sync badge permanently
      // above zero during the hold; exclude them here, mirroring the
      // outbound filter in _syncSales (documentType != 'CREDIT_NOTE').
      final sales = await _salesRepository.getUnsyncedAggregates();
      count += sales
          .where((aggregate) => aggregate['documentType'] != 'CREDIT_NOTE')
          .length;
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
      // Count only what the outbound inventory batch would actually send, so
      // the badge and the sender cannot disagree about what is still pending.
      // The raw DAO result is insufficient: sale-sync movements are delivered
      // by the sale aggregate pipeline and have no row in the legacy
      // `inventory_movement_sync_state` table, so the DAO's
      // `sync_status IS NULL` branch matched already-delivered work and kept
      // the badge above zero (live-device false positive).
      count += movements.where(_isGenericInventoryOutboxMovement).length;
    } catch (e, st) {
      _logOutboxCountFailure('movements', e, st);
    }

    // R-16: the badge must never report up to date while cash or loyalty
    // work is unconfirmed. These domains were invisible to the count on the
    // night of the 68-minute stall: cash movements, a reconciled card voucher
    // and a closed shift sat pending while the counter read zero. Raw reads
    // (no Floor codegen change), fault-isolated like every domain above.
    final database = _database;
    if (database != null) {
      try {
        final rows = await database.database.rawQuery(
          "SELECT COUNT(*) AS pending FROM cash_movements "
          "WHERE sync_status = 'pending'",
        );
        count += _scalarCount(rows);
      } catch (e, st) {
        _logOutboxCountFailure('cash movements', e, st);
      }

      try {
        // Only CLOSED sessions count as unconfirmed work: an open session
        // stays sync_status='pending' by design until closure (the backend
        // upserts it by id on every pass), so counting it would keep the
        // badge permanently above zero during every open shift. The closure
        // — counted totals, difference, Z report — is the pending work.
        final rows = await database.database.rawQuery(
          "SELECT COUNT(*) AS pending FROM cashier_sessions "
          "WHERE sync_status = 'pending' AND is_closed = 1",
        );
        count += _scalarCount(rows);
      } catch (e, st) {
        _logOutboxCountFailure('cash sessions', e, st);
      }

      try {
        final rows = await database.database.rawQuery(
          "SELECT COUNT(*) AS pending FROM customer_point_transactions "
          "WHERE sync_status = 'pending'",
        );
        count += _scalarCount(rows);
      } catch (e, st) {
        _logOutboxCountFailure('loyalty point transactions', e, st);
      }

      // S1a (backlog #68): the reconciliation outbox rides on the payments
      // table, so the count is a raw read (no extra DAO surface) — same
      // fault-isolated shape as every domain above. A reconciliation pending
      // here is unconfirmed work: the cloud does not have it yet.
      try {
        final rows = await database.database.rawQuery(
          "SELECT COUNT(*) AS pending FROM payments "
          "WHERE reconciliation_sync_status = 'pending'",
        );
        count += _scalarCount(rows);
      } catch (e, st) {
        _logOutboxCountFailure('payment reconciliations', e, st);
      }

      try {
        final rows = await database.database.rawQuery(
          "SELECT COUNT(*) AS pending FROM fulfillment_outbox_events "
          "WHERE state = 'PENDING'",
        );
        count += _scalarCount(rows);
      } catch (e, st) {
        _logOutboxCountFailure('fulfillment events', e, st);
      }
    }

    return count;
  }

  /// R-16: age of the oldest unconfirmed pending item in the locally
  /// timestamped outbox sources, or null when nothing is pending (or the
  /// device database is unavailable). This is the badge's stall signal:
  /// while the device is online, an age beyond [pendingStallThreshold] means
  /// work is not being confirmed even though the network is up — the exact
  /// R-16 condition that kept the badge green during the 68-minute stall.
  ///
  /// Covers the sources the stall can actually age: sales invoices (DSI-6
  /// credit notes excluded, mirroring the outbound hold), cash movements,
  /// closed cash sessions and loyalty point transactions. Fulfillment outbox
  /// events carry no timestamp column and cannot be aged; they are still
  /// counted by [getPendingOutboxCount].
  ///
  /// Fault-isolated per source like [getPendingOutboxCount]: a failed read
  /// only removes that source from the signal, never breaks the read.
  Future<Duration?> getOldestPendingItemAge() async {
    final database = _database;
    if (database == null) return null;
    final oldestTimestampsMs = <int>[];

    Future<void> readOldest(String source, String sql) async {
      try {
        final rows = await database.database.rawQuery(sql);
        if (rows.isEmpty) return;
        final value = rows.first['oldest'];
        if (value is int && value > 0) oldestTimestampsMs.add(value);
      } catch (e, st) {
        _logOutboxCountFailure(source, e, st);
      }
    }

    await readOldest(
      'sales oldest pending',
      "SELECT MIN(created_at) AS oldest FROM invoices "
      "WHERE sync_status = 'pending' AND type != 'creditNote'",
    );
    await readOldest(
      'cash movements oldest pending',
      "SELECT MIN(timestamp) AS oldest FROM cash_movements "
      "WHERE sync_status = 'pending'",
    );
    // Open sessions are excluded deliberately: they stay 'pending' by design
    // until closure and are re-pushed (idempotently) on every pass, so their
    // age is not evidence of a stall. See getPendingOutboxCount.
    await readOldest(
      'cash sessions oldest pending',
      "SELECT MIN(opened_at) AS oldest FROM cashier_sessions "
      "WHERE sync_status = 'pending' AND is_closed = 1",
    );
    await readOldest(
      'loyalty oldest pending',
      "SELECT MIN(created_at) AS oldest FROM customer_point_transactions "
      "WHERE sync_status = 'pending'",
    );
    await readOldest(
      'reconciliations oldest pending',
      "SELECT MIN(reconciled_at) AS oldest FROM payments "
      "WHERE reconciliation_sync_status = 'pending'",
    );

    if (oldestTimestampsMs.isEmpty) return null;
    final oldestMs = oldestTimestampsMs.reduce(min);
    return DateTime.now()
        .difference(DateTime.fromMillisecondsSinceEpoch(oldestMs));
  }

  /// Scalar `COUNT(*) AS pending` extraction for the raw pending-count
  /// queries below. Mirrors the defensive parse in [getPendingAuditCount].
  int _scalarCount(List<Map<String, Object?>> rows) {
    if (rows.isEmpty) return 0;
    final value = rows.first['pending'];
    return value is int ? value : int.tryParse('$value') ?? 0;
  }

  /// D-18: number of audit rows still pending cloud ACK on this terminal,
  /// for the sync badge's `Registros de auditoría pendientes` row and the
  /// audit-degraded honesty check. The count runs directly against
  /// `audit_logs` with the same read-only rawQuery pattern as
  /// [getInertRecipeVerdictReport] instead of adding a generated Floor DAO
  /// query, so the audit DAO's generated implementation in
  /// `app_database.g.dart` stays untouched. Fault-isolated: a failed read
  /// returns 0 and never throws, mirroring [getPendingOutboxCount].
  Future<int> getPendingAuditCount() async {
    final database = _database;
    if (database == null) return 0;
    try {
      final rows = await database.database.rawQuery(
        'SELECT COUNT(*) AS pending FROM audit_logs WHERE is_synced = 0',
      );
      if (rows.isEmpty) return 0;
      final count = rows.first['pending'];
      return count is int ? count : int.tryParse('$count') ?? 0;
    } catch (e, st) {
      _logOutboxCountFailure('audit logs', e, st);
      return 0;
    }
  }

  /// Whether a movement is actionable outbound work for the generic inventory
  /// batch. Shared by [getPendingOutboxCount] and the outbound inventory sync
  /// so the two cannot drift apart.
  ///
  /// Covers only the synchronously evaluable part of the outbound filter;
  /// callers add their async-only conditions (production linkage, blocked
  /// ids) on top.
  ///
  /// Sale movements are excluded deliberately: their delivery is owned by the
  /// sale-sync aggregate, not by this batch. Credit-note restock movements
  /// share the DSI-6 credit-note transport hold and are excluded for the same
  /// reason — neither is actionable pending work.
  bool _isGenericInventoryOutboxMovement(InventoryMovement movement) {
    return movement.deliveryOwner == 'GENERIC_INVENTORY' &&
        movement.deliveryState != 'QUARANTINED' &&
        movement.deliveryState != 'CLOUD_ACKNOWLEDGED' &&
        movement.type != MovementType.sale &&
        movement.sourceDocumentType != 'SALE' &&
        movement.sourceDocumentType != 'SALE_CANCEL' &&
        movement.type != MovementType.purchase &&
        !(movement.reason?.startsWith('COUNT_SESSION:') ?? false) &&
        !(movement.reason?.startsWith('Anulación Factura:') ?? false) &&
        !_isCreditNoteRestockMovement(movement);
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
      // Only verdicts that are still UNRESOLVED surface here: the verdict
      // table is append-only (audit material), so a stale verdict for a
      // product the operator has since fixed (product no longer missing, no
      // longer recorded SIMPLE) must not keep the badge above zero. Unknown
      // products (p.id IS NULL) always stay reported. Cloud telemetry
      // (AuthorityIngestionVerdicts.inertCountKey in local_configs) keeps
      // counting raw historical rows; this is the operator-facing read
      // model only (#613).
      final rows = await database.database.rawQuery(
        'SELECT v.product_id AS product_id, p.name AS product_name '
        'FROM authority_ingestion_verdicts v '
        'LEFT JOIN products p ON p.id = v.product_id '
        'WHERE p.id IS NULL OR p.product_type = ? '
        'ORDER BY p.name',
        const [AuthorityInertRecipe.inertProductType],
      );
      final count = rows.length;
      if (count <= 0) return null;
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
    // D-18: audit degradation is recomputed from scratch on every pass.
    _auditStreamDegraded = false;
    _lastAuditOutcome = null;
    _updateStatus(CloudSyncStatus.syncing);
    developer.log('[SYNC_MANUAL] triggered=true', name: 'SyncService');

    final List<String> domainErrors = [];

    try {
      developer.log(
        'Starting sync pass with fault isolation...',
        name: 'SyncService',
      );

      // D-18: the audit stream is locally durable (rows persist with
      // `is_synced = 0` until the backend ACKs) and MUST NOT fail the sync
      // pass. On a PIN-only session the audit push is rejected before send
      // (`CloudAuthUnavailableException`), which is not an HTTP 401 and
      // must not flip the badge red while business documents keep syncing.
      // Record the outcome separately instead: it is never added to
      // [domainErrors] and only degrades the pass to the dedicated
      // `CloudSyncStatus.auditDegraded` state (amber), handled in the
      // success branch below.
      var hasFailure = false;
      var auditOutcome = const AuditSyncOutcome.retryable(failedStreams: 1);
      await _runDomain('audit', () async {
        auditOutcome = await _auditRepository.syncLogs();
      });
      _lastAuditOutcome = auditOutcome.status.name;
      if (auditOutcome.status != AuditSyncStatus.complete) {
        _auditStreamDegraded = true;
      }

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

      // 1e. Push card/voucher reconciliations (S1a, backlog #68): a
      // reconciliation is performed on the terminal AFTER the sale synced,
      // and re-pushing the sale is a dead end (same idempotency key →
      // DUPLICATE_REPLAY; the sale payload hash excludes reconciliation
      // fields), so this is a dedicated payment-level transport.
      // Fault-isolated like every other domain: a failure never aborts
      // later domains.
      final reconciliationSuccess = await _runDomain(
        'reconciliation',
        _syncPaymentReconciliations,
      );
      if (!reconciliationSuccess) {
        hasFailure = true;
        domainErrors.add('Conciliaciones');
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
        // D-18 honesty: when only the audit stream degraded, the pass is
        // not an error, but it is not "Nube Sincronizada al 100%" either
        // while audit rows remain pending on this terminal. Surface the
        // dedicated degraded state (amber in the badge) and report the run
        // as partial; never the green success path.
        final pendingAudit = await getPendingAuditCount();
        if (_auditStreamDegraded || pendingAudit > 0) {
          _auditStreamDegraded = true;
          _updateStatus(CloudSyncStatus.auditDegraded);
          developer.log(
            '[SYNC_MANUAL] completed=true reason=audit_degraded '
            'pendingAudit=$pendingAudit outcome=$_lastAuditOutcome',
            name: 'SyncService',
          );
          return const SyncRunOutcome.partial();
        }
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
      } else if (_isRunning) {
        _scheduleNextSync();
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
      // ignore: avoid_print
      print('[SyncDomainError] DioException in domain $domain: ${dioErr.message} status=${dioErr.response?.statusCode} data=${dioErr.response?.data}');
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
      // ignore: avoid_print
      print('[SyncDomainError] Error in domain $domain: $error\n$stackTrace');
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

    // D-3/D-14: resolve the cashier id against the local users table before
    // pushing so the cloud `cashier_name` column carries a person's name.
    // findAllUsers keeps INACTIVE users for historical attribution. When the
    // id cannot be resolved the key is OMITTED (never the UUID): the backend
    // then resolves against the tenant users table and only falls back to
    // the id as a last resort.
    Map<String, String> userNamesById = const {};
    try {
      final users = await database.userDao.findAllUsers();
      userNamesById = {for (final u in users) u.id: u.name};
    } catch (_) {
      userNamesById = const {};
    }

    developer.log(
      'Cash shift sync: posting ${sessionBatch.length} sessions and '
      '${movementBatch.length} movements',
      name: 'SyncService',
    );
    final response = await _dio.post(
      '/sales/shifts/sync',
      data: {
        'sessions': await Future.wait(sessionBatch
            .map((session) =>
                _buildCashShiftSessionPayload(session, userNamesById))
            .toList(growable: false)),
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
  /// (CashShiftSessionSyncItemDto). D-3/D-14: when the cashier id resolves
  /// against the local users table, the resolved person name is sent as
  /// `cashierName`; when it does not, the key is omitted and the backend
  /// resolves server-side (its last resort remains the cashier id, so the
  /// NOT NULL column is still satisfied — a UUID never originates here when
  /// a name exists).
  ///
  /// S2 (backlog #68): a CLOSED session also carries the shift's voucher
  /// reconciliation state — the counts of card payments attached to the
  /// shift's invoices by reconciliation status (pending / reconciled /
  /// manually overridden). The keys are omitted for a still-OPEN session:
  /// the shift's voucher state is a close-time fact, and the backend maps
  /// the absent keys to NULL columns (the later closed push carries them).
  Future<Map<String, Object?>> _buildCashShiftSessionPayload(
    CashierSessionEntity session,
    Map<String, String> userNamesById,
  ) async {
    final cashierName = userNamesById[session.userId];
    final payload = {
      'id': session.id,
      'terminalId': session.terminalId,
      'cashierId': session.userId,
      if (cashierName != null && cashierName.trim().isNotEmpty)
        'cashierName': cashierName.trim(),
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

    if (session.isClosed) {
      final paymentDao = _database?.paymentDao;
      if (paymentDao != null) {
        payload['cardVouchersPending'] =
            await paymentDao.countPendingCardPaymentsForShift(session.id) ?? 0;
        payload['cardVouchersReconciled'] =
            await paymentDao.countReconciledCardPaymentsForShift(session.id) ??
                0;
        payload['cardVouchersOverridden'] =
            await paymentDao.countOverriddenCardPaymentsForShift(session.id) ??
                0;
      }
    }

    return payload;
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

  /// S1a (backlog #68): pushes pending card/voucher reconciliations to the
  /// cloud in bounded batches. Rows stay 'pending' on any failure and are
  /// retried on the next sync pass; rows the backend reports as FAILED
  /// per-record (UNKNOWN_PAYMENT, INVOICE_MISMATCH, INVALID_STATUS,
  /// PERSISTENCE_ERROR) also stay pending instead of being lost. The
  /// backend upserts `invoice_payments` by payment id, so re-pushing an
  /// accepted reconciliation is an idempotent no-op server-side.
  Future<void> _syncPaymentReconciliations() async {
    final database = _database;
    if (database == null) return;
    final paymentDao = database.paymentDao;
    // DAO-level filter (not a Dart filter): the payments table grows with
    // every sale.
    final pending = await paymentDao.getPendingReconciliations();
    if (pending.isEmpty) return;

    final batch = pending.take(_batchEnvelopeLimit).toList(growable: false);

    developer.log(
      'Reconciliation sync: posting ${batch.length} payment reconciliations',
      name: 'SyncService',
    );
    final response = await _dio.post(
      '/sales/payment-reconciliations/sync',
      data: {
        'reconciliations': batch
            .map(_buildPaymentReconciliationPayload)
            .toList(growable: false),
      },
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      final acceptedKeys = _acceptedReconciliationSyncKeys(response.data);
      for (final payment in batch) {
        if (!acceptedKeys.contains(payment.id)) continue;
        await paymentDao
            .updateReconciliationSyncStatus(payment.id, 'synced');
      }
    }
  }

  /// Maps a local payment row onto the cloud ingestion contract
  /// (PaymentReconciliationSyncItemDto). `reconciledAt` is sent as ISO-8601
  /// (the DTO requires a non-empty string); the optional correlation fields
  /// are omitted when absent, never sent as null.
  Map<String, Object?> _buildPaymentReconciliationPayload(
    PaymentEntity payment,
  ) {
    return {
      'paymentId': payment.id,
      'invoiceId': payment.invoiceId,
      'reconciliationStatus': payment.reconciliationStatus ?? 'PENDIENTE',
      'reconciledAt': payment.reconciledAt != null
          ? DateTime.fromMillisecondsSinceEpoch(
              payment.reconciledAt!,
              isUtc: true,
            ).toIso8601String()
          : DateTime.now().toUtc().toIso8601String(),
      'reconciledByUserId':
          payment.reconciledByUserId ?? 'unknown-terminal-operator',
      if (payment.voucherCode != null) 'voucherCode': payment.voucherCode,
      if (payment.batchNumber != null) 'batchNumber': payment.batchNumber,
      if (payment.last4 != null) 'last4': payment.last4,
    };
  }

  /// Extracts the payment ids the backend accepted (per-record outcomes).
  /// Results are keyed by `paymentId` (PaymentReconciliationSyncIngestionService).
  Set<String> _acceptedReconciliationSyncKeys(dynamic responseData) {
    if (responseData is! Map) return const <String>{};
    final results = responseData['results'];
    if (results is! List) return const <String>{};
    return {
      for (final item in results)
        if (item is Map &&
            item['status'] == 'ACCEPTED' &&
            item['paymentId'] is String)
          item['paymentId'] as String,
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
                _isGenericInventoryOutboxMovement(movement) &&
                !_isProductionLinkedMovement(movement) &&
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

  /// Consumes the `humanAuthorization` member of an inbound pull response
  /// (unit B2c-3b; design §4.2, §5, §9).
  ///
  /// Member semantics (backend `inbound-sync.dto.ts` / delivery service):
  /// the member is a top-level sibling of `deltas`, and its absence means
  /// either 'not participating' or 'up to date' — indistinguishable
  /// client-side, so absence and every non-`DELIVER` status (`DISABLED`,
  /// `UPGRADE_REQUIRED`, `RECOVERY_REQUIRED`) are no-ops: never persisted,
  /// and absence is never treated as a DISABLED state change.
  ///
  /// `DELIVER` carries `{status, epoch, sequence, digest}` where the sibling
  /// `sequence`/`digest` merely duplicate the epoch's own values; a mismatch
  /// between the two renderings fails closed before anything is parsed or
  /// written.
  ///
  /// Identity comes from the persisted terminal state, never from the epoch:
  /// the mapper asserts the envelope against `state.tenantId`/
  /// `state.terminalId` and throws on mismatch. `ensureTerminalState` already
  /// ran during this pull's negotiation, but this method must not assume the
  /// row exists — a missing row is a fail-closed refusal, and any `StateError`
  /// R raises (state not `ACTIVE`, sequence race) is contained by the caller's
  /// try/catch so consumption can never fail the pull or the watermark.
  ///
  /// The negotiated facts recorded by R reuse the same build string this
  /// client negotiated with (`readOhacPosBuild()`), the epoch's
  /// `publisherBackendBuild`, and the envelope's two schema ids.
  Future<void> _consumeHumanAuthorizationEpoch(
    Map<dynamic, dynamic> data,
  ) async {
    final member = data['humanAuthorization'];
    if (member == null) {
      developer.log(
        '[SYNC_PULL] ohac_epoch member=absent action=noop',
        name: 'SyncService',
      );
      return;
    }
    if (member is! Map) {
      developer.log(
        '[SYNC_PULL] ohac_epoch_refused reason=member_not_map',
        name: 'SyncService',
      );
      return;
    }
    final envelope = Map<String, dynamic>.from(member);

    final status = envelope['status']?.toString();
    if (status != 'DELIVER') {
      if (status == 'RECOVERY_REQUIRED') {
        // Unit B2d (design §5 step 5, §9): the backend answers
        // RECOVERY_REQUIRED when the floor THIS terminal reported is ahead
        // of what the server has acknowledged — i.e. "local above floor
        // with a confirmed-active claim". There is no legitimate local path
        // to that state (our floor only advances on a server receipt), so
        // this is a server-side loss or rollback against this terminal's
        // recorded history. §9's classification for a "local/server floor"
        // conflict is ACK_INCONSISTENT: fail closed, quarantine, security
        // investigation plus recovery. DISABLED and UPGRADE_REQUIRED remain
        // no-ops (§10 zero fallback).
        final database = _database!;
        final tenantConfig = await database.localConfigDao.getConfigByKey(
          'tenant_id',
        );
        final tenantId = tenantConfig?.value ?? 'tenant-1';
        final terminalId = _auditRepository.deviceId;
        final recoveryState = await database.ohacDeliveryDao
            .findTerminalState(tenantId, terminalId);
        if (recoveryState == null) {
          developer.log(
            '[SYNC_PULL] ohac_recovery_required_refused '
            'reason=terminal_state_missing',
            name: 'SyncService',
          );
          return;
        }
        if (recoveryState.state != OhacTerminalPhase.integrityLoss.wire) {
          // §9 classification routing (U5b): the RECOVERY_REQUIRED answer
          // is a local/server floor conflict → the classifier's
          // ACK_INCONSISTENT family, via the single mapping source.
          final classification = classifyOhacIntegrity(
            const OhacConditionAckInconsistent('recovery_required'),
          );
          final marked = await database.ohacDeliveryDao.markIntegrityLoss(
            tenantId,
            terminalId,
            recoveryState.revision,
            classification.wire,
            DateTime.now().toIso8601String(),
          );
          _emitOhacFact(ohacIntegrityClassifiedFact(
            tenantId: tenantId,
            terminalId: terminalId,
            classification: classification.wire,
            reason: 'recovery_required',
            applied: marked == 1,
          ));
        }
        developer.log(
          '[SYNC_PULL] ohac_recovery_required classification='
          '${OhacIntegrityClassification.ackInconsistent.wire}',
          name: 'SyncService',
        );
        return;
      }
      // DISABLED / UPGRADE_REQUIRED (and any unknown status) carry no
      // epoch: nothing to apply, nothing to persist.
      developer.log(
        '[SYNC_PULL] ohac_epoch status=$status action=noop',
        name: 'SyncService',
      );
      return;
    }

    final epochRaw = envelope['epoch'];
    if (epochRaw is! Map) {
      developer.log(
        '[SYNC_PULL] ohac_epoch_refused reason=epoch_not_map',
        name: 'SyncService',
      );
      return;
    }
    final epochMap = Map<String, dynamic>.from(epochRaw);

    // Cross-check the sibling pair against the epoch's own values before
    // anything else: the backend renders them as a redundancy, and a
    // truncated or tampered rendering must be detected before parsing.
    if (envelope['sequence'] != epochMap['sequence'] ||
        envelope['digest'] != epochMap['digest']) {
      developer.log(
        '[SYNC_PULL] ohac_epoch_refused reason=sibling_pair_mismatch',
        name: 'SyncService',
      );
      return;
    }

    final database = _database!;
    final tenantConfig = await database.localConfigDao.getConfigByKey(
      'tenant_id',
    );
    final tenantId = tenantConfig?.value ?? 'tenant-1';
    final terminalId = _auditRepository.deviceId;
    final state = await database.ohacDeliveryDao.findTerminalState(
      tenantId,
      terminalId,
    );
    if (state == null) {
      // The negotiation step ensures the row on every pull, but never assume
      // it: no state row, no consumption.
      developer.log(
        '[SYNC_PULL] ohac_epoch_refused reason=terminal_state_missing',
        name: 'SyncService',
      );
      return;
    }

    final posBuild = await readOhacPosBuild();
    if (posBuild == null) {
      // The negotiated build cannot be read, so nothing can be matched
      // against the epoch's targetPosBuild: refuse rather than guess.
      developer.log(
        '[SYNC_PULL] ohac_epoch_refused reason=pos_build_unreadable',
        name: 'SyncService',
      );
      return;
    }

    // Parse + map before deciding: the envelope digest is the only check
    // that detects byte-level corruption, and R needs the mapped rows.
    final mapping = mapDeliveredEpochForPersistence(
      epochMap: epochMap,
      tenantId: state.tenantId,
      terminalId: state.terminalId,
      receivedAt: DateTime.now().toIso8601String(),
    );

    final decision = evaluateDeliveredEpoch(
      epoch: mapping.epoch,
      state: _acceptanceStateFor(state),
      supportedPosBuild: posBuild,
    );

    switch (decision) {
      case OhacReceiveAccept():
        // Transaction R takes positional arguments in its exact declared
        // order (Floor @transaction, AGENTS.md, design §13).
        await database.ohacDeliveryDao.receiveCandidateEpoch(
          mapping.epochEntity,
          mapping.entryEntities,
          mapping.entryEntities.length,
          mapping.epoch.digest,
          state.revision,
          posBuild,
          mapping.epoch.publisherBackendBuild,
          mapping.epoch.schema,
          mapping.epoch.minimumAssertionSchema,
          DateTime.now().toIso8601String(),
        );
        developer.log(
          '[SYNC_PULL] ohac_epoch_accepted sequence=${mapping.epoch.sequence}',
          name: 'SyncService',
        );
        _emitOhacFact(ohacEpochPublicationFact(
          action: 'accepted',
          sequence: mapping.epoch.sequence,
          detail: 'candidate_received',
        ));

        // Design §5 steps 3-4 (unit B2d): a freshly received candidate must
        // not sit in RECEIVE_PENDING — flip to ACK_SUBMITTING (transaction
        // S) and immediately send the acknowledgement. The flip is the S
        // transaction's own precondition-checked move; its revision is read
        // back because R just bumped it.
        final submittedState = await database.ohacDeliveryDao
            .findTerminalState(state.tenantId, state.terminalId);
        if (submittedState == null) {
          developer.log(
            '[SYNC_PULL] ohac_ack_deferred reason=terminal_state_missing',
            name: 'SyncService',
          );
          return;
        }
        await database.ohacDeliveryDao.submitCandidateAcknowledgement(
          state.tenantId,
          state.terminalId,
          submittedState.revision,
          mapping.epochEntity.sequence,
          mapping.epoch.digest,
          DateTime.now().toIso8601String(),
          _ohacOutboxRegistry,
        );
        final ackState = await database.ohacDeliveryDao.findTerminalState(
          state.tenantId,
          state.terminalId,
        );
        if (ackState == null) {
          developer.log(
            '[SYNC_PULL] ohac_ack_deferred reason=terminal_state_missing',
            name: 'SyncService',
          );
          return;
        }
        if (ackState.state == OhacTerminalPhase.receivePending.wire) {
          // B3 (design §5.1 lines 176/180): transaction S evaluated the
          // drain gate and deferred — the flip did NOT happen, so nothing
          // may be POSTed: the server floor must not advance while a
          // registered outbox holds a prior-epoch assertion. The deferral is
          // retried on the next sync cycle by the reconciliation step.
          _logOhacAckDeferred(ackState);
          return;
        }
        await _submitOhacAcknowledgement(
          ackState,
          mapping.epochEntity,
          posBuild,
          reason: 'candidate_received',
        );
      case OhacReceiveDuplicate():
        _emitOhacFact(ohacEpochPublicationFact(
          action: 'duplicate',
          sequence: mapping.epoch.sequence,
          detail: 'already_held',
        ));
        developer.log(
          '[SYNC_PULL] ohac_epoch status=duplicate action=noop',
          name: 'SyncService',
        );
      case OhacReceiveReject(:final error):
        _emitOhacFact(ohacEpochPublicationFact(
          action: 'rejected',
          sequence: mapping.epoch.sequence,
          detail: error.code,
        ));
        // Stale or gapped epoch: a normal race against other terminals of
        // the tenant. No persistence, no fault.
        developer.log(
          '[SYNC_PULL] ohac_epoch_rejected code=${error.code} '
          'field=${error.field}',
          name: 'SyncService',
        );
      case OhacReceiveIntegrityLoss(:final classification):
        // §9 quarantine semantics: record the fault class on the terminal
        // state. Reconciliation of INTEGRITY_LOSS is B2d's scope.
        final marked = await database.ohacDeliveryDao.markIntegrityLoss(
          state.tenantId,
          state.terminalId,
          state.revision,
          classification.wire,
          DateTime.now().toIso8601String(),
        );
        _emitOhacFact(ohacIntegrityClassifiedFact(
          tenantId: state.tenantId,
          terminalId: state.terminalId,
          classification: classification.wire,
          reason: 'epoch_receive_conflict',
          applied: marked == 1,
        ));
        developer.log(
          '[SYNC_PULL] ohac_epoch_integrity_loss '
          'classification=${classification.wire} applied=${marked == 1}',
          name: 'SyncService',
        );
    }
  }

  /// Logs one drain-gate deferral observation (B3, design §5.1 line 180:
  /// "the deferral is observable (terminal-state reason
  /// `OHAC_ACK_DEFERRED_OUTBOX`, §10, plus metrics) and retried on every
  /// subsequent sync cycle").
  ///
  /// When the candidate's deferral count has reached the design's bounded
  /// retry placeholder ([OhacOutboxRegistry.ohacAckDeferredRetryBound]), the
  /// log escalates to WARNING with `quarantineReview=true`: the retry bound
  /// governs the drain gate only (§5.1 line 182) and imposes no admissibility
  /// TTL on the assertion itself. The reason column stays
  /// `OHAC_ACK_DEFERRED_OUTBOX` — no invented reason vocabulary; actual
  /// terminal-side quarantine classification is DSI-6's decision.
  void _logOhacAckDeferred(OhacTerminalStateEntity state) {
    final count = state.ackDeferralCount ?? 0;
    final boundReached =
        count >= OhacOutboxRegistry.ohacAckDeferredRetryBound;
    _emitOhacFact(ohacAckDeferredFact(
      reason: OhacLocalEventType.ackDeferredOutbox,
      phase: state.state,
      candidateSequence: state.candidateSequence,
      deferralCount: count,
      quarantineReview: boundReached,
    ));
    developer.log(
      '[SYNC_PULL] ohac_ack_deferred '
      'reason=${OhacLocalEventType.ackDeferredOutbox} '
      'candidate=${state.candidateSequence} '
      'count=$count '
      'quarantineReview=$boundReached',
      name: 'SyncService',
      // dart:developer's log takes the severity as an int (800 = INFO,
      // 900 = WARNING per its documented Level values).
      level: boundReached ? 900 : 800,
    );
  }

  /// Retries a drain-gate deferral (B3, design §5.1 line 180: retried on
  /// every subsequent sync cycle). Runs from the reconciliation step, which
  /// fires on every pull before epoch consumption — so a candidate sitting
  /// in `RECEIVE_PENDING` with a recorded deferral reason re-enters
  /// transaction S, which re-evaluates the gate; a pass flips and the ack is
  /// sent exactly as on the accept path. A still-blocking gate logs the
  /// deferral and waits for the next cycle.
  ///
  /// This path can only fire when a deferral was recorded, which requires a
  /// registered assertion-bearing outbox — with the empty production
  /// registry the pull behaves byte-identically to the pre-B3 build
  /// (decision 31's inert structure).
  Future<void> _retryDeferredOhacAcknowledgement(
    OhacTerminalStateEntity state,
  ) async {
    final database = _database!;
    final tenantId = state.tenantId;
    final terminalId = state.terminalId;

    // A deferred terminal always carries a candidate pair; the sentinel pair
    // here would mean a deferral recorded against nothing — refuse and leave
    // it for the integrity paths.
    if (state.candidateSequence <= 0 || state.candidateDigest.isEmpty) {
      developer.log(
        '[SYNC_PULL] ohac_deferral_retry_refused reason=candidate_pair_missing',
        name: 'SyncService',
      );
      return;
    }

    await database.ohacDeliveryDao.submitCandidateAcknowledgement(
      tenantId,
      terminalId,
      state.revision,
      state.candidateSequence,
      state.candidateDigest,
      DateTime.now().toIso8601String(),
      _ohacOutboxRegistry,
    );

    final after = await database.ohacDeliveryDao.findTerminalState(
      tenantId,
      terminalId,
    );
    if (after == null) {
      developer.log(
        '[SYNC_PULL] ohac_deferral_retry_refused reason=terminal_state_missing',
        name: 'SyncService',
      );
      return;
    }
    if (after.state == OhacTerminalPhase.receivePending.wire) {
      // Still blocked: same containment as the accept path.
      _logOhacAckDeferred(after);
      return;
    }

    // The gate passed and the flip committed: send the acknowledgement
    // exactly as the accept path would have.
    final epoch = await database.ohacDeliveryDao.findEpoch(
      tenantId,
      terminalId,
      after.candidateSequence,
    );
    if (epoch == null) {
      developer.log(
        '[SYNC_PULL] ohac_deferral_retry_refused reason=epoch_row_missing',
        name: 'SyncService',
      );
      return;
    }
    final posBuild = await readOhacPosBuild();
    if (posBuild == null) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=pos_build_unreadable '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }
    await _submitOhacAcknowledgement(
      after,
      epoch,
      posBuild,
      reason: 'drain_gate_retry',
    );
  }

  /// The OHAC acknowledgement client and reconnect reconciliation (unit
  /// B2d, design §5 steps 3-5, §9, §10).
  ///
  /// **Phase-driven retry (§5 step 5).** Runs on every pull, before the
  /// epoch consumption: a terminal whose acknowledgement never reached the
  /// server (lost POST, lost response, process death) sits in
  /// `ACK_SUBMITTING` with `active == floor`, so `decideReconciliation`
  /// would answer `NothingToReconcile` and freeze it forever. The phase
  /// itself is the retry trigger — not a reconciliation arithmetic — so
  /// `decideReconciliation` is deliberately left uncalled here.
  ///
  /// With an intact candidate the identical request is resent (same derived
  /// idempotency key, so the server replays the stored receipt instead of
  /// answering `IDEMPOTENCY_CONFLICT`). With a candidate that can no longer
  /// be proven intact (missing epoch row, digest drift) or a missing
  /// candidate pair, §5 step 5's "below floor ... otherwise" branch applies:
  /// `INTEGRITY_LOSS` with the §9 classification (`LOCAL_ROLLBACK` for the
  /// lost/mismatched candidate — the wire spelling of §5.5's
  /// ROLLBACK_DETECTED; `AUTH_STATE_MISSING` for the required-row shape a
  /// submitting terminal can never legitimately have).
  Future<void> _reconcileOhacAcknowledgement() async {
    final database = _database;
    if (database == null) return;

    final tenantConfig = await database.localConfigDao.getConfigByKey(
      'tenant_id',
    );
    final tenantId = tenantConfig?.value ?? 'tenant-1';
    final terminalId = _auditRepository.deviceId;
    final state = await database.ohacDeliveryDao.findTerminalState(
      tenantId,
      terminalId,
    );
    if (state == null) return;
    if (state.state == OhacTerminalPhase.receivePending.wire) {
      // B3 (design §5.1 line 180): a recorded drain-gate deferral is retried
      // on every subsequent sync cycle. Without a recorded reason the pull
      // behaves exactly as before B3.
      if (state.ackDeferralReason == null) return;
      await _retryDeferredOhacAcknowledgement(state);
      return;
    }
    if (state.state != OhacTerminalPhase.ackSubmitting.wire) return;

    // A submitting terminal always carries a candidate pair; the sentinel
    // pair here is required-row loss (§9 AUTH_STATE_MISSING).
    final candidateSequence = state.candidateSequence;
    final candidateDigest = state.candidateDigest;
    if (candidateSequence <= 0 || candidateDigest.isEmpty) {
      await _markOhacIntegrityLoss(
        state,
        classifyOhacIntegrity(
          const OhacConditionAuthStateMissing('candidate_pair_missing'),
        ),
        'candidate_pair_missing',
      );
      return;
    }

    // The intact check: the immutable epoch row behind the candidate must
    // still exist and still carry the digest the state claims. Anything
    // else is §5 step 5's not-intact branch → LOCAL_ROLLBACK.
    final epoch = await database.ohacDeliveryDao.findEpoch(
      tenantId,
      terminalId,
      candidateSequence,
    );
    if (epoch == null || epoch.digest != candidateDigest) {
      await _markOhacIntegrityLoss(
        state,
        classifyOhacIntegrity(
          const OhacConditionLocalRollback('candidate_not_intact'),
        ),
        'candidate_not_intact',
      );
      return;
    }

    // The identical request needs the POS's own build. A failed read stays
    // in ACK_SUBMITTING (fail closed, retry on a later pull): never send a
    // partial body.
    final posBuild = await readOhacPosBuild();
    if (posBuild == null) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=pos_build_unreadable '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }

    await _submitOhacAcknowledgement(
      state,
      epoch,
      posBuild,
      reason: 'reconnect_retry',
    );
  }

  /// Sends the acknowledgement for [epoch] and, on a cross-checked 201
  /// receipt, records it and promotes the candidate (§5 steps 3-4).
  ///
  /// Every outcome is contained: this method logs and returns — it never
  /// throws and never breaks the pull or the watermark.
  ///
  /// Outcome map (§10):
  /// - 201 + cross-checked claim → transaction C (confirm + promote);
  /// - 409 with a claim-fatal `resultCode` → `markIntegrityLoss` with the
  ///   §9 classification (see `classifyOhacAckRejection` in
  ///   `ohac_integrity_classifier.dart`, the single mapping source);
  /// - 409 `UNAVAILABLE`, a network error, a 5xx, any other indeterminate
  ///   answer → stay `ACK_SUBMITTING` (`OHAC_ACK_RESPONSE_LOST`: retry the
  ///   identical ack);
  /// - an unbuildable request → stay `ACK_SUBMITTING` (fail closed; a
  ///   partial body is never sent).
  Future<void> _submitOhacAcknowledgement(
    OhacTerminalStateEntity state,
    OhacPolicyEpochEntity epoch,
    String posBuild, {
    required String reason,
  }) async {
    final database = _database!;
    final body = buildOhacAcknowledgementRequestBody(
      epoch: epoch,
      tenantId: state.tenantId,
      terminalId: state.terminalId,
      posBuild: posBuild,
      negotiatedAssertionSchema: state.negotiatedAssertionSchema,
    );
    if (body == null) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=request_unbuildable '
        'reason_tag=$reason phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }

    final Response<dynamic> response;
    try {
      response = await _dio.post(
        '/v1/sync/inbound/human-authorization/staff-policy/ack',
        data: body,
      );
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      // asObject rejects a non-String-keyed body safely instead of throwing
      // (a Map<String, dynamic>.from would): a hostile or malformed error
      // body must be treated as an unparseable code, never break the pull.
      final resultCode = asObject(e.response?.data)?['resultCode']?.toString();
      if (statusCode == 409) {
        // §9 classification routing (U5b): the 409 verdict comes from the
        // classifier — the single mapping source for conditions → classes.
        final verdict = classifyOhacAckRejection(resultCode);
        if (verdict is OhacAckIndeterminate) {
          // `UNAVAILABLE`: indeterminate — the claim may or may not have
          // been accepted. Stay in ACK_SUBMITTING and retry.
          _emitOhacFact(ohacAckOutcomeFact(
            outcome: 'deferred',
            reason: 'server_unavailable',
            sequence: epoch.sequence,
            floorSequence: state.serverFloorSequence,
          ));
          developer.log(
            '[SYNC_PULL] ohac_ack_deferred reason=server_unavailable '
            'phase=ACK_SUBMITTING',
            name: 'SyncService',
          );
          return;
        }
        final loss = verdict as OhacAckIntegrityLoss;
        await _markOhacIntegrityLoss(
          state,
          loss.classification,
          'ack_rejected_${resultCode ?? 'unknown_code'}',
        );
        return;
      }
      // Network error or 5xx: §10 OHAC_ACK_RESPONSE_LOST — the request may
      // have reached the server; only the identical retry converges.
      _emitOhacFact(ohacAckOutcomeFact(
        outcome: 'deferred',
        reason: 'transport_error',
        sequence: epoch.sequence,
        floorSequence: state.serverFloorSequence,
      ));
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=transport_error '
        'status_code=$statusCode phase=ACK_SUBMITTING',
        name: 'SyncService',
        error: e,
      );
      return;
    } catch (e) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=unexpected_error '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
        error: e,
      );
      return;
    }

    if (response.statusCode != 201) {
      _emitOhacFact(ohacAckOutcomeFact(
        outcome: 'deferred',
        reason: 'unexpected_status',
        sequence: epoch.sequence,
        floorSequence: state.serverFloorSequence,
      ));
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=unexpected_status '
        'status_code=${response.statusCode} phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }
    final data = response.data;
    if (data is! Map) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=response_not_map '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }
    // asObject rejects a non-String-keyed receipt safely instead of
    // throwing (a Map<String, dynamic>.from would): an indeterminate body
    // stays in ACK_SUBMITTING, it never escapes this method.
    final receipt = asObject(data);
    if (receipt == null) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=response_not_object '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }
    if (receipt['status']?.toString().toUpperCase() != 'ACCEPTED') {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=response_not_accepted '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }

    // Cross-check the receipt against the claim BEFORE confirming: a 201
    // that does not describe the claim we sent is a same-claim conflict,
    // and §9's classification for a local/server ack disagreement is
    // ACK_INCONSISTENT. Confirming the receipt blindly would promote a
    // pair the server never acknowledged.
    final responseSequence = receipt['sequence']?.toString();
    final responseDigest = receipt['digest']?.toString();
    if (responseSequence != epoch.sequence.toString() ||
        responseDigest != epoch.digest) {
      await _markOhacIntegrityLoss(
        state,
        classifyOhacIntegrity(
          const OhacConditionAckInconsistent('ack_response_mismatch'),
        ),
        'ack_response_mismatch',
      );
      return;
    }

    final receiptId = receipt['receiptId']?.toString() ?? '';
    final floorSequence =
        int.tryParse(receipt['floorSequence']?.toString() ?? '');
    if (receiptId.isEmpty || floorSequence == null) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=receipt_unparseable '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }

    // §5 step 4: atomically record the receipt and promote the candidate.
    // The floor digest is the confirmed claim itself: the acknowledged
    // epoch IS the new server floor (the 201 carries no separate
    // floorDigest field). Re-read the state first — S or a retry cycle may
    // have moved the revision since [state] was read.
    final fresh = await database.ohacDeliveryDao.findTerminalState(
      state.tenantId,
      state.terminalId,
    );
    if (fresh == null) {
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=terminal_state_missing '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
      );
      return;
    }
    try {
      await database.ohacDeliveryDao.confirmAcknowledgementWithReceipt(
        fresh.tenantId,
        fresh.terminalId,
        fresh.revision,
        epoch.sequence,
        epoch.digest,
        receiptId,
        floorSequence,
        epoch.digest,
        DateTime.now().toIso8601String(),
      );
      developer.log(
        '[SYNC_PULL] ohac_ack_confirmed sequence=${epoch.sequence} '
        'floor=$floorSequence',
        name: 'SyncService',
      );
      _emitOhacFact(ohacAckOutcomeFact(
        outcome: 'confirmed',
        reason: 'receipt_accepted',
        sequence: epoch.sequence,
        floorSequence: floorSequence,
      ));
    } catch (e) {
      // §5 step 4: "If the final local write fails, retrying the same ack
      // returns the receipt." Contained; the next pull's phase-driven retry
      // resends the identical request.
      developer.log(
        '[SYNC_PULL] ohac_ack_deferred reason=confirm_write_failed '
        'phase=ACK_SUBMITTING',
        name: 'SyncService',
        error: e,
      );
    }
  }

  /// Applies a §9 classification to the terminal state and logs it.
  Future<void> _markOhacIntegrityLoss(
    OhacTerminalStateEntity state,
    OhacIntegrityClassification classification,
    String reason,
  ) async {
    final database = _database!;
    final marked = await database.ohacDeliveryDao.markIntegrityLoss(
      state.tenantId,
      state.terminalId,
      state.revision,
      classification.wire,
      DateTime.now().toIso8601String(),
    );
    _emitOhacFact(ohacIntegrityClassifiedFact(
      tenantId: state.tenantId,
      terminalId: state.terminalId,
      classification: classification.wire,
      reason: reason,
      applied: marked == 1,
    ));
    developer.log(
      '[SYNC_PULL] ohac_ack_integrity_loss '
      'classification=${classification.wire} reason=$reason '
      'applied=${marked == 1}',
      name: 'SyncService',
    );
  }

  /// Builds the four OHAC negotiation query parameters for the inbound pull
  /// (design §11.5 decision 30, §12), or an empty map — the legacy-client
  /// answer — when they cannot be read.
  ///
  /// Decision 30: the negotiated build is the POS's own package version read
  /// at runtime, sent verbatim; when that read fails, ALL FOUR parameters
  /// are omitted so the backend classifies the terminal as a legacy client
  /// and omits the `humanAuthorization` member. A successful read is sent
  /// verbatim even when empty: the backend deliberately distinguishes absent
  /// (legacy) from present-blank (`UPGRADE_REQUIRED`).
  ///
  /// The floor parameter is the terminal's local `server_floor_sequence` —
  /// the server-confirmed floor, not the active sequence, which legitimately
  /// runs ahead while a candidate is unacknowledged and would turn every
  /// such pull into `RECOVERY_REQUIRED`. The row is ensured first because
  /// nothing else creates the fresh-install sentinel. Any failure reading
  /// the floor state also omits the parameters: a pull that cannot state its
  /// floor coherently must not claim negotiation it cannot support.
  Future<Map<String, String>> _buildOhacNegotiationQueryParams() async {
    final database = _database;
    if (database == null) return const {};

    final posBuild = await readOhacPosBuild();
    if (posBuild == null) return const {};

    try {
      final tenantConfig = await database.localConfigDao.getConfigByKey(
        'tenant_id',
      );
      final tenantId = tenantConfig?.value ?? 'tenant-1';
      final terminalId = _auditRepository.deviceId;

      await database.ohacDeliveryDao.ensureTerminalState(
        tenantId,
        terminalId,
        DateTime.now().toIso8601String(),
      );
      final state = await database.ohacDeliveryDao.findTerminalState(
        tenantId,
        terminalId,
      );
      if (state == null) return const {};

      return buildOhacNegotiationParameters(
        posBuild: posBuild,
        serverFloorSequence: state.serverFloorSequence,
      );
    } catch (e) {
      developer.log(
        '[SYNC_PULL] ohac_negotiation_omitted=$e',
        name: 'SyncService',
      );
      return const {};
    }
  }

  /// The persisted active-pair sentinel is `(0, '')` — "no epoch" — while
  /// the policy layer expresses the position before epoch 1 in chain
  /// vocabulary: `(0, 'GENESIS')` (design §4.1; the entity doc comment calls
  /// 0/`GENESIS` "the epoch chain's own representation of the position before
  /// epoch 1", and the adapter's own coverage seeds a fresh terminal that
  /// way). Translating the sentinel here lets a fresh terminal accept epoch
  /// 1 without weakening anything: epoch 1 still has to present
  /// `previousSequence '0'` AND `previousDigest 'GENESIS'`, identity, build
  /// and a valid digest. A real active head already speaks the chain
  /// vocabulary and passes through untouched, and a corrupt row `(0,`
  /// `<digest>`) is not translated, so its head simply fails the chain
  /// check — fail closed.
  ///
  /// Flagged for the parent: the alternative fix is seeding `GENESIS` in
  /// `ensureTerminalState` itself (a frozen surface for this unit); the
  /// translation is the contained in-surface resolution.
  OhacTerminalStateEntity _acceptanceStateFor(OhacTerminalStateEntity state) {
    if (state.activeSequence != 0 || state.activeDigest.isNotEmpty) {
      return state;
    }
    return OhacTerminalStateEntity(
      tenantId: state.tenantId,
      terminalId: state.terminalId,
      state: state.state,
      activeSequence: state.activeSequence,
      activeDigest: genesisDigest,
      candidateSequence: state.candidateSequence,
      candidateDigest: state.candidateDigest,
      serverFloorSequence: state.serverFloorSequence,
      serverFloorDigest: state.serverFloorDigest,
      negotiatedPosBuild: state.negotiatedPosBuild,
      negotiatedBackendBuild: state.negotiatedBackendBuild,
      negotiatedPolicySchema: state.negotiatedPolicySchema,
      negotiatedAssertionSchema: state.negotiatedAssertionSchema,
      integrityClassification: state.integrityClassification,
      localAuthorizationSequence: state.localAuthorizationSequence,
      revision: state.revision,
      updatedAt: state.updatedAt,
    );
  }

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

      // OHAC pull negotiation (design §11.5 decision 30, §12). The params
      // are omitted entirely — the fail-closed legacy-client answer — when
      // the POS cannot read its own version; this unit sends the request,
      // it does not consume the response.
      queryParams.addAll(await _buildOhacNegotiationQueryParams());

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
              stock: asDouble(map['stock']) ?? 0.0,
              averageCost: asDouble(map['averageCost']) ?? 0.0,
              sellPrice: asDouble(map['sellPrice']) ?? 0.0,
              isActive: map['isActive'] as bool? ?? true,
              sku: map['sku'] as String? ?? existing?.sku,
              barcode: map['barcode'] as String? ?? existing?.barcode,
              category: map['category'] as String? ?? existing?.category,
              // T0.5c: absent key (older backend) keeps the previously
              // resolved id; an explicit null is authoritative and clears it.
              categoryId: map.containsKey('categoryId')
                  ? map['categoryId']?.toString()
                  : existing?.categoryId,
              isPrepared: pType == 'PREPARED' || pType == 'COMPOUND',
              productType: pType,
              mappingVersionId: map['mappingVersionId'] as String?,
              insumoId: map['insumoId'] as String?,
              createdAt: map['createdAt']?.toString() ?? existing?.createdAt,
              tenantId: map['tenantId'] as String? ?? existing?.tenantId,
              taxRate: asDouble(map['taxRate']) ?? 0.0,
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
                sortOrder: asInt(map['sortOrder']) ?? 0,
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
                stock: asDouble(map['stock']) ?? 0.0,
                averageCost: asDouble(map['averageCost']) ?? 0.0,
                isActive: map['isActive'] as bool? ?? true,
                isPerishable: map['isPerishable'] as bool? ?? false,
                // Issue #521 S1: stock alert thresholds from the backend
                // delta; coerced safely via asDouble (numeric/decimal columns
                // are serialized as strings by TypeORM/pg driver).
                parLevel: asDouble(map['parLevel']),
                stockMin: asDouble(map['minStock'] ?? map['stockMin']),
                stockMax: asDouble(map['maxStock'] ?? map['stockMax']),
              );
            })
            .toList(growable: false);

        if (insumoEntities.isNotEmpty) {
          await _database!.insumoDao.insertInsumos(insumoEntities);
        }

        // 3b. Direct-mapping authority insumo hydration. The authority
        // projection is otherwise hydrated only from each recipe version's
        // component closure (4b below), but a product can also carry a
        // DIRECT insumo mapping (mappingVersionId + insumoId) with no
        // published recipe. Without a row in authority_insumos, the
        // checkout authority guard cannot resolve that mapping's insumo
        // and fails closed for the entire cart. The top-level `insumos`
        // delta already carries every field the AuthorityInsumoEntity
        // shape needs, so mirror each well-formed row into the authority
        // projection using the same insert-if-absent pattern as
        // AuthorityHydrationService.hydrate. Standing invariant (Q80):
        // hydration trouble must never fail the pull — catch, log, and
        // keep the operational writes above intact.
        try {
          final authorityDao = _database!.authorityProjectionDao;
          for (final raw in rawInsumos) {
            if (raw is! Map) continue;
            final map = Map<String, dynamic>.from(raw);
            final tenantId = (map['tenantId'] as String?)?.trim() ?? '';
            final id = (map['id'] as String?)?.trim() ?? '';
            final name = (map['name'] as String?)?.trim() ?? '';
            final uom =
                ((map['consumptionUom'] ?? map['purchaseUom']) as String?)
                    ?.trim() ??
                '';
            // Never fabricate a tenant, an identity, or a UOM: the
            // authority row requires all three, so skip malformed rows.
            if (tenantId.isEmpty || id.isEmpty || name.isEmpty || uom.isEmpty) {
              continue;
            }
            final existing = await authorityDao.findInsumoById(tenantId, id);
            if (existing == null) {
              await authorityDao.insertInsumo(
                AuthorityInsumoEntity(
                  tenantId: tenantId,
                  id: id,
                  name: name,
                  uom: uom,
                ),
              );
            }
          }
        } catch (e, st) {
          developer.log(
            '[SYNC_PULL] authority_insumo_hydration_failed error=$e',
            name: 'SyncService',
            error: e,
            stackTrace: st,
          );
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
                quantity: asDouble(map['quantity']) ?? 0.0,
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

        // Terminal-local tenant binding (set at activation). Used only as the
        // last-resort cure for user rows that would otherwise lose their
        // tenant through the replace-upsert; never fabricated by this pull.
        final localTenantConfig = await _database!.localConfigDao
            .getConfigByKey('tenant_id');
        final localTenantId = localTenantConfig?.value;

        for (final u in rawUsers) {
          final map = Map<String, dynamic>.from(u as Map);
          final userId = map['id'] as String;
          final secProfile = map['securityProfile'] as Map<String, dynamic>?;
          final pinHash = (secProfile?['pinHash'] as String?) ?? '';

          // Tenant binding resolution for the replace-upsert: a column absent
          // from the constructed entity is erased to NULL, so resolve in
          // order: inbound delta -> existing row -> terminal-local binding.
          // No default tenant is invented: a fabricated tenant would write
          // cross-tenant data.
          final existingUser = await _database!.userDao.findUserById(userId);
          final deltaTenantId = map['tenantId'] as String?;
          final tenantId = deltaTenantId ?? existingUser?.tenantId ?? localTenantId;

          userEntities.add(
            UserEntity(
              id: userId,
              name: map['name'] as String,
              role: map['role'] as String,
              pinHash: pinHash,
              isActive: map['isActive'] as bool? ?? true,
              email: map['email'] as String?,
              tenantId: tenantId,
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

        // Heal user rows whose tenant binding was already erased by a
        // previous replace-upsert. The per-row cure above only runs for
        // inbound delta rows, so when the user delta is empty the erased
        // rows stay NULL. The backend filters user deltas with
        // `user.tenant_id = :tenantId` (the terminal's tenant), so every
        // user row this terminal can ever receive belongs to the terminal
        // binding: any local NULL/blank tenant_id is unambiguously an
        // erased value of the terminal's own tenant, never a cross-tenant
        // row. An unbound terminal stays untouched (no binding, no write),
        // and the statement is idempotent: once healed, the WHERE clause
        // matches zero rows.
        try {
          final healTenantConfig = await _database!.localConfigDao
              .getConfigByKey('tenant_id');
          final healTenantId = healTenantConfig?.value;
          if (healTenantId != null && healTenantId.trim().isNotEmpty) {
            await _database!.database.execute(
              "UPDATE users SET tenant_id = ? "
              "WHERE tenant_id IS NULL OR TRIM(tenant_id) = ''",
              [healTenantId],
            );
            developer.log(
              '[SYNC_PULL] user_tenant_heal applied',
              name: 'SyncService',
            );
          }
        } catch (e, stackTrace) {
          // Best-effort, exactly like the other auxiliary pull steps: a
          // heal failure must never turn a healthy pull into a failed one.
          developer.log(
            '[SYNC_PULL] user_tenant_heal skipped',
            name: 'SyncService',
            error: e,
            stackTrace: stackTrace,
          );
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
              buyQuantity: asInt(map['buyQuantity']) ?? 0,
              getQuantity: asInt(map['getQuantity']) ?? 0,
              discountValue: asDouble(map['discountValue']) ?? 0.0,
              minOrderAmount: asDouble(map['minOrderAmount']) ?? 0.0,
              daysOfWeek: rawDaysOfWeek
                  ?.map((day) => day.toString())
                  .join(','),
              startTime: map['startTime']?.toString(),
              endTime: map['endTime']?.toString(),
              startDate: asInt(map['startDate']),
              endDate: asInt(map['endDate']),
              priority: asInt(map['priority']) ?? 0,
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
                  : asDouble(map['pointsBalance']) ??
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

        // 5f. Modifier mirrors (full-snapshot deltas). Presence-correct per
        // key: a key ABSENT (older backend) leaves its tables untouched — NO
        // wipe; a key PRESENT, even empty, is authoritative and replaces.
        // Each builder on the backend ships the COMPLETE tenant state for
        // its type (attachments hard-DELETE on detach, so only a full
        // snapshot propagates removals), and groups ride together with their
        // options. Malformed rows are skipped individually; a malformed row
        // with a usable id keeps its previously synced entity (R3-002: corrupt
        // input never deletes local data).
        final rawModifierGroups = rawDeltas['modifierGroups'];
        if (rawModifierGroups is List) {
          final groupEntities = <ModifierGroupEntity>[];
          final optionEntities = <ModifierOptionEntity>[];
          final malformedGroupIds = <String>{};
          final malformedOptionIds = <String>{};
          for (final row in rawModifierGroups) {
            if (row is! Map) continue;
            final map = Map<String, dynamic>.from(row);
            final id = map['id']?.toString();
            final name = map['name']?.toString();
            if (id == null || id.isEmpty || name == null || name.isEmpty) {
              developer.log(
                '[SYNC_MODIFIERS] skipped malformed cloud modifier group row (id=$id)',
                name: 'SyncService',
              );
              if (id != null && id.isNotEmpty) malformedGroupIds.add(id);
              continue;
            }
            groupEntities.add(
              ModifierGroupEntity(
                id: id,
                name: name,
                minSelected: asInt(map['minSelected']) ?? 0,
                maxSelected: asInt(map['maxSelected']) ?? 1,
                allowQuantities: map['allowQuantities'] as bool? ?? false,
                sortOrder: asInt(map['sortOrder']) ?? 0,
                isActive: map['isActive'] as bool? ?? true,
              ),
            );
            final rawOptions = map['options'] as List<dynamic>? ?? const [];
            for (final optionRow in rawOptions) {
              if (optionRow is! Map) continue;
              final optionMap = Map<String, dynamic>.from(optionRow);
              final optionId = optionMap['id']?.toString();
              final optionName = optionMap['name']?.toString();
              if (optionId == null ||
                  optionId.isEmpty ||
                  optionName == null ||
                  optionName.isEmpty) {
                developer.log(
                  '[SYNC_MODIFIERS] skipped malformed cloud modifier option row (id=$optionId)',
                  name: 'SyncService',
                );
                if (optionId != null && optionId.isNotEmpty) {
                  malformedOptionIds.add(optionId);
                }
                continue;
              }
              optionEntities.add(
                ModifierOptionEntity(
                  id: optionId,
                  groupId: id,
                  name: optionName,
                  priceDelta: asDouble(optionMap['priceDelta']) ?? 0.0,
                  isDefault: optionMap['isDefault'] as bool? ?? false,
                  sortOrder: asInt(optionMap['sortOrder']) ?? 0,
                  isActive: optionMap['isActive'] as bool? ?? true,
                ),
              );
            }
          }
          // R3-002: a malformed row is corrupt input, not an authoritative
          // removal — the previously synced entities for those ids ride
          // along with this replace instead of being deleted by it.
          if (malformedGroupIds.isNotEmpty || malformedOptionIds.isNotEmpty) {
            final currentGroups = await _database!
                .modifierDao
                .getAllModifierGroups();
            final preservedGroups = currentGroups
                .where((g) => malformedGroupIds.contains(g.id))
                .toList();
            groupEntities.addAll(preservedGroups);
            if (malformedOptionIds.isNotEmpty || preservedGroups.isNotEmpty) {
              final currentOptions = await _database!
                  .modifierDao
                  .getAllModifierOptions();
              final preservedGroupIds =
                  preservedGroups.map((g) => g.id).toSet();
              optionEntities.addAll(
                currentOptions.where(
                  (o) =>
                      malformedOptionIds.contains(o.id) ||
                      preservedGroupIds.contains(o.groupId),
                ),
              );
            }
          }
          // Groups and options replace TOGETHER. Attachment keys absent in
          // this envelope: their current rows survive EXCEPT dangling ones —
          // an attachment whose group left the new authoritative snapshot is
          // dropped here, never re-inserted as an orphan (R3-001).
          final newGroupIds = {for (final g in groupEntities) g.id};
          final currentCategoryAttachments = (await _database!
                  .modifierDao
                  .getAllCategoryModifierGroups())
              .where((a) => newGroupIds.contains(a.groupId))
              .toList();
          final currentProductAttachments = (await _database!
                  .modifierDao
                  .getAllProductModifierGroups())
              .where((a) => newGroupIds.contains(a.groupId))
              .toList();
          await _database!.modifierDao.replaceAllModifierData(
            groupEntities,
            optionEntities,
            currentCategoryAttachments,
            currentProductAttachments,
          );
        }

        final rawCategoryAttachments = rawDeltas['categoryModifierGroups'];
        if (rawCategoryAttachments is List) {
          final attachmentEntities = <CategoryModifierGroupEntity>[];
          final malformedCategoryIds = <String>{};
          for (final row in rawCategoryAttachments) {
            if (row is! Map) continue;
            final map = Map<String, dynamic>.from(row);
            final id = map['id']?.toString();
            final catalogValueId = map['catalogValueId']?.toString();
            final groupId = map['groupId']?.toString();
            if (id == null ||
                id.isEmpty ||
                catalogValueId == null ||
                catalogValueId.isEmpty ||
                groupId == null ||
                groupId.isEmpty) {
              developer.log(
                '[SYNC_MODIFIERS] skipped malformed cloud category attachment row (id=$id)',
                name: 'SyncService',
              );
              if (id != null && id.isNotEmpty) malformedCategoryIds.add(id);
              continue;
            }
            attachmentEntities.add(
              CategoryModifierGroupEntity(
                id: id,
                catalogValueId: catalogValueId,
                catalogCode: map['catalogCode']?.toString() ?? '',
                groupId: groupId,
                sortOrder: asInt(map['sortOrder']) ?? 0,
              ),
            );
          }
          // Groups/options key absent in this envelope: read and re-insert
          // the current mirror so only the attachments replace. Malformed
          // attachment rows keep their previously synced entity (R3-002).
          if (malformedCategoryIds.isNotEmpty) {
            final currentCategoryAttachments = await _database!
                .modifierDao
                .getAllCategoryModifierGroups();
            attachmentEntities.addAll(
              currentCategoryAttachments.where(
                (a) => malformedCategoryIds.contains(a.id),
              ),
            );
          }
          final currentGroups = await _database!.modifierDao.getAllModifierGroups();
          final currentOptions = await _database!.modifierDao.getAllModifierOptions();
          final currentProductAttachments = await _database!
              .modifierDao
              .getAllProductModifierGroups();
          await _database!.modifierDao.replaceAllModifierData(
            currentGroups,
            currentOptions,
            attachmentEntities,
            currentProductAttachments,
          );
        }

        final rawProductAttachments = rawDeltas['productModifierGroups'];
        if (rawProductAttachments is List) {
          final attachmentEntities = <ProductModifierGroupEntity>[];
          final malformedProductIds = <String>{};
          for (final row in rawProductAttachments) {
            if (row is! Map) continue;
            final map = Map<String, dynamic>.from(row);
            final id = map['id']?.toString();
            final productId = map['productId']?.toString();
            final groupId = map['groupId']?.toString();
            if (id == null ||
                id.isEmpty ||
                productId == null ||
                productId.isEmpty ||
                groupId == null ||
                groupId.isEmpty) {
              developer.log(
                '[SYNC_MODIFIERS] skipped malformed cloud product attachment row (id=$id)',
                name: 'SyncService',
              );
              if (id != null && id.isNotEmpty) malformedProductIds.add(id);
              continue;
            }
            attachmentEntities.add(
              ProductModifierGroupEntity(
                id: id,
                productId: productId,
                groupId: groupId,
                sortOrder: asInt(map['sortOrder']) ?? 0,
              ),
            );
          }
          // Groups/options and category keys absent: re-insert the current
          // mirror so only the product attachments replace. Malformed
          // attachment rows keep their previously synced entity (R3-002).
          if (malformedProductIds.isNotEmpty) {
            final currentProductAttachments = await _database!
                .modifierDao
                .getAllProductModifierGroups();
            attachmentEntities.addAll(
              currentProductAttachments.where(
                (a) => malformedProductIds.contains(a.id),
              ),
            );
          }
          final currentGroups = await _database!.modifierDao.getAllModifierGroups();
          final currentOptions = await _database!.modifierDao.getAllModifierOptions();
          final currentCategoryAttachments = await _database!
              .modifierDao
              .getAllCategoryModifierGroups();
          await _database!.modifierDao.replaceAllModifierData(
            currentGroups,
            currentOptions,
            currentCategoryAttachments,
            attachmentEntities,
          );
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

        // 6a. OHAC reconnect reconciliation (unit B2d, §5 step 5): retry
        // a pending acknowledgement on every pull, before consuming new
        // epoch work. Contained exactly like the consumption below: an OHAC
        // reconciliation failure must never fail the pull nor block the
        // watermark update.
        try {
          await _reconcileOhacAcknowledgement();
        } catch (e, stackTrace) {
          developer.log(
            '[SYNC_PULL] ohac_ack_reconciliation_failed reason=exception',
            name: 'SyncService',
            error: e,
            stackTrace: stackTrace,
          );
        }

        // 6b. OHAC human-authorization epoch consumption (unit B2c-3b,
        // design §4.2, §5). Contained: an OHAC consumption failure must
        // never fail the pull nor block the watermark update — §5.1 keeps
        // pull-side receipt decoupled from the ack path, and a refused or
        // failed consumption converges on the next pull.
        try {
          await _consumeHumanAuthorizationEpoch(data);
        } catch (e, stackTrace) {
          developer.log(
            '[SYNC_PULL] ohac_epoch_consumption_failed reason=exception',
            name: 'SyncService',
            error: e,
            stackTrace: stackTrace,
          );
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
