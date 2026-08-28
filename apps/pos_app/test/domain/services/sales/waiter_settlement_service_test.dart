import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/sales/cashier_session_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/payment_entity.dart';
import 'package:pos_app/data/models/sales/hold_ticket_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_area_entity.dart';
import 'package:pos_app/data/models/sales/restaurant_table_entity.dart';
import 'package:pos_app/domain/services/sales/waiter_settlement_service.dart';

void main() {
  late AppDatabase database;
  late WaiterSettlementService settlementService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    settlementService = WaiterSettlementService(database);

    // Seed area for FK integrity
    await database.restaurantAreaDao.insertAreas([
      RestaurantAreaEntity(id: 'area-1', name: 'Área 1', displayOrder: 1),
    ]);
  });

  tearDown(() async {
    await database.close();
  });

  group('WaiterSettlementService - TDD & Fiscal Shift Settlement', () {
    test('Case 1: Generates settlement summary with aggregated cash, cards, and tips', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      // 1. Insert waiter shift
      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-waiter-01',
          userId: 'u-waiter-10',
          terminalId: 'POS-MOB-01',
          openedAt: now - 3600000,
          tipoModelo: 'CARTERA_MESERO',
          openingBalanceNio: 500.0,
          openingBalanceUsd: 20.0,
          isClosed: false,
          syncStatus: 'synced',
        ),
      );

      // 2. Insert invoices for this waiter
      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-1',
          number: '001-001-01-00000001',
          createdAt: now - 1800000,
          userId: 'u-waiter-10',
          subtotal: 1000.0,
          totalTax: 150.0,
          total: 1250.0, // 1000 sub + 150 tax + 100 tip
        ),
      );

      await database.invoiceDao.insertInvoice(
        InvoiceEntity(
          id: 'inv-2',
          number: '001-001-01-00000002',
          createdAt: now - 900000,
          userId: 'u-waiter-10',
          subtotal: 500.0,
          totalTax: 75.0,
          total: 625.0, // 500 sub + 75 tax + 50 tip
        ),
      );

      // 3. Insert payments: Inv 1 paid with cash 1250, Inv 2 paid with card 625
      await database.paymentDao.insertPayments([
        PaymentEntity(
          id: 'pay-1',
          invoiceId: 'inv-1',
          method: 'cash',
          amount: 1250.0,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 1250.0,
        ),
        PaymentEntity(
          id: 'pay-2',
          invoiceId: 'inv-2',
          method: 'card',
          amount: 625.0,
          currency: 'NIO',
          exchangeRate: 1.0,
          amountNio: 625.0,
          bankPos: 'BAC',
          cardBrand: 'VISA',
          reconciliationStatus: 'CONCILIADO',
        ),
      ]);

      final report = await settlementService.calculateSettlement(
        shiftId: 'shift-waiter-01',
        waiterUserId: 'u-waiter-10',
      );

      expect(report.totalSalesNio, 1875.0);
      expect(report.totalCashCollectedNio, 1250.0);
      expect(report.totalCardCollectedNio, 625.0);
      expect(report.invoicesCount, 2);
      expect(report.hasOpenTables, isFalse);
      expect(report.canCloseShift, isTrue);
    });

    test('Case 2: Blocks shift closure if waiter still has open parked tables (INV-16.5)', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-waiter-02',
          userId: 'u-waiter-20',
          terminalId: 'POS-MOB-02',
          openedAt: now - 3600000,
          tipoModelo: 'CARTERA_MESERO',
          openingBalanceNio: 500.0,
          isClosed: false,
          syncStatus: 'synced',
        ),
      );

      // Parked table for waiter 20
      await database.holdTicketDao.saveHoldTicket(
        HoldTicketEntity(
          id: 'hold-open-1',
          name: 'Mesa 4',
          tableId: 'tbl-4',
          waiterId: 'u-waiter-20',
          waiterName: 'Juan Mesero',
          createdAt: now - 1000000,
          guestCount: 3,
        ),
        [],
      );

      await database.restaurantTableDao.insertTables([
        RestaurantTableEntity(
          id: 'tbl-4',
          areaId: 'area-1',
          tableNumber: 'Mesa 4',
          status: 'OCUPADA',
          currentTicketId: 'hold-open-1',
        ),
      ]);

      final report = await settlementService.calculateSettlement(
        shiftId: 'shift-waiter-02',
        waiterUserId: 'u-waiter-20',
      );

      expect(report.hasOpenTables, isTrue);
      expect(report.openTablesCount, 1);
      expect(report.openTableNames, contains('Mesa 4'));
      expect(report.canCloseShift, isFalse);

      // Attempting to close shift throws StateError
      expect(
        () => settlementService.closeWaiterShift(
          shiftId: 'shift-waiter-02',
          waiterUserId: 'u-waiter-20',
          declaredCashNio: 500.0,
        ),
        throwsA(isA<OpenTablesPendingException>()),
      );
    });

    test('Case 3: Successfully closes waiter shift when all tables are liquidated or transferred', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      await database.cashierSessionDao.insertSession(
        CashierSessionEntity(
          id: 'shift-waiter-03',
          userId: 'u-waiter-30',
          terminalId: 'POS-MOB-03',
          openedAt: now - 3600000,
          tipoModelo: 'CARTERA_MESERO',
          openingBalanceNio: 300.0,
          isClosed: false,
          syncStatus: 'synced',
        ),
      );

      final closedSession = await settlementService.closeWaiterShift(
        shiftId: 'shift-waiter-03',
        waiterUserId: 'u-waiter-30',
        declaredCashNio: 300.0,
      );

      expect(closedSession.isClosed, isTrue);
      expect(closedSession.closingCountedNio, 300.0);
    });
  });
}
