import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tenant_config.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/domain/services/config/business_mode_evaluator.dart';

void main() {
  group('BusinessModeEvaluator - TDD & Triangulation across Business Types', () {
    test('Case 1: Food Park QSR mode configuration evaluation', () {
      const config = TenantConfig(
        operationMode: TenantOperationMode.foodparkQsr,
        tenantId: 't-foodpark-01',
        tenantName: 'Food Park Central',
      );

      final evaluator = BusinessModeEvaluator(config);

      expect(evaluator.isFoodParkQsr, isTrue);
      expect(evaluator.isRestaurant, isFalse);
      expect(evaluator.isHybrid, isFalse);

      // Capability checks
      expect(evaluator.canUseTableService, isFalse);
      expect(evaluator.canUseBuzzerPager, isTrue);
      expect(evaluator.isSplitBillAllowed, isFalse);
      expect(evaluator.isSuggestedTipPromptEnabled, isFalse);

      // Workflow determination
      expect(
        evaluator.resolveWorkflow(hasActiveTable: false),
        CheckoutWorkflowType.fastCounterQsr,
      );
      expect(
        evaluator.resolveWorkflow(hasActiveTable: true),
        CheckoutWorkflowType.fastCounterQsr, // Forces QSR even if stale table
      );
    });

    test('Case 2: Restaurant (Fine Dining / Mesas) mode configuration evaluation', () {
      const config = TenantConfig(
        operationMode: TenantOperationMode.restaurant,
        tenantId: 't-rest-01',
        tenantName: 'Restaurante El Güegüense',
      );

      final evaluator = BusinessModeEvaluator(config);

      expect(evaluator.isFoodParkQsr, isFalse);
      expect(evaluator.isRestaurant, isTrue);
      expect(evaluator.isHybrid, isFalse);

      // Capability checks
      expect(evaluator.canUseTableService, isTrue);
      expect(evaluator.canUseBuzzerPager, isFalse);
      expect(evaluator.isSplitBillAllowed, isTrue);
      expect(evaluator.isSuggestedTipPromptEnabled, isTrue);

      // Workflow determination
      expect(
        evaluator.resolveWorkflow(hasActiveTable: true),
        CheckoutWorkflowType.restaurantTable,
      );
      expect(
        evaluator.resolveWorkflow(hasActiveTable: false),
        CheckoutWorkflowType.restaurantTable,
      );
    });

    test('Case 3: Hybrid mode configuration evaluation (Dual Counter & Table capability)', () {
      const config = TenantConfig(
        operationMode: TenantOperationMode.hybrid,
        tenantId: 't-hybrid-01',
        tenantName: 'Café & Bistro Híbrido',
      );

      final evaluator = BusinessModeEvaluator(config);

      expect(evaluator.isFoodParkQsr, isFalse);
      expect(evaluator.isRestaurant, isFalse);
      expect(evaluator.isHybrid, isTrue);

      // Capability checks: supports both
      expect(evaluator.canUseTableService, isTrue);
      expect(evaluator.canUseBuzzerPager, isTrue);
      expect(evaluator.isSplitBillAllowed, isTrue);
      expect(evaluator.isSuggestedTipPromptEnabled, isTrue);

      // Dynamic workflow determination based on active context
      expect(
        evaluator.resolveWorkflow(hasActiveTable: false),
        CheckoutWorkflowType.hybridCounter,
      );
      expect(
        evaluator.resolveWorkflow(hasActiveTable: true),
        CheckoutWorkflowType.hybridTable,
      );
    });

    test('Case 4: Custom override flags take precedence when explicitly configured', () {
      // Foodpark with explicit table service flag enabled in custom settings
      const config = TenantConfig(
        operationMode: TenantOperationMode.foodparkQsr,
        tableServiceEnabled: true,
      );

      final evaluator = BusinessModeEvaluator(config);
      expect(evaluator.canUseTableService, isTrue);
      expect(evaluator.isSplitBillAllowed, isTrue);
    });
  });
}
