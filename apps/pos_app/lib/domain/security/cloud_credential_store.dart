abstract class CloudCredentialStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

abstract class CloudCredentialStoreFailure implements Exception {
  CloudCredentialStoreFailure({
    required this.operation,
    required this.errorType,
  });
  final String operation;
  final String? errorType;
}

class CloudCredentialStoreReadFailure extends CloudCredentialStoreFailure {
  CloudCredentialStoreReadFailure(String? errorType)
    : super(operation: 'read', errorType: errorType);
}

class CloudCredentialStoreWriteFailure extends CloudCredentialStoreFailure {
  CloudCredentialStoreWriteFailure({
    required super.operation,
    required super.errorType,
  });
}
