import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../domain/security/cloud_credential_store.dart';

class FlutterSecureCloudCredentialStore implements CloudCredentialStore {
  FlutterSecureCloudCredentialStore(this._storage);
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (error) {
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
      await action();
    } catch (error) {
      throw CloudCredentialStoreWriteFailure(
        operation: operation,
        errorType: error.runtimeType.toString(),
      );
    }
  }
}
