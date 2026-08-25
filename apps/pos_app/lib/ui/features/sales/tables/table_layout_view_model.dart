import 'package:flutter/foundation.dart';
import '../../../../data/database/app_database.dart';
import '../../../../data/mappers/sales_mapper.dart';
import '../../../../domain/models/sales/hold_ticket.dart';
import '../../../../domain/models/sales/cart_item.dart';
import '../../../../domain/models/sales/restaurant_area.dart';
import '../../../../domain/models/sales/restaurant_table.dart';
import '../../../../domain/services/sales/table_order_service.dart';

class TableLayoutViewModel extends ChangeNotifier {
  final AppDatabase _database;
  final TableOrderService _tableOrderService;

  TableLayoutViewModel({
    required AppDatabase database,
    TableOrderService? tableOrderService,
    bool autoLoad = true,
  })  : _database = database,
        _tableOrderService = tableOrderService ?? TableOrderService(database) {
    if (autoLoad) {
      loadData();
    }
  }

  List<RestaurantArea> _areas = [];
  List<RestaurantArea> get areas => _areas;

  List<RestaurantTable> _tables = [];
  List<RestaurantTable> get tables => _tables;

  Map<String, HoldTicket> _ticketsByTableId = {};
  Map<String, HoldTicket> get ticketsByTableId => _ticketsByTableId;

  String? _selectedAreaId;
  String? get selectedAreaId => _selectedAreaId;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  List<RestaurantTable> get filteredTables {
    if (_selectedAreaId == null) return _tables;
    return _tables.where((t) => t.areaId == _selectedAreaId).toList();
  }

  HoldTicket? getTicketForTable(String tableId) => _ticketsByTableId[tableId];

  double getTableTotal(String tableId) {
    final ticket = _ticketsByTableId[tableId];
    if (ticket == null) return 0.0;
    return ticket.items.fold(0.0, (sum, item) => sum + item.total);
  }

  void selectArea(String? areaId) {
    _selectedAreaId = areaId;
    notifyListeners();
  }

  @visibleForTesting
  void setTestData({
    List<RestaurantArea>? areas,
    List<RestaurantTable>? tables,
    Map<String, HoldTicket>? ticketsByTableId,
  }) {
    if (areas != null) _areas = areas;
    if (tables != null) _tables = tables;
    if (ticketsByTableId != null) _ticketsByTableId = ticketsByTableId;
    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadData() async {
    _isLoading = true;
    notifyListeners();

    try {
      final areaEntities = await _database.restaurantAreaDao.getActiveAreas();
      _areas = areaEntities.map((e) => SalesMapper.toAreaDomain(e)).toList();

      final tableEntities = await _database.restaurantTableDao.getAllTables();
      _tables = tableEntities.map((e) => SalesMapper.toTableDomain(e)).toList();

      final openOrders = await _tableOrderService.getAllOpenOrders();
      _ticketsByTableId = {};
      for (final order in openOrders) {
        if (order.tableId != null) {
          _ticketsByTableId[order.tableId!] = order;
        }
      }

      _errorMessage = null;
    } catch (e) {
      _errorMessage = 'Error al cargar mapa de mesas: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> transferTableOrder({
    required String sourceTableId,
    required String targetTableId,
  }) async {
    final sourceTicket = _ticketsByTableId[sourceTableId];
    if (sourceTicket == null) {
      _errorMessage = 'No hay comanda activa en la mesa origen.';
      notifyListeners();
      return;
    }

    try {
      final now = DateTime.now();

      // 1. Update ticket with new tableId
      final updatedTicket = sourceTicket.copyWith(
        tableId: targetTableId,
        updatedAt: now,
      );

      final entity = SalesMapper.toHoldTicketEntity(updatedTicket);
      final itemEntities = SalesMapper.toHoldTicketItemEntities(updatedTicket);
      await _database.holdTicketDao.saveHoldTicket(entity, itemEntities);

      // 2. Release source table
      await _database.restaurantTableDao.releaseTable(sourceTableId);

      // 3. Occupy target table
      await _database.restaurantTableDao.occupyTable(
        targetTableId,
        'OCUPADA',
        updatedTicket.id,
        updatedTicket.guestCount,
        now.millisecondsSinceEpoch,
      );

      await loadData();
    } catch (e) {
      _errorMessage = 'Error al transferir mesa: $e';
      notifyListeners();
    }
  }

  Future<void> mergeTableOrders({
    required String sourceTableId,
    required String targetTableId,
  }) async {
    final sourceTicket = _ticketsByTableId[sourceTableId];
    final targetTicket = _ticketsByTableId[targetTableId];

    if (sourceTicket == null || targetTicket == null) {
      _errorMessage = 'Ambas mesas deben tener comandas activas para fusionarse.';
      notifyListeners();
      return;
    }

    try {
      await _tableOrderService.mergeOrders(
        sourceTicketId: sourceTicket.id,
        targetTicketId: targetTicket.id,
        targetExpectedVersion: targetTicket.version,
      );

      await loadData();
    } catch (e) {
      _errorMessage = 'Error al fusionar mesas: $e';
      notifyListeners();
    }
  }
}
