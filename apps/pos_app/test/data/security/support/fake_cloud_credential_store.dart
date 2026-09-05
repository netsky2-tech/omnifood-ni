import 'package:pos_app/domain/security/cloud_credential_record.dart';
import 'package:pos_app/domain/security/cloud_credential_store.dart';

enum FakeFaultStage {
  slotRead,
  hintRead,
  preparedWrite,
  preparedReadback,
  committedWrite,
  committedReadback,
  hintWrite,
  hintReadback;

  static const commitStages = [
    preparedWrite,
    preparedReadback,
    committedWrite,
    committedReadback,
    hintWrite,
    hintReadback,
  ];

  bool get isHint => this == hintWrite || this == hintReadback;
}

enum FakeFault { failBefore, mutateThenThrow, substitutedReadback }

class FakeStageFault {
  const FakeStageFault(this.stage, this.fault);
  final FakeFaultStage stage;
  final FakeFault fault;
}

class FakeCloudCredentialStore implements CloudCredentialStore {
  static const slotA = 'cloud_credentials_slot_a_v1';
  static const slotB = 'cloud_credentials_slot_b_v1';
  static const hint = 'cloud_credentials_hint_v1';
  final values = <String, String>{};
  final keys = <String>[];
  final observedStages = <FakeFaultStage>[];
  final _readbacks = <String, FakeFaultStage>{};
  FakeStageFault? fault;
  String? readFailureKey;
  String lastError = '';

  void corrupt(String key) => values[key] = 'corrupt';
  void throwOnRead(String key) => readFailureKey = key;

  @override
  Future<String?> read(String key) async {
    keys.add(key);
    final stage =
        _readbacks.remove(key) ??
        (key == hint ? FakeFaultStage.hintRead : FakeFaultStage.slotRead);
    observedStages.add(stage);
    if (readFailureKey == key ||
        (fault?.stage == stage &&
            (fault?.fault == FakeFault.failBefore ||
                fault?.fault == FakeFault.mutateThenThrow))) {
      throw CloudCredentialStoreReadFailure('FakeRead');
    }
    final value = values[key];
    if (fault?.stage == stage &&
        fault?.fault == FakeFault.substitutedReadback) {
      return 'substituted';
    }
    return value;
  }

  @override
  Future<void> write(String key, String value) async {
    keys.add(key);
    final stage = _writeStage(key, value);
    observedStages.add(stage);
    final injected = fault?.stage == stage ? fault : null;
    if (injected?.fault == FakeFault.failBefore) {
      _failWrite();
    }
    values[key] = value;
    _readbacks[key] = stage == FakeFaultStage.preparedWrite
        ? FakeFaultStage.preparedReadback
        : stage == FakeFaultStage.committedWrite
        ? FakeFaultStage.committedReadback
        : FakeFaultStage.hintReadback;
    if (injected?.fault == FakeFault.mutateThenThrow) {
      _failWrite();
    }
  }

  FakeFaultStage _writeStage(String key, String value) {
    if (key == hint) return FakeFaultStage.hintWrite;
    return CloudCredentialRecord.decode(value).record!.state ==
            CredentialRecordPhase.prepared
        ? FakeFaultStage.preparedWrite
        : FakeFaultStage.committedWrite;
  }

  Never _failWrite() {
    lastError = 'write failed';
    throw CloudCredentialStoreWriteFailure(
      operation: 'write',
      errorType: 'FakeWrite',
    );
  }

  @override
  Future<void> delete(String key) async => values.remove(key);
}
