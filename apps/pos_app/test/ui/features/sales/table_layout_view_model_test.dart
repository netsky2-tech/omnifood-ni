import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/domain/models/sales/cart_item.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/ui/features/sales/tables/table_layout_view_model.dart';

void main() {
  late AppDatabase database;
  late TableOrderService tableOrderService;
  late TableLayoutViewModel viewModel;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    tableOrderService = TableOrderService(database);

    // Seed Areas
    await database.restaurantAreaDao.insertAreas([
      RestaurantAreaEntity(id: 'area-salon', name: 'Salón Principal', displayOrder: 1),
      RestaurantAreaEntity(id: 'area-terraza', name: 'Terraza', displayOrder: 2),
    ]);

    // Seed Tables
    await database.restaurantTableDao.insertTables([
      RestaurantTableEntity(id: 'tbl-1', areaId: 'area-salon', tableNumber: 'Mesa 1', capacity: 4),
      RestaurantTableEntity(id: 'tbl-2', areaId: 'area-salon', tableNumber: 'Mesa 2', capacity: 6),
      RestaurantTableEntity(id: 'tbl-3', areaId: 'area-terraza', tableNumber: 'Mesa T1', capacity: 4),
    ]);

    viewModel = TableLayoutViewModel(
      database: database,
      tableOrderService: tableOrderService,
    );
  });

  tearDown(() async {
    await database.close();
  });

  final testItem = CartItem(
    productId: 'prod-1',
    productName: 'Tacos de Res',
    quantity: 2,
    unitPrice: 150.0,
    taxRate: 0.15,
  );

  group('TableLayoutViewModel (Slice 4.3)', () {
    test('loads areas and tables on init', () async {
      await viewModel.loadData();

      expect(viewModel.areas.length, 2);
      expect(viewModel.tables.length, 3);
      expect(viewModel.filteredTables.length, 3);
      expect(viewModel.selectedAreaId, isNull); // 'Todas'
    });

    test('filters tables by selected area', () async {
      await viewModel.loadData();

      viewModel.selectArea('area-terraza');
      expect(viewModel.selectedAreaId, 'area-terraza');
      expect(viewModel.filteredTables.length, 1);
      expect(viewModel.filteredTables.first.tableNumber, 'Mesa T1');

      viewModel.selectArea(null);
      expect(viewModel.filteredTables.length, 3);
    });

    test('transferTableOrder moves comanda to empty table and frees origin', () async {
      await viewModel.loadData();

      // Occupy Table 1
      final ticket = await tableOrderService.parkOrder(
        tableId: 'tbl-1',
        areaId: 'area-salon',
        name: 'Mesa 1',
        items: [testItem],
      );

      await viewModel.loadData();
      expect(viewModel.tables.firstWhere((t) => t.id == 'tbl-1').status, 'OCUPADA');
      expect(viewModel.tables.firstWhere((t) => t.id == 'tbl-2').status, 'DISPONIBLE');

      // Transfer from Table 1 to Table 2
      await viewModel.transferTableOrder(
        sourceTableId: 'tbl-1',
        targetTableId: 'tbl-2',
      );

      final t1 = viewModel.tables.firstWhere((t) => t.id == 'tbl-1');
      final t2 = viewModel.tables.firstWhere((t) => t.id == 'tbl-2');

      expect(t1.status, 'DISPONIBLE');
      expect(t1.currentTicketId, isNull);

      expect(t2.status, 'OCUPADA');
      expect(t2.currentTicketId, ticket.id);
    });

    test('mergeTables combines comandas from table 1 and table 3', () async {
      await viewModel.loadData();

      await tableOrderService.parkOrder(
        tableId: 'tbl-1',
        areaId: 'area-salon',
        name: 'Mesa 1',
        items: [testItem],
      );

      await tableOrderService.parkOrder(
        tableId: 'tbl-3',
        areaId: 'area-terraza',
        name: 'Mesa T1',
        items: [testItem],
      );

      await viewModel.loadData();

      await viewModel.mergeTableOrders(
        sourceTableId: 'tbl-3',
        targetTableId: 'tbl-1',
      );

      final t3 = viewModel.tables.firstWhere((t) => t.id == 'tbl-3');
      final t1 = viewModel.tables.firstWhere((t) => t.id == 'tbl-1');

      expect(t3.status, 'DISPONIBLE');
      expect(t1.status, 'OCUPADA');

      final orderT1 = await tableOrderService.getOrderByTableId('tbl-1');
      expect(orderT1?.items.length, 2);
    });
  });
}
