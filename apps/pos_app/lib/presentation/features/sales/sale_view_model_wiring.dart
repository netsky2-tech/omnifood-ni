import 'package:pos_app/data/adapters/customer_identification_adapters.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/services/sync_service.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/sales/customer_identification_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_reward_interaction_service.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';

/// WHY THIS FILE EXISTS: a wiring defect (production constructing the VM with
/// the wrong constructor or the wrong arguments) can only be pinned by a test
/// that exercises the SAME code path production uses. A test that replicates
/// the construction by hand would not have caught the P3 loyalty defect: the
/// test's hand-built VM was correct while the till shipped inoperable. Every
/// production construction of [SaleViewModel] must go through this function
/// so the wiring test below (sale_view_model_loyalty_wiring_test.dart,
/// 'production wiring' group) fails the moment this file drifts.
///
/// The argument values are exactly the ones `main.dart` passed before the
/// extraction; only the construction site moved.
SaleViewModel buildSaleViewModel({
  required SalesRepository salesRepository,
  required InventoryRepository inventoryRepository,
  required AuthRepository authRepository,
  required AppDatabase database,
  SyncService? syncService,
  String deviceId = '',
}) {
  // One shared evaluation service: the reward interaction service reads the
  // evaluation through it, so both loyalty surfaces MUST receive the SAME
  // instance (matching LoyaltyRewardInteractionService's constructor contract).
  final evaluationService = LoyaltyEvaluationService();

  return SaleViewModel.withLoyalty(
    salesRepository,
    inventoryRepository,
    authRepository,
    database,
    tableOrderService: TableOrderService(database),
    autoLoad: true,
    tenantConfigService: null,
    kitchenOrderService: null,
    printerConfigService: null,
    printerPort: null,
    syncService: syncService,
    promotionsEngine: null,
    loyaltyService: null,
    terminalId: deviceId,
    // M11: inject the full identification adapter chain (QR, code, phone,
    // search). Without this, identifyCustomer returned null for EVERY input
    // in production — including manual code entry.
    identificationService: CustomerIdentificationService(
      [
        QrIdentificationAdapter(database.customerDao),
        CustomerCodeIdentificationAdapter(database.customerDao),
        PhoneIdentificationAdapter(database.customerDao),
        SearchIdentificationAdapter(database.customerDao),
      ],
    ),
    // P3 loyalty fix: without these two, _reEvaluateLoyalty returned early
    // (_evaluationService == null), currentEvaluation was ALWAYS null, both
    // loyalty widgets collapsed to SizedBox.shrink() and selectReward was a
    // no-op — customers accrued points they could never spend.
    rewardInteractionService:
        LoyaltyRewardInteractionService(evaluationService),
    evaluationService: evaluationService,
  );
}
