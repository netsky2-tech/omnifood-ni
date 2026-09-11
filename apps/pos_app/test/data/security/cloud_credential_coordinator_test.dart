import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/security/cloud_credential_coordinator.dart';
import 'package:pos_app/domain/security/cloud_credential_record.dart';
import 'package:pos_app/domain/security/cloud_credentials.dart';

import 'support/fake_cloud_credential_store.dart';

const _id = '123e4567-e89b-42d3-a456-426614174000';

CloudCredentials _credentials(String value) => CloudCredentials(
  accessToken: 'access-$value',
  refreshToken: 'refresh-$value',
  userId: 'user-$value',
  tenantId: 'tenant-$value',
  issuedAtUtc: DateTime.utc(2026, 1, 2),
);

CloudCredentialCoordinator _coordinator(FakeCloudCredentialStore store) =>
    CloudCredentialCoordinator(store, commitId: () => _id);

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
      store.throwOnRead(FakeCloudCredentialStore.slotA);
      expect(
        () => _coordinator(store).recover(),
        throwsA(isA<CredentialDurableStateFailure>()),
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
        if (stage.isHint) {
          expect((await result).committed, isTrue);
        } else {
          await expectLater(result, throwsA(isA<Object>()));
        }
        expect(store.observedStages, contains(stage));
        final recovered = (await _coordinator(store).recover()).record!;
        final committedCandidate =
            stage.isHint ||
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
      await expectLater(
        first.commit(stale, _credentials('candidate')),
        throwsA(isA<Object>()),
      );
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
}
