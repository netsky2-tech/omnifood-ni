import 'dart:developer' as developer;

import 'cloud_credential_record.dart';
import 'cloud_credential_store.dart';
import 'cloud_credentials.dart';
import 'cloud_revocation_barrier.dart';

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
  const CredentialCommitResult.committed(
    this.record, {
    this.durable = true,
  }) : stale = false;

  const CredentialCommitResult.stale()
      : record = null,
        stale = true,
        durable = false;

  final CloudCredentialRecord? record;
  final bool stale;
  final bool durable;

  bool get committed => !stale;
  bool get isDurable => durable && committed;
  bool get isDegraded => !durable && committed;
}

class CredentialRecovery {
  const CredentialRecovery(this.record);
  final CloudCredentialRecord? record;
}

class CloudCredentialCoordinator {
  CloudCredentialCoordinator(
    this._store, {
    required String Function() commitId,
    CloudRevocationBarrierStore? barrierStore,
  })  : _commitId = commitId,
        _barrierStore = barrierStore;

  static const slotA = 'cloud_credentials_slot_a_v1';
  static const slotB = 'cloud_credentials_slot_b_v1';
  static const hint = 'cloud_credentials_hint_v1';
  final CloudCredentialStore _store;
  final String Function() _commitId;
  final CloudRevocationBarrierStore? _barrierStore;
  static Future<void> _processTail = Future.value();
  static BigInt _processEpoch = BigInt.zero;

  static void resetProcessCoordinationForTest() {
    _processTail = Future.value();
    _processEpoch = BigInt.zero;
  }

  CloudCredentialRecord? _current;
  CredentialSlot? _currentSlot;
  BigInt? _lastKnownGeneration;

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
    RevocationBarrier? barrier;
    if (_barrierStore != null) {
      try {
        barrier = await _barrierStore!.readBarrier();
      } catch (e) {
        developer.log(
          'Failed to read revocation barrier during commit: $e',
          name: 'CloudCredentialCoordinator',
        );
      }
    }
    var baseGen = current?.generation ??
        _lastKnownGeneration ??
        barrier?.generation ??
        BigInt.zero;
    if (barrier?.generation != null && barrier!.generation! > baseGen) {
      baseGen = barrier.generation!;
    }
    final newGeneration = baseGen + BigInt.one;
    final clearPrev = baseGen > BigInt.zero ? baseGen : null;
    final record = CloudCredentialRecord.active(
      generation: newGeneration,
      previousGeneration: current != null ? current.generation : clearPrev,
      writerEpoch: intent.epoch,
      commitId: _commitId(),
      state: CredentialRecordPhase.prepared,
      credentials: credentials,
    );
    final durable = await _persist(record);
    if (durable && _barrierStore != null) {
      try {
        await _barrierStore!.clearBarrier();
      } catch (e) {
        developer.log(
          'Failed to clear revocation barrier after durable commit: $e',
          name: 'CloudCredentialCoordinator',
        );
      }
    }
    return CredentialCommitResult.committed(_current!, durable: durable);
  });

  Future<CredentialCommitResult> clear() => _locked(() async {
    final current = (await _recover()).record;
    _processEpoch += BigInt.one;
    RevocationBarrier? barrier;
    if (_barrierStore != null) {
      try {
        barrier = await _barrierStore!.readBarrier();
      } catch (e) {
        developer.log(
          'Failed to read revocation barrier during clear: $e',
          name: 'CloudCredentialCoordinator',
        );
      }
    }
    var baseGen = current?.generation ??
        _lastKnownGeneration ??
        barrier?.generation ??
        BigInt.zero;
    if (barrier?.generation != null && barrier!.generation! > baseGen) {
      baseGen = barrier.generation!;
    }
    final clearGeneration = baseGen + BigInt.one;
    final clearPrev = baseGen > BigInt.zero ? baseGen : null;
    final record = CloudCredentialRecord.cleared(
      generation: clearGeneration,
      previousGeneration: clearPrev,
      writerEpoch: _processEpoch,
      commitId: _commitId(),
      state: CredentialRecordPhase.prepared,
      issuedAtUtc: DateTime.now().toUtc(),
    );

    // Clear in-memory credential immediately so process state cannot resurrect
    _current = _withPhase(record, CredentialRecordPhase.committed);

    // Write durable non-secret revocation barrier before attempting secure store write.
    // If secure delete or write fails/hangs, the barrier prevents resurrecting older records.
    bool barrierWritten = false;
    Object? barrierFailure;
    if (_barrierStore != null) {
      try {
        await _barrierStore!.writeBarrier(
          RevocationBarrier(
            revokedAtUtc: record.issuedAtUtc,
            generation: clearGeneration,
          ),
        );
        barrierWritten = true;
      } catch (e) {
        barrierFailure = e;
        developer.log(
          'Failed to write revocation barrier during clear: $e',
          name: 'CloudCredentialCoordinator',
        );
      }
    }

    final durable = await _persist(record);

    if (!durable && !barrierWritten) {
      throw CredentialDurableStateFailure(
        'neither secure revocation nor durable barrier can be established'
        '${barrierFailure != null ? ' (barrier error: $barrierFailure)' : ''}',
      );
    }

    return CredentialCommitResult.committed(_current!, durable: durable);
  });

  Future<bool> _persist(CloudCredentialRecord prepared) async {
    final slot = _currentSlot == CredentialSlot.a
        ? CredentialSlot.b
        : CredentialSlot.a;
    final key = slot == CredentialSlot.a ? slotA : slotB;

    // When the platform Keystore is hung (both reads AND writes time out),
    // we still need to carry the credential forward in memory so that
    // subsequent API calls (sync, etc.) can authenticate.
    try {
      await _store.write(key, prepared.encode());
    } on CloudCredentialStoreFailure catch (e) {
      developer.log(
        'Keystore write failed (${e.runtimeType}); falling back to in-memory only',
        name: 'CloudCredentialCoordinator',
      );
      _current = _withPhase(prepared, CredentialRecordPhase.committed);
      _currentSlot = slot;
      return false;
    }

    bool durable = true;
    try {
      if (!(await _read(key)).record.same(prepared)) {
        throw CredentialDurableStateFailure('prepared read-back mismatch');
      }
    } on CredentialDurableStateFailure catch (e) {
      developer.log(
        'Prepared read-back failed (${e.reason}); continuing with in-memory record',
        name: 'CloudCredentialCoordinator',
      );
      durable = false;
    }

    final committed = _withPhase(prepared, CredentialRecordPhase.committed);
    try {
      await _store.write(key, committed.encode());
    } on CloudCredentialStoreFailure catch (e) {
      developer.log(
        'Committed write failed (${e.runtimeType}); falling back to in-memory only',
        name: 'CloudCredentialCoordinator',
      );
      _current = committed;
      _currentSlot = slot;
      return false;
    }

    try {
      if (!(await _read(key)).record.same(committed)) {
        throw CredentialDurableStateFailure('committed read-back mismatch');
      }
    } on CredentialDurableStateFailure catch (e) {
      developer.log(
        'Committed read-back failed (${e.reason}); continuing with in-memory record',
        name: 'CloudCredentialCoordinator',
      );
      durable = false;
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
    return durable;
  }

  Future<CredentialRecovery> _recover() async {
    // Fast path: if we already have a valid in-memory record from a prior
    // commit in this process, return it immediately.  This is critical when
    // the platform Keystore is hung (reads time out) — the record was written
    // successfully but read-back verification could not confirm it.
    if (_current != null &&
        (_current!.credentialState == CredentialState.active ||
            _current!.credentialState == CredentialState.cleared)) {
      return CredentialRecovery(_current);
    }

    RevocationBarrier? barrier;
    bool barrierUnavailable = false;
    if (_barrierStore != null) {
      try {
        barrier = await _barrierStore!.readBarrier();
      } catch (e) {
        barrierUnavailable = true;
        developer.log(
          'Failed to read revocation barrier during recovery: $e',
          name: 'CloudCredentialCoordinator',
        );
      }
    }

    List<CredentialRecordDecodeResult> reads;
    try {
      final a = await _read(slotA);
      final b = await _read(slotB);
      reads = [a, b];
    } on CredentialDurableStateFailure {
      // Keystore is hung or corrupted — return whatever we have in memory
      // (which may be null on cold start).
      return CredentialRecovery(_current);
    }

    final committed = <_Located>[];
    final invalid = <CredentialRecordStatus>[];
    for (final located in [
      _Located(CredentialSlot.a, reads[0]),
      _Located(CredentialSlot.b, reads[1]),
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

    // Check revocation barrier:
    // 1. If barrier state could not be established (corruption / read error),
    // we MUST NOT accept durable credentials (fail closed).
    if (barrierUnavailable) {
      developer.log(
        'Durable record generation ${winner.record.generation} rejected because revocation barrier state cannot be established',
        name: 'CloudCredentialCoordinator',
      );
      _lastKnownGeneration = winner.record.generation;
      _current = null;
      _currentSlot = winner.slot;
      return const CredentialRecovery(null);
    }

    // 2. If barrier is present and winner is older than or equal to barrier, reject it!
    if (barrier != null &&
        barrier.rejects(
          recordGeneration: winner.record.generation,
          recordIssuedAtUtc: winner.record.issuedAtUtc,
        )) {
      developer.log(
        'Durable record generation ${winner.record.generation} rejected by revocation barrier',
        name: 'CloudCredentialCoordinator',
      );
      _lastKnownGeneration = winner.record.generation;
      _current = null;
      _currentSlot = winner.slot;
      return const CredentialRecovery(null);
    }

    _lastKnownGeneration = winner.record.generation;
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
