import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../domain/security/cloud_credential_store.dart';

const _keystoreOperationTimeout = Duration(seconds: 3);

class FlutterSecureCloudCredentialStore implements CloudCredentialStore {
  FlutterSecureCloudCredentialStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) async {
    try {
      return await _storage
          .read(key: key)
          .timeout(_keystoreOperationTimeout);
    } catch (error) {
      debugPrint(
        '[FlutterSecureCloudCredentialStore] read failed or timed out: $error',
      );
      throw CloudCredentialStoreReadFailure(error.runtimeType.toString());
    }
  }

  @override
  Future<void> write(String key, String value) =>
      _write('write', () => _storage.write(key: key, value: value));

  @override
  Future<void> delete(String key) =>
      _write('delete', () => _storage.delete(key: key));

  Future<void> _write(String operation, Future<void> Function() action) async {
    try {
      await action().timeout(_keystoreOperationTimeout);
    } catch (error) {
      debugPrint(
        '[FlutterSecureCloudCredentialStore] $operation failed or timed out: $error',
      );
      throw CloudCredentialStoreWriteFailure(
        operation: operation,
        errorType: error.runtimeType.toString(),
      );
    }
  }
}
