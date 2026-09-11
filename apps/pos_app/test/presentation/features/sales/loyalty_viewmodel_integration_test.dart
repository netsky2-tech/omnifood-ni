import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';

void main() {
  late LoyaltyEvaluationService service;

  setUp(() {
    service = const LoyaltyEvaluationService();
  });

  group('SaleViewModel loyalty integration', () {
    test('evaluate returns result with programs from Floor', () async {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson: json.encode({
            'spendBlockNio': 10,
            'pointsPerBlock': 1,
          }),
          eligibilityRuleJson: json.encode({'minimumTicketTotal': 0}),
          configVersion: 1,
        ),
      ];

      final rewards = [
        const RewardDefinitionLocal(
          id: 'rw-1',
          tenantId: 'tenant-1',
          loyaltyProgramId: 'prog-1',
          name: 'C\$50 descuento',
          rewardType: RewardType.discountAmount,
          costUnits: 100,
          benefitConfigJson: '{"amountNio": 50}',
          status: RewardStatus.active,
          configVersion: 1,
          presentationOrder: 0,
        ),
      ];

      final balanceMap = {
        'prog-1': 150,
      };

      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        ticketId: 'ticket-1',
        customerId: 'cust-1',
        occurredAt: DateTime.now(),
        lines: [
          TicketLineSnapshot(
            lineId: 'line-1',
            productId: 'prod-1',
            quantity: 3,
            netAmount: 135,
            source: TicketLineSource.normal,
          ),
        ],
      );

      final result = service.evaluate(
        snapshot: snapshot,
        programs: programs,
        rewards: rewards,
        balanceMap: balanceMap,
      );

      expect(result, isNotNull);
      expect(result.customerId, equals('cust-1'));
      expect(result.programs, hasLength(1));
      expect(result.programs.first.programName, equals('Puntos SOHO'));
      expect(result.programs.first.balanceUnits, equals(150));
      expect(result.programs.first.earningPreviewUnits, equals(13));
      expect(result.programs.first.eligibleRewards, isNotEmpty);
      expect(result.programs.first.nextReward, isNotNull);
    });

    test('evaluate returns empty programs when no programs', () {
      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        ticketId: 'ticket-1',
        customerId: 'cust-1',
        occurredAt: DateTime.now(),
        lines: [
          TicketLineSnapshot(
            lineId: 'line-1',
            productId: 'prod-1',
            quantity: 1,
            netAmount: 45,
            source: TicketLineSource.normal,
          ),
        ],
      );

      final result = service.evaluate(
        snapshot: snapshot,
        programs: [],
        rewards: [],
        balanceMap: {},
      );

      expect(result, isNotNull);
      expect(result.programs, isEmpty);
    });

    test('evaluate balances update when customer changes', () {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson: json.encode({
            'spendBlockNio': 10,
            'pointsPerBlock': 1,
          }),
          eligibilityRuleJson: json.encode({'minimumTicketTotal': 0}),
          configVersion: 1,
        ),
      ];

      final balanceMap = {
        'prog-1': 50,
      };

      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        ticketId: 'ticket-1',
        customerId: 'cust-2',
        occurredAt: DateTime.now(),
        lines: [
          TicketLineSnapshot(
            lineId: 'line-1',
            productId: 'prod-1',
            quantity: 1,
            netAmount: 45,
            source: TicketLineSource.normal,
          ),
        ],
      );

      final result = service.evaluate(
        snapshot: snapshot,
        programs: programs,
        rewards: [],
        balanceMap: balanceMap,
      );

      expect(result, isNotNull);
      expect(result.programs.first.balanceUnits, equals(50));
    });

    test('evaluate clears when customer is null', () {
      final programs = [
        LoyaltyProgramLocal(
          id: 'prog-1',
          tenantId: 'tenant-1',
          name: 'Puntos SOHO',
          programType: LoyaltyProgramType.spendPoints,
          status: LoyaltyProgramStatus.active,
          earningRuleJson: json.encode({
            'spendBlockNio': 10,
            'pointsPerBlock': 1,
          }),
          eligibilityRuleJson: json.encode({'minimumTicketTotal': 0}),
          configVersion: 1,
        ),
      ];

      final snapshot = LoyaltyTicketSnapshot(
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        terminalId: 'term-1',
        ticketId: 'ticket-1',
        occurredAt: DateTime.now(),
        lines: [
          TicketLineSnapshot(
            lineId: 'line-1',
            productId: 'prod-1',
            quantity: 1,
            netAmount: 45,
            source: TicketLineSource.normal,
          ),
        ],
      );

      final result = service.evaluate(
        snapshot: snapshot,
        programs: programs,
        rewards: [],
        balanceMap: {},
      );

      expect(result, isNotNull);
      expect(result.customerId, isEmpty);
      expect(result.programs.first.balanceUnits, equals(0));
    });
  });
}
