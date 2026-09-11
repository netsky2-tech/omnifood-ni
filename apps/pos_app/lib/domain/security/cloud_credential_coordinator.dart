import 'cloud_credential_record.dart';
import 'cloud_credential_store.dart';
import 'cloud_credentials.dart';

class CredentialDurableStateFailure implements Exception {
  CredentialDurableStateFailure(this.reason);
  final String reason;
  @override
  String toString() => 'Credential durable state failure: $reason';
}

class CredentialIntent {
  const CredentialIntent(this.epoch, this.baseGeneration, this.baseWriterEpoch);
  final BigInt epoch;
  final BigInt? baseGeneration;
  final BigInt? baseWriterEpoch;
}

class CredentialCommitResult {
  const CredentialCommitResult.committed(this.record) : stale = false;
  const CredentialCommitResult.stale() : record = null, stale = true;
  final CloudCredentialRecord? record;
  final bool stale;
  bool get committed => !stale;
}

class CredentialRecovery {
  const CredentialRecovery(this.record);
  final CloudCredentialRecord? record;
}

class CloudCredentialCoordinator {
  CloudCredentialCoordinator(this._store, {required String Function() commitId})
    : _commitId = commitId;

  static const slotA = 'cloud_credentials_slot_a_v1';
  static const slotB = 'cloud_credentials_slot_b_v1';
  static const hint = 'cloud_credentials_hint_v1';
  final CloudCredentialStore _store;
  final String Function() _commitId;
  static Future<void> _processTail = Future.value();
  static BigInt _processEpoch = BigInt.zero;

  static void resetProcessCoordinationForTest() {
    _processTail = Future.value();
    _processEpoch = BigInt.zero;
  }

  CloudCredentialRecord? _current;
  CredentialSlot? _currentSlot;

  Future<CredentialRecovery> recover() => _locked(() async => _recover());

  Future<CredentialIntent> reserveIntent() => _locked(() async {
    final recovered = await _recover();
    _processEpoch += BigInt.one;
    final current = recovered.record;
    return CredentialIntent(
      _processEpoch,
      current?.generation,
      current?.writerEpoch,
    );
  });

  Future<CredentialCommitResult> commit(
    CredentialIntent intent,
    CloudCredentials credentials,
  ) => _locked(() async {
    final current = (await _recover()).record;
    if (intent.epoch != _processEpoch ||
        intent.baseGeneration != current?.generation ||
        intent.baseWriterEpoch != current?.writerEpoch) {
      return const CredentialCommitResult.stale();
    }
    final record = CloudCredentialRecord.active(
      generation: (current?.generation ?? BigInt.zero) + BigInt.one,
      previousGeneration: current?.generation,
      writerEpoch: intent.epoch,
      commitId: _commitId(),
      state: CredentialRecordPhase.prepared,
      credentials: credentials,
    );
    await _persist(record);
    return CredentialCommitResult.committed(_current!);
  });

  Future<CredentialCommitResult> clear() => _locked(() async {
    final current = (await _recover()).record;
    _processEpoch += BigInt.one;
    final record = CloudCredentialRecord.cleared(
      generation: (current?.generation ?? BigInt.zero) + BigInt.one,
      previousGeneration: current?.generation,
      writerEpoch: _processEpoch,
      commitId: _commitId(),
      state: CredentialRecordPhase.prepared,
      issuedAtUtc: DateTime.now().toUtc(),
    );
    await _persist(record);
    return CredentialCommitResult.committed(_current!);
  });

  Future<void> _persist(CloudCredentialRecord prepared) async {
    final slot = _currentSlot == CredentialSlot.a
        ? CredentialSlot.b
        : CredentialSlot.a;
    final key = slot == CredentialSlot.a ? slotA : slotB;
    await _store.write(key, prepared.encode());
    if (!(await _read(key)).record.same(prepared)) {
      throw CredentialDurableStateFailure('prepared read-back mismatch');
    }
    final committed = _withPhase(prepared, CredentialRecordPhase.committed);
    await _store.write(key, committed.encode());
    if (!(await _read(key)).record.same(committed)) {
      throw CredentialDurableStateFailure('committed read-back mismatch');
    }
    final value = CloudCredentialHint(
      generation: committed.generation,
      slot: slot,
      commitId: committed.commitId,
      checksum: _checksum(committed),
    ).encode();
    try {
      await _store.write(hint, value);
      if ((await _store.read(hint)) != value) throw StateError('hint mismatch');
    } catch (_) {
      // A fully verified slot remains authoritative; hints are optimization only.
    }
    _current = committed;
    _currentSlot = slot;
  }

  Future<CredentialRecovery> _recover() async {
    final a = await _read(slotA);
    final b = await _read(slotB);
    final committed = <_Located>[];
    final invalid = <CredentialRecordStatus>[];
    for (final located in [
      _Located(CredentialSlot.a, a),
      _Located(CredentialSlot.b, b),
    ]) {
      if (located.result.status == CredentialRecordStatus.committed) {
        committed.add(located);
      }
      if (located.result.status != CredentialRecordStatus.absent &&
          located.result.status != CredentialRecordStatus.committed) {
        invalid.add(located.result.status);
      }
    }
    if (committed.isEmpty) {
      if (invalid.isNotEmpty) {
        throw CredentialDurableStateFailure('no valid committed slot');
      }
      try {
        await _store.read(hint);
      } catch (_) {}
      _current = null;
      _currentSlot = null;
      return const CredentialRecovery(null);
    }
    committed.sort(
      (left, right) =>
          right.record.generation.compareTo(left.record.generation),
    );
    final winner = committed.first;
    if (committed.length == 2 &&
        committed[1].record.generation == winner.record.generation &&
        !winner.record.same(committed[1].record)) {
      throw CredentialDurableStateFailure('ambiguous generation');
    }
    _current = winner.record;
    _currentSlot = winner.slot;
    if (_processEpoch < winner.record.writerEpoch) {
      _processEpoch = winner.record.writerEpoch;
    }
    try {
      await _store.read(hint);
    } catch (_) {}
    return CredentialRecovery(winner.record);
  }

  Future<CredentialRecordDecodeResult> _read(String key) async {
    try {
      return CloudCredentialRecord.decode(await _store.read(key));
    } on CloudCredentialStoreFailure {
      throw CredentialDurableStateFailure('slot read failed');
    } catch (_) {
      throw CredentialDurableStateFailure('slot read failed');
    }
  }

  Future<T> _locked<T>(Future<T> Function() action) {
    final result = _processTail.then((_) => action());
    _processTail = result.then<void>((_) {}, onError: (error, stackTrace) {});
    return result;
  }

  CloudCredentialRecord _withPhase(
    CloudCredentialRecord record,
    CredentialRecordPhase phase,
  ) => record.credentialState == CredentialState.active
      ? CloudCredentialRecord.active(
          generation: record.generation,
          previousGeneration: record.previousGeneration,
          writerEpoch: record.writerEpoch,
          commitId: record.commitId,
          state: phase,
          credentials: record.credentials!,
        )
      : CloudCredentialRecord.cleared(
          generation: record.generation,
          previousGeneration: record.previousGeneration,
          writerEpoch: record.writerEpoch,
          commitId: record.commitId,
          state: phase,
          issuedAtUtc: record.issuedAtUtc,
        );

  String _checksum(CloudCredentialRecord record) =>
      (record.encode().split('"checksum":"').last).split('"').first;
}

class _Located {
  const _Located(this.slot, this.result);
  final CredentialSlot slot;
  final CredentialRecordDecodeResult result;
  CloudCredentialRecord get record => result.record!;
}

extension on CloudCredentialRecord? {
  bool same(CloudCredentialRecord other) => this?.encode() == other.encode();
}
