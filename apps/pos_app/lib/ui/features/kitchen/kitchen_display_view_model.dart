import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../../domain/models/kitchen/kitchen_order.dart';
import '../../../domain/services/kitchen/kitchen_order_service.dart';

class KitchenDisplayViewModel extends ChangeNotifier {
  final KitchenOrderService _kitchenOrderService;
  final bool _autoStartTimer;

  List<KitchenOrder> _orders = [];
  String _selectedStation = 'TODAS';
  bool _isLoading = false;
  String? _errorMessage;
  Timer? _refreshTimer;

  KitchenDisplayViewModel({
    required KitchenOrderService kitchenOrderService,
    bool autoStartTimer = true,
  })  : _kitchenOrderService = kitchenOrderService,
        _autoStartTimer = autoStartTimer {
    if (_autoStartTimer) {
      loadOrders();
      _startPeriodicTimer();
    }
  }

  List<KitchenOrder> get orders => _orders;
  String get selectedStation => _selectedStation;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  int get pendingCount => _orders.where((o) => o.status != 'ENTREGADO').length;
  int get cocinaCount => _orders.where((o) => o.station == 'COCINA' && o.status != 'ENTREGADO').length;
  int get barraCount => _orders.where((o) => o.station == 'BARRA' && o.status != 'ENTREGADO').length;

  void _startPeriodicTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      // Re-render to update elapsed minutes and SLA badges
      notifyListeners();
    });
  }

  void setTestData(List<KitchenOrder> orders, {String selectedStation = 'TODAS'}) {
    _orders = orders;
    _selectedStation = selectedStation;
    _isLoading = false;
    _errorMessage = null;
    notifyListeners();
  }

  Future<void> loadOrders() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _orders = await _kitchenOrderService.getActiveOrders(
        station: _selectedStation == 'TODAS' ? null : _selectedStation,
      );
    } catch (e) {
      _errorMessage = 'Error al cargar comandas de cocina: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> selectStation(String station) async {
    _selectedStation = station;
    await loadOrders();
  }

  Future<void> startPreparation(String orderId) async {
    try {
      await _kitchenOrderService.startPreparation(orderId);
      await loadOrders();
    } catch (e) {
      _errorMessage = 'Error al iniciar preparación: $e';
      notifyListeners();
    }
  }

  Future<void> markItemReady(String orderId, String itemId) async {
    try {
      await _kitchenOrderService.markItemStatus(
        orderId: orderId,
        itemId: itemId,
        status: 'LISTO',
      );
      await loadOrders();
    } catch (e) {
      _errorMessage = 'Error al actualizar ítem: $e';
      notifyListeners();
    }
  }

  Future<void> markOrderReady(String orderId) async {
    try {
      await _kitchenOrderService.markOrderReady(orderId);
      await loadOrders();
    } catch (e) {
      _errorMessage = 'Error al marcar orden lista: $e';
      notifyListeners();
    }
  }

  Future<void> bumpOrder(String orderId) async {
    try {
      await _kitchenOrderService.bumpOrder(orderId);
      await loadOrders();
    } catch (e) {
      _errorMessage = 'Error al despachar orden: $e';
      notifyListeners();
    }
  }

  KitchenSlaStatus getSlaStatus(DateTime createdAt) {
    return _kitchenOrderService.getSlaStatus(createdAt);
  }

  int getElapsedMinutes(DateTime createdAt) {
    return _kitchenOrderService.getElapsedMinutes(createdAt);
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }
}
