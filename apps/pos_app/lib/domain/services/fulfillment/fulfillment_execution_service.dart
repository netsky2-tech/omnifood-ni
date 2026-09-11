import 'dart:convert';
import 'package:uuid/uuid.dart';
import '../../../data/database/app_database.dart';
import '../../../data/models/fulfillment/fulfillment_persistence_entities.dart';
import '../../models/fulfillment/fulfillment_contracts.dart';
import '../../models/kitchen/kitchen_order.dart';
import '../../models/sales/cart_item.dart';
import '../kitchen/kitchen_order_service.dart';

class FulfillmentExecutionResult {
  final String id;
  final String saleId;
  final String channel;
  final String routeState;
  final String deliveryState;
  final List<KitchenOrder> kdsOrders;
  final List<PrintJobEntity> printJobs;

  const FulfillmentExecutionResult({
    required this.id,
    required this.saleId,
    required this.channel,
    required this.routeState,
    required this.deliveryState,
    this.kdsOrders = const [],
    this.printJobs = const [],
  });
}

class FulfillmentExecutionService {
  final AppDatabase _database;
  final KitchenOrderService _kitchenOrderService;
  final Uuid _uuid;

  FulfillmentExecutionService(
    this._database, {
    KitchenOrderService? kitchenOrderService,
    Uuid? uuid,
  })  : _kitchenOrderService =
            kitchenOrderService ?? KitchenOrderService(_database),
        _uuid = uuid ?? const Uuid();

  /// Resolves the canonical channel string from topology channels.
  String resolveChannelString(Set<FulfillmentChannel> channels) {
    final hasPrint = channels.contains(FulfillmentChannel.print);
    final hasKds = channels.contains(FulfillmentChannel.kds);
    if (hasPrint && hasKds) {
      return 'KDS_AND_PRINT';
    } else if (hasPrint) {
      return 'PRINT_ONLY';
    } else if (hasKds) {
      return 'KDS_ONLY';
    }
    return 'PRINT_ONLY';
  }

  /// Executes fulfillment orchestration for a sale transaction.
  Future<FulfillmentExecutionResult> executeFulfillment({
    required String tenantId,
    required String saleId,
    required String invoiceNumber,
    required List<CartItem> items,
    required FulfillmentTopology topology,
    required String cashierName,
    String? tableNumber,
    String? tableName,
    String? waiterName,
    String? buzzerNumber,
    String? notes,
    Map<String, String>? productCategories,
  }) async {
    final channelStr = resolveChannelString(topology.channels);
    final fulfillmentId = 'fulfillment-$saleId';
    final now = DateTime.now();

    // 1. Persist FulfillmentRecordEntity
    final linesJson = jsonEncode(
      items.map((i) => {
        'id': _uuid.v4(),
        'productId': i.productId,
        'productName': i.productName,
        'quantity': i.quantity,
        'unitPrice': i.unitPrice,
      }).toList(),
    );

    final fulfillmentRecord = FulfillmentRecordEntity(
      id: fulfillmentId,
      tenantId: tenantId,
      saleId: saleId,
      topologySnapshotId: '${topology.tenantId}-r${topology.revision}',
      topologyRevision: topology.revision,
      channel: channelStr,
      routeState: 'ROUTED',
      deliveryState: 'PENDING',
      linesPayload: linesJson,
    );
    await _database.fulfillmentPersistenceDao.insertFulfillment(fulfillmentRecord);

    final List<PrintJobEntity> createdPrintJobs = [];

    // 2. Sequential Print Jobs Enforced: Receipt sequence 0, Kitchen ticket sequence 1
    // Receipt (seq 0) is generated whenever printing is configured or for fiscal delivery
    final receiptPayload = jsonEncode({
      'type': 'RECEIPT',
      'invoiceNumber': invoiceNumber,
      'cashierName': cashierName,
      'timestamp': now.toIso8601String(),
    });

    final receiptJob = PrintJobEntity(
      id: 'print-$saleId-receipt',
      tenantId: tenantId,
      fulfillmentId: fulfillmentId,
      documentKind: 'RECEIPT',
      sequence: 0,
      payload: receiptPayload,
      state: 'PENDING',
      retryCount: 0,
      idempotencyKey: 'print:$fulfillmentId:receipt:0',
    );
    await _database.fulfillmentPersistenceDao.insertPrintJob(receiptJob);
    createdPrintJobs.add(receiptJob);

    // Kitchen ticket (seq 1) is ONLY created if channel includes print AND is not KDS_ONLY
    if (channelStr == 'PRINT_ONLY' || channelStr == 'KDS_AND_PRINT') {
      final ticketPayload = jsonEncode({
        'type': 'TICKET',
        'ticketId': saleId,
        'invoiceNumber': invoiceNumber,
        'cashierName': cashierName,
        'tableNumber': tableNumber,
        'tableName': tableName,
        'buzzerNumber': buzzerNumber,
        'notes': notes,
        'timestamp': now.toIso8601String(),
        'items': items.map((i) => {
          'productId': i.productId,
          'productName': i.productName,
          'quantity': i.quantity,
          'notes': i.notes,
        }).toList(),
      });

      final ticketJob = PrintJobEntity(
        id: 'print-$saleId-ticket',
        tenantId: tenantId,
        fulfillmentId: fulfillmentId,
        documentKind: 'TICKET',
        sequence: 1,
        payload: ticketPayload,
        state: 'PENDING',
        retryCount: 0,
        idempotencyKey: 'print:$fulfillmentId:ticket:1',
      );
      await _database.fulfillmentPersistenceDao.insertPrintJob(ticketJob);
      createdPrintJobs.add(ticketJob);
    }

    // 3. KDS Orders: ONLY created when channel has KDS (KDS_ONLY or KDS_AND_PRINT)
    // In PRINT_ONLY mode, NO active KDS orders are created!
    final List<KitchenOrder> createdKdsOrders = [];
    if (channelStr == 'KDS_ONLY' || channelStr == 'KDS_AND_PRINT') {
      final kdsOrders = await _kitchenOrderService.sendDirectSaleToKitchen(
        invoiceId: saleId,
        invoiceNumber: invoiceNumber,
        items: items,
        buzzerNumber: buzzerNumber,
        customerName: tableName,
        waiterName: waiterName,
        productCategories: productCategories,
      );
      createdKdsOrders.addAll(kdsOrders);
    }

    // 4. Outbox Event for background sync
    final outboxEvent = OutboxEventEntity(
      eventId: 'event-$fulfillmentId',
      tenantId: tenantId,
      deviceId: 'pos-1',
      sourceSequence: now.millisecondsSinceEpoch,
      aggregateType: 'fulfillment',
      aggregateId: fulfillmentId,
      idempotencyKey: 'outbox:$tenantId:$fulfillmentId',
      payloadHash: 'claimed',
      topologyRevision: topology.revision,
      state: 'PENDING',
      attempts: 0,
    );
    await _database.fulfillmentPersistenceDao.insertOutboxEvent(outboxEvent);

    return FulfillmentExecutionResult(
      id: fulfillmentId,
      saleId: saleId,
      channel: channelStr,
      routeState: 'ROUTED',
      deliveryState: 'PENDING',
      kdsOrders: createdKdsOrders,
      printJobs: createdPrintJobs,
    );
  }

  /// Retrieves active KDS orders with active-query suppression.
  /// Suppresses any order belonging to PRINT_ONLY channels or already DELIVERED/CANCELED.
  Future<List<KitchenOrder>> getActiveKdsOrders(
    String tenantId, {
    String? station,
  }) async {
    final rawOrders = await _kitchenOrderService.getActiveOrders(
      station: station,
    );

    // Filter out orders that belong to a PRINT_ONLY channel or are not active
    final List<KitchenOrder> activeOrders = [];
    for (final order in rawOrders) {
      final fulfillment = await _database.fulfillmentPersistenceDao
          .findFulfillmentBySaleId(order.ticketId, tenantId);

      if (fulfillment != null) {
        // Active-query suppression: PRINT_ONLY orders MUST NOT appear in KDS!
        if (fulfillment.channel == 'PRINT_ONLY') {
          continue;
        }
        // If deliveryState is already DELIVERED or CANCELED, suppress
        if (fulfillment.deliveryState == 'DELIVERED' ||
            fulfillment.deliveryState == 'CANCELED') {
          continue;
        }
      }
      activeOrders.add(order);
    }
    return activeOrders;
  }

  /// Marks printing completed for a fulfillment record.
  /// INVARIANT: Route state becomes PRINTED, but delivery state remains PENDING!
  Future<void> markPrintCompleted({
    required String tenantId,
    required String fulfillmentId,
  }) async {
    await _database.fulfillmentPersistenceDao.updateRouteState(
      fulfillmentId,
      tenantId,
      'PRINTED',
    );
  }

  /// Bumps a KDS order to delivered (ENTREGADO).
  /// Updates deliveryState to DELIVERED when ready, leaving route/print state unchanged.
  Future<void> bumpKdsOrder({
    required String tenantId,
    required String orderId,
  }) async {
    final bumped = await _kitchenOrderService.bumpOrder(orderId);
    final fulfillment = await _database.fulfillmentPersistenceDao
        .findFulfillmentBySaleId(bumped.ticketId, tenantId);

    if (fulfillment != null) {
      // Check if all KDS orders for this ticket are delivered
      final orderEntities = await _database.kitchenOrderDao
          .getOrdersByTicketId(bumped.ticketId);
      final allDelivered = orderEntities.every((o) => o.status == 'ENTREGADO');
      if (allDelivered) {
        await _database.fulfillmentPersistenceDao.updateDeliveryState(
          fulfillment.id,
          tenantId,
          'DELIVERED',
        );
      }
    }
  }

  /// Legacy Read Adapter: reads fulfillment record by saleId.
  /// If the fulfillment record is absent (legacy sale before migration),
  /// adapts it from legacy invoices and kitchen orders without breaking.
  Future<FulfillmentRecordEntity?> getFulfillmentBySaleId({
    required String tenantId,
    required String saleId,
  }) async {
    final existing = await _database.fulfillmentPersistenceDao
        .findFulfillmentBySaleId(saleId, tenantId);
    if (existing != null) {
      return existing;
    }

    // Legacy Read Adapter fallback: check if invoice exists
    final invoice = await _database.invoiceDao.getInvoiceById(saleId);
    if (invoice != null) {
      final legacyOrders = await _database.kitchenOrderDao
          .getOrdersByTicketId(saleId);
      final hasKds = legacyOrders.isNotEmpty;
      final allDelivered = legacyOrders.every((o) => o.status == 'ENTREGADO');

      return FulfillmentRecordEntity(
        id: 'legacy-fulfillment-$saleId',
        tenantId: tenantId,
        saleId: saleId,
        topologySnapshotId: 'legacy-adapted',
        topologyRevision: 1,
        channel: 'LEGACY_ADAPTED',
        routeState: 'PRINTED',
        deliveryState: hasKds && !allDelivered ? 'PENDING' : 'DELIVERED',
        linesPayload: jsonEncode([]),
      );
    }

    return null;
  }
}
