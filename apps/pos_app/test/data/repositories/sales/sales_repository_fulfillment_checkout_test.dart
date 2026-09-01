import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/fulfillment/topology_persistence_entities.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';

import 'sales_repository_impl_test.mocks.dart';

void main() {
  late AppDatabase database;
  late MockDgiNumberingService numberingService;
  late MockProcessSaleInventoryUseCase processInventoryUseCase;
  late SalesRepositoryImpl repository;

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_prefix', value: '001-001-01-'),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'dgi_current_number', value: '1'),
    );
    await database.insumoDao.insertInsumos([
      InsumoEntity(
        id: 'ins-1',
        name: 'Rice',
        consumptionUom: 'kg',
        stock: 10,
        averageCost: 1,
      ),
    ]);

    numberingService = MockDgiNumberingService();
    processInventoryUseCase = MockProcessSaleInventoryUseCase();
    final inventoryRepository = MockInventoryRepository();
    final auditRepository = MockAuditRepository();
    when(numberingService.isRangeExhausted()).thenAnswer((_) async => false);
    when(
      numberingService.getNextNumber(),
    ).thenAnswer((_) async => '001-001-01-00000001');
    when(
      inventoryRepository.getProductById('product-1'),
    ).thenAnswer((_) async => null);
    when(processInventoryUseCase.execute(any)).thenAnswer(
      (_) async => [
        InventoryMovement(
          id: 'movement-sale-1',
          insumoId: 'ins-1',
          type: MovementType.sale,
          quantity: -1,
          previousStock: 10,
          newStock: 9,
          timestamp: DateTime.parse('2026-08-31T10:00:00Z'),
        ),
      ],
    );
    when(
      auditRepository.log(any, metadata: anyNamed('metadata')),
    ).thenAnswer((_) async {});

    repository = SalesRepositoryImpl(
      database: database,
      invoiceDao: database.invoiceDao,
      itemDao: database.invoiceItemDao,
      paymentDao: database.paymentDao,
      transactionDao: database.salesTransactionDao,
      numberingService: numberingService,
      movementEngine: MockMovementEngine(),
      auditRepository: auditRepository,
      processInventoryUseCase: processInventoryUseCase,
      reverseInventoryUseCase: MockReverseSaleInventoryUseCase(),
      inventoryRepository: inventoryRepository,
    );
  });

  tearDown(() => database.close());

  test(
    'commits a validated cached topology checkout as one offline aggregate',
    () async {
      await database.fulfillmentTopologyDao.insertSnapshot(_snapshot());

      await repository.saveSale(
        invoice: _invoice(),
        items: _items(),
        payments: const [],
        fulfillmentContext: _context(),
      );

      expect(
        (await database.invoiceDao.getInvoiceById('sale-1'))?.number,
        '001-001-01-00000001',
      );
      expect((await database.insumoDao.findInsumoById('ins-1'))?.stock, 9);
      expect(
        await database.fulfillmentPersistenceDao.findFulfillment(
          'fulfillment-sale-1',
          'tenant-1',
        ),
        isNotNull,
      );
      expect(
        await database.fulfillmentPersistenceDao.findRetryablePrintJobs(
          'tenant-1',
        ),
        hasLength(1),
      );
      expect(
        await database.fulfillmentPersistenceDao.findPendingOutboxEvents(
          'tenant-1',
        ),
        hasLength(1),
      );
      expect(
        (await database.localConfigDao.getConfigByKey(
          'dgi_current_number',
        ))?.value,
        '2',
      );

      await repository.saveSale(
        invoice: _invoice(),
        items: _items(),
        payments: const [],
        fulfillmentContext: _context(),
      );
      expect(await database.movementDao.findAllMovements(), hasLength(1));
      expect(
        await database.fulfillmentPersistenceDao.findPendingOutboxEvents(
          'tenant-1',
        ),
        hasLength(1),
      );
    },
  );

  test(
    'rejects missing, cross-tenant, stale, and hash-mismatched snapshots without mutation',
    () async {
      await database.fulfillmentTopologyDao.insertSnapshot(_snapshot());
      for (final context in [
        _context(id: 'missing'),
        _context(tenantId: 'tenant-2'),
        _context(revision: 2),
        _context(hash: 'wrong-hash'),
      ]) {
        await expectLater(
          repository.saveSale(
            invoice: _invoice(),
            items: _items(),
            payments: const [],
            fulfillmentContext: context,
          ),
          throwsA(isA<StateError>()),
        );
      }
      expect(await database.invoiceDao.getInvoiceById('sale-1'), isNull);
      expect(await database.movementDao.findAllMovements(), isEmpty);
      expect((await database.insumoDao.findInsumoById('ins-1'))?.stock, 10);
      expect(
        (await database.localConfigDao.getConfigByKey(
          'dgi_current_number',
        ))?.value,
        '1',
      );
      expect(
        await database.fulfillmentPersistenceDao.findPendingOutboxEvents(
          'tenant-1',
        ),
        isEmpty,
      );
    },
  );
}

TopologySnapshotEntity _snapshot() => TopologySnapshotEntity(
  id: 'tenant-1-r3',
  tenantId: 'tenant-1',
  revision: 3,
  hash: 'snapshot-hash',
  payload: '{}',
  receivedAt: '2026-08-31T10:00:00Z',
);

FulfillmentCheckoutContext _context({
  String tenantId = 'tenant-1',
  String id = 'tenant-1-r3',
  int revision = 3,
  String hash = 'snapshot-hash',
}) => FulfillmentCheckoutContext(
  tenantId: tenantId,
  topologySnapshotId: id,
  topologyRevision: revision,
  topologyHash: hash,
  channel: 'PRINT_ONLY',
);

Invoice _invoice() => Invoice(
  id: 'sale-1',
  number: 'draft',
  createdAt: DateTime.parse('2026-08-31T10:00:00Z'),
  userId: 'cashier-1',
  subtotal: 100,
  totalTax: 15,
  total: 115,
  paymentStatus: PaymentStatus.paid,
  syncStatus: SyncStatus.pending,
  type: InvoiceType.regular,
);

List<InvoiceItem> _items() => const [
  InvoiceItem(
    id: 'line-1',
    invoiceId: 'sale-1',
    productId: 'product-1',
    productName: 'Product 1',
    quantity: 1,
    unitPrice: 100,
    taxAmount: 15,
    total: 115,
    originalTaxRate: 15,
    appliedTaxRate: 15,
  ),
];
