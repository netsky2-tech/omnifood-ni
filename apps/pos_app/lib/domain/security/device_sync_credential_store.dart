import 'device_sync_credential_record.dart';

/// Contract for persisting and retrieving the device sync renewal credential.
///
/// Implementations must guarantee that human credentials and cloud access/refresh
/// tokens are NEVER stored in this repository.
abstract class DeviceSyncCredentialStore {
  /// Reads the current device sync renewal credential, or returns null if none provisioned.
  Future<DeviceSyncCredentialRecord?> readCredential();

  /// Persists a new or updated device sync renewal credential.
  Future<void> writeCredential(DeviceSyncCredentialRecord record);

  /// Clears the stored device sync renewal credential.
  Future<void> clearCredential();

  /// Stages a candidate credential record without replacing the active credential.
  Future<void> stageCandidate(DeviceSyncCredentialRecord record);

  /// Reads back the currently staged candidate record, if any.
  Future<DeviceSyncCredentialRecord?> readCandidate();

  /// Commits the staged candidate record as the active credential and clears the staged candidate.
  Future<void> commitCandidate();

  /// Discards the staged candidate record without modifying the active credential.
  Future<void> rollbackCandidate();
}
