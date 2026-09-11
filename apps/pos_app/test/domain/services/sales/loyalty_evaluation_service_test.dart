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

  group('LoyaltyEvaluationService — EvaluateTicketForLoyalty', () {
    group('SPEND_POINTS strategy', () {
      test('calcula earning preview correctamente', () {
        // 10 NIO por bloque, 1 punto por bloque
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 2,
              netAmount: 150.0,
              source: TicketLineSource.normal,
            ),
            TicketLineSnapshot(
              lineId: 'l2',
              productId: 'prod-2',
              quantity: 1,
              netAmount: 50.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs.length, equals(1));
        // Total net: 200 NIO / 10 = 20 bloques * 1 punto = 20 puntos
        expect(evaluation.programs.first.earningPreviewUnits, equals(20));
        expect(evaluation.hasAnyEarning, isTrue);
      });

      test('excluye líneas LOYALTY_REWARD del earning', () {
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 2,
              netAmount: 150.0,
              source: TicketLineSource.normal,
            ),
            TicketLineSnapshot(
              lineId: 'l2',
              productId: 'prod-free',
              quantity: 1,
              netAmount: 0.0,
              source: TicketLineSource.loyaltyReward,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        // Solo la línea normal: 150 / 10 = 15 * 1 = 15 puntos
        expect(evaluation.programs.first.earningPreviewUnits, equals(15));
      });

      test('usa floor() para bloques fraccionarios', () {
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 25.0, // 25 / 10 = 2.5 → floor = 2
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs.first.earningPreviewUnits, equals(2));
      });
    });

    group('PRODUCT_STAMPS strategy', () {
      test('cuenta cantidades enteras de productos elegibles', () {
        final programs = [
          LoyaltyProgramLocal(
            id: 'prog-2',
            tenantId: 'tenant-1',
            name: 'Sellos Café',
            programType: LoyaltyProgramType.productStamps,
            status: LoyaltyProgramStatus.active,
            earningRuleJson:
                '{"schemaVersion":1,"type":"PRODUCT_STAMPS","eligibleProductIds":["prod-cc","prod-latte"]}',
            eligibilityRuleJson: '{"schemaVersion":1}',
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-cc',
              quantity: 2,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
            TicketLineSnapshot(
              lineId: 'l2',
              productId: 'prod-latte',
              quantity: 1,
              netAmount: 80.0,
              source: TicketLineSource.normal,
            ),
            TicketLineSnapshot(
              lineId: 'l3',
              productId: 'prod-croissant',
              quantity: 3,
              netAmount: 60.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        // Solo prod-cc (2) + prod-latte (1) = 3 sellos
        expect(evaluation.programs.first.earningPreviewUnits, equals(3));
      });

      test('ignora cantidades fraccionarias', () {
        final programs = [
          LoyaltyProgramLocal(
            id: 'prog-2',
            tenantId: 'tenant-1',
            name: 'Sellos Café',
            programType: LoyaltyProgramType.productStamps,
            status: LoyaltyProgramStatus.active,
            earningRuleJson:
                '{"schemaVersion":1,"type":"PRODUCT_STAMPS","eligibleProductIds":["prod-cc"]}',
            eligibilityRuleJson: '{"schemaVersion":1}',
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-cc',
              quantity: 3, // quantity is int, so always whole
              netAmount: 150.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs.first.earningPreviewUnits, equals(3));
      });

      test('no cuenta líneas LOYALTY_REWARD para stamps', () {
        final programs = [
          LoyaltyProgramLocal(
            id: 'prog-2',
            tenantId: 'tenant-1',
            name: 'Sellos Café',
            programType: LoyaltyProgramType.productStamps,
            status: LoyaltyProgramStatus.active,
            earningRuleJson:
                '{"schemaVersion":1,"type":"PRODUCT_STAMPS","eligibleProductIds":["prod-cc"]}',
            eligibilityRuleJson: '{"schemaVersion":1}',
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-cc',
              quantity: 2,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
            TicketLineSnapshot(
              lineId: 'l2',
              productId: 'prod-cc',
              quantity: 1,
              netAmount: 0.0,
              source: TicketLineSource.loyaltyReward,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs.first.earningPreviewUnits, equals(2));
      });
    });

    group('VISIT_STAMPS strategy', () {
      test('produce máximo una unidad lógica de visita por ticket', () {
        final programs = [
          LoyaltyProgramLocal(
            id: 'prog-3',
            tenantId: 'tenant-1',
            name: 'Visitas',
            programType: LoyaltyProgramType.visitStamps,
            status: LoyaltyProgramStatus.active,
            earningRuleJson:
                '{"schemaVersion":1,"type":"VISIT_STAMPS","unitsPerVisit":3}',
            eligibilityRuleJson: '{"schemaVersion":1}',
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 5,
              netAmount: 300.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        // unitsPerVisit = 3, siempre 1 visita por ticket
        expect(evaluation.programs.first.earningPreviewUnits, equals(3));
      });
    });

    group('Program filtering', () {
      test('no evalúa programas INACTIVE', () {
        final programs = [
          LoyaltyProgramLocal(
            id: 'prog-1',
            tenantId: 'tenant-1',
            name: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            status: LoyaltyProgramStatus.inactive,
            earningRuleJson:
                '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
            eligibilityRuleJson: '{"schemaVersion":1}',
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs, isEmpty);
        expect(evaluation.hasAnyEarning, isFalse);
      });

      test('no evalúa programas fuera de ventana temporal', () {
        final programs = [
          LoyaltyProgramLocal(
            id: 'prog-1',
            tenantId: 'tenant-1',
            name: 'Puntos SOHO',
            programType: LoyaltyProgramType.spendPoints,
            status: LoyaltyProgramStatus.active,
            startsAt: DateTime.utc(2026, 10, 1), // futuro
            endsAt: DateTime.utc(2026, 12, 31),
            earningRuleJson:
                '{"schemaVersion":1,"type":"SPEND_POINTS","spendBlockNio":10,"pointsPerBlock":1}',
            eligibilityRuleJson: '{"schemaVersion":1}',
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 15), // antes de startsAt
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs, isEmpty);
      });

      test('evalúa múltiples programas', () {
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
          LoyaltyProgramLocal(
            id: 'prog-2',
            tenantId: 'tenant-1',
            name: 'Sellos Café',
            programType: LoyaltyProgramType.productStamps,
            status: LoyaltyProgramStatus.active,
            earningRuleJson:
                '{"schemaVersion":1,"type":"PRODUCT_STAMPS","eligibleProductIds":["prod-cc"]}',
            eligibilityRuleJson: '{"schemaVersion":1}',
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-cc',
              quantity: 3,
              netAmount: 150.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs.length, equals(2));
        expect(evaluation.totalEarningPreviewUnits, greaterThan(0));
      });
    });

    group('Balance and eligible rewards', () {
      test('retorna balance por programa desde balanceMap', () {
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {'prog-1': 150},
        );

        expect(evaluation.programs.first.balanceUnits, equals(150));
      });

      test('retorna rewards elegibles según balance', () {
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: rewards,
          balanceMap: const {'prog-1': 75}, // balance < costUnits de rw-1
        );

        // Solo rw-2 (costUnits=50) es elegible con balance=75
        expect(evaluation.programs.first.eligibleRewards.length, equals(1));
        expect(evaluation.programs.first.eligibleRewards.first.rewardId, equals('rw-2'));
      });

      test('nextReward retorna la de menor costo', () {
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: rewards,
          balanceMap: const {'prog-1': 200},
        );

        // Ambas elegibles, nextReward es la de menor costo (rw-2, 50)
        expect(evaluation.nextReward?.rewardId, equals('rw-2'));
      });
    });

    group('Edge cases', () {
      test('sin programas retorna evaluación vacía', () {
        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: const [],
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs, isEmpty);
        expect(evaluation.hasAnyEarning, isFalse);
        expect(evaluation.hasAnyEligibleReward, isFalse);
        expect(evaluation.totalEarningPreviewUnits, equals(0));
      });

      test('sin líneas retorna earning = 0', () {
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: const [],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs.length, equals(1));
        expect(evaluation.programs.first.earningPreviewUnits, equals(0));
      });

      test('con todas las líneas LOYALTY_REWARD, earning = 0', () {
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

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-free-1',
              quantity: 1,
              netAmount: 0.0,
              source: TicketLineSource.loyaltyReward,
            ),
            TicketLineSnapshot(
              lineId: 'l2',
              productId: 'prod-free-2',
              quantity: 2,
              netAmount: 0.0,
              source: TicketLineSource.loyaltyReward,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: const [],
          balanceMap: const {},
        );

        expect(evaluation.programs.first.earningPreviewUnits, equals(0));
      });

      test('rewards de otros programas no se incluyen', () {
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
            id: 'rw-other',
            tenantId: 'tenant-1',
            loyaltyProgramId: 'prog-other', // otro programa
            name: 'Reward de otro programa',
            rewardType: RewardType.discountAmount,
            costUnits: 10,
            benefitConfigJson: '{}',
            status: RewardStatus.active,
            configVersion: 1,
            presentationOrder: 0,
          ),
        ];

        final ticket = LoyaltyTicketSnapshot(
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          terminalId: 'term-1',
          ticketId: 'ticket-1',
          customerId: 'cust-1',
          occurredAt: DateTime.utc(2026, 9, 1, 12),
          lines: [
            TicketLineSnapshot(
              lineId: 'l1',
              productId: 'prod-1',
              quantity: 1,
              netAmount: 100.0,
              source: TicketLineSource.normal,
            ),
          ],
        );

        final evaluation = service.evaluate(
          snapshot: ticket,
          programs: programs,
          rewards: rewards,
          balanceMap: const {'prog-1': 100},
        );

        expect(evaluation.programs.first.eligibleRewards, isEmpty);
      });
    });
  });
}
