import 'package:shared_preferences/shared_preferences.dart';
import '../../domain/services/update/offer_suppression.dart';

/// SharedPreferences adapter for [ReleaseOfferSuppressionStore] (T3, AC5).
///
/// Mirrors the canonical persistence pattern of
/// `SharedPreferencesCloudRevocationBarrierStore` (data/security): optional
/// positional constructor overrides for tests, lazy `_prefs` caching, and a
/// versioned key constant so a future format change can migrate instead of
/// misreading an old payload.
///
/// The stored value is the highest suppressed **int** `versionCode` (V11 —
/// never the `"1.0.0+7"` display string) kept monotonic on write.
class SharedPreferencesReleaseOfferSuppressionStore
    implements ReleaseOfferSuppressionStore {
  SharedPreferencesReleaseOfferSuppressionStore([
    SharedPreferences? prefs,
    Future<SharedPreferences> Function()? prefsProvider,
  ])  : _prefs = prefs,
        _prefsProvider = prefsProvider;

  SharedPreferences? _prefs;
  final Future<SharedPreferences> Function()? _prefsProvider;

  static const _suppressionKey = 'release_offer_suppression_v1';

  Future<SharedPreferences> _getPrefs() async {
    if (_prefs != null) return _prefs!;
    if (_prefsProvider != null) {
      _prefs = await _prefsProvider!();
      return _prefs!;
    }
    return _prefs = await SharedPreferences.getInstance();
  }

  @override
  Future<int?> readHighestSuppressedVersionCode() async {
    try {
      final prefs = await _getPrefs();
      return prefs.getInt(_suppressionKey);
    } catch (e) {
      throw ReleaseOfferSuppressionReadFailure(
        'Failed to read release offer suppression from SharedPreferences',
        e,
      );
    }
  }

  @override
  Future<void> recordSuppressedVersionCode(int versionCode) async {
    try {
      final prefs = await _getPrefs();
      final current = prefs.getInt(_suppressionKey);
      // Monotonic guard: never lower the stored highest versionCode. A
      // stale or reordered write must not re-suppress a version that was
      // already surfaced (a boolean "dismissed" flag would hide every
      // future release — the plan calls that out explicitly as wrong).
      if (current != null && versionCode <= current) return;
      final ok = await prefs.setInt(_suppressionKey, versionCode);
      if (!ok) {
        throw const ReleaseOfferSuppressionWriteFailure(
          'SharedPreferences.setInt returned false when writing '
          'release offer suppression',
        );
      }
    } on ReleaseOfferSuppressionWriteFailure {
      rethrow;
    } catch (e) {
      throw ReleaseOfferSuppressionWriteFailure(
        'Failed to write release offer suppression to SharedPreferences',
        e,
      );
    }
  }
}
