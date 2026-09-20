import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
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
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../support/loyalty_release_harness.dart';

// Port fakes for the B1 evaluation probe. Justification: SalesRepository,
// InventoryRepository and AuthRepository are I/O ports for sale persistence,
// catalog loading and session identity. They cannot affect tenant resolution
// or the Loyalty calculation: the probe exercises only the production
// evaluation path (real Floor DAOs + real Loyalty services on the migrated
// database) with autoLoad disabled and never calls processSale. Same
// established pattern as test/e2e/loyalty_v1_real_sqlite_e2e_test.dart.
class _ProbeSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ProbeInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _ProbeAuthRepository implements AuthRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const deviceTenantId = 'tenant-foodpark-losrobles-01';
  const customerId = 'c-customer-9842';
  const customerCode = '01B1TEST00000001';
  const programId = 'prog-spend-device-tenant';

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Future<LoyaltyReleaseHarness> createHarness() async {
    final directory = await Directory.systemTemp.createTemp(
      'loyalty_release_probe_',
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

  group('Loyalty release harness — migrated file-backed SQLite baseline', () {
    test('[CONTROL-sqlite-schema] migrations 10->54 build the Loyalty schema '
        'and it survives close/reopen', () async {
      final harness = await createHarness();
      try {
        // Pre-open guard: the file must be the untouched v10 baseline, so a
        // missing/empty file cannot silently fall into Floor onCreate.
        await harness.verifyLegacyBaseline();
        final db = await harness.openMigratedDatabase();
        expect(
          await LoyaltyReleaseHarness.userVersion(db),
          LoyaltyReleaseHarness.currentSchemaVersion,
          reason: 'the migrated file must reach the current schema version',
        );
        final expected = LoyaltyReleaseHarness.requiredLoyaltyColumns;
        for (final entry in expected.entries) {
          expect(
            await LoyaltyReleaseHarness.tableColumns(db, entry.key),
            containsAll(entry.value),
            reason: 'migrated ${entry.key} must expose all probe columns',
          );
        }
        await harness.close();

        // Restart boundary: reopen the same file through Floor; the Loyalty
        // schema must survive and real DAOs must run against it.
        final reopened = await harness.openMigratedDatabase();
        for (final table in expected.keys) {
          expect(
            await LoyaltyReleaseHarness.tableColumns(reopened, table),
            containsAll(expected[table]!),
          );
        }
        expect(
          await reopened.loyaltyProgramDao.getActivePrograms(deviceTenantId),
          isEmpty,
          reason: 'real DAO queries must run against the migrated schema',
        );
      } finally {
        await disposeHarness(harness);
      }
    });

    test('[B4-sqlite] migrated SQLite rejects two ledger movements with '
        'distinct ids sharing one idempotency key', () async {
      final harness = await createHarness();
      try {
        final db = await harness.openMigratedDatabase();
        final now = DateTime.now().millisecondsSinceEpoch;
        Map<String, Object?> movement(String id) => {
          'id': id,
          'customer_id': customerId,
          'type': 'earn',
          'points': 15.0,
          'balance_after': 15.0,
          'conversion_rate': 0.1,
          'created_at': now,
          'sync_status': 'pending',
          'loyalty_program_id': programId,
          'ticket_id': 'ticket-b4-1',
          'transaction_type': 'EARN',
          'units': 15,
          'idempotency_key': 'loyalty:earn:$deviceTenantId:ticket-b4-1',
          'origin': 'POS',
        };

        await db.database.insert(
          'customer_point_transactions',
          movement('ledger-b4-first'),
        );

        // Correct behavior: the database must enforce ledger idempotency
        // (arch §5.3) with a real SQLite uniqueness violation. RED until T2
        // adds the migrated unique constraint; today the duplicate is
        // accepted, so no DatabaseException is emitted at all.
        await expectLater(
          db.database.insert(
            'customer_point_transactions',
            movement('ledger-b4-duplicate'),
          ),
          throwsA(
            isA<DatabaseException>().having(
              (error) => error.toString(),
              'resultCode',
              contains('UNIQUE constraint failed'),
            ),
          ),
          reason: '[B4-sqlite] duplicate idempotency key must be rejected by '
              'the migrated SQLite ledger with a uniqueness violation',
        );
      } finally {
        await disposeHarness(harness);
      }
    });

    test('[B9] migrated customers table supports real CustomerDao '
        'save/read by customer_code', () async {
      final harness = await createHarness();
      try {
        final db = await harness.openMigratedDatabase();

        // Correct behavior: the production customer path (save + Crockford
        // code lookup) must work on a migrated database. RED today because
        // no migration 10->53 creates `customers.customer_code` (the column
        // only exists on Floor-onCreate fresh installs), so the generated
        // saveCustomer INSERT fails on the migrated schema.
        await db.customerDao.saveCustomer(
          CustomerEntity(
            id: customerId,
            name: 'Cliente Aislado B9',
            taxId: '001-150692-0003K',
            phone: '88990011',
            pointsBalance: 120.0,
            isActive: true,
            customerCode: customerCode,
            createdAt: DateTime.now().millisecondsSinceEpoch,
            updatedAt: DateTime.now().millisecondsSinceEpoch,
          ),
        );

        final loaded = await db.customerDao.getCustomerByCode(customerCode);
        expect(
          loaded,
          isNotNull,
          reason: '[B9] customer saved through the real DAO must be readable '
              'by customer_code on the migrated database',
        );
        expect(loaded!.id, customerId);
      } finally {
        await disposeHarness(harness);
      }
    });
  });

  group('Loyalty release harness — B1 device-tenant evaluation baseline', () {
    const rewardId = 'rw-spend-device-tenant';

    test('[B1] production evaluation path finds the program seeded under the '
        'device tenant, never under the customer id', () async {
      final harness = await createHarness();
      try {
        final db = await harness.openMigratedDatabase();
        final now = DateTime.now().millisecondsSinceEpoch;

        // The device tenant MUST come from device configuration
        // (`local_configs['tenant_id']`), never from the customer id and never
        // from the session. T4 resolves tenant context from
        // `TenantConfigService.getTenantConfig().tenantId`; seeding it here
        // means [B1] turns green exactly when that production fix lands.
        await db.localConfigDao.saveConfig(
          LocalConfigEntity(
            key: TenantConfigService.tenantIdKey,
            value: deviceTenantId,
            description: 'Device tenant for the release probe',
          ),
        );
        expect(
          (await TenantConfigService(db.localConfigDao).getTenantConfig())
              .tenantId,
          deviceTenantId,
          reason: '[B1] the device tenant must be readable from local '
              'configuration before the program lookup is asserted',
        );

        // Program/reward seeded through the real Loyalty DAOs under the REAL
        // device tenant id, which is deliberately different from the customer
        // id (arch §5: programs are tenant-scoped).
        await db.loyaltyProgramDao.saveProgram(
          LoyaltyProgramEntity(
            id: programId,
            tenantId: deviceTenantId,
            name: 'Puntos Device Tenant',
            programType: 'spendPoints',
            status: 'ACTIVE',
            earningRuleJson: '{"spendBlockNio": 10, "pointsPerBlock": 1}',
            eligibilityRuleJson: '{"minimumTicketTotal": 0}',
            configVersion: 1,
            createdAt: now,
            updatedAt: now,
          ),
        );
        await db.loyaltyRewardDao.saveReward(
          LoyaltyRewardEntity(
            id: rewardId,
            tenantId: deviceTenantId,
            loyaltyProgramId: programId,
            name: 'C\$20 Descuento',
            rewardType: 'discountAmount',
            costUnits: 50,
            benefitConfigJson: '{"amountNio": 20.0}',
            status: 'ACTIVE',
            configVersion: 1,
            presentationOrder: 1,
            createdAt: now,
            updatedAt: now,
          ),
        );

        // Customer persisted through the real CustomerDao, identified by its
        // customer_code (T2a-repaired column), with a distinct id.
        await db.customerDao.saveCustomer(
          CustomerEntity(
            id: customerId,
            name: 'Cliente B1 Device Tenant',
            taxId: '001-150692-0004J',
            phone: '88991122',
            pointsBalance: 200.0,
            isActive: true,
            customerCode: customerCode,
            createdAt: now,
            updatedAt: now,
          ),
        );

        const evaluationService = LoyaltyEvaluationService();
        final viewModel = SaleViewModel.withLoyalty(
          _ProbeSalesRepository(),
          _ProbeInventoryRepository(),
          _ProbeAuthRepository(),
          db,
          tableOrderService: TableOrderService(db),
          autoLoad: false,
          tenantConfigService: TenantConfigService(db.localConfigDao),
          kitchenOrderService: KitchenOrderService(db),
          printerConfigService: PrinterConfigService(db.localConfigDao),
          identificationService: CustomerIdentificationService([
            QrIdentificationAdapter(db.customerDao),
            CustomerCodeIdentificationAdapter(db.customerDao),
            PhoneIdentificationAdapter(db.customerDao),
            SearchIdentificationAdapter(db.customerDao),
          ]),
          rewardInteractionService:
              LoyaltyRewardInteractionService(evaluationService),
          evaluationService: evaluationService,
          loyaltyService: const LoyaltyService(),
        );

        // C\$350 ticket: 2x burger (150) + 1x fries (50).
        viewModel.addToCart(
          const Product(
            id: 'prod-b1-burger',
            name: 'Hamburguesa B1',
            uom: 'UND',
            stock: 100,
            averageCost: 50,
            sellPrice: 150,
            category: 'Comida',
          ),
        );
        viewModel.addToCart(
          const Product(
            id: 'prod-b1-fries',
            name: 'Papas B1',
            uom: 'UND',
            stock: 100,
            averageCost: 20,
            sellPrice: 50,
            category: 'Comida',
          ),
        );

        // Production identification path: the customer is resolved by its
        // customer_code, and selection triggers the real _reEvaluateLoyalty.
        final identified = await viewModel.identifyCustomer(
          'NHL1:$customerCode',
        );
        expect(identified, isNotNull);
        expect(viewModel.selectedCustomer?.id, customerId);

        // Correct behavior (arch §9.6): program lookup must be scoped to the
        // DEVICE tenant, never to _selectedCustomer.id. RED today because
        // sale_view_model.dart queries getActivePrograms(customer.id) and no
        // program exists under the customer id.
        final evaluation = viewModel.currentEvaluation;
        expect(
          evaluation,
          isNotNull,
          reason: '[B1] the device-tenant program must be evaluated',
        );
        final programEval = evaluation!.programs
            .where((p) => p.programId == programId)
            .toList();
        expect(
          programEval,
          hasLength(1),
          reason: '[B1] the program seeded under the device tenant must be '
              'found and evaluated (not scoped by the customer id)',
        );
        expect(programEval.single.balanceUnits, 200);
        expect(programEval.single.earningPreviewUnits, 35); // 350 / 10
        expect(
          programEval.single.eligibleRewards.map((r) => r.rewardId),
          contains(rewardId),
        );
      } finally {
        await disposeHarness(harness);
      }
    });
  });
}
