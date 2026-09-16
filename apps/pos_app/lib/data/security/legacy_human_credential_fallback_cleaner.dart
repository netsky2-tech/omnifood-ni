import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Explicit, idempotent cleaner that purges stale insecure human fallback credentials
/// from [SharedPreferences] on app/auth initialization and on human logout.
///
/// Upgraded physical devices or older builds may retain human secrets in
/// SharedPreferences under legacy fallback keys.
///
/// Security invariants:
/// 1. Only known legacy human credential keys are targeted.
/// 2. Under NO circumstance are key values ever read, returned, or logged.
/// 3. Preserves nonsecret entries such as `cloud_auth_revocation_barrier_v1`.
/// 4. Preserves Device Sync credentials (which reside in SQLite / secure store).
/// 5. Safe failure: failures to remove are logged safely without throwing or
///    causing fallback credential recovery.
class LegacyHumanCredentialFallbackCleaner {
  LegacyHumanCredentialFallbackCleaner([
    SharedPreferences? prefs,
    Future<SharedPreferences> Function()? prefsProvider,
  ]) : _prefs = prefs,
       _prefsProvider = prefsProvider;

  SharedPreferences? _prefs;
  final Future<SharedPreferences> Function()? _prefsProvider;

  /// The exact known set of legacy human credential keys prohibited in SharedPreferences.
  static const Set<String> legacyHumanCredentialKeys = {
    'access_token',
    'refresh_token_fallback',
    'refresh_tenant_id_fallback',
    'refresh_user_id_fallback',
  };

  Future<SharedPreferences> _getPrefs() async {
    if (_prefs != null) return _prefs!;
    if (_prefsProvider != null) {
      _prefs = await _prefsProvider!();
      return _prefs!;
    }
    return _prefs = await SharedPreferences.getInstance();
  }

  /// Purges all prohibited legacy human credential keys from [SharedPreferences].
  ///
  /// Returns `true` if all existing legacy keys were successfully removed or
  /// already absent.
  /// Returns `false` if an error occurred or `remove()` indicated failure,
  /// failing safely without throwing.
  Future<bool> clean() async {
    try {
      final prefs = await _getPrefs();
      var allSuccess = true;

      for (final key in legacyHumanCredentialKeys) {
        try {
          if (prefs.containsKey(key)) {
            // Remove the key without reading its value.
            final removed = await prefs.remove(key);
            if (!removed) {
              allSuccess = false;
              debugPrint(
                '[LegacyHumanCredentialFallbackCleaner] Failed to remove prohibited key: $key',
              );
            }
          }
        } catch (keyErr) {
          allSuccess = false;
          debugPrint(
            '[LegacyHumanCredentialFallbackCleaner] Error removing prohibited key $key: $keyErr',
          );
        }
      }

      return allSuccess;
    } catch (e) {
      debugPrint(
        '[LegacyHumanCredentialFallbackCleaner] Safe cleanup failure: $e',
      );
      return false;
    }
  }
}
