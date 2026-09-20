import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/clock/monotonic_clock.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_point_transaction_entity.dart';
import 'package:pos_app/data/models/inventory/insumo_entity.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/data/models/inventory/product_entity.dart';
import 'package:pos_app/data/models/inventory/recipe_entity.dart';
import 'package:pos_app/data/models/sales/invoice_entity.dart';
import 'package:pos_app/data/models/sales/invoice_item_entity.dart';
import 'package:pos_app/data/repositories/audit_repository_impl.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'package:pos_app/data/repositories/sales/sales_repository_impl.dart';
import 'package:pos_app/data/repositories/tenant_capability_cache.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';
import 'package:pos_app/domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'package:pos_app/domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../support/loyalty_release_harness.dart';

// Port fakes, justified inline:
// - DgiNumberingService: fiscal numbering is a port consumed only by sale
//   creation/credit notes; voidInvoice never reads it, so a stub cannot
//   affect the void, its inventory reversal or any Loyalty behavior.
// - AuthRepository (audit stream identity): prepareLog uses the current user
//   only to stamp the forensic audit entry. It is a session identity port and
//   cannot influence tenant resolution of Loyalty lookups or the reversal
//   calculation; the tenant here is the real device tenant, not a customer
//   identity.
class _VoidDgiNumberingService implements DgiNumberingService {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _VoidAuditAuthRepository implements AuthRepository {
  @override
  Future<User?> getCurrentUser() async => const User(
        id: 'user-void-auditor',
        name: 'Auditor Void',
        role: UserRole.manager,
        isActive: true,
        tenantId: 'tenant-foodpark-losrobles-01',
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const deviceTenantId = 'tenant-foodpark-losrobles-01';
  const customerId = 'c-customer-void-9842';
  const programId = 'prog-void-device-tenant';
  const productId = 'prod-void-burger';
  const insumoId = 'ins-void-beef';
  const invoiceId = 'inv-void-loyalty-0001';
  const earnId = 'ledger-void-earn-0001';
  const redeemId = 'ledger-void-redeem-0001';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Future<LoyaltyReleaseHarness> createHarness() async {
    final directory = await Directory.systemTemp.createTemp(
      'loyalty_void_probe_',
    );
    final harness = LoyaltyReleaseHarness(directory);
    await harness.createLegacyV10Database();
    return harness;
  }

  Future<void> disposeHarness(LoyaltyReleaseHarness harness) async {
    await harness.close();
    if (harness.directory.existsSync()) {
      await harness.directory.delete(recursive: true);
    }
  }

  SalesRepositoryImpl buildVoidRepository(AppDatabase db) {
    // Real inventory dependency on the migrated schema: the production
    // repository over real Floor DAOs (recipe/insumo reads, movement writes).
    final inventoryRepository = InventoryRepositoryImpl(
      insumoDao: db.insumoDao,
      recipeDao: db.recipeDao,
      movementDao: db.movementDao,
      movementSyncStateDao: db.movementSyncStateDao,
      supplierDao: db.supplierDao,
      warehouseDao: db.warehouseDao,
      forensicAlertDao: db.forensicAlertDao,
      uomConversionDao: db.uomConversionDao,
      batchDao: db.batchDao,
      purchaseDao: db.purchaseDao,
      recipeVersionDocumentDao: db.recipeVersionDocumentDao,
      productionOrderDocumentDao: db.productionOrderDocumentDao,
      dio: Dio(),
      database: db,
    );
    final engine = MovementEngineImpl(inventoryRepository, AlertServiceImpl());
    // Real audit dependency on the migrated schema: the production forensic
    // repository writing through the real AuditDao inside the void
    // transaction.
    final auditRepository = AuditRepositoryImpl(
      db.auditDao,
      _VoidAuditAuthRepository(),
      Dio(),
      'device-void-probe',
      capabilityCache: TenantCapabilityCache(
        configDao: db.localConfigDao,
        clock: StopwatchMonotonicClock(),
        bootSessionId: 'void-probe',
      ),
      forensicAlertDao: db.forensicAlertDao,
    );
    return SalesRepositoryImpl(
      database: db,
      invoiceDao: db.invoiceDao,
      itemDao: db.invoiceItemDao,
      paymentDao: db.paymentDao,
      transactionDao: db.salesTransactionDao,
      numberingService: _VoidDgiNumberingService(),
      movementEngine: engine,
      auditRepository: auditRepository,
      processInventoryUseCase: ProcessSaleInventoryUseCase(engine),
      reverseInventoryUseCase: ReverseSaleInventoryUseCase(engine),
      inventoryRepository: inventoryRepository,
    );
  }

  Future<void> seedTicketWithLoyalty(AppDatabase db) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    // Real catalog: product -> simple recipe -> insumo, so the production
    // reversal path explodes a real BOM on the migrated schema.
    await db.productDao.insertProducts([
      ProductEntity(
        id: productId,
        name: 'Hamburguesa Void',
        uom: 'UND',
        stock: 50,
        averageCost: 40,
        sellPrice: 150,
      ),
    ]);
    await db.insumoDao.insertInsumos([
      InsumoEntity(
        id: insumoId,
        name: 'Carne Void',
        consumptionUom: 'UND',
        stock: 50,
        averageCost: 40,
      ),
    ]);
    await db.recipeDao.insertRecipes([
      RecipeEntity(
        id: 'recipe-void-1',
        productId: productId,
        ingredientId: insumoId,
        ingredientType: 'insumo',
        quantity: 1,
      ),
    ]);

    // Paid ticket persisted through the real sales transaction DAO (with its
    // original sale movement so the void reversal has a historical origin).
    await db.salesTransactionDao.executeSaleTransaction(
      InvoiceEntity(
        id: invoiceId,
        number: '001-001-01-00005555',
        createdAt: now,
        userId: 'user-void-auditor',
        subtotal: 300,
        totalTax: 45,
        total: 345,
        customerId: customerId,
      ),
      [
        InvoiceItemEntity(
          id: 'item-void-1',
          invoiceId: invoiceId,
          productId: productId,
          productName: 'Hamburguesa Void',
          quantity: 2,
          unitPrice: 150,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 45,
          total: 345,
        ),
      ],
      [],
      [],
      [
        MovementEntity(
          id: 'mv-void-sale-1',
          insumoId: insumoId,
          type: 'sale',
          quantity: -2,
          previousStock: 50,
          newStock: 48,
          timestamp: DateTime.now().toIso8601String(),
          reason: 'Venta void probe',
          userId: 'user-void-auditor',
          sourceDocumentType: 'invoice',
          sourceDocumentId: invoiceId,
        ),
      ],
      null,
      false,
    );

    // Loyalty ledger rows for the ticket through the real DAO: one EARN
    // (+345 units) and one REDEEM (-50 units), arch §2.3 signs.
    await db.customerPointTransactionDao.insertTransactions([
      CustomerPointTransactionEntity(
        id: earnId,
        customerId: customerId,
        invoiceId: invoiceId,
        type: 'earn',
        points: 34.5,
        balanceAfter: 294.5,
        conversionRate: 0.1,
        createdAt: now,
        loyaltyProgramId: programId,
        ticketId: invoiceId,
        transactionType: 'EARN',
        units: 345,
        idempotencyKey: 'loyalty:earn:$deviceTenantId:$invoiceId:$programId',
        origin: 'POS',
      ),
      CustomerPointTransactionEntity(
        id: redeemId,
        customerId: customerId,
        invoiceId: invoiceId,
        type: 'redeem',
        points: -5,
        balanceAfter: 244.5,
        conversionRate: 0.1,
        createdAt: now,
        loyaltyProgramId: programId,
        ticketId: invoiceId,
        rewardId: 'rw-void-20',
        transactionType: 'REDEEM',
        units: -50,
        idempotencyKey: 'loyalty:redeem:$deviceTenantId:$invoiceId',
        origin: 'POS',
      ),
    ]);
  }

  test('[B5] real void appends exact append-only Loyalty reversals and keeps '
      'the invoice canceled, never deleted', () async {
    final harness = await createHarness();
    try {
      final db = await harness.openMigratedDatabase();
      await seedTicketWithLoyalty(db);

      // Production void path: SalesRepositoryImpl.voidInvoice with its real
      // inventory reversal and forensic audit dependencies on the migrated
      // schema (arch §4.3 ReverseTicketLoyalty, §12 DGI append-only).
      final repository = buildVoidRepository(db);
      await repository.voidInvoice(invoiceId, 'anulacion cliente');

      // DGI compliance: the invoice is flagged canceled, not deleted.
      final invoice = await db.invoiceDao.getInvoiceById(invoiceId);
      expect(
        invoice,
        isNotNull,
        reason: '[B5] DGI DT 09-2007 forbids deleting invoices; the voided '
            'invoice row must remain',
      );
      expect(invoice!.isCanceled, isTrue);

      // The real inventory reversal branch ran against the migrated schema.
      final reversalMovements = await db.database.rawQuery(
        "SELECT * FROM inventory_movements WHERE source_document_id = ? "
        "AND type = 'REVERSAL'",
        [invoiceId],
      );
      expect(reversalMovements, hasLength(1));

      // Forensic audit trail: the void must leave a SALE_VOIDED entry
      // correlated with the canceled invoice (arch §12).
      final auditRows = await db.database.rawQuery(
        "SELECT * FROM audit_logs WHERE action = 'SALE_VOIDED'",
      );
      expect(
        auditRows,
        isNotEmpty,
        reason: '[B5] the real void path must write a SALE_VOIDED audit entry '
            'for the canceled invoice',
      );

      // Original ledger rows are preserved (append-only ledger).
      final earn = await db.customerPointTransactionDao.findByIdempotencyKey(
        'loyalty:earn:$deviceTenantId:$invoiceId:$programId',
      );
      final redeem = await db.customerPointTransactionDao.findByIdempotencyKey(
        'loyalty:redeem:$deviceTenantId:$invoiceId',
      );
      expect(earn, isNotNull);
      expect(redeem, isNotNull);
      expect(earn!.reversalOfTransactionId, isNull);
      expect(redeem!.reversalOfTransactionId, isNull);

      // Correct behavior (arch §4.3): for each EARN/REDEEM of the ticket the
      // void must append exactly one REVERSAL with units = -original.units
      // and reversalOfTransactionId = original.id. RED today because nothing
      // writes loyalty reversals on void.
      final ledgerRows = await db.customerPointTransactionDao
          .getTransactionsByCustomer(customerId);
      final earnReversals = ledgerRows
          .where((r) => r.reversalOfTransactionId == earnId)
          .toList();
      final redeemReversals = ledgerRows
          .where((r) => r.reversalOfTransactionId == redeemId)
          .toList();
      expect(
        earnReversals,
        hasLength(1),
        reason: '[B5] void must append exactly one compensating REVERSAL for '
            'the EARN movement of the ticket',
      );
      expect(
        redeemReversals,
        hasLength(1),
        reason: '[B5] void must append exactly one compensating REVERSAL for '
            'the REDEEM movement of the ticket',
      );
      expect(earnReversals.single.transactionType, 'REVERSAL');
      expect(earnReversals.single.units, -(earn!.units!));
      expect(redeemReversals.single.transactionType, 'REVERSAL');
      expect(redeemReversals.single.units, -(redeem!.units!));
      expect(earnReversals.single.loyaltyProgramId, programId);
    } finally {
      await disposeHarness(harness);
    }
  });
}
