import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/ports/activation_sync_port.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/security/device_sync_bootstrap_coordinator.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';
import 'package:pos_app/domain/security/ohac_integrity_recovery_coordinator.dart';
import 'package:pos_app/domain/security/ohac_observability.dart';

class _MockDeviceSyncCredentialStore extends Mock
    implements DeviceSyncCredentialStore {}

/// The credential-provisioning seam (design §9): the ONLY path through which
/// device credentials may ever be touched. The recovery coordinator under
/// test holds no port of its own.
class _MockActivationSyncPort extends Mock implements ActivationSyncPort {}

/// Unit U5b (design §9): the ordered clear-data path. Transport restore
/// (the existing DeviceSyncBootstrapCoordinator seam) runs FIRST; the OHAC
/// token redeem runs ONLY after transport success. Failure at step 1 stops
/// the recovery — the redeem step is never reached. OHAC never provisions,
/// confirms, rotates or revokes device credentials.
void main() {
  const tenantId = 'tenant-1';
  const terminalId = 'dev-1';
  const deviceId = 'dev-1';

  final ownerUser = const User(
    id: 'user-owner-1',
    name: 'Owner Alice',
    role: UserRole.owner,
    isActive: true,
    tenantId: tenantId,
  );

  final managerUser = const User(
    id: 'user-mgr-1',
    name: 'Manager Bob',
    role: UserRole.manager,
    isActive: true,
    tenantId: tenantId,
  );

  late _MockDeviceSyncCredentialStore store;
  late _MockActivationSyncPort port;
  late DeviceSyncBootstrapCoordinator bootstrap;
  final List<String> callOrder = [];
  final List<OhacObservabilityFact> facts = [];

  DeviceSyncCredentialRecord record({
    required String credentialId,
    required String secret,
    required DateTime expiresAt,
  }) => DeviceSyncCredentialRecord(
    credentialId: credentialId,
    tenantId: tenantId,
    deviceId: deviceId,
    renewalSecret: secret,
    credentialVersion: 1,
    expiresAt: expiresAt,
    scopes: const ['sync:push', 'sync:pull'],
  );

  setUpAll(() {
    registerFallbackValue(
      record(
        credentialId: 'fallback',
        secret: 'fallback-secret',
        expiresAt: DateTime.utc(2027),
      ),
    );
  });

  setUp(() {
    store = _MockDeviceSyncCredentialStore();
    port = _MockActivationSyncPort();
    facts.clear();
    callOrder.clear();

    when(() => store.readCandidate()).thenAnswer((_) async => null);
    when(() => store.readCredential()).thenAnswer((_) async => null);
    when(() => store.stageCandidate(any())).thenAnswer((_) async {});
    when(() => store.commitCandidate()).thenAnswer((_) async {});
    when(() => store.rollbackCandidate()).thenAnswer((_) async {});
    when(() => store.clearCredential()).thenAnswer((_) async {});

    bootstrap = DeviceSyncBootstrapCoordinator(
      store: store,
      activationSyncPort: port,
      resolveDeviceId: () async => deviceId,
      nowUtc: () => DateTime.utc(2026, 6, 1, 12, 0, 0),
    );
  });

  /// The transport seam wired to the real bootstrap coordinator (DSI-7
  /// ownership): the ONLY credential-touching code in this suite lives here.
  Future<bool> restoreTransport(User user) async {
    callOrder.add('transport');
    final result = await bootstrap.bootstrap(user: user);
    return result.isSuccessful;
  }

  OhacIntegrityRecoveryCoordinator coordinator({
    Future<OhacTokenRedeemResult> Function()? redeem,
    required User user,
  }) => OhacIntegrityRecoveryCoordinator(
    restoreActivationTransport: () => restoreTransport(user),
    redeemOhacToken: redeem == null
        ? null
        : () async {
            callOrder.add('redeem');
            return redeem();
          },
    observe: facts.add,
  );

  group('ordered clear-data path (design §9)', () {
    test('transport failure stops the recovery: redeem never reached and the '
        'credential-provisioning seam is never invoked', () async {
      // A non-owner fails the bootstrap role gate: the transport step
      // reports failure without ANY credential interaction.
      var redeemCalls = 0;
      final outcome =
          await coordinator(
            user: managerUser,
            redeem: () async {
              redeemCalls++;
              return const OhacTokenRedeemSucceeded();
            },
          ).recover(
            tenantId: tenantId,
            terminalId: terminalId,
            integrityClassification: 'LOCAL_ROLLBACK',
          );

      expect(outcome, isA<OhacRecoveryTransportFailed>());
      expect(callOrder, [
        'transport',
      ], reason: 'transport ran, redeem never reached');
      expect(redeemCalls, 0);
      // design §9: OHAC never provisions/confirms/rotates/revokes device
      // credentials — zero interactions with the provisioning seam.
      verifyZeroInteractions(port);
    });

    test('transport success precedes redeem: ordering enforced, credentials '
        'touched only through the bootstrap seam', () async {
      // Confirm echoes the staged secret (the bootstrap's
      // secret-verification requires the confirmed response to match).
      const pendingSecret =
          'pending-secret-entropy-64-bytes-long-padding-for-security!!';
      const activeSecret = pendingSecret;
      final pending = record(
        credentialId: 'cred-1',
        secret: pendingSecret,
        expiresAt: DateTime.utc(2026, 6, 1, 12, 15, 0),
      );
      final active = record(
        credentialId: 'cred-1',
        secret: activeSecret,
        expiresAt: DateTime.utc(2027, 6, 1, 12, 0, 0),
      );
      // The bootstrap coordinator reads the candidate back after staging
      // the confirmed record; model that read-back with a mutable value.
      var candidate = pending;
      when(() => store.readCandidate()).thenAnswer((_) async => candidate);
      when(() => store.stageCandidate(any())).thenAnswer((_) async {});
      when(
        () => port.confirmBootstrapDeviceSyncCredential(
          credentialId: 'cred-1',
          deviceId: deviceId,
          credentialVersion: 1,
          renewalSecret: pendingSecret,
        ),
      ).thenAnswer((_) async {
        callOrder.add('confirm');
        candidate = active;
        return active;
      });

      final outcome =
          await coordinator(
            user: ownerUser,
            redeem: () async => const OhacTokenRedeemSucceeded(),
          ).recover(
            tenantId: tenantId,
            terminalId: terminalId,
            integrityClassification: 'LOCAL_ROLLBACK',
          );

      expect(outcome, isA<OhacRecoveryCompleted>());
      expect(
        callOrder.indexOf('transport'),
        lessThan(callOrder.indexOf('redeem')),
        reason: 'transport FIRST, redeem only after transport success',
      );
      // The ONLY credential interaction was the confirm inside the
      // injected DSI-7 closure — never a coordinator-owned call.
      verify(
        () => port.confirmBootstrapDeviceSyncCredential(
          credentialId: 'cred-1',
          deviceId: deviceId,
          credentialVersion: 1,
          renewalSecret: pendingSecret,
        ),
      ).called(1);
      verifyNever(
        () => port.provisionBootstrapDeviceSyncCredential(
          deviceId: any(named: 'deviceId'),
        ),
      );
    });

    test('transport failure with no redeem port injected: the outcome is '
        'the transport failure, never a redeem result', () async {
      final outcome = await coordinator(user: managerUser).recover(
        tenantId: tenantId,
        terminalId: terminalId,
        integrityClassification: 'LOCAL_ROLLBACK',
      );

      // With the non-owner transport failure AND no redeem port, the
      // failure still dominates: step 1 failed, so the outcome is the
      // transport failure, never a redeem result.
      expect(outcome, isA<OhacRecoveryTransportFailed>());
      expect(callOrder, ['transport']);
    });

    test(
      'transport-only mode: successful transport with no redeem port',
      () async {
        // Owner with an already-active local credential: transport restores
        // as a no-op without provisioning.
        final active = record(
          credentialId: 'cred-1',
          secret: 'active-secret-entropy-64-bytes-long-padding-sec!!',
          expiresAt: DateTime.utc(2027, 6, 1, 12, 0, 0),
        );
        when(() => store.readCredential()).thenAnswer((_) async => active);

        final outcome = await coordinator(user: ownerUser).recover(
          tenantId: tenantId,
          terminalId: terminalId,
          integrityClassification: 'LOCAL_ROLLBACK',
        );

        expect(outcome, isA<OhacRecoveryTransportRestoredOnly>());
        expect(callOrder, ['transport']);
        verifyZeroInteractions(port);
      },
    );

    test('redeem failure is reported, never thrown through', () async {
      final active = record(
        credentialId: 'cred-1',
        secret: 'active-secret-entropy-64-bytes-long-padding-sec!!',
        expiresAt: DateTime.utc(2027, 6, 1, 12, 0, 0),
      );
      when(() => store.readCredential()).thenAnswer((_) async => active);

      final outcome =
          await coordinator(
            user: ownerUser,
            redeem: () async => const OhacTokenRedeemFailed('token_consumed'),
          ).recover(
            tenantId: tenantId,
            terminalId: terminalId,
            integrityClassification: 'LOCAL_ROLLBACK',
          );

      expect(outcome, isA<OhacRecoveryCompleted>());
      final completed = outcome as OhacRecoveryCompleted;
      expect(completed.redeem, isA<OhacTokenRedeemFailed>());
    });
  });

  group('recovery observability facts', () {
    test('each step emits a fact with pinned content', () async {
      final active = record(
        credentialId: 'cred-1',
        secret: 'active-secret-entropy-64-bytes-long-padding-sec!!',
        expiresAt: DateTime.utc(2027, 6, 1, 12, 0, 0),
      );
      when(() => store.readCredential()).thenAnswer((_) async => active);

      await coordinator(
        user: ownerUser,
        redeem: () async => const OhacTokenRedeemSucceeded(),
      ).recover(
        tenantId: tenantId,
        terminalId: terminalId,
        integrityClassification: 'LOCAL_ROLLBACK',
      );

      final events = facts.map((f) => f.event).toList();
      expect(events.contains('ohac_recovery_step'), isTrue);
      final started = facts.firstWhere((f) => f.fields['step'] == 'transport');
      expect(started.fields['outcome'], 'started');
      expect(started.fields['classification'], 'LOCAL_ROLLBACK');
      expect(facts.any((f) => f.fields['step'] == 'redeem'), isTrue);
    });
  });
}
