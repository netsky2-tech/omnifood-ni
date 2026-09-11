import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract class TotpSeedKeyProvider {
  Future<String> getKeyMaterial();
}

class DeviceBoundTotpSeedKeyProvider implements TotpSeedKeyProvider {
  static const String _storageKey = 'totp_seed_encryption_key_v1';

  DeviceBoundTotpSeedKeyProvider({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String> getKeyMaterial() async {
    try {
      final existing = await _storage
          .read(key: _storageKey)
          .timeout(const Duration(milliseconds: 500));
      if (existing != null && existing.trim().isNotEmpty) {
        return existing;
      }

      final generated = _generateKeyMaterial();
      await _storage
          .write(key: _storageKey, value: generated)
          .timeout(const Duration(milliseconds: 500));
      final persisted = await _storage
          .read(key: _storageKey)
          .timeout(const Duration(milliseconds: 500));
      if (persisted == null || persisted.trim().isEmpty) {
        throw StateError('Unable to persist local TOTP seed encryption key');
      }
      return persisted;
    } catch (e) {
      debugPrint('[DeviceBoundTotpSeedKeyProvider] Secure storage hang/error, falling back to SharedPreferences: $e');
      try {
        final prefs = await SharedPreferences.getInstance();
        final existingPref = prefs.getString(_storageKey);
        if (existingPref != null && existingPref.trim().isNotEmpty) {
          return existingPref;
        }
        final generated = _generateKeyMaterial();
        await prefs.setString(_storageKey, generated);
        return generated;
      } catch (fallbackError) {
        throw StateError(
          'Local TOTP seed key unavailable; fail-closed to prevent plaintext persistence: $fallbackError',
        );
      }
    }
  }

  String _generateKeyMaterial() {
    final random = Random.secure();
    final bytes = Uint8List.fromList(
      List<int>.generate(32, (_) => random.nextInt(256)),
    );
    return base64UrlEncode(bytes);
  }
}
