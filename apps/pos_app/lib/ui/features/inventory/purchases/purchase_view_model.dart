import 'package:flutter/foundation.dart';
import '../../../../domain/models/inventory/insumo.dart';
import '../../../../domain/models/inventory/supplier.dart';
import '../../../../domain/models/inventory/purchase.dart';
import '../../../../domain/models/inventory/uom_conversion.dart';
import '../../../../domain/models/inventory/batch.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';
import '../../../../domain/models/inventory/inventory_movement.dart';
import '../../../../domain/services/inventory/movement_engine.dart';
import '../../../../domain/services/inventory/uom_conversion_calculator.dart';

const purchaseCurrencies = ['NIO', 'USD'];

class PurchaseReviewData {
  const PurchaseReviewData({
    required this.quantityInBaseUnit,
    required this.bcnRate,
    required this.unitCostNio,
    required this.previousCppNio,
    required this.projectedCppNio,
    required this.requiresBatchTracking,
  });

  final double quantityInBaseUnit;
  final double bcnRate;
  final double unitCostNio;
  final double previousCppNio;
  final double projectedCppNio;
  final bool requiresBatchTracking;
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

  List<Insumo> _insumos = [];
  List<Insumo> get insumos => _insumos;

  List<Supplier> _suppliers = [];
  List<Supplier> get suppliers => _suppliers;

  List<UomConversion> _conversions = [];
  List<UomConversion> get conversions => _conversions;

  List<PurchaseFifoRow> _fifoRows = [];
  List<PurchaseFifoRow> get fifoRows => _fifoRows;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  PurchaseViewModel(this.repository, this.movementEngine);

  Future<void> loadInitialData({String? insumoId}) async {
    _isLoading = true;
    notifyListeners();

    _insumos = await repository.getActiveInsumos();
    _suppliers = await repository.getActiveSuppliers();
    if (insumoId != null) {
      _conversions = await repository.getConversionsByInsumoId(insumoId);
      _fifoRows = await _loadFifoRows(insumoId);
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> recordPurchase({
    required String insumoId,
    required String supplierId,
    required String invoiceNumber,
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
      final purchaseId = DateTime.now().millisecondsSinceEpoch.toString();
      final entryTimestamp = DateTime.now();

      if (review.requiresBatchTracking) {
        if (lotCode == null ||
            lotCode.isEmpty ||
            receivedDate == null ||
            expirationDate == null) {
          throw ArgumentError(
            'Lot code, received date, and expiration date are required for batch-managed items.',
          );
        }
      }

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
        quantity: review.quantityInBaseUnit,
        unitCost: unitCost,
        timestamp: entryTimestamp,
        invoiceDate: invoiceDate,
        currency: currency,
        bcnRate: review.bcnRate,
        unitCostNio: review.unitCostNio,
        cppBeforeNio: review.previousCppNio,
        projectedCppNio: review.projectedCppNio,
        lotCode: lotCode,
        receivedDate: receivedDate,
        expirationDate: expirationDate,
        requiresBatchTracking: review.requiresBatchTracking,
      );
      await repository.queuePurchaseSync(purchase);

      if (review.requiresBatchTracking &&
          lotCode != null &&
          receivedDate != null &&
          expirationDate != null) {
        await repository.saveBatch(
          Batch(
            id: purchaseId,
            insumoId: insumoId,
            batchNumber: lotCode,
            receivedDate: receivedDate,
            expirationDate: expirationDate,
            remainingStock: review.quantityInBaseUnit,
            cost: review.unitCostNio,
          ),
        );
      }

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

  PurchaseReviewData buildPurchaseReview({
    required String insumoId,
    required String uomConversionId,
    required double quantity,
    required double unitCost,
    required String currency,
    double? bcnRate,
  }) {
    final insumo = _insumos.firstWhere(
      (item) => item.id == insumoId,
      orElse: () => throw ArgumentError('Invalid insumo ID: $insumoId'),
    );
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

    return PurchaseReviewData(
      quantityInBaseUnit: quantityInBaseUnit,
      bcnRate: resolvedBcnRate,
      unitCostNio: double.parse(unitCostNio.toStringAsFixed(4)),
      previousCppNio: double.parse(insumo.averageCost.toStringAsFixed(4)),
      projectedCppNio: double.parse(projectedCpp.toStringAsFixed(4)),
      requiresBatchTracking: insumo.isPerishable,
    );
  }

  double _requireExplicitBcnRate(double? bcnRate) {
    if (bcnRate == null || bcnRate <= 0) {
      throw ArgumentError('USD purchases require an explicit BCN exchange rate.');
    }

    return bcnRate.toDouble();
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
  InventoryMovement toMovement() {
    return InventoryMovement(
      id: id,
      insumoId: insumoId,
      type: MovementType.purchase,
      quantity: quantity,
      previousStock: 0, // Should be fetched from repo
      newStock: quantity, // Should be calculated
      timestamp: timestamp,
      reason: 'Purchase invoice $invoiceNumber from $supplierId',
    );
  }
}
