import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/loyalty/loyalty_program_entity.dart';
import 'package:pos_app/data/models/loyalty/loyalty_reward_entity.dart';
import 'package:pos_app/domain/services/sales/loyalty_sync_service.dart';

void main() {
  group('LoyaltySyncService', () {
    test('convertBackendProgramToEntity mapea campos correctamente', () {
      final backendProgram = {
        'id': 'prog-1',
        'tenant_id': 'tenant-1',
        'name': 'Puntos SOHO',
        'program_type': 'SPEND_POINTS',
        'status': 'ACTIVE',
        'starts_at': '2026-01-01T00:00:00.000Z',
        'ends_at': '2026-12-31T23:59:59.999Z',
        'earning_rule': {'spendBlockNio': 10, 'pointsPerBlock': 1},
        'eligibility_rule': {'minimumTicketTotal': 0},
        'config_version': 3,
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-06-15T12:00:00.000Z',
      };

      final entity = LoyaltySyncService.programFromJson(backendProgram);

      expect(entity.id, equals('prog-1'));
      expect(entity.tenantId, equals('tenant-1'));
      expect(entity.name, equals('Puntos SOHO'));
      expect(entity.programType, equals('SPEND_POINTS'));
      expect(entity.status, equals('ACTIVE'));
      expect(entity.startsAt, isNotNull);
      expect(entity.endsAt, isNotNull);
      expect(entity.configVersion, equals(3));
    });

    test('convertBackendRewardToEntity mapea campos correctamente', () {
      final backendReward = {
        'id': 'rw-1',
        'tenant_id': 'tenant-1',
        'loyalty_program_id': 'prog-1',
        'name': 'C\$50 descuento',
        'reward_type': 'DISCOUNT_AMOUNT',
        'cost_units': 100,
        'benefit_config': {'amountNio': 50},
        'status': 'ACTIVE',
        'starts_at': '2026-01-01T00:00:00.000Z',
        'ends_at': '2026-12-31T23:59:59.999Z',
        'presentation_order': 0,
        'config_version': 2,
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-06-15T12:00:00.000Z',
      };

      final entity = LoyaltySyncService.rewardFromJson(backendReward);

      expect(entity.id, equals('rw-1'));
      expect(entity.tenantId, equals('tenant-1'));
      expect(entity.loyaltyProgramId, equals('prog-1'));
      expect(entity.name, equals('C\$50 descuento'));
      expect(entity.rewardType, equals('DISCOUNT_AMOUNT'));
      expect(entity.costUnits, equals(100));
      expect(entity.presentationOrder, equals(0));
      expect(entity.configVersion, equals(2));
    });

    test('convertBackendRewardToEntity con FREE_PRODUCT', () {
      final backendReward = {
        'id': 'rw-2',
        'tenant_id': 'tenant-1',
        'loyalty_program_id': 'prog-1',
        'name': 'Cappuccino gratis',
        'reward_type': 'FREE_PRODUCT',
        'cost_units': 50,
        'benefit_config': {'productId': 'prod-cc', 'quantity': 1},
        'status': 'ACTIVE',
        'presentation_order': 1,
        'config_version': 1,
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-06-15T12:00:00.000Z',
      };

      final entity = LoyaltySyncService.rewardFromJson(backendReward);

      expect(entity.rewardType, equals('FREE_PRODUCT'));
      expect(entity.costUnits, equals(50));
      expect(entity.presentationOrder, equals(1));
    });

    test('convertBackendProgramToEntity con nulls en campos opcionales', () {
      final backendProgram = {
        'id': 'prog-2',
        'tenant_id': 'tenant-1',
        'name': 'Visitas',
        'program_type': 'VISIT_STAMPS',
        'status': 'DRAFT',
        'earning_rule': {'unitsPerVisit': 1},
        'eligibility_rule': {},
        'config_version': 1,
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-06-15T12:00:00.000Z',
      };

      final entity = LoyaltySyncService.programFromJson(backendProgram);

      expect(entity.startsAt, isNull);
      expect(entity.endsAt, isNull);
      expect(entity.status, equals('DRAFT'));
    });

    test('convertBackendRewardToEntity con nulls en campos opcionales', () {
      final backendReward = {
        'id': 'rw-3',
        'tenant_id': 'tenant-1',
        'loyalty_program_id': 'prog-2',
        'name': 'Visita gratis',
        'reward_type': 'FREE_PRODUCT',
        'cost_units': 10,
        'benefit_config': {'productId': 'prod-cc'},
        'status': 'ACTIVE',
        'presentation_order': 0,
        'config_version': 1,
        'created_at': '2026-01-01T00:00:00.000Z',
        'updated_at': '2026-06-15T12:00:00.000Z',
      };

      final entity = LoyaltySyncService.rewardFromJson(backendReward);

      expect(entity.startsAt, isNull);
      expect(entity.endsAt, isNull);
    });
  });
}
