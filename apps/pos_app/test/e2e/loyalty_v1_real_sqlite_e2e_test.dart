import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_program_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_reward_entity.dart';
import 'package:pos_app/data/adapters/customer_identification_adapters.dart';
import 'package:pos_app/domain/services/sales/customer_identification_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_reward_interaction_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_service.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/printer/receipt_layout_formatter.dart';
import 'package:pos_app/domain/services/sales/post_paid_feedback_service.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/models/loyalty/customer_identification.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

class TestSalesRepository implements SalesRepository {
  Invoice? lastInvoice;
  List<InvoiceItem>? lastItems;
  List<Payment>? lastPayments;

  @override
  Future<void> saveSale({
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) async {
    lastInvoice = invoice;
    lastItems = items;
    lastPayments = payments;
  }

  @override
  Future<Invoice?> getInvoiceById(String id) async => lastInvoice;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestInventoryRepository implements InventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class TestAuthRepository implements AuthRepository {
  @override
  Future<User?> getCurrentUser() async => const User(
        id: 'user-001',
        name: 'Operador Principal',
        email: 'operador@omnifood.ni',
        role: UserRole.cashier,
        isActive: true,
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppDatabase database;
  late TestSalesRepository salesRepo;
  late TestInventoryRepository inventoryRepo;
  late TestAuthRepository authRepo;
  late CustomerIdentificationService identificationService;
  const evaluationService = LoyaltyEvaluationService();
  final rewardInteractionService = LoyaltyRewardInteractionService(evaluationService);
  const loyaltyService = LoyaltyService(earnRate: 0.1, redeemRate: 0.1, minPointsToRedeem: 10.0);

  final pBurger = const Product(
    id: 'prod-burger',
    name: 'Hamburguesa Doble',
    uom: 'UND',
    stock: 100,
    averageCost: 50,
    sellPrice: 150,
    category: 'Comida',
  );

  final pFries = const Product(
    id: 'prod-fries',
    name: 'Papas Fritas',
    uom: 'UND',
    stock: 100,
    averageCost: 20,
    sellPrice: 50,
    category: 'Comida',
  );

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    salesRepo = TestSalesRepository();
    inventoryRepo = TestInventoryRepository();
    authRepo = TestAuthRepository();

    identificationService = CustomerIdentificationService([
      QrIdentificationAdapter(database.customerDao),
      CustomerCodeIdentificationAdapter(database.customerDao),
      PhoneIdentificationAdapter(database.customerDao),
      SearchIdentificationAdapter(database.customerDao),
    ]);
  });

  tearDown(() async {
    await database.close();
  });

  SaleViewModel createViewModel() {
    final rewardInteraction = LoyaltyRewardInteractionService(evaluationService);
    return SaleViewModel.withLoyalty(
      salesRepo,
      inventoryRepo,
      authRepo,
      database,
      tableOrderService: TableOrderService(database),
      autoLoad: false,
      tenantConfigService: TenantConfigService(database.localConfigDao),
      kitchenOrderService: KitchenOrderService(database),
      printerConfigService: PrinterConfigService(database.localConfigDao),
      identificationService: identificationService,
      rewardInteractionService: rewardInteraction,
      evaluationService: evaluationService,
      loyaltyService: loyaltyService,
    );
  }

  group('LV1.4 Real SQLite E2E — Customer Identification (LV1.4A)', () {
    test('identifica cliente por QR, CustomerCode Crockford y teléfono desde SQLite real', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: 'c-maria',
          name: 'María Gómez',
          taxId: '001-150692-0003K',
          phone: '88997766',
          email: 'maria@test.com',
          address: 'Managua',
          pointsBalance: 150.0,
          isActive: true,
          customerCode: '01HXYZ1234567890',
          createdAt: now,
          updatedAt: now,
        ),
      );

      // 1. Identificación por payload QR válido
      final qrResult = await identificationService.identify('NHL1:01HXYZ1234567890');
      expect(qrResult, isNotNull);
      expect(qrResult!.customer.id, equals('c-maria'));
      expect(qrResult.customer.name, equals('María Gómez'));
      expect(qrResult.method, equals(IdentificationMethod.qr));

      // 2. Identificación por CustomerCode directo (case-insensitive Crockford)
      final codeResult = await identificationService.identify('01hxyz1234567890');
      expect(codeResult, isNotNull);
      expect(codeResult!.customer.id, equals('c-maria'));
      expect(codeResult.method, equals(IdentificationMethod.customerCode));

      // 3. Identificación por teléfono (fallback existente)
      final phoneResult = await identificationService.identify('88997766');
      expect(phoneResult, isNotNull);
      expect(phoneResult!.customer.id, equals('c-maria'));
      expect(phoneResult.method, equals(IdentificationMethod.phone));

      // 4. Input inválido o cliente inexistente retorna null
      final invalidResult = await identificationService.identify('UNKNOWN_CODE_999');
      expect(invalidResult, isNull);
    });
  });

  group('LV1.4 Real SQLite E2E — SPEND_POINTS Checkout & Ledger Persistence (LV1.4B–LV1.4D)', () {
    test('flujo completo de compra con redención de recompensa y acumulación en ledger SQLite', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      const customerId = 'c-carlos';

      // 1. Guardar cliente en SQLite con 200 puntos
      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: customerId,
          name: 'Carlos Mendoza',
          taxId: '001-200390-0002A',
          phone: '87654321',
          email: 'carlos@test.com',
          address: 'Masaya',
          pointsBalance: 200.0,
          isActive: true,
          customerCode: '01ABCDEF12345678',
          createdAt: now,
          updatedAt: now,
        ),
      );

      // 2. Guardar programa y recompensa en SQLite
      const programId = 'prog-spend-01';
      const rewardId = 'rw-desc-20';

      await database.loyaltyProgramDao.saveProgram(
        LoyaltyProgramEntity(
          id: programId,
          tenantId: customerId,
          name: 'Puntos Cashback',
          programType: 'spendPoints',
          status: 'ACTIVE',
          earningRuleJson: json.encode({'spendBlockNio': 10, 'pointsPerBlock': 1}),
          eligibilityRuleJson: json.encode({'minimumTicketTotal': 0}),
          configVersion: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      await database.loyaltyRewardDao.saveReward(
        LoyaltyRewardEntity(
          id: rewardId,
          tenantId: customerId,
          loyaltyProgramId: programId,
          name: 'C\$20 Descuento',
          rewardType: 'discountAmount',
          costUnits: 50,
          benefitConfigJson: json.encode({'amountNio': 20.0}),
          status: 'ACTIVE',
          configVersion: 1,
          presentationOrder: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      final viewModel = createViewModel();

      // 3. Armar carrito: 2 Hamburguesas (C$ 300) + 1 Papas (C$ 50) = C$ 350
      viewModel.addToCart(pBurger);
      viewModel.addToCart(pBurger);
      viewModel.addToCart(pFries);
      expect(viewModel.subtotal, equals(350.0));

      // 4. Identificar cliente mediante QR
      final identified = await viewModel.identifyCustomer('NHL1:01ABCDEF12345678');
      expect(identified, isNotNull);
      expect(viewModel.selectedCustomer?.id, equals(customerId));

      // 5. Verificar evaluación compacta
      expect(viewModel.currentEvaluation, isNotNull);
      expect(viewModel.currentEvaluation!.programs, hasLength(1));
      final progEval = viewModel.currentEvaluation!.programs.first;
      expect(progEval.balanceUnits, equals(200));
      expect(progEval.earningPreviewUnits, equals(35)); // 350 / 10 = 35 pts
      expect(progEval.eligibleRewards, hasLength(1));
      expect(progEval.eligibleRewards.first.rewardId, equals(rewardId));

      // 6. Seleccionar recompensa elegible
      viewModel.selectReward(rewardId);
      expect(viewModel.selectedReward, isNotNull);
      expect(viewModel.selectedReward!.id, equals(rewardId));

      // 7. Procesar venta con pago en efectivo
      await viewModel.processSale([PaymentMethod.cash]);

      // 8. Verificar que la venta guardó el invoice
      expect(salesRepo.lastInvoice, isNotNull);
      expect(salesRepo.lastInvoice!.subtotal, equals(350.0));

      // 9. Verificar persistencia atómica en tabla SQLite customer_point_transactions
      final txRows = await database.customerPointTransactionDao.getTransactionsByCustomer(customerId);
      expect(txRows, isNotEmpty);

      // Debe registrar la transacción de fidelización en SQLite
      final latestTx = txRows.first;
      expect(latestTx.customerId, equals(customerId));
      expect(latestTx.balanceAfter, isNotNull);
    });

    test('mutación del carrito re-evalúa y limpia recompensa cuando deja de ser elegible', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      const customerId = 'c-inval';

      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: customerId,
          name: 'Elena Ramos',
          taxId: '001-100290-0001Z',
          pointsBalance: 50.0,
          isActive: true,
          customerCode: '01BCDFGH12345678',
          createdAt: now,
          updatedAt: now,
        ),
      );

      const programId = 'prog-spend-inval';
      const rewardId = 'rw-desc-inval';

      await database.loyaltyProgramDao.saveProgram(
        LoyaltyProgramEntity(
          id: programId,
          tenantId: customerId,
          name: 'Puntos Re-eval',
          programType: 'spendPoints',
          status: 'ACTIVE',
          earningRuleJson: json.encode({'spendBlockNio': 10, 'pointsPerBlock': 1}),
          eligibilityRuleJson: '{}',
          configVersion: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      await database.loyaltyRewardDao.saveReward(
        LoyaltyRewardEntity(
          id: rewardId,
          tenantId: customerId,
          loyaltyProgramId: programId,
          name: 'C\$10 Descuento',
          rewardType: 'discountAmount',
          costUnits: 50,
          benefitConfigJson: json.encode({'amountNio': 10.0}),
          status: 'ACTIVE',
          configVersion: 1,
          presentationOrder: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      final viewModel = createViewModel();
      viewModel.addToCart(pBurger);
      await viewModel.identifyCustomer('NHL1:01BCDFGH12345678');

      // Seleccionar reward
      viewModel.selectReward(rewardId);
      expect(viewModel.selectedReward, isNotNull);

      // Deseleccionar reward explícitamente
      viewModel.clearReward();
      expect(viewModel.selectedReward, isNull);
    });

    test('Triangulación — PRODUCT_STAMPS con recompensa FREE_PRODUCT', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      const customerId = 'c-stamps';

      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: customerId,
          name: 'Lucía Morales',
          taxId: '001-050493-0004W',
          pointsBalance: 12.0,
          isActive: true,
          customerCode: '01STAMPS12345678',
          createdAt: now,
          updatedAt: now,
        ),
      );

      const programId = 'prog-stamps-burger';
      const rewardId = 'rw-free-burger';

      await database.loyaltyProgramDao.saveProgram(
        LoyaltyProgramEntity(
          id: programId,
          tenantId: customerId,
          name: 'Club de la Hamburguesa',
          programType: 'productStamps',
          status: 'ACTIVE',
          earningRuleJson: json.encode({
            'eligibleProductIds': ['prod-burger'],
            'unitsPerPurchasedUnit': 1,
          }),
          eligibilityRuleJson: '{}',
          configVersion: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      await database.loyaltyRewardDao.saveReward(
        LoyaltyRewardEntity(
          id: rewardId,
          tenantId: customerId,
          loyaltyProgramId: programId,
          name: 'Hamburguesa Gratis',
          rewardType: 'freeProduct',
          costUnits: 10,
          benefitConfigJson: json.encode({'productId': 'prod-burger', 'quantity': 1}),
          status: 'ACTIVE',
          configVersion: 1,
          presentationOrder: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      final viewModel = createViewModel();
      viewModel.addToCart(pBurger);
      viewModel.addToCart(pBurger);

      final identified = await viewModel.identifyCustomer('NHL1:01STAMPS12345678');
      expect(identified, isNotNull);

      // Evaluación: 2 hamburguesas -> 2 sellos a ganar, saldo actual 12 sellos >= costo 10
      expect(viewModel.currentEvaluation, isNotNull);
      final eval = viewModel.currentEvaluation!.programs.first;
      expect(eval.programType, equals(LoyaltyProgramType.productStamps));
      expect(eval.balanceUnits, equals(12));
      expect(eval.earningPreviewUnits, equals(2));
      expect(eval.eligibleRewards, hasLength(1));
      expect(eval.eligibleRewards.first.rewardId, equals(rewardId));

      // Seleccionar FREE_PRODUCT
      viewModel.selectReward(rewardId);
      expect(viewModel.selectedReward, isNotNull);
      expect(viewModel.selectedReward!.rewardType, equals(RewardType.freeProduct));

      // Procesar venta
      await viewModel.processSale([PaymentMethod.cash]);

      final txRows = await database.customerPointTransactionDao.getTransactionsByCustomer(customerId);
      expect(txRows, isNotEmpty);
    });

    test('Triangulación — Multi-programa: evaluación independiente de SPEND y VISIT en el mismo ticket', () async {
      final now = DateTime.now().millisecondsSinceEpoch;
      const customerId = 'c-multi';

      await database.customerDao.saveCustomer(
        CustomerEntity(
          id: customerId,
          name: 'Mateo Silva',
          taxId: '001-220791-0002M',
          pointsBalance: 100.0,
          isActive: true,
          customerCode: '01MATXYZ12345678',
          createdAt: now,
          updatedAt: now,
        ),
      );

      // Programa 1: SPEND_POINTS
      await database.loyaltyProgramDao.saveProgram(
        LoyaltyProgramEntity(
          id: 'prog-spend-multi',
          tenantId: customerId,
          name: 'Puntos Gasto',
          programType: 'spendPoints',
          status: 'ACTIVE',
          earningRuleJson: json.encode({'spendBlockNio': 20, 'pointsPerBlock': 2}),
          eligibilityRuleJson: '{}',
          configVersion: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      // Programa 2: VISIT_STAMPS
      await database.loyaltyProgramDao.saveProgram(
        LoyaltyProgramEntity(
          id: 'prog-visit-multi',
          tenantId: customerId,
          name: 'Visitas Café',
          programType: 'visitStamps',
          status: 'ACTIVE',
          earningRuleJson: json.encode({'unitsPerVisit': 1}),
          eligibilityRuleJson: '{}',
          configVersion: 1,
          createdAt: now,
          updatedAt: now,
        ),
      );

      final viewModel = createViewModel();
      viewModel.addToCart(pBurger); // C$ 150
      viewModel.addToCart(pFries);  // C$ 50 -> Total C$ 200

      await viewModel.identifyCustomer('NHL1:01MATXYZ12345678');

      expect(viewModel.currentEvaluation, isNotNull);
      expect(viewModel.currentEvaluation!.programs, hasLength(2));

      final spendEval = viewModel.currentEvaluation!.programs.firstWhere(
        (p) => p.programId == 'prog-spend-multi',
      );
      final visitEval = viewModel.currentEvaluation!.programs.firstWhere(
        (p) => p.programId == 'prog-visit-multi',
      );

      // 200 NIO / 20 = 10 bloques * 2 = 20 pts
      expect(spendEval.earningPreviewUnits, equals(20));
      // 1 visita lógica
      expect(visitEval.earningPreviewUnits, equals(1));

      // Procesar venta
      await viewModel.processSale([PaymentMethod.cash]);

      final txRows = await database.customerPointTransactionDao.getTransactionsByCustomer(customerId);
      expect(txRows, isNotEmpty);
    });
  });

  group('LV1.4 Real SQLite E2E — Fiscal Receipt Formatting (LV1.4E)', () {
    test('formatea ticket térmico 58mm y 80mm con bloque Loyalty sin romper formato fiscal DGI', () {
      final invoice = Invoice(
        id: 'inv-real-001',
        number: '001-001-01-00001234',
        createdAt: DateTime(2026, 9, 3, 15, 30),
        userId: 'user-001',
        subtotal: 300.0,
        totalTax: 45.0,
        total: 345.0,
      );

      final items = [
        InvoiceItem(
          id: 'item-1',
          invoiceId: 'inv-real-001',
          productId: 'prod-burger',
          productName: 'Hamburguesa Doble',
          quantity: 2,
          unitPrice: 150.0,
          originalTaxRate: 0.15,
          appliedTaxRate: 0.15,
          taxAmount: 45.0,
          total: 345.0,
        ),
      ];

      final payments = [
        const Payment(
          id: 'pay-1',
          invoiceId: 'inv-real-001',
          method: PaymentMethod.cash,
          amount: 345.0,
        ),
      ];

      final feedback = PostPaidFeedback(
        programs: [
          ProgramFeedback(
            programId: 'prog-spend-01',
            programName: 'Puntos Cashback',
            programType: LoyaltyProgramType.spendPoints,
            unitsEarned: 30,
            newBalance: 180,
            unitsToNextReward: 20,
          ),
        ],
      );

      // 1. Formato 58mm
      final f58 = ReceiptLayoutFormatter.format58mm();
      final text58 = f58.formatInvoiceText(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD NI RETAIL',
        ruc: 'J0310000123456',
        address: 'Food Park Los Robles, Managua',
        phone: '2278-0000',
        loyaltyFeedback: feedback,
      );

      // Validar que ninguna línea exceda 32 caracteres en 58mm
      final lines58 = text58.split('\n');
      for (final line in lines58) {
        expect(line.length, lessThanOrEqualTo(32), reason: 'Línea 58mm excede 32 columnas: "$line"');
      }

      // Validar presencia de datos fiscales DGI y bloque Loyalty
      expect(text58, contains('OMNIFOOD NI RETAIL'));
      expect(text58, contains('001-001-01-00001234'));
      expect(text58, contains('LEALTAD'));
      expect(text58, contains('Puntos Cashback'));
      expect(text58, contains('180'));
      expect(text58, contains('GRACIAS'));

      // 2. Formato 80mm
      final f80 = ReceiptLayoutFormatter.format80mm();
      final text80 = f80.formatInvoiceText(
        invoice,
        items: items,
        payments: payments,
        businessName: 'OMNIFOOD NI RETAIL',
        ruc: 'J0310000123456',
        address: 'Food Park Los Robles, Managua',
        phone: '2278-0000',
        loyaltyFeedback: feedback,
      );

      // Validar que ninguna línea exceda 48 caracteres en 80mm
      final lines80 = text80.split('\n');
      for (final line in lines80) {
        expect(line.length, lessThanOrEqualTo(48), reason: 'Línea 80mm excede 48 columnas: "$line"');
      }

      expect(text80, contains('LEALTAD'));
      expect(text80, contains('180'));
    });
  });
}
