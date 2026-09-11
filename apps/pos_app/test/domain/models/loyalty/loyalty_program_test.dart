import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';

void main() {
  group('LoyaltyProgramLocal — Domain Model', () {
    test('crea programa SPEND_POINTS con earningRule válida', () {
      final program = LoyaltyProgramLocal(
        id: 'prog-1',
        tenantId: 'tenant-1',
        name: 'Puntos SOHO',
        programType: LoyaltyProgramType.spendPoints,
        status: LoyaltyProgramStatus.active,
        earningRuleJson: '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
        eligibilityRuleJson: '{"schemaVersion":1}',
        configVersion: 1,
      );

      expect(program.id, equals('prog-1'));
      expect(program.programType, equals(LoyaltyProgramType.spendPoints));
      expect(program.isActive, isTrue);
      expect(program.isDraft, isFalse);
    });

    test('isActive returns true solo para ACTIVE', () {
      const active = LoyaltyProgramLocal(
        id: 'p1', tenantId: 't1', name: 'A',
        programType: LoyaltyProgramType.spendPoints,
        status: LoyaltyProgramStatus.active,
        earningRuleJson: '{}', eligibilityRuleJson: '{}', configVersion: 1,
      );
      const draft = LoyaltyProgramLocal(
        id: 'p2', tenantId: 't1', name: 'B',
        programType: LoyaltyProgramType.spendPoints,
        status: LoyaltyProgramStatus.draft,
        earningRuleJson: '{}', eligibilityRuleJson: '{}', configVersion: 1,
      );
      const inactive = LoyaltyProgramLocal(
        id: 'p3', tenantId: 't1', name: 'C',
        programType: LoyaltyProgramType.spendPoints,
        status: LoyaltyProgramStatus.inactive,
        earningRuleJson: '{}', eligibilityRuleJson: '{}', configVersion: 1,
      );

      expect(active.isActive, isTrue);
      expect(draft.isActive, isFalse);
      expect(inactive.isActive, isFalse);
    });

    test('withinWindow evalúa startsAt/endsAt con semántica semiabierta', () {
      final now = DateTime.utc(2026, 9, 1, 12);
      final program = LoyaltyProgramLocal(
        id: 'p1', tenantId: 't1', name: 'P',
        programType: LoyaltyProgramType.spendPoints,
        status: LoyaltyProgramStatus.active,
        earningRuleJson: '{}', eligibilityRuleJson: '{}', configVersion: 1,
        startsAt: DateTime.utc(2026, 8, 1),
        endsAt: DateTime.utc(2026, 10, 1),
      );

      expect(program.withinEarningWindow(now), isTrue);
      expect(program.withinEarningWindow(DateTime.utc(2026, 7, 15)), isFalse);
      expect(program.withinEarningWindow(DateTime.utc(2026, 10, 1)), isFalse);
    });

    test('withinWindow sin startsAt/endsAt siempre retorna true', () {
      const program = LoyaltyProgramLocal(
        id: 'p1', tenantId: 't1', name: 'P',
        programType: LoyaltyProgramType.spendPoints,
        status: LoyaltyProgramStatus.active,
        earningRuleJson: '{}', eligibilityRuleJson: '{}', configVersion: 1,
      );

      expect(program.withinEarningWindow(DateTime.now()), isTrue);
    });
  });

  group('RewardDefinitionLocal — Domain Model', () {
    test('crea reward DISCOUNT_AMOUNT con costo positivo', () {
      final reward = RewardDefinitionLocal(
        id: 'rw-1',
        tenantId: 'tenant-1',
        loyaltyProgramId: 'prog-1',
        name: 'C\$50 de descuento',
        rewardType: RewardType.discountAmount,
        costUnits: 100,
        benefitConfigJson: '{"schemaVersion":1,"amountNio":50}',
        status: RewardStatus.active,
        configVersion: 1,
        presentationOrder: 0,
      );

      expect(reward.costUnits, equals(100));
      expect(reward.rewardType, equals(RewardType.discountAmount));
      expect(reward.isActive, isTrue);
    });

    test('crea reward FREE_PRODUCT', () {
      final reward = RewardDefinitionLocal(
        id: 'rw-2',
        tenantId: 'tenant-1',
        loyaltyProgramId: 'prog-1',
        name: 'Cappuccino gratis',
        rewardType: RewardType.freeProduct,
        costUnits: 10,
        benefitConfigJson: '{"schemaVersion":1,"productId":"prod-cc","quantity":1}',
        status: RewardStatus.active,
        configVersion: 1,
        presentationOrder: 1,
      );

      expect(reward.rewardType, equals(RewardType.freeProduct));
      expect(reward.presentationOrder, equals(1));
    });

    test('isActive retorna true solo para ACTIVE', () {
      const active = RewardDefinitionLocal(
        id: 'r1', tenantId: 't1', loyaltyProgramId: 'p1', name: 'A',
        rewardType: RewardType.discountAmount, costUnits: 10,
        benefitConfigJson: '{}', status: RewardStatus.active,
        configVersion: 1, presentationOrder: 0,
      );
      const inactive = RewardDefinitionLocal(
        id: 'r2', tenantId: 't1', loyaltyProgramId: 'p1', name: 'B',
        rewardType: RewardType.discountAmount, costUnits: 10,
        benefitConfigJson: '{}', status: RewardStatus.inactive,
        configVersion: 1, presentationOrder: 0,
      );

      expect(active.isActive, isTrue);
      expect(inactive.isActive, isFalse);
    });

    test('withinWindow evalúa ventana de disponibilidad de la reward', () {
      final reward = RewardDefinitionLocal(
        id: 'r1', tenantId: 't1', loyaltyProgramId: 'p1', name: 'A',
        rewardType: RewardType.discountAmount, costUnits: 10,
        benefitConfigJson: '{}', status: RewardStatus.active,
        configVersion: 1, presentationOrder: 0,
        startsAt: DateTime.utc(2026, 9, 1),
        endsAt: DateTime.utc(2026, 9, 30),
      );

      expect(reward.withinAvailabilityWindow(DateTime.utc(2026, 9, 15)), isTrue);
      expect(reward.withinAvailabilityWindow(DateTime.utc(2026, 8, 15)), isFalse);
      expect(reward.withinAvailabilityWindow(DateTime.utc(2026, 10, 1)), isFalse);
    });
  });
}
