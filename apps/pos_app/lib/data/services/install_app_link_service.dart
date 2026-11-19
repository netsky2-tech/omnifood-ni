import 'dart:async';

import 'package:flutter/services.dart';

/// Lightweight bridge to Android App Links delivered to `MainActivity`
/// (issue #958).
///
/// Gracefully handles `MissingPluginException` so widget tests and non-Android
/// targets continue working without native channel registration.
class InstallAppLinkService {
  static const String channelName = 'com.nhilos.pos_app/app_links';

  InstallAppLinkService({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel(channelName) {
    _channel.setMethodCallHandler(_handleMethodCall);
  }

  final MethodChannel _channel;
  final StreamController<String> _linkController =
      StreamController<String>.broadcast();
  bool _disposed = false;

  /// Stream of App Link URIs delivered while the app is already running
  /// (`MainActivity.onNewIntent`).
  Stream<String> get onLink => _linkController.stream;

  /// Returns the App Link URI that cold-started the app, if any.
  Future<String?> getInitialLink() async {
    try {
      final link = await _channel.invokeMethod<String>('getInitialLink');
      if (link == null || link.trim().isEmpty) {
        return null;
      }
      return link;
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  Future<void> _handleMethodCall(MethodCall call) async {
    if (_disposed) return;
    if (call.method == 'onNewLink') {
      final raw = call.arguments;
      if (raw is String && raw.trim().isNotEmpty) {
        _linkController.add(raw);
      }
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _channel.setMethodCallHandler(null);
    _linkController.close();
  }
}
