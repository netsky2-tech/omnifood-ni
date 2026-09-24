import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_exceptions.dart';

void main() {
  group('DeviceSyncCredentialRecord', () {
    final validRecord = DeviceSyncCredentialRecord(
      credentialId: 'cred-1234-uuid',
      tenantId: 'tenant-abc-789',
      deviceId: 'pos-local-device-01',
      renewalSecret: 'sec_abcdef1234567890abcdef1234567890',
      credentialVersion: 1,
      expiresAt: DateTime.utc(2026, 12, 31, 23, 59, 59),
      scopes: const ['sync:push', 'sync:pull'],
    );

    test('creates and serializes valid device-sync-only credential record', () {
      expect(validRecord.credentialId, 'cred-1234-uuid');
      expect(validRecord.tenantId, 'tenant-abc-789');
      expect(validRecord.deviceId, 'pos-local-device-01');
      expect(validRecord.renewalSecret, 'sec_abcdef1234567890abcdef1234567890');
      expect(validRecord.credentialVersion, 1);
      expect(validRecord.expiresAt, DateTime.utc(2026, 12, 31, 23, 59, 59));
      expect(validRecord.scopes, ['sync:push', 'sync:pull']);

      final json = validRecord.toJson();
      expect(json['credentialId'], 'cred-1234-uuid');
      expect(json['tenantId'], 'tenant-abc-789');
      expect(json['deviceId'], 'pos-local-device-01');
      expect(json['renewalSecret'], 'sec_abcdef1234567890abcdef1234567890');
      expect(json['credentialVersion'], 1);
      expect(json['expiresAt'], '2026-12-31T23:59:59.000Z');
      expect(json['scopes'], ['sync:push', 'sync:pull']);

      final deserialized = DeviceSyncCredentialRecord.fromJson(json);
      expect(deserialized, equals(validRecord));
    });

    test('defaults scopes to fixed V1 sync:push and sync:pull when omitted', () {
      final defaultRecord = DeviceSyncCredentialRecord(
        credentialId: 'cred-1234-uuid',
        tenantId: 'tenant-abc-789',
        deviceId: 'pos-local-device-01',
        renewalSecret: 'sec_abcdef1234567890abcdef1234567890',
        credentialVersion: 1,
        expiresAt: DateTime.utc(2026, 12, 31, 23, 59, 59),
      );
      expect(defaultRecord.scopes, ['sync:push', 'sync:pull']);
    });

    test('accepts valid non-empty subsets of fixed V1 scopes', () {
      final pushOnly = validRecord.copyWith(scopes: const ['sync:push']);
      expect(pushOnly.scopes, ['sync:push']);

      final pullOnly = validRecord.copyWith(scopes: const ['sync:pull']);
      expect(pullOnly.scopes, ['sync:pull']);

      final reversed = validRecord.copyWith(scopes: const ['sync:pull', 'sync:push']);
      expect(reversed.scopes, ['sync:pull', 'sync:push']);
    });

    test('strictly rejects empty scopes', () {
      expect(
        () => validRecord.copyWith(scopes: const []),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('strictly rejects unknown scopes including legacy batch/inbound', () {
      expect(
        () => validRecord.copyWith(scopes: const ['sync:batch']),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(scopes: const ['sync:inbound']),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(scopes: const ['sync:push', 'sync:batch']),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(scopes: const ['admin']),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('strictly rejects duplicate scope entries', () {
      expect(
        () => validRecord.copyWith(scopes: const ['sync:push', 'sync:push']),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(scopes: const ['sync:pull', 'sync:pull']),
        throwsA(isA<ArgumentError>()),
      );
    });

    test('toString exposes zero secret material ([REDACTED] only)', () {
      final stringRep = validRecord.toString();
      expect(stringRep, contains('secret: [REDACTED]'));
      // Zero secret material must appear in toString output
      expect(stringRep.contains('sec_'), isFalse);
      expect(stringRep.contains('7890'), isFalse);
      expect(stringRep.contains('abcdef'), isFalse);
      expect(stringRep.contains('***'), isFalse);
    });

    test('validates renewal expiration', () {
      final expired = validRecord.copyWith(
        expiresAt: DateTime.utc(2020, 1, 1),
      );
      expect(expired.isRenewalExpired(DateTime.utc(2025, 1, 1)), isTrue);
      expect(validRecord.isRenewalExpired(DateTime.utc(2025, 1, 1)), isFalse);
    });

    test('accepts the optional tenant slug from provisioning responses and round-trips it', () {
      final withSlug = DeviceSyncCredentialRecord.fromJson(
        Map<String, dynamic>.from(validRecord.toJson())
          ..['slug'] = 'tenant-omnifood-managua',
      );
      expect(withSlug.slug, 'tenant-omnifood-managua');

      final json = withSlug.toJson();
      expect(json['slug'], 'tenant-omnifood-managua');
      expect(DeviceSyncCredentialRecord.fromJson(json).slug, 'tenant-omnifood-managua');

      final copied = validRecord.copyWith(slug: 'tenant-slug-copy');
      expect(copied.slug, 'tenant-slug-copy');
    });

    test('treats slug as pre-auth routing hint, not credential identity', () {
      // Slug is not part of equality: two records with identical exchange
      // material but different slugs are the same credential.
      final a = DeviceSyncCredentialRecord.fromJson(
        Map<String, dynamic>.from(validRecord.toJson())..['slug'] = 'slug-a',
      );
      final b = DeviceSyncCredentialRecord.fromJson(
        Map<String, dynamic>.from(validRecord.toJson())..['slug'] = 'slug-b',
      );
      expect(a, equals(b));
    });

    test('strictly rejects prohibited human credentials or tokens in fromJson', () {
      final prohibitedFieldsToTest = [
        'accessToken',
        'access_token',
        'refreshToken',
        'refresh_token',
        'password',
        'pin',
        'pinHash',
        'pin_hash',
        'totpSecret',
        'totpSecretSeed',
        'totp_secret_seed',
        'cashier',
        'cashierId',
        'cashier_id',
        'role',
        'permissions',
        'adminSecret',
        'admin_secret',
        'email',
        'userId',
        'user_id',
      ];

      for (final field in prohibitedFieldsToTest) {
        final badJson = Map<String, dynamic>.from(validRecord.toJson());
        badJson[field] = 'leak-or-sensitive-data';

        expect(
          () => DeviceSyncCredentialRecord.fromJson(badJson),
          throwsA(isA<DeviceSyncProhibitedFieldException>()),
          reason: 'Field $field should be strictly rejected',
        );
      }
    });

    test('defaults slug to empty string when the response omits it (legacy installs)', () {
      final jsonWithoutSlug = Map<String, dynamic>.from(validRecord.toJson())..remove('slug');
      expect(DeviceSyncCredentialRecord.fromJson(jsonWithoutSlug).slug, '');
    });

    test('rejects unexpected unknown keys outside allowlist in fromJson', () {
      final badJson = Map<String, dynamic>.from(validRecord.toJson());
      badJson['arbitraryExtraneousField'] = 'evil';

      expect(
        () => DeviceSyncCredentialRecord.fromJson(badJson),
        throwsA(isA<DeviceSyncProhibitedFieldException>()),
      );
    });

    test('requires non-empty required fields and positive version', () {
      expect(
        () => validRecord.copyWith(credentialId: ''),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(tenantId: ''),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(deviceId: ''),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(renewalSecret: ''),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(credentialVersion: 0),
        throwsA(isA<ArgumentError>()),
      );
      expect(
        () => validRecord.copyWith(credentialVersion: -1),
        throwsA(isA<ArgumentError>()),
      );
    });
  });
}
