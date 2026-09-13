import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_app/data/security/shared_preferences_cloud_revocation_barrier_store.dart';
import 'package:pos_app/domain/security/cloud_revocation_barrier.dart';

class _MockSharedPreferences extends Mock implements SharedPreferences {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const barrierKey = 'cloud_auth_revocation_barrier_v1';

  group('SharedPreferencesCloudRevocationBarrierStore', () {
    test('absent key returns null', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesCloudRevocationBarrierStore();
      final barrier = await store.readBarrier();
      expect(barrier, isNull);
    });

    test('successful write and read roundtrip with generation', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesCloudRevocationBarrierStore();
      final now = DateTime.utc(2026, 3, 30, 12, 0, 0);

      await store.writeBarrier(
        RevocationBarrier(revokedAtUtc: now, generation: BigInt.from(42)),
      );

      final recovered = await store.readBarrier();
      expect(recovered, isNotNull);
      expect(recovered!.revokedAtUtc, now);
      expect(recovered.generation, BigInt.from(42));
    });

    test('successful write and read roundtrip without generation', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesCloudRevocationBarrierStore();
      final now = DateTime.utc(2026, 3, 30, 15, 30, 0);

      await store.writeBarrier(RevocationBarrier(revokedAtUtc: now));

      final recovered = await store.readBarrier();
      expect(recovered, isNotNull);
      expect(recovered!.revokedAtUtc, now);
      expect(recovered.generation, isNull);
    });

    test('clearBarrier successfully removes barrier', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesCloudRevocationBarrierStore();

      await store.writeBarrier(
        RevocationBarrier(
          revokedAtUtc: DateTime.utc(2026, 1, 1),
          generation: BigInt.one,
        ),
      );
      expect(await store.readBarrier(), isNotNull);

      await store.clearBarrier();
      expect(await store.readBarrier(), isNull);
    });

    test('payload stores only non-secret revocation metadata (no tokens/secrets)', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesCloudRevocationBarrierStore();
      final now = DateTime.utc(2026, 4, 1, 10, 0, 0);

      await store.writeBarrier(
        RevocationBarrier(revokedAtUtc: now, generation: BigInt.from(99)),
      );

      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(barrierKey);
      expect(raw, isNotNull);

      final decoded = jsonDecode(raw!) as Map<String, dynamic>;
      expect(decoded.keys.toSet(), {'revokedAtUtc', 'generation'});
      expect(decoded.containsKey('access_token'), isFalse);
      expect(decoded.containsKey('token'), isFalse);
      expect(decoded.containsKey('refresh_token'), isFalse);
      expect(decoded.containsKey('secret'), isFalse);
      expect(decoded.containsKey('credentials'), isFalse);
    });

    group('Corrupt JSON & malformed payloads fail closed', () {
      test('corrupt JSON syntax throws RevocationBarrierCorruptedFailure', () async {
        SharedPreferences.setMockInitialValues(<String, Object>{
          barrierKey: '{"revokedAtUtc": "not-valid-json-syntax',
        });
        final store = SharedPreferencesCloudRevocationBarrierStore();

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierCorruptedFailure>()),
        );
      });

      test('JSON array instead of map throws RevocationBarrierCorruptedFailure', () async {
        SharedPreferences.setMockInitialValues(<String, Object>{
          barrierKey: jsonEncode(['not', 'a', 'map']),
        });
        final store = SharedPreferencesCloudRevocationBarrierStore();

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierCorruptedFailure>()),
        );
      });

      test('missing revokedAtUtc field throws RevocationBarrierCorruptedFailure', () async {
        SharedPreferences.setMockInitialValues(<String, Object>{
          barrierKey: jsonEncode({'generation': '5'}),
        });
        final store = SharedPreferencesCloudRevocationBarrierStore();

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierCorruptedFailure>()),
        );
      });

      test('invalid revokedAtUtc date string throws RevocationBarrierCorruptedFailure', () async {
        SharedPreferences.setMockInitialValues(<String, Object>{
          barrierKey: jsonEncode({
            'revokedAtUtc': 'this-is-not-a-valid-iso-date',
            'generation': '5',
          }),
        });
        final store = SharedPreferencesCloudRevocationBarrierStore();

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierCorruptedFailure>()),
        );
      });

      test('invalid generation string throws RevocationBarrierCorruptedFailure', () async {
        SharedPreferences.setMockInitialValues(<String, Object>{
          barrierKey: jsonEncode({
            'revokedAtUtc': '2026-01-01T00:00:00.000Z',
            'generation': 'not-a-number',
          }),
        });
        final store = SharedPreferencesCloudRevocationBarrierStore();

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierCorruptedFailure>()),
        );
      });

      test('invalid generation type (boolean) throws RevocationBarrierCorruptedFailure', () async {
        SharedPreferences.setMockInitialValues(<String, Object>{
          barrierKey: jsonEncode({
            'revokedAtUtc': '2026-01-01T00:00:00.000Z',
            'generation': true,
          }),
        });
        final store = SharedPreferencesCloudRevocationBarrierStore();

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierCorruptedFailure>()),
        );
      });
    });

    group('Read exceptions where injectable', () {
      test('prefsProvider throwing propagates as RevocationBarrierReadFailure', () async {
        final store = SharedPreferencesCloudRevocationBarrierStore(
          null,
          () async => throw Exception('Disk read IO failure'),
        );

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierReadFailure>()),
        );
      });

      test('prefs.getString throwing propagates as RevocationBarrierReadFailure', () async {
        final mockPrefs = _MockSharedPreferences();
        when(() => mockPrefs.getString(barrierKey)).thenThrow(
          Exception('PlatformChannel error on read'),
        );

        final store = SharedPreferencesCloudRevocationBarrierStore(mockPrefs);

        expect(
          () => store.readBarrier(),
          throwsA(isA<RevocationBarrierReadFailure>()),
        );
      });
    });

    group('setString=false and write failures propagate', () {
      test('setString returning false throws RevocationBarrierWriteFailure', () async {
        final mockPrefs = _MockSharedPreferences();
        when(() => mockPrefs.setString(barrierKey, any())).thenAnswer(
          (_) async => false,
        );

        final store = SharedPreferencesCloudRevocationBarrierStore(mockPrefs);

        expect(
          () => store.writeBarrier(
            RevocationBarrier(revokedAtUtc: DateTime.utc(2026, 1, 1)),
          ),
          throwsA(isA<RevocationBarrierWriteFailure>()),
        );
      });

      test('setString throwing propagates as RevocationBarrierWriteFailure', () async {
        final mockPrefs = _MockSharedPreferences();
        when(() => mockPrefs.setString(barrierKey, any())).thenThrow(
          Exception('Disk full'),
        );

        final store = SharedPreferencesCloudRevocationBarrierStore(mockPrefs);

        expect(
          () => store.writeBarrier(
            RevocationBarrier(revokedAtUtc: DateTime.utc(2026, 1, 1)),
          ),
          throwsA(isA<RevocationBarrierWriteFailure>()),
        );
      });
    });

    group('remove=false and clear failures propagate', () {
      test('remove returning false throws RevocationBarrierWriteFailure', () async {
        final mockPrefs = _MockSharedPreferences();
        when(() => mockPrefs.remove(barrierKey)).thenAnswer(
          (_) async => false,
        );

        final store = SharedPreferencesCloudRevocationBarrierStore(mockPrefs);

        expect(
          () => store.clearBarrier(),
          throwsA(isA<RevocationBarrierWriteFailure>()),
        );
      });

      test('remove throwing propagates as RevocationBarrierWriteFailure', () async {
        final mockPrefs = _MockSharedPreferences();
        when(() => mockPrefs.remove(barrierKey)).thenThrow(
          Exception('Platform error on remove'),
        );

        final store = SharedPreferencesCloudRevocationBarrierStore(mockPrefs);

        expect(
          () => store.clearBarrier(),
          throwsA(isA<RevocationBarrierWriteFailure>()),
        );
      });
    });
  });
}
