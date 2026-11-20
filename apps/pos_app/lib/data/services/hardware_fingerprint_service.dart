import 'package:flutter/services.dart';

typedef HardwareFingerprintProvider = Future<String?> Function();

/// Reads the device's privacy-preserving hardware fingerprint (SHA-256 hex of
/// Android `Settings.Secure.ANDROID_ID`) from the native platform channel.
///
/// Safely returns `null` on non-Android platforms, desktop environments, tests,
/// or whenever the native channel is unavailable or returns an invalid payload.
class HardwareFingerprintService {
  HardwareFingerprintService({
    MethodChannel? channel,
    HardwareFingerprintProvider? provider,
  })  : _channel = channel ?? const MethodChannel(channelName),
        _provider = provider;

  static const String channelName = 'com.nhilos.pos_app/device_identity';
  static const String methodName = 'getHardwareFingerprint';

  static final RegExp _sha256HexRegex = RegExp(r'^[0-9a-fA-F]{64}$');

  final MethodChannel _channel;
  final HardwareFingerprintProvider? _provider;

  /// Returns a validated 64-character lowercase SHA-256 hex fingerprint, or
  /// `null` when unavailable or invalid.
  Future<String?> getHardwareFingerprint() async {
    try {
      final raw = _provider != null
          ? await _provider()
          : await _channel.invokeMethod<String>(methodName);
      final normalized = raw?.trim();
      if (normalized == null || !_sha256HexRegex.hasMatch(normalized)) {
        return null;
      }
      return normalized.toLowerCase();
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }
}
