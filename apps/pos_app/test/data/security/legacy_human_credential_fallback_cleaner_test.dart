import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/security/legacy_human_credential_fallback_cleaner.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockSharedPreferences extends Mock implements SharedPreferences {}

void main() {
  group('LegacyHumanCredentialFallbackCleaner', () {
    const prohibitedKeys = [
      'access_token',
      'refresh_token_fallback',
      'refresh_tenant_id_fallback',
      'refresh_user_id_fallback',
    ];

    test(
      'removes all prohibited legacy keys while preserving unrelated keys',
      () async {
        SharedPreferences.setMockInitialValues({
          'access_token': 'secret-human-jwt',
          'refresh_token_fallback': 'secret-refresh-jwt',
          'refresh_tenant_id_fallback': 'tenant-uuid-1',
          'refresh_user_id_fallback': 'user-uuid-1',
          'cloud_auth_revocation_barrier_v1': '{"barrierVersion": 1}',
          'theme_mode': 'dark',
        });

        final prefs = await SharedPreferences.getInstance();
        for (final key in prohibitedKeys) {
          expect(prefs.containsKey(key), isTrue);
        }
        expect(prefs.containsKey('cloud_auth_revocation_barrier_v1'), isTrue);
        expect(prefs.containsKey('theme_mode'), isTrue);

        final cleaner = LegacyHumanCredentialFallbackCleaner(prefs);
        final result = await cleaner.clean();

        expect(result, isTrue);

        // Prohibited keys MUST be gone
        for (final key in prohibitedKeys) {
          expect(
            prefs.containsKey(key),
            isFalse,
            reason: 'Key $key should be removed',
          );
        }

        // Nonsecret keys MUST be preserved
        expect(prefs.containsKey('cloud_auth_revocation_barrier_v1'), isTrue);
        expect(
          prefs.getString('cloud_auth_revocation_barrier_v1'),
          '{"barrierVersion": 1}',
        );
        expect(prefs.getString('theme_mode'), 'dark');
      },
    );

    test('is idempotent when legacy keys are already absent', () async {
      SharedPreferences.setMockInitialValues({
        'cloud_auth_revocation_barrier_v1': '{"barrierVersion": 1}',
      });

      final prefs = await SharedPreferences.getInstance();
      final cleaner = LegacyHumanCredentialFallbackCleaner(prefs);

      expect(await cleaner.clean(), isTrue);
      expect(await cleaner.clean(), isTrue);
      expect(prefs.containsKey('cloud_auth_revocation_barrier_v1'), isTrue);
    });

    test(
      'never reads values of prohibited keys (no getString or get calls for secrets)',
      () async {
        final mockPrefs = _MockSharedPreferences();
        when(() => mockPrefs.containsKey(any())).thenReturn(true);
        when(() => mockPrefs.remove(any())).thenAnswer((_) async => true);

        final cleaner = LegacyHumanCredentialFallbackCleaner(mockPrefs);
        final result = await cleaner.clean();

        expect(result, isTrue);

        // Verify remove was called for all prohibited keys
        for (final key in prohibitedKeys) {
          verify(() => mockPrefs.remove(key)).called(1);
        }

        // Verify values were NEVER read
        verifyNever(() => mockPrefs.get(any()));
        verifyNever(() => mockPrefs.getString(any()));
      },
    );

    test(
      'safe failure: returns false and does not throw when remove fails or throws',
      () async {
        final mockPrefs = _MockSharedPreferences();
        when(() => mockPrefs.containsKey(any())).thenReturn(true);
        when(
          () => mockPrefs.remove('refresh_token_fallback'),
        ).thenAnswer((_) async => false);
        when(
          () => mockPrefs.remove('access_token'),
        ).thenThrow(Exception('SharedPreferences disk I/O error'));
        when(
          () => mockPrefs.remove('refresh_tenant_id_fallback'),
        ).thenAnswer((_) async => true);
        when(
          () => mockPrefs.remove('refresh_user_id_fallback'),
        ).thenAnswer((_) async => true);

        final cleaner = LegacyHumanCredentialFallbackCleaner(mockPrefs);

        final result = await cleaner.clean();

        expect(result, isFalse);
        // Verify values were NEVER read even on failure
        verifyNever(() => mockPrefs.get(any()));
        verifyNever(() => mockPrefs.getString(any()));
      },
    );
  });
}
