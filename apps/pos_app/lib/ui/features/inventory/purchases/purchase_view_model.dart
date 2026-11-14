import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/models/inventory/supplier.dart';
import '../../../../domain/models/inventory/purchase.dart';
import '../../../../domain/models/inventory/uom_conversion.dart';
import '../../../../domain/models/inventory/batch.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/models/inventory/inventory_movement.dart';
import '../../../../domain/services/inventory/movement_engine.dart';
import '../../../../domain/services/inventory/negative_stock_regularization_service.dart';
import '../../../../domain/services/inventory/uom_conversion_calculator.dart';

const purchaseCurrencies = ['NIO', 'USD'];
const officialBcnRateLoadedMessage =
    'Official BCN rate loaded for the invoice date.';
const officialBcnRateDateChangedMessage =
    'Invoice date changed. Refetch the official BCN rate or keep a manual rate.';
const officialBcnRateManualOverrideMessage =
    'BCN rate edited manually. The rate source is now manual.';

/// Whether a purchase of [insumo] must carry lot metadata.
///
/// WHY (#938): the outflow guard on the server reads BATCH balances
/// (`batch-allocation.ts` fetches every batch row for the insumo and refuses
/// the movement when the batches cannot cover it). An insumo that already has
/// lots is therefore tracked by lot whether or not it is perishable, and a
/// purchase that raises the aggregate stock without creating a lot leaves the
/// two balances apart: the next sale is refused with "batch balances cannot
/// cover the outflow", a message that names the wrong subsystem and stops the
/// counter.
///
/// So the rule is not "perishable" alone: it is "perishable **or** tracked by
/// lot". Three sources, because no single one covers every terminal:
///  - [Insumo.isPerishable]: the catalog says so;
///  - [Insumo.isBatchManaged]: the CLOUD says the insumo already has lots. The
///    inbound sync sends this derived flag (`sync_service.dart`), not the batch
///    rows, so on a freshly synced terminal the local `batches` table is EMPTY
///    even when the cloud has lots — reading only the local table would let the
///    operator save a lot-less purchase locally and fail later in the cloud;
///  - [existingBatchCount]: lots this terminal created and has not synced back.
///
/// Nit: NIC 2 §23-24 — non-interchangeable goods require specific
/// identification, and the lot is that identification.
bool purchaseNeedsLotMetadata({
  required Insumo insumo,
  required int existingBatchCount,
}) =>
    insumo.isPerishable || insumo.isBatchManaged || existingBatchCount > 0;

/// The refusal a purchase without lot metadata gets, naming the REAL cause.
String purchaseLotMetadataRequiredMessage({
  required bool becauseExistingBatches,
}) => becauseExistingBatches
    ? 'This item is already tracked by lot: lot code, received date, and '
          'expiration date are required so the lot balance does not fall '
          'behind the aggregate stock.'
    : 'Lot code, received date, and expiration date are required for '
          'batch-managed items.';

/// The lot a purchase stores when the insumo is tracked by lot.
class PurchaseLotMetadata {
  const PurchaseLotMetadata({
    required this.batchNumber,
    required this.receivedDate,
    required this.expirationDate,
  });

  final String batchNumber;
  final DateTime receivedDate;
  final DateTime expirationDate;
}

class PurchaseReviewData {
  const PurchaseReviewData({
    required this.quantityInBaseUnit,
    required this.bcnRate,
    required this.unitCostNio,
    required this.previousCppNio,
    required this.projectedCppNio,
    required this.requiresBatchTracking,
    this.trackedByExistingBatches = false,
  });

  final double quantityInBaseUnit;
  final double bcnRate;
  final double unitCostNio;
  final double previousCppNio;
  final double projectedCppNio;
  final bool requiresBatchTracking;

  /// True when the lot requirement comes from lots ALREADY recorded on the
  /// insumo rather than from `is_perishable`. The form says so, because a
  /// non-perishable insumo suddenly asking for a lot is otherwise surprising.
  final bool trackedByExistingBatches;
}

class PurchaseFifoRow {
  const PurchaseFifoRow({
    required this.batchNumber,
    required this.remainingStock,
    required this.expirationDate,
    required this.isExpired,
    required this.isNearExpiry,
  });

  final String batchNumber;
  final double remainingStock;
  final DateTime expirationDate;
  final bool isExpired;
  final bool isNearExpiry;
}

class PurchaseViewModel with ChangeNotifier {
  final InventoryRepository repository;
  final MovementEngine movementEngine;

  /// #601 (R2): optional negative-stock regularization service. The
  /// queue processing itself rides [MovementEngine.recordPurchase]; the
  /// reference is kept for future UI-level queue introspection. Null keeps
  /// the view model usable without the kardex regularization graph.
  final NegativeStockRegularizationService? regularizationService;

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  List<Supplier> _suppliers = [];
  List<Supplier> get suppliers => _suppliers;

  List<UomConversion> _conversions = [];
  List<UomConversion> get conversions => _conversions;

  List<PurchaseFifoRow> _fifoRows = [];
  List<PurchaseFifoRow> get fifoRows => _fifoRows;

  /// The insumo [fifoRows] belong to. Without it a selection change would let
  /// a previous insumo's lots decide the CURRENT one's lot requirement.
  String? _fifoInsumoId;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  bool _isFetchingOfficialBcnRate = false;
  bool get isFetchingOfficialBcnRate => _isFetchingOfficialBcnRate;

  bool _hasOfficialBcnRate = false;
  bool get hasOfficialBcnRate => _hasOfficialBcnRate;

  String? _bcnRateLookupMessage;
  String? get bcnRateLookupMessage => _bcnRateLookupMessage;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  double _defaultBcnRate = 36.6241;
  double get defaultBcnRate => _defaultBcnRate;

  PurchaseViewModel(
    this.repository,
    this.movementEngine, [
    this.regularizationService,
  ]);

  Future<void> loadInitialData({String? insumoId}) async {
    _isLoading = true;
    notifyListeners();

    _insumos = await repository.getActiveInsumos();
    _suppliers = await repository.getActiveSuppliers();
    _defaultBcnRate = await repository.getCachedOfficialBcnRate();
    _fifoInsumoId = insumoId;
    if (insumoId != null) {
      final list = await repository.getConversionsByInsumoId(insumoId);
      if (list.isEmpty) {
        final insumo = _insumos.cast<Insumo?>().firstWhere(
              (i) => i?.id == insumoId,
              orElse: () => null,
            );
        if (insumo != null) {
          _conversions = [
            UomConversion(
              id: 'base-${insumo.id}',
              insumoId: insumo.id,
              unitName: insumo.consumptionUom,
              factor: 1.0,
              isDefault: true,
            ),
          ];
        } else {
          _conversions = [];
        }
      } else {
        _conversions = list;
      }
      _fifoRows = await _loadFifoRows(insumoId);
    } else {
      _fifoRows = [];
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> recordPurchase({
    required String insumoId,
    required String supplierId,
    required String invoiceNumber,
    String? fiscalAuthorizationCode,
    required String uomConversionId,
    required double quantity,
    required double unitCost,
    required DateTime invoiceDate,
    required String currency,
    double? bcnRate,
    String? lotCode,
    DateTime? receivedDate,
    DateTime? expirationDate,
  }) async {
    _errorMessage = null;
    _isLoading = true;
    notifyListeners();

    try {
      final normalizedSupplierId = supplierId.trim();
      final normalizedInvoiceNumber = invoiceNumber.trim();
      final normalizedFiscalAuthorizationCode = fiscalAuthorizationCode?.trim();
      // A lot code of only whitespace is NO lot: the form does not trim, and a
      // `'   '` batch number would pass the missing-lot check while storing a
      // lot nobody can read back (#938).
      final normalizedLotCode = _normalizeLotCode(lotCode);

      if (normalizedInvoiceNumber.isEmpty) {
        throw ArgumentError('Invoice number is required.');
      }

      await _assertNoDuplicateLocalInvoice(
        supplierId: normalizedSupplierId,
        invoiceNumber: normalizedInvoiceNumber,
      );

      final review = buildPurchaseReview(
        insumoId: insumoId,
        uomConversionId: uomConversionId,
        quantity: quantity,
        unitCost: unitCost,
        currency: currency,
        bcnRate: bcnRate,
      );
      // A UUID, not `millisecondsSinceEpoch`: the cloud column
      // (`inventory_purchase_documents.id`) is `uuid`, so a numeric id made
      // EVERY purchase fail the sync with a 500
      // (`invalid input syntax for type uuid`) and the terminal retried it in a
      // loop forever — the purchase existed locally and never reached the
      // cloud. Found on a real device; no unit test could see it because every
      // spec passed a UUID.
      final purchaseId = const Uuid().v4();
      final entryTimestamp = DateTime.now();

      // #938: the lot requirement is decided HERE, against the repository, not
      // from the preview flag the form happened to render. The preview can be
      // stale (another terminal parked a lot a second ago); the aggregate it
      // would raise is not.
      final insumo = _requireInsumo(insumoId);
      final existingBatchCount =
          (await repository.getBatchesByInsumoId(insumoId)).length;
      final requiresLotMetadata = purchaseNeedsLotMetadata(
        insumo: insumo,
        existingBatchCount: existingBatchCount,
      );

      // Refuses BEFORE the movement engine raises the aggregate: throwing
      // after it would leave the two balances apart, the very divergence this
      // guard exists to prevent.
      final lotMetadata = _resolveLotMetadata(
        requiresLotMetadata: requiresLotMetadata,
        becauseExistingBatches: !insumo.isPerishable,
        lotCode: normalizedLotCode,
        receivedDate: receivedDate,
        expirationDate: expirationDate,
      );

      await movementEngine.recordPurchase(
        insumoId,
        review.quantityInBaseUnit,
        review.unitCostNio,
        movementId: purchaseId,
        reason:
            'Purchase $currency invoice $normalizedInvoiceNumber @ ${review.unitCostNio.toStringAsFixed(4)} NIO',
      );

      final purchase = Purchase(
        id: purchaseId,
        insumoId: insumoId,
        supplierId: normalizedSupplierId,
        invoiceNumber: normalizedInvoiceNumber,
        fiscalAuthorizationCode:
            normalizedFiscalAuthorizationCode == null ||
                normalizedFiscalAuthorizationCode.isEmpty
            ? null
            : normalizedFiscalAuthorizationCode,
        quantity: review.quantityInBaseUnit,
        unitCost: unitCost,
        timestamp: entryTimestamp,
        invoiceDate: invoiceDate,
        currency: currency,
        bcnRate: review.bcnRate,
        fxRateMode: _resolveFxRateMode(currency),
        unitCostNio: review.unitCostNio,
        cppBeforeNio: review.previousCppNio,
        projectedCppNio: review.projectedCppNio,
        lotCode: normalizedLotCode,
        receivedDate: receivedDate,
        expirationDate: expirationDate,
        requiresBatchTracking: requiresLotMetadata,
      );
      await repository.queuePurchaseSync(purchase);

      // #938: an insumo already tracked by lot gets its lot here too —
      // otherwise the aggregate rises and the batch balance stays behind.
      if (lotMetadata != null) {
        await repository.saveBatch(
          Batch(
            id: purchaseId,
            insumoId: insumoId,
            batchNumber: lotMetadata.batchNumber,
            receivedDate: lotMetadata.receivedDate,
            expirationDate: lotMetadata.expirationDate,
            remainingStock: review.quantityInBaseUnit,
            cost: review.unitCostNio,
          ),
        );
      }

      _fifoInsumoId = insumoId;
      _fifoRows = await _loadFifoRows(insumoId);

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _errorMessage = e.toString();
      _isLoading = false;
      notifyListeners();
      rethrow;
    }
  }

  String? _normalizeLotCode(String? lotCode) {
    final trimmed = lotCode?.trim();
    return (trimmed == null || trimmed.isEmpty) ? null : trimmed;
  }

  /// Returns the lot to store, or null when this purchase needs no lot.
  ///
  /// Throws when the insumo IS tracked by lot and the purchase arrives without
  /// it: raising the aggregate then would leave `insumos.stock` above the sum
  /// of `batches.remaining_stock`, and the next outflow would be refused by the
  /// batch guard with a message that names the wrong subsystem (#938).
  PurchaseLotMetadata? _resolveLotMetadata({
    required bool requiresLotMetadata,
    required bool becauseExistingBatches,
    required String? lotCode,
    required DateTime? receivedDate,
    required DateTime? expirationDate,
  }) {
    if (!requiresLotMetadata) return null;

    if (lotCode == null ||
        lotCode.isEmpty ||
        receivedDate == null ||
        expirationDate == null) {
      throw ArgumentError(
        purchaseLotMetadataRequiredMessage(
          becauseExistingBatches: becauseExistingBatches,
        ),
      );
    }

    return PurchaseLotMetadata(
      batchNumber: lotCode,
      receivedDate: receivedDate,
      expirationDate: expirationDate,
    );
  }

  PurchaseReviewData buildPurchaseReview({
    required String insumoId,
    required String uomConversionId,
    required double quantity,
    required double unitCost,
    required String currency,
    double? bcnRate,
  }) {
    final insumo = _requireInsumo(insumoId);
    final conversion = _conversions.firstWhere(
      (c) => c.id == uomConversionId,
      orElse: () =>
          throw ArgumentError('Invalid conversion ID: $uomConversionId'),
    );

    final resolvedBcnRate = currency == 'USD'
        ? _requireExplicitBcnRate(bcnRate)
        : 1.0;
    final quantityInBaseUnit = const UomConversionCalculator()
        .toInventoryBaseQuantity(
          purchaseQuantity: quantity,
          factorToInventoryBase: conversion.factor,
        );
    final unitCostNio = (unitCost * resolvedBcnRate) / conversion.factor;
    final previousTotalCost = insumo.stock * insumo.averageCost;
    final purchaseTotalCost = quantityInBaseUnit * unitCostNio;
    final projectedStock = insumo.stock + quantityInBaseUnit;
    final projectedCpp = projectedStock == 0
        ? 0
        : (previousTotalCost + purchaseTotalCost) / projectedStock;

    // The preview reads the lots already loaded for THIS insumo. When the
    // form has not loaded them yet the flag can under-report, and `
    // recordPurchase` still refuses at save time: the guard is authoritative
    // there, the preview only shapes the form.
    final existingBatchCount = _fifoInsumoId == insumoId
        ? _fifoRows.length
        : 0;

    return PurchaseReviewData(
      quantityInBaseUnit: quantityInBaseUnit,
      bcnRate: resolvedBcnRate,
      unitCostNio: double.parse(unitCostNio.toStringAsFixed(4)),
      previousCppNio: double.parse(insumo.averageCost.toStringAsFixed(4)),
      projectedCppNio: double.parse(projectedCpp.toStringAsFixed(4)),
      requiresBatchTracking: purchaseNeedsLotMetadata(
        insumo: insumo,
        existingBatchCount: existingBatchCount,
      ),
      trackedByExistingBatches: !insumo.isPerishable &&
          (insumo.isBatchManaged || existingBatchCount > 0),
    );
  }

  Insumo _requireInsumo(String insumoId) => _insumos.firstWhere(
    (item) => item.id == insumoId,
    orElse: () => throw ArgumentError('Invalid insumo ID: $insumoId'),
  );

  Future<double?> fetchOfficialBcnRate(DateTime invoiceDate) async {
    _isFetchingOfficialBcnRate = true;
    _bcnRateLookupMessage = null;
    notifyListeners();

    try {
      final rate = await repository.fetchOfficialBcnRateByInvoiceDate(
        invoiceDate,
      );
      _hasOfficialBcnRate = true;
      _bcnRateLookupMessage = officialBcnRateLoadedMessage;
      return rate;
    } on OfficialBcnRateLookupException catch (error) {
      _hasOfficialBcnRate = false;
      _bcnRateLookupMessage = error.message;
      return null;
    } catch (_) {
      _hasOfficialBcnRate = false;
      _bcnRateLookupMessage =
          'Could not load the official BCN rate. Enter the BCN rate manually to continue.';
      return null;
    } finally {
      _isFetchingOfficialBcnRate = false;
      notifyListeners();
    }
  }

  void clearOfficialBcnRateSource() {
    _setOfficialBcnRateState(hasOfficialBcnRate: false, lookupMessage: null);
  }

  void markOfficialBcnRateStaleForInvoiceDateChange() {
    if (_hasOfficialBcnRate) {
      _setOfficialBcnRateState(
        hasOfficialBcnRate: false,
        lookupMessage: officialBcnRateDateChangedMessage,
      );
      return;
    }

    if (_bcnRateLookupMessage != null) {
      clearOfficialBcnRateSource();
    }
  }

  void markOfficialBcnRateOverriddenManually() {
    if (_hasOfficialBcnRate) {
      _setOfficialBcnRateState(
        hasOfficialBcnRate: false,
        lookupMessage: officialBcnRateManualOverrideMessage,
      );
      return;
    }

    if (_bcnRateLookupMessage != null) {
      clearOfficialBcnRateSource();
    }
  }

  void _setOfficialBcnRateState({
    required bool hasOfficialBcnRate,
    required String? lookupMessage,
  }) {
    if (_hasOfficialBcnRate == hasOfficialBcnRate &&
        _bcnRateLookupMessage == lookupMessage) {
      return;
    }

    _hasOfficialBcnRate = hasOfficialBcnRate;
    _bcnRateLookupMessage = lookupMessage;
    notifyListeners();
  }

  double _requireExplicitBcnRate(double? bcnRate) {
    if (bcnRate == null || bcnRate <= 0) {
      throw ArgumentError(
        'USD purchases require an explicit BCN exchange rate.',
      );
    }

    return bcnRate.toDouble();
  }

  String _resolveFxRateMode(String currency) {
    if (currency == 'USD' && _hasOfficialBcnRate) {
      return purchaseFxRateModeOfficial;
    }

    return purchaseFxRateModeExplicit;
  }

  Future<void> _assertNoDuplicateLocalInvoice({
    required String supplierId,
    required String invoiceNumber,
  }) async {
    final purchases = await repository.getPurchaseHistory();
    final alreadyExists = purchases.any(
      (purchase) =>
          purchase.supplierId.trim() == supplierId &&
          purchase.invoiceNumber.trim() == invoiceNumber,
    );

    if (alreadyExists) {
      throw ArgumentError(
        'Purchase invoice $invoiceNumber is already registered for supplier $supplierId.',
      );
    }
  }

  Future<List<PurchaseFifoRow>> _loadFifoRows(String insumoId) async {
    final now = DateTime.now();
    final batches = await repository.getBatchesByInsumoId(insumoId);
    return batches
        .map(
          (batch) => PurchaseFifoRow(
            batchNumber: batch.batchNumber,
            remainingStock: batch.remainingStock,
            expirationDate: batch.expirationDate,
            isExpired: batch.expirationDate.isBefore(now),
            isNearExpiry:
                !batch.expirationDate.isBefore(now) &&
                batch.expirationDate.difference(now).inDays <= 7,
          ),
        )
        .toList(growable: false);
  }
}

extension PurchaseX on Purchase {
  InventoryMovement toMovement({double previousStock = 0.0}) {
    return InventoryMovement(
      id: id,
      insumoId: insumoId,
      type: MovementType.purchase,
      quantity: quantity,
      previousStock: previousStock,
      newStock: previousStock + quantity,
      timestamp: timestamp,
      reason: 'Purchase invoice $invoiceNumber from $supplierId',
    );
  }
}
