import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../domain/security/device_sync_credential_record.dart';
import '../../domain/security/device_sync_credential_store.dart';
import '../../domain/security/device_sync_exceptions.dart';

enum _CircuitState { available, degraded }

/// Preferred hardware-backed Android Keystore / iOS Keychain credential store
/// for device sync renewal credentials.
///
/// Features:
/// - Dedicated device storage key/namespace (`device_sync_credential_v1`).
/// - Strict operation timeout (bounded to prevent main thread/event loop hangs).
/// - Single-flight gate to serialize native platform channel calls.
/// - Circuit breaker: first native failure or timeout marks Keystore DEGRADED;
///   all subsequent operations fail immediately without touching native storage,
///   preventing logcat exhaustion and thread saturation.
class FlutterSecureDeviceSyncCredentialStore implements DeviceSyncCredentialStore {
  FlutterSecureDeviceSyncCredentialStore({
    FlutterSecureStorage? storage,
    Duration timeout = const Duration(seconds: 3),
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _timeout = timeout;

  static const String storageKey = 'device_sync_credential_v1';
  static const String candidateStorageKey = 'device_sync_credential_candidate_v1';

  final FlutterSecureStorage _storage;
  final Duration _timeout;

  _CircuitState _circuitState = _CircuitState.available;
  Completer<void>? _gate;

  bool get isDegraded => _circuitState == _CircuitState.degraded;

  @override
  Future<DeviceSyncCredentialRecord?> readCredential() async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw const DeviceSyncUnavailableException('Keystore circuit degraded');
      }

      final raw = await _storage.read(key: storageKey).timeout(_timeout);
      if (raw == null || raw.trim().isEmpty) {
        return null;
      }

      final Map<String, dynamic> json = jsonDecode(raw) as Map<String, dynamic>;
      return DeviceSyncCredentialRecord.fromJson(json);
    } on DeviceSyncUnavailableException {
      rethrow;
    } catch (error) {
      _openCircuit('read', error);
      throw DeviceSyncUnavailableException(
        'Keystore read failed: ${error.runtimeType}',
      );
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<void> writeCredential(DeviceSyncCredentialRecord record) async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw const DeviceSyncUnavailableException('Keystore circuit degraded');
      }

      final encoded = jsonEncode(record.toJson());
      await _storage.write(key: storageKey, value: encoded).timeout(_timeout);
    } on DeviceSyncUnavailableException {
      rethrow;
    } catch (error) {
      _openCircuit('write', error);
      throw DeviceSyncUnavailableException(
        'Keystore write failed: ${error.runtimeType}',
      );
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<void> clearCredential() async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw const DeviceSyncUnavailableException('Keystore circuit degraded');
      }

      await _storage.delete(key: storageKey).timeout(_timeout);
      await _storage.delete(key: candidateStorageKey).timeout(_timeout);
    } on DeviceSyncUnavailableException {
      rethrow;
    } catch (error) {
      _openCircuit('clear', error);
      throw DeviceSyncUnavailableException(
        'Keystore clear failed: ${error.runtimeType}',
      );
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<void> stageCandidate(DeviceSyncCredentialRecord record) async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw const DeviceSyncUnavailableException('Keystore circuit degraded');
      }

      final encoded = jsonEncode(record.toJson());
      await _storage.write(key: candidateStorageKey, value: encoded).timeout(_timeout);
    } on DeviceSyncUnavailableException {
      rethrow;
    } catch (error) {
      _openCircuit('stageCandidate', error);
      throw DeviceSyncUnavailableException(
        'Keystore stageCandidate failed: ${error.runtimeType}',
      );
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<DeviceSyncCredentialRecord?> readCandidate() async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw const DeviceSyncUnavailableException('Keystore circuit degraded');
      }

      final raw = await _storage.read(key: candidateStorageKey).timeout(_timeout);
      if (raw == null || raw.trim().isEmpty) {
        return null;
      }

      final Map<String, dynamic> json = jsonDecode(raw) as Map<String, dynamic>;
      return DeviceSyncCredentialRecord.fromJson(json);
    } on DeviceSyncUnavailableException {
      rethrow;
    } catch (error) {
      _openCircuit('readCandidate', error);
      throw DeviceSyncUnavailableException(
        'Keystore readCandidate failed: ${error.runtimeType}',
      );
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<void> commitCandidate() async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw const DeviceSyncUnavailableException('Keystore circuit degraded');
      }

      final raw = await _storage.read(key: candidateStorageKey).timeout(_timeout);
      if (raw == null || raw.trim().isEmpty) {
        throw const DeviceSyncUnavailableException('No candidate staged to commit');
      }

      await _storage.write(key: storageKey, value: raw).timeout(_timeout);
      await _storage.delete(key: candidateStorageKey).timeout(_timeout);
    } on DeviceSyncUnavailableException {
      rethrow;
    } catch (error) {
      _openCircuit('commitCandidate', error);
      throw DeviceSyncUnavailableException(
        'Keystore commitCandidate failed: ${error.runtimeType}',
      );
    } finally {
      _releaseGate();
    }
  }

  @override
  Future<void> rollbackCandidate() async {
    await _acquireGate();
    try {
      if (_circuitState == _CircuitState.degraded) {
        throw const DeviceSyncUnavailableException('Keystore circuit degraded');
      }

      await _storage.delete(key: candidateStorageKey).timeout(_timeout);
    } on DeviceSyncUnavailableException {
      rethrow;
    } catch (error) {
      _openCircuit('rollbackCandidate', error);
      throw DeviceSyncUnavailableException(
        'Keystore rollbackCandidate failed: ${error.runtimeType}',
      );
    } finally {
      _releaseGate();
    }
  }

  void _openCircuit(String operation, Object error) {
    if (_circuitState == _CircuitState.available) {
      _circuitState = _CircuitState.degraded;
      debugPrint(
        '[FlutterSecureDeviceSyncCredentialStore] Circuit OPEN — Keystore marked DEGRADED '
        'after $operation error: $error. All subsequent calls will fail immediately.',
      );
    }
  }

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

  @visibleForTesting
  void resetCircuit() {
    _circuitState = _CircuitState.available;
  }
}
