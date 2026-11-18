import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/entitlements/entitlement_snapshot.dart';

void main() {
  final issuedAt = DateTime.utc(2026, 1, 1, 0, 0, 0);
  final expiresAt = DateTime.utc(2026, 1, 2, 0, 0, 0);

  Map<String, Object?> validJson() => {
        'version': 1,
        'planCode': 'OPERACION',
        'status': 'active',
        'supportTier': 'standard',
        'capabilities': ['core.sales', 'inventory.retail'],
        'limits': {'limits.terminals': 1, 'limits.owner_accounts': null},
        'addOns': ['pack.retail'],
        'issuedAt': issuedAt.toIso8601String(),
        'expiresAt': expiresAt.toIso8601String(),
      };

  group('EntitlementSnapshot', () {
    test('roundtrips toJson → fromJson without loss', () {
      final snapshot = EntitlementSnapshot.fromJson(validJson());

      final restored = EntitlementSnapshot.fromJson(
        Map<String, Object?>.from(snapshot.toJson()),
      );

      expect(restored, equals(snapshot));
      expect(restored.version, 1);
      expect(restored.planCode, 'OPERACION');
      expect(restored.status, 'active');
      expect(restored.supportTier, 'standard');
      expect(restored.capabilities, ['core.sales', 'inventory.retail']);
      expect(restored.limits, {'limits.terminals': 1, 'limits.owner_accounts': null});
      expect(restored.addOns, ['pack.retail']);
      expect(restored.issuedAt, issuedAt);
      expect(restored.expiresAt, expiresAt);
    });

    test('empty() grants no premium capability and no limit', () {
      final empty = EntitlementSnapshot.empty();

      expect(empty.capabilities, isEmpty);
      expect(empty.limits, isEmpty);
      expect(empty.addOns, isEmpty);
      expect(empty.planCode, isNull);
      expect(empty.version, 0);
    });

    test('fromJson never throws on malformed payloads', () {
      // Wrong types everywhere — must degrade, not crash.
      final garbage = EntitlementSnapshot.fromJson(const {
        'version': 'not-a-number',
        'capabilities': 'not-a-list',
        'limits': 'not-a-map',
        'issuedAt': 42,
        'expiresAt': true,
      });
      expect(garbage.capabilities, isEmpty);
      expect(garbage.limits, isEmpty);
      expect(garbage.issuedAt, isNull);
      expect(garbage.expiresAt, isNull);

      // Structural garbage values inside otherwise correct containers.
      final partial = EntitlementSnapshot.fromJson(const {
        'version': 1,
        'capabilities': [123, null, 'core.sales'],
        'limits': {'ok': 3, 'bad': 'nope', 'nulled': null},
        'addOns': {'not': 'a list'},
      });
      expect(partial.capabilities, ['core.sales']);
      expect(partial.limits, {'ok': 3, 'nulled': null});
      expect(partial.addOns, isEmpty);
    });

    test('planCode null models sin_plan', () {
      final json = validJson()..['planCode'] = null;
      final snapshot = EntitlementSnapshot.fromJson(json);
      expect(snapshot.planCode, isNull);
    });

    test('isExpiredAt is true for missing expiresAt and for past dates', () {
      final now = DateTime.utc(2026, 1, 3);

      // No TTL at all: an unverifiable snapshot counts as expired (§6.6).
      expect(
        EntitlementSnapshot.empty().isExpiredAt(now),
        isTrue,
      );

      expect(
        EntitlementSnapshot(expiresAt: DateTime.utc(2026, 1, 2))
            .isExpiredAt(now),
        isTrue,
      );
      // Exactly at the expiry instant: expired.
      expect(
        EntitlementSnapshot(expiresAt: now).isExpiredAt(now),
        isTrue,
      );
      expect(
        EntitlementSnapshot(expiresAt: DateTime.utc(2026, 1, 4))
            .isExpiredAt(now),
        isFalse,
      );
    });

    test('equality is field-based so unchanged snapshots compare equal', () {
      expect(
        EntitlementSnapshot.fromJson(validJson()),
        EntitlementSnapshot.fromJson(validJson()),
      );
      final changed = validJson()..['version'] = 2;
      expect(
        EntitlementSnapshot.fromJson(validJson()),
        isNot(EntitlementSnapshot.fromJson(changed)),
      );
    });
  });
}
