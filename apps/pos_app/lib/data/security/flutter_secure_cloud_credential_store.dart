import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../domain/security/cloud_credential_store.dart';

/// Timeout for Keystore operations.
///
/// 30 seconds on purpose. Android emulators and devices without hardware-backed
/// Keystore can take 5-10 seconds (or more) for the first key-generation call.
/// The previous 3-second timeout triggered the circuit-breaker on every emulator
/// boot, permanently marking the circuit as DEGRADED and blocking all credential
/// reads — see session issue (keystore overdue >22Ks in logcat).
///
/// Production devices with StrongBox/hardware-backed Keystore complete in <100ms
/// so the higher timeout has zero real-world cost. If a read still exceeds 30s,
/// the circuit-breaker correctly assumes a hung Keystore and fails fast.
const _keystoreOperationTimeout = Duration(seconds: 30);

/// Circuit-breaker states for the Keystore-backed credential store.
///
/// Once DEGRADED, every subsequent operation fails immediately without
/// touching the native Keystore — avoiding the timeout storm
/// that saturates logcat and blocks the Dart event loop.
enum _CircuitState { available, degraded }

class FlutterSecureCloudCredentialStore implements CloudCredentialStore {
  FlutterSecureCloudCredentialStore([FlutterSecureStorage? storage])
      : _storage = storage ?? FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));
  final FlutterSecureStorage _storage;

  _CircuitState _circuitState = _CircuitState.available;

  /// Single-flight gate: when non-null, subsequent callers await it
  /// before entering native Keystore code.  Each operation replaces it
  /// so the queue drains naturally.
  Completer<void>? _gate;

  @override
  Future<String?> read(String key) async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw CloudCredentialStoreReadFailure('circuit_degraded');
      }
      return await _storage
          .read(key: key)
          .timeout(_keystoreOperationTimeout);
    } on CloudCredentialStoreReadFailure {
      rethrow;
    } catch (error) {
      _openCircuit();
      throw CloudCredentialStoreReadFailure(error.runtimeType.toString());
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<void> write(String key, String value) async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw CloudCredentialStoreWriteFailure(
          operation: 'write',
          errorType: 'circuit_degraded',
        );
      }
      await _storage
          .write(key: key, value: value)
          .timeout(_keystoreOperationTimeout);
    } on CloudCredentialStoreWriteFailure {
      rethrow;
    } catch (error) {
      _openCircuit();
      throw CloudCredentialStoreWriteFailure(
        operation: 'write',
        errorType: error.runtimeType.toString(),
      );
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<void> delete(String key) async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw CloudCredentialStoreWriteFailure(
          operation: 'delete',
          errorType: 'circuit_degraded',
        );
      }
      await _storage
          .delete(key: key)
          .timeout(_keystoreOperationTimeout);
    } on CloudCredentialStoreWriteFailure {
      rethrow;
    } catch (error) {
      _openCircuit();
      throw CloudCredentialStoreWriteFailure(
        operation: 'delete',
        errorType: error.runtimeType.toString(),
      );
    } finally {
      _releaseGate();
    }
  }

  /// Opens the circuit after the first native failure.
  /// Logged once per process lifetime — subsequent operations fail instantly.
  void _openCircuit() {
    if (_circuitState == _CircuitState.available) {
      _circuitState = _CircuitState.degraded;
      debugPrint(
        '[FlutterSecureCloudCredentialStore] Circuit OPEN — '
        'Keystore marked DEGRADED. All subsequent operations will fail '
        'immediately without touching native storage.',
      );
    }
  }

  /// Single-flight gate: serializes native Keystore operations so that
  /// at most one Dart future is inside flutter_secure_storage at a time.
  Future<void> _acquireGate() async {
    while (_gate != null) {
      await _gate!.future;
    }
    _gate = Completer<void>();
  }

  void _releaseGate() {
    final c = _gate;
    _gate = null;
    c?.complete();
  }

  /// Resets the circuit breaker to AVAILABLE. Visible for testing only.
  @visibleForTesting
  void resetCircuit() {
    _circuitState = _CircuitState.available;
  }
}
