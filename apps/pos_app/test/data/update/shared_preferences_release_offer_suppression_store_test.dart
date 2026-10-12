import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_app/data/update/shared_preferences_release_offer_suppression_store.dart';
import 'package:pos_app/domain/services/update/offer_suppression.dart';

class _MockSharedPreferences extends Mock implements SharedPreferences {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // The key MUST be versioned (repo persistence convention, mirroring
  // 'cloud_auth_revocation_barrier_v1') so a future format change can
  // migrate instead of misreading an old payload.
  const suppressionKey = 'release_offer_suppression_v1';

  group('SharedPreferencesReleaseOfferSuppressionStore', () {
    test('empty state reads as nothing suppressed', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesReleaseOfferSuppressionStore();

      expect(await store.readHighestSuppressedVersionCode(), isNull);
    });

    test('record 2007 then re-read returns 2007', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesReleaseOfferSuppressionStore();

      await store.recordSuppressedVersionCode(2007);

      expect(await store.readHighestSuppressedVersionCode(), 2007);
    });

    test('recording a LOWER versionCode after a higher one does not lower '
        'the stored value (monotonic)', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesReleaseOfferSuppressionStore();

      await store.recordSuppressedVersionCode(2007);
      await store.recordSuppressedVersionCode(2006);

      // A boolean "dismissed" flag would hide every future release; storing
      // the HIGHEST surfaced versionCode means any strictly greater
      // versionCode re-offers. Lowering the record would re-suppress
      // versions already offered.
      expect(await store.readHighestSuppressedVersionCode(), 2007);
    });

    test('recording the SAME versionCode is idempotent', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesReleaseOfferSuppressionStore();

      await store.recordSuppressedVersionCode(2007);
      await store.recordSuppressedVersionCode(2007);

      expect(await store.readHighestSuppressedVersionCode(), 2007);
    });

    test('stores under the versioned key, keyed by the int versionCode '
        '(never the "1.0.0+7" display string, V11)', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final store = SharedPreferencesReleaseOfferSuppressionStore();

      await store.recordSuppressedVersionCode(2007);

      final prefs = await SharedPreferences.getInstance();
      // The versioned key exists and carries a plain int — not a version
      // string. Per-ABI offsets make "1.0.0+7" incomparable across devices;
      // the int versionCode is monotonic per ABI.
      expect(prefs.getInt(suppressionKey), 2007);
      expect(prefs.getKeys(), contains(suppressionKey));
    });

    test('a second store instance over the same prefs state sees the '
        'recorded versionCode (persistence across process restart)', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{});
      final first = SharedPreferencesReleaseOfferSuppressionStore();
      await first.recordSuppressedVersionCode(2007);

      // A fresh instance models a restarted process over the same
      // SharedPreferences backing store.
      final restarted = SharedPreferencesReleaseOfferSuppressionStore();
      expect(await restarted.readHighestSuppressedVersionCode(), 2007);
    });

    test('corrupt (non-int) stored value throws '
        'ReleaseOfferSuppressionReadFailure', () async {
      SharedPreferences.setMockInitialValues(<String, Object>{
        suppressionKey: 'not-an-int',
      });
      final store = SharedPreferencesReleaseOfferSuppressionStore();

      expect(
        () => store.readHighestSuppressedVersionCode(),
        throwsA(isA<ReleaseOfferSuppressionReadFailure>()),
      );
    });

    test('prefsProvider throwing propagates as '
        'ReleaseOfferSuppressionReadFailure', () async {
      final store = SharedPreferencesReleaseOfferSuppressionStore(
        null,
        () async => throw Exception('Disk read IO failure'),
      );

      expect(
        () => store.readHighestSuppressedVersionCode(),
        throwsA(isA<ReleaseOfferSuppressionReadFailure>()),
      );
    });

    test('setString returning false throws '
        'ReleaseOfferSuppressionWriteFailure', () async {
      final mockPrefs = _MockSharedPreferences();
      when(() => mockPrefs.getInt(suppressionKey)).thenReturn(null);
      when(() => mockPrefs.setInt(suppressionKey, any()))
          .thenAnswer((_) async => false);

      final store = SharedPreferencesReleaseOfferSuppressionStore(mockPrefs);

      expect(
        () => store.recordSuppressedVersionCode(2007),
        throwsA(isA<ReleaseOfferSuppressionWriteFailure>()),
      );
    });

    test('setInt throwing propagates as ReleaseOfferSuppressionWriteFailure',
        () async {
      final mockPrefs = _MockSharedPreferences();
      when(() => mockPrefs.getInt(suppressionKey)).thenReturn(2007);
      when(() => mockPrefs.setInt(suppressionKey, any()))
          .thenThrow(Exception('Disk full'));

      final store = SharedPreferencesReleaseOfferSuppressionStore(mockPrefs);

      expect(
        () => store.recordSuppressedVersionCode(2008),
        throwsA(isA<ReleaseOfferSuppressionWriteFailure>()),
      );
    });

    test('a lower recording attempt on mocked prefs performs no write '
        '(monotonic guard short-circuits)', () async {
      final mockPrefs = _MockSharedPreferences();
      when(() => mockPrefs.getInt(suppressionKey)).thenReturn(2007);

      final store = SharedPreferencesReleaseOfferSuppressionStore(mockPrefs);
      await store.recordSuppressedVersionCode(2006);

      verifyNever(() => mockPrefs.setInt(suppressionKey, any()));
    });
  });
}
