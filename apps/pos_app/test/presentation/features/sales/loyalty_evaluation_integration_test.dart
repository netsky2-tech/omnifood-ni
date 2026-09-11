import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';

void main() {
  group('SaleViewModel Loyalty Integration', () {
    late LoyaltyEvaluationService evaluationService;

    setUp(() {
      evaluationService = const LoyaltyEvaluationService();
    });

    test('evaluateLoyalty retorna evaluación cuando hay customer y programas', () {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson:
              '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
          eligibilityRuleJson: '{"schemaVersion":1}',
        ),
      ];

      // Simulate: create a snapshot and evaluate
      final snapshot = _createSnapshot(
        customerId: 'cust-1',
        lines: [
          _createLine(productId: 'prod-1', quantity: 2, netAmount: 150.0),
          _createLine(productId: 'prod-2', quantity: 1, netAmount: 50.0),
        ],
      );

      final evaluation = evaluationService.evaluate(
        snapshot: snapshot,
        programs: programs,
        rewards: const [],
        balanceMap: const {'prog-1': 100},
      );

      expect(evaluation.programs.length, equals(1));
      expect(evaluation.programs.first.earningPreviewUnits, equals(20));
      expect(evaluation.programs.first.balanceUnits, equals(100));
      expect(evaluation.hasAnyEarning, isTrue);
    });

    test('evaluateLoyalty retorna vacío cuando no hay customer', () {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson:
              '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
          eligibilityRuleJson: '{"schemaVersion":1}',
        ),
      ];

      final snapshot = _createSnapshot(
        customerId: null, // no customer
        lines: [
          _createLine(productId: 'prod-1', quantity: 1, netAmount: 100.0),
        ],
      );

      final evaluation = evaluationService.evaluate(
        snapshot: snapshot,
        programs: programs,
        rewards: const [],
        balanceMap: const {},
      );

      // Should still evaluate earning but balance is 0
      expect(evaluation.programs.length, equals(1));
      expect(evaluation.programs.first.balanceUnits, equals(0));
      expect(evaluation.programs.first.eligibleRewards, isEmpty);
    });

    test('evaluateLoyalty re-evalúa cuando cambia el ticket', () {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson:
              '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
          eligibilityRuleJson: '{"schemaVersion":1}',
        ),
      ];

      // First evaluation: 100 NIO
      final snapshot1 = _createSnapshot(
        customerId: 'cust-1',
        lines: [
          _createLine(productId: 'prod-1', quantity: 1, netAmount: 100.0),
        ],
      );

      final evaluation1 = evaluationService.evaluate(
        snapshot: snapshot1,
        programs: programs,
        rewards: const [],
        balanceMap: const {},
      );

      expect(evaluation1.programs.first.earningPreviewUnits, equals(10));

      // Second evaluation: 250 NIO (ticket changed)
      final snapshot2 = _createSnapshot(
        customerId: 'cust-1',
        lines: [
          _createLine(productId: 'prod-1', quantity: 2, netAmount: 250.0),
        ],
      );

      final evaluation2 = evaluationService.evaluate(
        snapshot: snapshot2,
        programs: programs,
        rewards: const [],
        balanceMap: const {},
      );

      expect(evaluation2.programs.first.earningPreviewUnits, equals(25));
    });

    test('evaluateLoyalty limpia evaluación cuando se remueve customer', () {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson:
              '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
          eligibilityRuleJson: '{"schemaVersion":1}',
        ),
      ];

      // Evaluate with customer
      final snapshot1 = _createSnapshot(
        customerId: 'cust-1',
        lines: [
          _createLine(productId: 'prod-1', quantity: 1, netAmount: 100.0),
        ],
      );

      final evaluation1 = evaluationService.evaluate(
        snapshot: snapshot1,
        programs: programs,
        rewards: const [],
        balanceMap: const {},
      );

      expect(evaluation1.programs, isNotEmpty);

      // Evaluate without customer (simulating clearCustomer)
      final snapshot2 = _createSnapshot(
        customerId: null,
        lines: [
          _createLine(productId: 'prod-1', quantity: 1, netAmount: 100.0),
        ],
      );

      final evaluation2 = evaluationService.evaluate(
        snapshot: snapshot2,
        programs: programs,
        rewards: const [],
        balanceMap: const {},
      );

      // Should still have programs but no eligible rewards (no balance)
      expect(evaluation2.programs.length, equals(1));
      expect(evaluation2.programs.first.balanceUnits, equals(0));
      expect(evaluation2.programs.first.eligibleRewards, isEmpty);
    });

    test('evaluateLoyalty con rewards elegibles muestra nextReward', () {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson:
              '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
          eligibilityRuleJson: '{"schemaVersion":1}',
        ),
      ];

      final rewards = [
        RewardDefinitionLocal(
          id: 'rw-1',
          tenantId: 'tenant-1',
          loyaltyProgramId: 'prog-1',
          name: 'C\$50 descuento',
          rewardType: RewardType.discountAmount,
          costUnits: 100,
          benefitConfigJson: '{"amountNio":50}',
          status: RewardStatus.active,
          configVersion: 1,
          presentationOrder: 0,
        ),
        RewardDefinitionLocal(
          id: 'rw-2',
          tenantId: 'tenant-1',
          loyaltyProgramId: 'prog-1',
          name: 'Cappuccino gratis',
          rewardType: RewardType.freeProduct,
          costUnits: 50,
          benefitConfigJson: '{"productId":"prod-cc"}',
          status: RewardStatus.active,
          configVersion: 1,
          presentationOrder: 1,
        ),
      ];

      final snapshot = _createSnapshot(
        customerId: 'cust-1',
        lines: [
          _createLine(productId: 'prod-1', quantity: 1, netAmount: 100.0),
        ],
      );

      final evaluation = evaluationService.evaluate(
        snapshot: snapshot,
        programs: programs,
        rewards: rewards,
        balanceMap: const {'prog-1': 75}, // balance between rw-2 and rw-1
      );

      // Only rw-2 (costUnits=50) is eligible
      expect(evaluation.programs.first.eligibleRewards.length, equals(1));
      expect(evaluation.programs.first.eligibleRewards.first.rewardId, equals('rw-2'));
      expect(evaluation.nextReward?.rewardId, equals('rw-2'));
    });
  });
}

// Helper functions to create test data
LoyaltyTicketSnapshot _createSnapshot({
  String? customerId,
  required List<TicketLineSnapshot> lines,
}) {
  return LoyaltyTicketSnapshot(
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    terminalId: 'term-1',
    ticketId: 'ticket-test',
    customerId: customerId,
    occurredAt: DateTime.utc(2026, 9, 1, 12),
    lines: lines,
  );
}

TicketLineSnapshot _createLine({
  required String productId,
  required int quantity,
  required double netAmount,
  TicketLineSource source = TicketLineSource.normal,
}) {
  return TicketLineSnapshot(
    lineId: 'line-$productId',
    productId: productId,
    quantity: quantity,
    netAmount: netAmount,
    source: source,
  );
}
