import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';

class FakeDeviceSyncCredentialStore implements DeviceSyncCredentialStore {
  DeviceSyncCredentialRecord? _active;
  DeviceSyncCredentialRecord? _candidate;

  @override
  Future<DeviceSyncCredentialRecord?> readCredential() async => _active;

  @override
  Future<void> writeCredential(DeviceSyncCredentialRecord record) async {
    _active = record;
  }

  @override
  Future<void> clearCredential() async {
    _active = null;
    _candidate = null;
  }

  @override
  Future<void> stageCandidate(DeviceSyncCredentialRecord record) async {
    _candidate = record;
  }

  @override
  Future<DeviceSyncCredentialRecord?> readCandidate() async => _candidate;

  @override
  Future<void> commitCandidate() async {
    if (_candidate != null) {
      _active = _candidate;
      _candidate = null;
    }
  }

  @override
  Future<void> rollbackCandidate() async {
    _candidate = null;
  }
}
