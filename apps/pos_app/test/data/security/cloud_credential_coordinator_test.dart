import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/cloud_credential_record.dart';
import 'package:pos_app/domain/security/cloud_credentials.dart';
import 'package:pos_app/domain/security/cloud_revocation_barrier.dart';

import 'support/fake_cloud_credential_store.dart';

const _id = '123e4567-e89b-42d3-a456-426614174000';

CloudCredentials _credentials(String value) => CloudCredentials(
  accessToken: 'access-$value',
  refreshToken: 'refresh-$value',
  userId: 'user-$value',
  tenantId: 'tenant-$value',
  issuedAtUtc: DateTime.utc(2026, 1, 2),
);

class FakeCloudRevocationBarrierStore implements CloudRevocationBarrierStore {
  RevocationBarrier? barrier;
  int writeCalls = 0;
  int clearCalls = 0;
  bool throwOnRead = false;
  bool throwOnWrite = false;
  bool throwOnClear = false;

  @override
  Future<RevocationBarrier?> readBarrier() async {
    if (throwOnRead) {
      throw const RevocationBarrierReadFailure('fake read failure');
    }
    return barrier;
  }

  @override
  Future<void> writeBarrier(RevocationBarrier b) async {
    if (throwOnWrite) {
      throw const RevocationBarrierWriteFailure('fake write failure');
    }
    writeCalls++;
    barrier = b;
  }

  @override
  Future<void> clearBarrier() async {
    if (throwOnClear) {
      throw const RevocationBarrierWriteFailure('fake clear failure');
    }
    clearCalls++;
    barrier = null;
  }
}

CloudCredentialCoordinator _coordinator(
  FakeCloudCredentialStore store, {
  CloudRevocationBarrierStore? barrierStore,
}) =>
    CloudCredentialCoordinator(
      store,
      commitId: () => _id,
      barrierStore: barrierStore,
    );

void main() {
  setUp(CloudCredentialCoordinator.resetProcessCoordinationForTest);

  test(
    'recovers empty then commits ACTIVE across restart through one port',
    () async {
      final store = FakeCloudCredentialStore();
      final coordinator = _coordinator(store);
      expect((await coordinator.recover()).record, isNull);
      expect(
        store.observedStages,
        containsAll([FakeFaultStage.slotRead, FakeFaultStage.hintRead]),
      );
      final result = await coordinator.commit(
        await coordinator.reserveIntent(),
        _credentials('one'),
      );
      expect(result.committed, isTrue);
      expect(
        (await _coordinator(store).recover()).record!.credentials!.userId,
        'user-one',
      );
      expect(
        store.keys,
        containsAll(<String>[
          FakeCloudCredentialStore.slotA,
          FakeCloudCredentialStore.hint,
        ]),
      );
    },
  );

  test(
    'rotates generations and clear creates a restart-safe tombstone',
    () async {
      final store = FakeCloudCredentialStore();
      final coordinator = _coordinator(store);
      await coordinator.commit(
        await coordinator.reserveIntent(),
        _credentials('one'),
      );
      final old = await coordinator.reserveIntent();
      final cleared = await _coordinator(store).clear();
      final recovered = await _coordinator(store).recover();
      expect(cleared.record!.generation, BigInt.from(2));
      expect(recovered.record!.credentialState.name, 'cleared');
      expect(
        (await coordinator.commit(old, _credentials('late'))).stale,
        isTrue,
      );
    },
  );

  test(
    'a newer coordinator reservation invalidates an older response',
    () async {
      final store = FakeCloudCredentialStore();
      final first = _coordinator(store);
      final second = _coordinator(store);
      final older = await first.reserveIntent();
      final newer = await second.reserveIntent();
      expect((await first.commit(older, _credentials('old'))).stale, isTrue);
      expect(
        (await second.commit(newer, _credentials('new'))).committed,
        isTrue,
      );
      expect(
        (await _coordinator(store).recover()).record!.credentials!.userId,
        'user-new',
      );
    },
  );

  test(
    'recovers valid committed peer but fails closed for corrupt-only, ties, and read errors',
    () async {
      final store = FakeCloudCredentialStore();
      final coordinator = _coordinator(store);
      await coordinator.commit(
        await coordinator.reserveIntent(),
        _credentials('ok'),
      );
      store.corrupt(FakeCloudCredentialStore.slotB);
      expect(
        (await _coordinator(store).recover()).record!.credentials!.userId,
        'user-ok',
      );
      final onlyCorrupt = FakeCloudCredentialStore()
        ..corrupt(FakeCloudCredentialStore.slotA);
      expect(
        () => _coordinator(onlyCorrupt).recover(),
        throwsA(isA<CredentialDurableStateFailure>()),
      );
      final tied = FakeCloudCredentialStore();
      final tieCoordinator = _coordinator(tied);
      await tieCoordinator.commit(
        await tieCoordinator.reserveIntent(),
        _credentials('tie'),
      );
      tied.values[FakeCloudCredentialStore.slotB] =
          tied.values[FakeCloudCredentialStore.slotA]!;
      expect(
        (await _coordinator(tied).recover()).record!.generation,
        BigInt.one,
      );
      final original = CloudCredentialRecord.decode(
        tied.values[FakeCloudCredentialStore.slotA],
      ).record!;
      tied.values[FakeCloudCredentialStore.slotB] =
          CloudCredentialRecord.active(
            generation: original.generation,
            previousGeneration: original.previousGeneration,
            writerEpoch: original.writerEpoch,
            commitId: '123e4567-e89b-42d3-a456-426614174001',
            state: CredentialRecordPhase.committed,
            credentials: original.credentials!,
          ).encode();
      expect(
        () => _coordinator(tied).recover(),
        throwsA(isA<CredentialDurableStateFailure>()),
      );
      // After Keystore read failure, a fresh coordinator returns null
      // (graceful degradation instead of hard failure).
      store.throwOnRead(FakeCloudCredentialStore.slotA);
      expect(
        (await _coordinator(store).recover()).record,
        isNull,
      );
    },
  );

  test('stage-aware faults prove exact restart recovery', () async {
    for (final stage in FakeFaultStage.commitStages) {
      final faults = stage.name.endsWith('Readback')
          ? FakeFault.values
          : FakeFault.values.take(2);
      for (final fault in faults) {
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final store = FakeCloudCredentialStore();
        final coordinator = _coordinator(store);
        await coordinator.commit(
          await coordinator.reserveIntent(),
          _credentials('prior'),
        );
        store.fault = FakeStageFault(stage, fault);
        final result = coordinator.commit(
          await coordinator.reserveIntent(),
          _credentials('$stage-$fault'),
        );
        // With Keystore-hung resilience, all fault stages now succeed:
        // write failures set _current in memory, read-back failures are non-fatal.
        expect((await result).committed, isTrue);
        expect(store.observedStages, contains(stage));
        final recovered = (await _coordinator(store).recover()).record!;
        final committedCandidate =
            stage.isHint ||
            stage == FakeFaultStage.preparedReadback ||
            stage == FakeFaultStage.committedReadback ||
            stage == FakeFaultStage.committedWrite &&
                fault == FakeFault.mutateThenThrow;
        expect(
          recovered.generation,
          committedCandidate ? BigInt.from(2) : BigInt.one,
        );
        expect(
          recovered.previousGeneration,
          committedCandidate ? BigInt.one : isNull,
        );
        expect(
          recovered.writerEpoch,
          committedCandidate ? BigInt.two : BigInt.one,
        );
        expect(recovered.commitId, _id);
        expect(recovered.state, CredentialRecordPhase.committed);
        expect(
          recovered.credentials!.accessToken,
          committedCandidate ? 'access-$stage-$fault' : 'access-prior',
        );
      }
    }
  });

  test(
    'mutated committed candidate recovers exactly and rejects stale restart intent',
    () async {
      final store = FakeCloudCredentialStore();
      final first = _coordinator(store);
      await first.commit(await first.reserveIntent(), _credentials('prior'));
      final stale = await first.reserveIntent();
      store.fault = const FakeStageFault(
        FakeFaultStage.committedWrite,
        FakeFault.mutateThenThrow,
      );
      // With Keystore-hung resilience, write failures are non-fatal:
      // the record is carried forward in memory even if the store write fails.
      final commitResult = await first.commit(
        stale,
        _credentials('candidate'),
      );
      expect(commitResult.committed, isTrue);
      final restarted = _coordinator(store);
      final record = (await restarted.recover()).record!;
      expect(record.generation, BigInt.from(2));
      expect(record.previousGeneration, BigInt.one);
      expect(record.credentials!.refreshToken, 'refresh-candidate');
      expect(
        (await restarted.commit(stale, _credentials('late'))).stale,
        isTrue,
      );
    },
  );

  test(
    'two coordinators serialize simultaneous reservations without reuse',
    () async {
      final store = FakeCloudCredentialStore();
      final first = _coordinator(store);
      final second = _coordinator(store);
      final intents = await Future.wait([
        first.reserveIntent(),
        second.reserveIntent(),
      ]);
      expect(intents[0].epoch == intents[1].epoch, isFalse);
      final results = await Future.wait([
        first.commit(intents[0], _credentials('first')),
        second.commit(intents[1], _credentials('second')),
      ]);
      expect(results.where((result) => result.committed).length, 1);
      expect(
        (await _coordinator(store).recover()).record!.generation,
        BigInt.one,
      );
    },
  );

  group('Durability & Revocation Barrier', () {
    test('commit exposes accurate durability and degraded state', () async {
      final store = FakeCloudCredentialStore();
      final coordinator = _coordinator(store);

      // Normal durable commit
      final intent1 = await coordinator.reserveIntent();
      final commit1 = await coordinator.commit(intent1, _credentials('durable'));
      expect(commit1.committed, isTrue);
      expect(commit1.isDurable, isTrue);
      expect(commit1.isDegraded, isFalse);

      // Hung Keystore commit: write fails, active record carried in memory
      store.throwOnWrite(FakeCloudCredentialStore.slotB);
      final intent2 = await coordinator.reserveIntent();
      final commit2 = await coordinator.commit(intent2, _credentials('in-memory'));
      expect(commit2.committed, isTrue);
      expect(commit2.isDurable, isFalse);
      expect(commit2.isDegraded, isTrue);
      expect(commit2.record?.credentials?.userId, 'user-in-memory');

      // Pilot behavior: in-memory active credential can be recovered in this process
      final inMemoryRecovery = await coordinator.recover();
      expect(inMemoryRecovery.record?.credentials?.userId, 'user-in-memory');
    });

    test(
      'clear writes non-secret barrier; recovery across restart rejects older durable record when secure clear fails',
      () async {
        final store = FakeCloudCredentialStore();
        final barrierStore = FakeCloudRevocationBarrierStore();
        final coordinator = _coordinator(store, barrierStore: barrierStore);

        // 1. Commit active session generation 1 durably
        final intent = await coordinator.reserveIntent();
        final commit = await coordinator.commit(intent, _credentials('user-one'));
        expect(commit.isDurable, isTrue);
        expect(store.values[FakeCloudCredentialStore.slotA], isNotNull);

        // 2. Keystore hangs during logout: write throws
        store.throwOnWrite(FakeCloudCredentialStore.slotB);
        final clearResult = await coordinator.clear();
        expect(clearResult.committed, isTrue);
        expect(clearResult.isDurable, isFalse); // Keystore write failed!
        expect(clearResult.record?.credentialState, CredentialState.cleared);

        // Barrier was durably written to non-secret store with generation 2
        expect(barrierStore.barrier, isNotNull);
        expect(barrierStore.barrier!.generation, BigInt.from(2));

        // In the same process, coordinator memory is cleared
        expect((await coordinator.recover()).record?.credentialState, CredentialState.cleared);

        // 3. Process restart (cold start): Keystore still holds generation 1 active, but barrier is present!
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final restarted = _coordinator(store, barrierStore: barrierStore);

        // Recovery reads slot A (generation 1), but checks barrier (generation 2) and REJECTS it!
        final recovery = await restarted.recover();
        expect(recovery.record, isNull, reason: 'Old session must NOT resurrect across restart');
      },
    );

    test(
      'later successful new login safely supersedes barrier only after correct commit semantics',
      () async {
        final store = FakeCloudCredentialStore();
        final barrierStore = FakeCloudRevocationBarrierStore();
        final coordinator = _coordinator(store, barrierStore: barrierStore);

        // 1. Commit generation 1, then clear with hung store -> barrier set at generation 2
        await coordinator.commit(await coordinator.reserveIntent(), _credentials('old'));
        store.throwOnWrite(FakeCloudCredentialStore.slotB);
        await coordinator.clear();
        expect(barrierStore.barrier?.generation, BigInt.from(2));

        // 2. Simulate restart
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final afterRestart = _coordinator(store, barrierStore: barrierStore);
        expect((await afterRestart.recover()).record, isNull);

        // 3. New login while Keystore is STILL broken: commit is degraded (in-memory only)
        store.throwOnWrite();
        final newIntent = await afterRestart.reserveIntent();
        final inMemoryCommit = await afterRestart.commit(newIntent, _credentials('new-temp'));
        expect(inMemoryCommit.committed, isTrue);
        expect(inMemoryCommit.isDurable, isFalse);
        // Barrier MUST NOT be cleared because durable store was not updated!
        expect(barrierStore.barrier, isNotNull);

        // Another restart while Keystore was not durably updated still rejects the old generation 1 record
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final restartedAgain = _coordinator(store, barrierStore: barrierStore);
        expect((await restartedAgain.recover()).record, isNull);

        // 4. Keystore recovers: durable login succeeds
        // Stop throwing on write
        final healthyStore = FakeCloudCredentialStore();
        // Pre-populate healthyStore with the old slot A from store
        healthyStore.values[FakeCloudCredentialStore.slotA] = store.values[FakeCloudCredentialStore.slotA]!;
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final healthyCoordinator = _coordinator(healthyStore, barrierStore: barrierStore);
        // Old record is still rejected by barrier
        expect((await healthyCoordinator.recover()).record, isNull);

        // Durable commit now succeeds!
        final durableIntent = await healthyCoordinator.reserveIntent();
        final durableCommit = await healthyCoordinator.commit(durableIntent, _credentials('new-durable'));
        expect(durableCommit.committed, isTrue);
        expect(durableCommit.isDurable, isTrue);
        expect(durableCommit.record!.generation, BigInt.from(3));

        // Barrier is now safely cleared because durable commit succeeded!
        expect(barrierStore.barrier, isNull);

        // On next restart, new durable record is successfully recovered!
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final finalRestart = _coordinator(healthyStore, barrierStore: barrierStore);
        final finalRecord = (await finalRestart.recover()).record;
        expect(finalRecord, isNotNull);
        expect(finalRecord!.credentials!.userId, 'user-new-durable');
        expect(finalRecord.generation, BigInt.from(3));
      },
    );

    test(
      'secure clear failure + barrier failure throws failure and clears in-memory credential immediately',
      () async {
        final store = FakeCloudCredentialStore();
        final barrierStore = FakeCloudRevocationBarrierStore();
        final coordinator = _coordinator(store, barrierStore: barrierStore);

        // 1. Commit active session generation 1 durably
        await coordinator.commit(
          await coordinator.reserveIntent(),
          _credentials('active'),
        );
        expect(
          (await coordinator.recover()).record?.credentials?.userId,
          'user-active',
        );

        // 2. Both Keystore AND Barrier store fail on clear
        store.throwOnWrite();
        barrierStore.throwOnWrite = true;

        // clear() must report failure by throwing CredentialDurableStateFailure
        expect(
          () => coordinator.clear(),
          throwsA(isA<CredentialDurableStateFailure>()),
        );

        // In-memory credential must be cleared immediately (cannot authenticate in current process)
        final inMemoryRecovery = await coordinator.recover();
        expect(inMemoryRecovery.record?.credentials, isNull);
        expect(inMemoryRecovery.record?.credentialState, CredentialState.cleared);
      },
    );

    test(
      'restart recovery fails closed when barrier state cannot be established (corrupt or read failure)',
      () async {
        final store = FakeCloudCredentialStore();
        final barrierStore = FakeCloudRevocationBarrierStore();
        final coordinator = _coordinator(store, barrierStore: barrierStore);

        // 1. Commit active session generation 1 durably
        await coordinator.commit(
          await coordinator.reserveIntent(),
          _credentials('durable-session'),
        );

        // 2. Barrier read fails (e.g. corrupt JSON or IO error)
        barrierStore.throwOnRead = true;

        // 3. Restart coordinator: recovery must NOT accept durable Keystore credentials
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final restarted = _coordinator(store, barrierStore: barrierStore);

        final recovery = await restarted.recover();
        expect(
          recovery.record,
          isNull,
          reason: 'Must fail closed when revocation barrier state cannot be established',
        );
      },
    );

    test(
      'later durable supersession clears prior corrupted barrier and allows recovery',
      () async {
        final store = FakeCloudCredentialStore();
        final barrierStore = FakeCloudRevocationBarrierStore();
        final coordinator = _coordinator(store, barrierStore: barrierStore);

        // 1. Existing slot in store
        await coordinator.commit(
          await coordinator.reserveIntent(),
          _credentials('old-session'),
        );

        // 2. Barrier store is corrupted / throwing on read
        barrierStore.throwOnRead = true;

        // 3. Restart: recovery fails closed
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final afterRestart = _coordinator(store, barrierStore: barrierStore);
        expect((await afterRestart.recover()).record, isNull);

        // 4. Barrier store read resolves, new durable commit is performed
        barrierStore.throwOnRead = false;
        final intent = await afterRestart.reserveIntent();
        final commit = await afterRestart.commit(
          intent,
          _credentials('superseding-session'),
        );
        expect(commit.committed, isTrue);
        expect(commit.isDurable, isTrue);
        expect(barrierStore.clearCalls, greaterThanOrEqualTo(1));

        // 5. Restart: new durable record is recovered
        CloudCredentialCoordinator.resetProcessCoordinationForTest();
        final finalRestart = _coordinator(store, barrierStore: barrierStore);
        final finalRecord = (await finalRestart.recover()).record;
        expect(finalRecord, isNotNull);
        expect(finalRecord!.credentials!.userId, 'user-superseding-session');
      },
    );
  });
}
