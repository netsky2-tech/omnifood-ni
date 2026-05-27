import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:encrypt/encrypt.dart' as enc;

class LocalTotpSeedCipher {
  static const String _prefixV1 = 'enc:v1:';
  static const String _prefixV2 = 'enc:v2:';

  final enc.Encrypter _encrypter;

  LocalTotpSeedCipher({required String keyMaterial})
    : _encrypter = enc.Encrypter(
        enc.AES(_deriveKey(keyMaterial), mode: enc.AESMode.cbc),
      );

  String? encryptNullable(String? plainText) {
    if (plainText == null || plainText.isEmpty) return plainText;
    if (plainText.startsWith(_prefixV1) || plainText.startsWith(_prefixV2)) {
      return plainText;
    }
    final iv = _secureIv();
    final encrypted = _encrypter.encrypt(plainText, iv: iv);
    return '$_prefixV2${iv.base64}:${encrypted.base64}';
  }

  String? decryptNullable(String? storedValue) {
    if (storedValue == null || storedValue.isEmpty) return storedValue;
    if (!storedValue.startsWith(_prefixV1) && !storedValue.startsWith(_prefixV2)) {
      return null;
    }

    try {
      if (storedValue.startsWith(_prefixV2)) {
        final encoded = storedValue.substring(_prefixV2.length);
        final parts = encoded.split(':');
        if (parts.length != 2) return null;
        final iv = enc.IV.fromBase64(parts[0]);
        return _encrypter.decrypt64(parts[1], iv: iv);
      }

      // Backward compatibility for deterministic v1 payloads.
      final encoded = storedValue.substring(_prefixV1.length);
      return _encrypter.decrypt64(encoded, iv: enc.IV.fromLength(16));
    } catch (_) {
      return null;
    }
  }

  static enc.IV _secureIv() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return enc.IV(Uint8List.fromList(bytes));
  }

  static enc.Key _deriveKey(String keyMaterial) {
    final source = keyMaterial.trim();
    if (source.isEmpty) {
      throw StateError('Missing local TOTP seed encryption key material');
    }
    final bytes = utf8.encode(source);
    if (bytes.length == 32) {
      return enc.Key(Uint8List.fromList(bytes));
    }

    final normalized = List<int>.filled(32, 0);
    for (var i = 0; i < bytes.length && i < normalized.length; i++) {
      normalized[i] = bytes[i];
    }
    return enc.Key(Uint8List.fromList(normalized));
  }
}
