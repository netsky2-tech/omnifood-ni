import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/domain/models/activation/activation_attempt_snapshot.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';

/// Test-only mixin for [ActivationSyncPort] doubles that intentionally do not
/// exercise these five methods. Restores the former throwing default bodies so
/// any unexpected call fails loudly instead of silently no-oping.
///
/// A real implementor must override every method it exercises; this mixin is
/// never valid in production code.
mixin UnimplementedActivationSyncDefaults on ActivationSyncPort {
  // Test-only: a real implementor must override this.
  @override
  Future<ActivationAttemptSnapshot?> fetchActiveAttempt() {
    throw UnimplementedError();
  }

  // Test-only: a real implementor must override this.
  @override
  Future<DeviceSyncCredentialRecord> provisionDeviceSyncCredential({
    required String attemptId,
    required String expectedDeviceId,
  }) {
    throw UnimplementedError();
  }

  // Test-only: a real implementor must override this.
  @override
  Future<DeviceSyncCredentialRecord> confirmDeviceSyncCredential({
    required String attemptId,
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  }) {
    throw UnimplementedError();
  }

  // Test-only: a real implementor must override this.
  @override
  Future<DeviceSyncCredentialRecord> provisionBootstrapDeviceSyncCredential({
    required String deviceId,
  }) {
    throw UnimplementedError();
  }

  // Test-only: a real implementor must override this.
  @override
  Future<DeviceSyncCredentialRecord> confirmBootstrapDeviceSyncCredential({
    required String credentialId,
    required String deviceId,
    required int credentialVersion,
    required String renewalSecret,
  }) {
    throw UnimplementedError();
  }
}
