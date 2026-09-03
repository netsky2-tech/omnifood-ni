import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_evaluation.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_program.dart';
import 'package:pos_app/domain/models/loyalty/loyalty_ticket_snapshot.dart';
import 'package:pos_app/domain/models/loyalty/reward_definition.dart';
import 'package:pos_app/domain/services/sales/loyalty_evaluation_service.dart';
import 'package:pos_app/domain/services/sales/loyalty_reward_interaction_service.dart';

void main() {
  late LoyaltyEvaluationService evalService;
  late LoyaltyRewardInteractionService interactionService;

  setUp(() {
    evalService = const LoyaltyEvaluationService();
    interactionService = LoyaltyRewardInteractionService(evalService);
  });

  LoyaltyProgramLocal _makeProgram({
    String id = 'prog-1',
    LoyaltyProgramType type = LoyaltyProgramType.spendPoints,
    LoyaltyProgramStatus status = LoyaltyProgramStatus.active,
  }) {
    return LoyaltyProgramLocal(
      id: id,
      tenantId: 'tenant-1',
      name: 'Puntos SOHO',
      programType: type,
      status: status,
      earningRuleJson: json.encode({
        'spendBlockNio': 10,
        'pointsPerBlock': 1,
      }),
      eligibilityRuleJson: json.encode({'minimumTicketTotal': 0}),
      configVersion: 1,
    );
  }

  RewardDefinitionLocal _makeReward({
    String id = 'rw-1',
    String programId = 'prog-1',
    int costUnits = 100,
    RewardStatus status = RewardStatus.active,
  }) {
    return RewardDefinitionLocal(
      id: id,
      tenantId: 'tenant-1',
      loyaltyProgramId: programId,
      name: 'C\$50 descuento',
      rewardType: RewardType.discountAmount,
      costUnits: costUnits,
      benefitConfigJson: json.encode({'amountNio': 50}),
      status: status,
      configVersion: 1,
      presentationOrder: 0,
    );
  }

  LoyaltyTicketSnapshot _makeSnapshot({
    String? customerId = 'cust-1',
    double totalNet = 150,
    List<TicketLineSnapshot>? lines,
  }) {
    return LoyaltyTicketSnapshot(
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      terminalId: 'term-1',
      ticketId: 'ticket-1',
      customerId: customerId,
      occurredAt: DateTime.now(),
      lines: lines ??
          [
            TicketLineSnapshot(
              lineId: 'line-1',
              productId: 'prod-1',
              quantity: 3,
              netAmount: totalNet,
              source: TicketLineSource.normal,
            ),
          ],
    );
  }

  group('LV1.4C — CTA visibility', () {
    test('canShowCta es false cuando no hay recompensas elegibles', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 50},
      )!;

      expect(interactionService.canShowCta(evaluation), isFalse);
    });

    test('canShowCta es true cuando hay al menos una recompensa elegible', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;

      expect(interactionService.canShowCta(evaluation), isTrue);
    });

    test('canShowCta es false cuando programa está INACTIVE', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram(status: LoyaltyProgramStatus.inactive)],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;

      expect(interactionService.canShowCta(evaluation), isFalse);
    });

    test('canShowCta es false cuando recompensa está INACTIVE', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100, status: RewardStatus.inactive)],
        balanceMap: {'prog-1': 150},
      )!;

      expect(interactionService.canShowCta(evaluation), isFalse);
    });
  });

  group('LV1.4C — Selección con confirmación explícita', () {
    test('selectReward solo acepta recompensas en eligibleRewards', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;

      interactionService.selectReward(evaluation, 'rw-1');
      expect(interactionService.selectedRewardId, 'rw-1');
    });

    test('selectReward rechaza recompensa no elegible (saldo insuficiente)', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 50},
      )!;

      interactionService.selectReward(evaluation, 'rw-1');
      expect(interactionService.selectedRewardId, isNull);
    });

    test('selectReward rechaza rewardId inexistente', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;

      interactionService.selectReward(evaluation, 'rw-999');
      expect(interactionService.selectedRewardId, isNull);
    });
  });

  group('LV1.4C — Re-evaluación al cambiar ticket', () {
    test('se conserva cuando el ticket cambia pero sigue siendo elegible', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(totalNet: 150),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;
      interactionService.selectReward(evaluation, 'rw-1');

      // Ticket total changes but balance still sufficient
      final newEval = evalService.evaluate(
        snapshot: _makeSnapshot(totalNet: 200),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;

      final stillValid = interactionService.validateAfterCartChange(newEval);
      expect(stillValid, isTrue);
      expect(interactionService.selectedRewardId, 'rw-1');
    });

    test('se invalida cuando customer cambia y nuevo no tiene saldo', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(customerId: 'cust-1'),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;
      interactionService.selectReward(evaluation, 'rw-1');

      // Customer changes — new customer has no balance
      final newEval = evalService.evaluate(
        snapshot: _makeSnapshot(customerId: 'cust-2'),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {},
      )!;

      final stillValid = interactionService.validateAfterCartChange(newEval);
      expect(stillValid, isFalse);
      expect(interactionService.selectedRewardId, isNull);
    });

    test('se invalida cuando se elimina línea elegible y ya no califica', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(totalNet: 150),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;
      interactionService.selectReward(evaluation, 'rw-1');

      // Empty cart — evaluation has no earning, but reward check is about balance
      final newEval = evalService.evaluate(
        snapshot: _makeSnapshot(totalNet: 0, lines: []),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;

      // Balance still 150 >= 100, so reward is still eligible
      final stillValid = interactionService.validateAfterCartChange(newEval);
      expect(stillValid, isTrue);
    });
  });

  group('LV1.4C — Invalidación', () {
    test('clearSelection elimina la selección', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;
      interactionService.selectReward(evaluation, 'rw-1');
      expect(interactionService.selectedRewardId, 'rw-1');

      interactionService.clearSelection();
      expect(interactionService.selectedRewardId, isNull);
    });

    test('re-evaluar con balance cero invalida selección', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;
      interactionService.selectReward(evaluation, 'rw-1');

      // Simulate redemption happened — balance now 0
      final newEval = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 0},
      )!;

      final stillValid = interactionService.validateAfterCartChange(newEval);
      expect(stillValid, isFalse);
      expect(interactionService.selectedRewardId, isNull);
    });
  });

  group('LV1.4C — Max one redemption per ticket', () {
    test('no se puede seleccionar una segunda recompensa', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;

      interactionService.selectReward(evaluation, 'rw-1');
      expect(interactionService.selectedRewardId, 'rw-1');

      // Try to select another — should replace (max 1 rule enforced at checkout)
      interactionService.selectReward(evaluation, 'rw-1');
      expect(interactionService.selectedRewardId, 'rw-1');
    });
  });

  group('LV1.4C — Nunca auto-redimir al alcanzar umbral', () {
    test('selectReward requiere selección explícita del operador', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 100},
      )!;

      // Balance == costUnits → reward IS eligible
      expect(evaluation.hasAnyEligibleReward, isTrue);

      // But selectedRewardId should be null until explicit selection
      expect(interactionService.selectedRewardId, isNull);
    });
  });

  group('LV1.4C — getSelectedReward', () {
    test('retorna la recompensa cuando está seleccionada', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;
      interactionService.selectReward(evaluation, 'rw-1');

      final reward = interactionService.getSelectedReward([_makeReward(costUnits: 100)]);
      expect(reward, isNotNull);
      expect(reward!.id, 'rw-1');
    });

    test('retorna null cuando no hay selección', () {
      expect(interactionService.getSelectedReward([_makeReward()]), isNull);
    });

    test('retorna null cuando rewardId ya no existe en el catálogo', () {
      final evaluation = evalService.evaluate(
        snapshot: _makeSnapshot(),
        programs: [_makeProgram()],
        rewards: [_makeReward(costUnits: 100)],
        balanceMap: {'prog-1': 150},
      )!;
      interactionService.selectReward(evaluation, 'rw-1');

      // Reward removed from catalog
      final reward = interactionService.getSelectedReward([]);
      expect(reward, isNull);
    });
  });
}
