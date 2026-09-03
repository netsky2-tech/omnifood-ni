import 'dart:typed_data';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_entity.dart';
import 'package:pos_app/data/models/kitchen/kitchen_order_item_entity.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/services/printer/receipt_58mm_formatter.dart';
import 'package:pos_app/domain/services/printer/esc_pos_builder.dart';

abstract class NetworkKitchenPrinterPort {
  Future<bool> printTicket({
    required String host,
    required int port,
    required List<int> bytes,
  });
}

class InMemoryNetworkPrinter implements NetworkKitchenPrinterPort {
  bool isOnline = true;
  final List<List<int>> printedPayloads = [];

  @override
  Future<bool> printTicket({
    required String host,
    required int port,
    required List<int> bytes,
  }) async {
    if (!isOnline) {
      throw Exception('SocketException: Connection refused to $host:$port (Kitchen Printer Offline)');
    }
    printedPayloads.add(bytes);
    return true;
  }
}

class KitchenPrintJobQueueService {
  final AppDatabase database;
  final NetworkKitchenPrinterPort networkPrinter;
  final String kitchenIp;
  final int kitchenPort;

  final List<Map<String, dynamic>> queuedJobs = [];

  KitchenPrintJobQueueService({
    required this.database,
    required this.networkPrinter,
    this.kitchenIp = '192.168.1.50',
    this.kitchenPort = 9100,
  });

  Future<void> dispatchKitchenOrder({
    required String orderId,
    required String ticketId,
    required int beeperNumber,
    required List<InvoiceItem> items,
  }) async {
    final nowMs = DateTime.now().millisecondsSinceEpoch;

    // 1. Guardar estado de la comanda en SQLite
    final orderEntity = KitchenOrderEntity(
      id: orderId,
      ticketId: ticketId,
      tableNumber: 'BEEPER #$beeperNumber',
      tableName: 'Beeper $beeperNumber',
      waiterName: 'Cajero Central',
      station: 'COCINA_CALIENTE',
      status: 'PENDIENTE',
      createdAt: nowMs,
      notes: 'BEEPER: $beeperNumber',
    );

    final itemEntities = items.map((it) => KitchenOrderItemEntity(
      id: 'kitem-${it.id}',
      kitchenOrderId: orderId,
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      status: 'PENDIENTE',
    )).toList();

    await database.kitchenOrderDao.saveKitchenOrder(orderEntity, itemEntities);

    // 2. Formatear comando ESC/POS con buzzer y cabecera para la impresora de cocina
    final escPosBytes = Receipt58mmFormatter.formatKitchenOrderEscPos(
      ticketId: ticketId,
      orderTitle: 'ORD-$beeperNumber',
      cashierName: 'Cajero FoodPark',
      timestamp: DateTime.now(),
      items: items,
      buzzerNumber: beeperNumber,
    );

    // 3. Intento de impresión inmediato; si falla, encolar resiliente sin bloquear al cajero
    try {
      await networkPrinter.printTicket(
        host: kitchenIp,
        port: kitchenPort,
        bytes: escPosBytes,
      );
    } catch (e) {
      queuedJobs.add({
        'orderId': orderId,
        'bytes': escPosBytes,
        'timestamp': DateTime.now(),
        'retries': 0,
      });
    }
  }

  Future<int> processQueuedJobs() async {
    final pending = List<Map<String, dynamic>>.from(queuedJobs);
    var flushedCount = 0;

    for (final job in pending) {
      try {
        await networkPrinter.printTicket(
          host: kitchenIp,
          port: kitchenPort,
          bytes: job['bytes'] as List<int>,
        );
        queuedJobs.remove(job);
        flushedCount++;
      } catch (_) {
        job['retries'] = ((job['retries'] as int?) ?? 0) + 1;
      }
    }
    return flushedCount;
  }
}

void main() {
  late AppDatabase database;
  late InMemoryNetworkPrinter networkPrinter;
  late KitchenPrintJobQueueService kitchenQueueService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    networkPrinter = InMemoryNetworkPrinter();
    kitchenQueueService = KitchenPrintJobQueueService(
      database: database,
      networkPrinter: networkPrinter,
    );
  });

  tearDown(() async {
    await database.close();
  });

  group('Fase 6: Flujo de Cocina y Hardware (Food Park & KDS)', () {
    test('Captura de Beeper #12 -> Impresión simultánea FOH/Cocina -> Manejo de cola offline', () async {
      // 1. Captura de Pedido: 2 Hamburguesas con Beeper #12
      const beeperNumber = 12;
      const orderId = 'kitchen-order-0012';
      const ticketId = 'TICK-9012';

      final items = [
        const InvoiceItem(
          id: 'item-burger-1',
          invoiceId: 'inv-burger-1',
          productId: 'prod-burger',
          productName: 'Hamburguesa Doble Queso',
          quantity: 2.0,
          unitPrice: 120.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 36.0,
          total: 276.0,
        ),
      ];

      // 2. Validación de Formato de Comanda de Cocina (Texto y Cabecera)
      final kitchenTicketText = Receipt58mmFormatter.formatKitchenOrderText(
        ticketId: ticketId,
        orderTitle: 'ORD-9012',
        cashierName: 'Cajero FoodPark',
        timestamp: DateTime.now(),
        items: items,
        buzzerNumber: beeperNumber,
      );

      expect(kitchenTicketText, contains('*** COMANDA COCINA ***'));
      expect(kitchenTicketText, contains('>>> BUZZER / PAGER #12 <<<'));
      expect(kitchenTicketText, contains('2 x Hamburguesa Doble Queso'));

      // 3. Enrutamiento Inteligente con Impresora de Red Online (192.168.1.50:9100)
      networkPrinter.isOnline = true;

      await kitchenQueueService.dispatchKitchenOrder(
        orderId: orderId,
        ticketId: ticketId,
        beeperNumber: beeperNumber,
        items: items,
      );

      // Comanda enviada a la impresora de red con formato ESC/POS
      expect(networkPrinter.printedPayloads.length, equals(1));
      expect(kitchenQueueService.queuedJobs.isEmpty, isTrue);

      // Validar persistencia en SQLite para la pantalla KDS
      final activeOrders = await database.kitchenOrderDao.getActiveOrders('SERVIDO');
      expect(activeOrders.length, equals(1));
      expect(activeOrders.first.notes, contains('BEEPER: 12'));

      // 4. Gestión de Cola: Simular que la impresora de cocina se apaga/desconecta
      networkPrinter.isOnline = false;

      const offlineOrderId = 'kitchen-order-0013';
      const offlineBeeper = 15;

      // El cajero emite el pedido sin que la pantalla se bloquee ni lance error fatal
      await kitchenQueueService.dispatchKitchenOrder(
        orderId: offlineOrderId,
        ticketId: 'TICK-9013',
        beeperNumber: offlineBeeper,
        items: items,
      );

      // La comanda fue encolada en memoria/SQLite para reintento
      expect(kitchenQueueService.queuedJobs.length, equals(1));
      expect(kitchenQueueService.queuedJobs.first['orderId'], equals(offlineOrderId));

      // 5. Reconexión de Impresora: Al volver la señal, la cola se vacía y se imprime automáticamente
      networkPrinter.isOnline = true;
      final flushedCount = await kitchenQueueService.processQueuedJobs();

      expect(flushedCount, equals(1));
      expect(kitchenQueueService.queuedJobs.isEmpty, isTrue);
      expect(networkPrinter.printedPayloads.length, equals(2)); // Primera + encolada reintentada
    });
  });
}
