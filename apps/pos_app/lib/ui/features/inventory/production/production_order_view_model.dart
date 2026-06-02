import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../../../../domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/production_order.dart';
import '../../../../domain/repositories/inventory/inventory_repository.dart';

typedef ProductionOrderIdFactory = String Function();
typedef ProductionOrderClock = DateTime Function();

class ProductionOrderViewModel extends ChangeNotifier {
  ProductionOrderViewModel(
    this._repository, {
    ProductionOrderIdFactory? createId,
    ProductionOrderClock? clock,
  })  : _createId = createId ?? _defaultCreateId,
        _clock = clock ?? DateTime.now;

  final InventoryRepository _repository;
  final ProductionOrderIdFactory _createId;
  final ProductionOrderClock _clock;
  final List<ProductionOrder> _orders = <ProductionOrder>[];
  List<Insumo> _availableInsumos = <Insumo>[];
  bool _isLoading = false;
  String? _errorMessage;
  String? _statusMessage;

  List<ProductionOrder> get orders => List<ProductionOrder>.unmodifiable(_orders);
  List<Insumo> get availableInsumos => List<Insumo>.unmodifiable(_availableInsumos);
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  String? get statusMessage => _statusMessage;

  Future<void> load(List<ProductionOrder> items) async {
    _isLoading = true;
    notifyListeners();
    _orders
      ..clear()
      ..addAll(items);
    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadInitialData() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _availableInsumos = await _repository.getActiveInsumos();
      _statusMessage = _orders.isEmpty
          ? 'Modo local: las órdenes creadas aquí quedan pendientes de integración BOH completa.'
          : _statusMessage;
    } catch (error) {
      _errorMessage = 'Error al cargar insumos para producción: $error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> startLocalOrder({
    required String producedInsumoId,
    required String recipeVersionId,
    required double orderQuantity,
  }) async {
    final normalizedRecipeVersionId = recipeVersionId.trim();

    if (producedInsumoId.trim().isEmpty) {
      throw ArgumentError('Produced insumo is required');
    }
    if (normalizedRecipeVersionId.isEmpty) {
      throw ArgumentError('Recipe version reference is required');
    }
    if (orderQuantity <= 0) {
      throw ArgumentError('Order quantity must be greater than zero');
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final order = ProductionOrder(
        id: _createId(),
        recipeVersionId: normalizedRecipeVersionId,
        producedInsumoId: producedInsumoId,
        orderQuantity: orderQuantity,
        operationDate: _clock(),
      );

      _orders.insert(0, order);
      _statusMessage =
          'Orden registrada localmente. La confirmación operativa BOH se integrará en una siguiente entrega.';
    } catch (error) {
      _errorMessage = 'No se pudo iniciar la orden de producción: $error';
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  String resolveInsumoName(String insumoId) {
    for (final insumo in _availableInsumos) {
      if (insumo.id == insumoId) {
        return insumo.name;
      }
    }
    return insumoId;
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  static String _defaultCreateId() => const Uuid().v4();
}
