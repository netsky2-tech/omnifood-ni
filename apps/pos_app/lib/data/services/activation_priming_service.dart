import 'dart:developer' as developer;

import '../database/app_database.dart';
import '../models/catalog/catalog_value_entity.dart';
import '../models/inventory/product_entity.dart';
import '../models/local_config_entity.dart';
import '../ports/activation_priming_port.dart';
import 'fiscal_inbox_handler.dart';

/// The outcome of applying a priming payload to the local database.
class ActivationPrimingResult {
  final String status;
  final int appliedProducts;
  final int appliedCatalogValues;

  /// Whether the payload carried a fiscal snapshot envelope at all. A tenant
  /// without fiscal setup legitimately primes without one; the later
  /// `REQUIRED_CONFIG_LOCAL` check fails closed in that case.
  final bool fiscalEnvelopePresent;

  /// The named outcome of `FiscalInboxHandler.handleFiscalEnvelope`, null
  /// when no fiscal envelope was present in the payload.
  final FiscalInboxOutcome? fiscalOutcome;

  /// The server's inbound version at priming time. Recorded ONLY under
  /// [ActivationPrimingService.primingVersionKey], never under
  /// `last_inbound_sync_version`.
  final int serverCurrentVersion;

  const ActivationPrimingResult({
    required this.status,
    required this.appliedProducts,
    required this.appliedCatalogValues,
    required this.fiscalEnvelopePresent,
    required this.fiscalOutcome,
    required this.serverCurrentVersion,
  });
}

/// L1-10b: primes a fresh terminal with its tenant's catalog and fiscal
/// projection BEFORE activation runs, breaking the bootstrap cycle (#469):
/// a pilot POS starts empty, the device credential requires a finalized
/// activation attempt, and finalizing requires a local catalog and fiscal
/// projection that normally only arrive over device-gated `/v1/sync/*`.
///
/// The payload comes from the human-authenticated
/// `GET onboarding/terminals/priming` surface and is applied to local SQLite
/// through the real DAOs, using the same entity and field mapping the inbound
/// device projection in `SyncService` uses for products and catalog values,
/// and `FiscalInboxHandler.handleFiscalEnvelope` for the fiscal envelope.
///
/// CRITICAL CONSTRAINT: this path deliberately does NOT write
/// `last_inbound_sync_version`. That key is the cursor for subsequent delta
/// pulls, and priming delivers only a subset of delta types (no users, no
/// recipes, no insumos). Advancing the cursor here would make the later full
/// device sync skip every type priming never delivered and leave a silently
/// incomplete terminal. Priming's delivered version is recorded under
/// [primingVersionKey], a distinct key, instead.
class ActivationPrimingService {
  /// Distinct marker key for the priming-delivered inbound version. Never a
  /// substitute for, and never written to, `last_inbound_sync_version`.
  static const String primingVersionKey = 'last_priming_inbound_version';

  static const String _inboundSyncCursorKey = 'last_inbound_sync_version';

  final AppDatabase _database;
  final ActivationPrimingPort _primingPort;
  final FiscalInboxHandler? _fiscalInboxHandler;

  ActivationPrimingService({
    required AppDatabase database,
    required ActivationPrimingPort primingPort,
    FiscalInboxHandler? fiscalInboxHandler,
  })  : _database = database,
        _primingPort = primingPort,
        _fiscalInboxHandler = fiscalInboxHandler;

  /// Fetches the priming payload and applies it to local SQLite. A malformed
  /// or partial payload raises [TerminalPrimingPayloadException]; a fiscal
  /// application conflict raises the handler's named exceptions — both let
  /// the caller block activation instead of proceeding half-primed.
  Future<ActivationPrimingResult> primeTerminal() async {
    final payload = await _primingPort.fetchPrimingPayload();

    // 1. Products — faithful dedicated applier using the same entity and
    //    field mapping as the inbound projection in SyncService (including
    //    the existing-row fallbacks for fields the payload does not carry).
    final productEntities = <ProductEntity>[];
    for (final map in payload.products) {
      final id = map['id'] as String;
      final existing = await _database.productDao.findProductById(id);
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
          inventoryPolicy:
              map['inventoryPolicy'] as String? ?? existing?.inventoryPolicy,
          directStockInsumoId:
              map['directStockInsumoId'] as String? ?? existing?.directStockInsumoId,
        ),
      );
    }

    if (productEntities.isNotEmpty) {
      await _database.productDao.insertProducts(productEntities);
    }

    // 2. Catalog Values — same mapping as the inbound projection.
    final catalogEntities = payload.catalogValues
        .map((map) {
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
      await _database.catalogValueDao.insertCatalogValues(catalogEntities);
    }

    // 3. Fiscal configuration projection through the fiscal inbox handler.
    //    Fail closed: the default throwOnConflict=true surfaces the handler's
    //    named integrity/staleness exceptions so the caller blocks activation
    //    rather than activating on an unverified fiscal projection.
    final fiscalEnvelope = payload.fiscalEnvelope;
    FiscalInboxOutcome? fiscalOutcome;
    if (fiscalEnvelope != null) {
      final handler = _fiscalInboxHandler ?? FiscalInboxHandler(_database);
      fiscalOutcome = await handler.handleFiscalEnvelope(fiscalEnvelope);
    }

    // 4. Record that priming happened — under the DISTINCT priming key. The
    //    inbound sync cursor `last_inbound_sync_version` is deliberately not
    //    touched: priming delivers a subset of delta types, and advancing
    //    that cursor would skip users, recipes and insumos on the later full
    //    device sync, leaving a silently incomplete terminal.
    await _database.localConfigDao.saveConfig(
      LocalConfigEntity(
        key: primingVersionKey,
        value: payload.currentVersion.toString(),
        description:
            'Inbound version delivered by activation priming (subset of delta '
            'types). The device sync cursor $_inboundSyncCursorKey is '
            'deliberately not advanced here.',
      ),
    );

    developer.log(
      '[PRIMING] applied=true products=${productEntities.length} '
      'catalogValues=${catalogEntities.length} '
      'fiscalPresent=${fiscalEnvelope != null} '
      'version=${payload.currentVersion}',
      name: 'ActivationPrimingService',
    );

    return ActivationPrimingResult(
      status: payload.status,
      appliedProducts: productEntities.length,
      appliedCatalogValues: catalogEntities.length,
      fiscalEnvelopePresent: fiscalEnvelope != null,
      fiscalOutcome: fiscalOutcome,
      serverCurrentVersion: payload.currentVersion,
    );
  }
}
