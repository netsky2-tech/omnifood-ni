import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/hardware_fingerprint_service.dart';
import 'package:pos_app/data/services/terminal_identity_service.dart';
import 'package:pos_app/domain/models/auth/terminal_linking.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/security/device_sync_credential_record.dart';
import 'package:pos_app/domain/security/device_sync_credential_store.dart';
import 'package:pos_app/ui/features/auth/viewmodels/link_terminal_viewmodel.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

class _InMemoryLocalConfigDao implements LocalConfigDao {
  final Map<String, LocalConfigEntity> saved = <String, LocalConfigEntity>{};

  @override
  Future<void> deleteConfig(String key) async => saved.remove(key);

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) async => saved[key];

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    saved[config.key] = config;
  }
}

class _InMemoryDeviceSyncCredentialStore implements DeviceSyncCredentialStore {
  DeviceSyncCredentialRecord? active;
  DeviceSyncCredentialRecord? candidate;

  @override
  Future<void> clearCredential() async => active = null;

  @override
  Future<void> commitCandidate() async {
    active = candidate;
    candidate = null;
  }

  @override
  Future<DeviceSyncCredentialRecord?> readCandidate() async => candidate;

  @override
  Future<DeviceSyncCredentialRecord?> readCredential() async => active;

  @override
  Future<void> rollbackCandidate() async => candidate = null;

  @override
  Future<void> stageCandidate(DeviceSyncCredentialRecord record) async {
    candidate = record;
  }

  @override
  Future<void> writeCredential(DeviceSyncCredentialRecord record) async {
    active = record;
  }
}

/// Verifies the linking viewmodel orchestration (issue #556): claim the
/// pre-auth code, persist the slug (+tenantId) on success, surface the
/// user-facing error and persist nothing on failure.
void main() {
  late _MockAuthRepository authRepository;
  final persistedSlugs = <String>[];
  final persistedTenantIds = <String>[];

  setUpAll(() {
    registerFallbackValue(
      const TerminalLinking(tenantId: '', slug: '', deviceId: ''),
    );
  });

  setUp(() {
    authRepository = _MockAuthRepository();
    persistedSlugs.clear();
    persistedTenantIds.clear();
  });

  LinkTerminalViewModel buildViewModel() {
    return LinkTerminalViewModel(
      authRepository,
      deviceId: 'pos-local-1234abcd',
      persistTenantSlug: (slug) async => persistedSlugs.add(slug),
      persistTenantId: (tenantId) async => persistedTenantIds.add(tenantId),
    );
  }

  test('link succeeds: claims the code, persists slug and tenantId, reports '
      'success', () async {
    when(() => authRepository.claimLinkingCode('AB12CD', 'pos-local-1234abcd'))
        .thenAnswer(
      (_) async => const TerminalLinking(
        tenantId: 'tenant-uuid-1',
        slug: 'soho',
        deviceId: 'pos-local-1234abcd',
        linkedAt: '2026-02-14T10:00:00.000Z',
      ),
    );

    final viewModel = buildViewModel();
    final success = await viewModel.link('AB12CD');

    expect(success, isTrue);
    expect(viewModel.error, isNull);
    expect(persistedSlugs, ['soho']);
    expect(persistedTenantIds, ['tenant-uuid-1']);
    expect(viewModel.isLoading, isFalse);
  });

  test('link failure: surfaces the user-facing message and persists nothing',
      () async {
    when(() => authRepository.claimLinkingCode(any(), any())).thenThrow(
      const LinkingClaimException(
        'Código de vinculación inválido o expirado. Solicite uno nuevo.',
        statusCode: 401,
      ),
    );

    final viewModel = buildViewModel();
    final success = await viewModel.link('XXXXXX');

    expect(success, isFalse);
    expect(viewModel.error,
        'Código de vinculación inválido o expirado. Solicite uno nuevo.');
    expect(persistedSlugs, isEmpty);
    expect(persistedTenantIds, isEmpty);
    expect(viewModel.isLoading, isFalse);
  });

  test('link trims the raw user input before claiming', () async {
    when(() => authRepository.claimLinkingCode('AB12CD', any())).thenAnswer(
      (_) async => const TerminalLinking(
        tenantId: 'tenant-uuid-1',
        slug: 'soho',
        deviceId: 'pos-local-1234abcd',
      ),
    );

    final viewModel = buildViewModel();
    await viewModel.link('  AB12CD ');

    verify(() => authRepository.claimLinkingCode('AB12CD', any()))
        .called(1);
  });

  test('link with a blank code fails fast without touching the repository',
      () async {
    final viewModel = buildViewModel();
    final success = await viewModel.link('   ');

    expect(success, isFalse);
    expect(viewModel.error, isNotNull);
    verifyNever(() => authRepository.claimLinkingCode(any(), any()));
    expect(persistedSlugs, isEmpty);
  });

  test('link with a persistence failure reports a local error without success',
      () async {
    when(() => authRepository.claimLinkingCode(any(), any())).thenAnswer(
      (_) async => const TerminalLinking(
        tenantId: 'tenant-uuid-1',
        slug: 'soho',
        deviceId: 'pos-local-1234abcd',
      ),
    );

    final viewModel = LinkTerminalViewModel(
      authRepository,
      deviceId: 'pos-local-1234abcd',
      persistTenantSlug: (slug) async => throw StateError('disk full'),
    );
    final success = await viewModel.link('AB12CD');

    expect(success, isFalse);
    expect(viewModel.error, isNotNull);
    expect(viewModel.isLoading, isFalse);
  });

  group('Terminal reactivation (issue #566)', () {
    const sampleFingerprint =
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    late _InMemoryLocalConfigDao configDao;
    late TerminalIdentityService terminalIdentityService;
    late _InMemoryDeviceSyncCredentialStore credentialStore;

    setUp(() {
      configDao = _InMemoryLocalConfigDao();
      terminalIdentityService = TerminalIdentityService(configDao);
      credentialStore = _InMemoryDeviceSyncCredentialStore();
    });

    LinkTerminalViewModel buildReactivationViewModel({
      String? fingerprint = sampleFingerprint,
    }) {
      return LinkTerminalViewModel(
        authRepository,
        deviceId: 'pos-local-ephemeral-1',
        persistTenantSlug: (slug) async => persistedSlugs.add(slug),
        persistTenantId: (tenantId) async => persistedTenantIds.add(tenantId),
        hardwareFingerprintService: HardwareFingerprintService(
          provider: () async => fingerprint,
        ),
        terminalIdentityService: terminalIdentityService,
        deviceSyncCredentialStore: credentialStore,
      );
    }

    test('checkReactivationAvailability exposes maskedHint when device-lookup '
        'finds a terminal', () async {
      when(() => authRepository.lookupReactivationDevice(sampleFingerprint))
          .thenAnswer(
        (_) async => DeviceReactivationLookupResult(
          found: true,
          recoveryChallengeId: 'challenge-uuid-1',
          status: 'PENDING',
          maskedHint: 'Terminal «••••4321» — Ca*** Ce***',
          expiresAt: DateTime.utc(2026, 11, 19, 13, 0),
        ),
      );

      final viewModel = buildReactivationViewModel();
      await viewModel.checkReactivationAvailability();

      expect(viewModel.hasPendingReactivation, isTrue);
      expect(
        viewModel.reactivationMaskedHint,
        'Terminal «••••4321» — Ca*** Ce***',
      );
      expect(viewModel.reactivationError, isNull);
    });

    test('completeReactivation blocked with REACTIVATION_APPROVAL_REQUIRED '
        'surfaces clear Spanish guidance', () async {
      when(() => authRepository.lookupReactivationDevice(sampleFingerprint))
          .thenAnswer(
        (_) async => const DeviceReactivationLookupResult(
          found: true,
          recoveryChallengeId: 'challenge-uuid-1',
          status: 'PENDING',
          maskedHint: 'Terminal «••••4321» — Ca*** Ce***',
        ),
      );
      when(
        () => authRepository.completeReactivation(
          challengeId: 'challenge-uuid-1',
          hardwareFingerprint: sampleFingerprint,
          recoveryCode: null,
        ),
      ).thenThrow(
        const TerminalReactivationException(
          'Approval required',
          code: 'REACTIVATION_APPROVAL_REQUIRED',
          statusCode: 403,
        ),
      );

      final viewModel = buildReactivationViewModel();
      await viewModel.checkReactivationAvailability();
      final success = await viewModel.completeReactivation();

      expect(success, isFalse);
      expect(
        viewModel.reactivationError,
        'Esperando aprobación desde el panel del negocio o ingresá tu código de recuperación de 6 dígitos.',
      );
      expect(persistedSlugs, isEmpty);
      expect(credentialStore.active, isNull);
    });

    test('completeReactivation succeeds with 6-digit recovery code, persists '
        'canonical terminalId, confirms credential, and writes store', () async {
      final expiresAt = DateTime.utc(2027, 1, 1);
      when(() => authRepository.lookupReactivationDevice(sampleFingerprint))
          .thenAnswer(
        (_) async => const DeviceReactivationLookupResult(
          found: true,
          recoveryChallengeId: 'challenge-uuid-2',
          status: 'PENDING',
          maskedHint: 'Terminal «••••9999» — Ca*** Ce***',
        ),
      );
      when(
        () => authRepository.completeReactivation(
          challengeId: 'challenge-uuid-2',
          hardwareFingerprint: sampleFingerprint,
          recoveryCode: '482910',
        ),
      ).thenAnswer(
        (_) async => CompletedReactivationResult(
          tenantId: 'tenant-uuid-9',
          slug: 'cafe-central',
          terminalId: 'terminal-canonical-9999',
          activationAttemptId: 'attempt-uuid-1',
          credentialId: 'cred-uuid-2',
          version: 2,
          renewalSecret: 'secret-renewal-token-0123456789abcdef',
          expiresAt: expiresAt,
          previousVersion: 1,
        ),
      );
      when(
        () => authRepository.confirmReactivationCredential(
          challengeId: 'challenge-uuid-2',
          credentialId: 'cred-uuid-2',
          version: 2,
          renewalSecret: 'secret-renewal-token-0123456789abcdef',
        ),
      ).thenAnswer((_) async {});

      final viewModel = buildReactivationViewModel();
      await viewModel.checkReactivationAvailability();
      final success = await viewModel.completeReactivation(
        recoveryCode: '482910',
      );

      expect(success, isTrue);
      expect(viewModel.reactivationError, isNull);
      expect(viewModel.deviceId, 'terminal-canonical-9999');
      expect(
        configDao.saved[TerminalIdentityService.localDeviceIdKey]?.value,
        'terminal-canonical-9999',
      );
      expect(persistedSlugs, ['cafe-central']);
      expect(persistedTenantIds, ['tenant-uuid-9']);
      expect(credentialStore.active?.credentialId, 'cred-uuid-2');
      expect(credentialStore.active?.credentialVersion, 2);
      expect(credentialStore.active?.deviceId, 'terminal-canonical-9999');
      verify(
        () => authRepository.confirmReactivationCredential(
          challengeId: 'challenge-uuid-2',
          credentialId: 'cred-uuid-2',
          version: 2,
          renewalSecret: 'secret-renewal-token-0123456789abcdef',
        ),
      ).called(1);
    });

    test('completeReactivation maps INVALID_RECOVERY_CODE and '
        'REACTIVATION_CHALLENGE_EXPIRED cleanly', () async {
      when(() => authRepository.lookupReactivationDevice(sampleFingerprint))
          .thenAnswer(
        (_) async => const DeviceReactivationLookupResult(
          found: true,
          recoveryChallengeId: 'challenge-uuid-3',
          status: 'PENDING',
          maskedHint: 'Terminal «••••1111» — Ca*** Ce***',
        ),
      );
      when(
        () => authRepository.completeReactivation(
          challengeId: 'challenge-uuid-3',
          hardwareFingerprint: sampleFingerprint,
          recoveryCode: '000000',
        ),
      ).thenThrow(
        const TerminalReactivationException(
          'Invalid',
          code: 'INVALID_RECOVERY_CODE',
          statusCode: 403,
        ),
      );
      when(
        () => authRepository.completeReactivation(
          challengeId: 'challenge-uuid-3',
          hardwareFingerprint: sampleFingerprint,
          recoveryCode: null,
        ),
      ).thenThrow(
        const TerminalReactivationException(
          'Expired',
          code: 'REACTIVATION_CHALLENGE_EXPIRED',
          statusCode: 409,
        ),
      );

      final viewModel = buildReactivationViewModel();
      await viewModel.checkReactivationAvailability();

      expect(
        await viewModel.completeReactivation(recoveryCode: '000000'),
        isFalse,
      );
      expect(
        viewModel.reactivationError,
        'Código de recuperación inválido o ya utilizado.',
      );

      expect(await viewModel.completeReactivation(), isFalse);
      expect(
        viewModel.reactivationError,
        'La solicitud expiró. Tocá «Buscar nuevamente» para generar una nueva.',
      );
    });

    test('factory-reset link passes hardwareFingerprint, adopts canonical '
        'terminalId, and auto-completes reactivation challenge', () async {
      final expiresAt = DateTime.utc(2027, 2, 1);
      when(
        () => authRepository.claimLinkingCode(
          'RST456',
          'pos-local-ephemeral-1',
          hardwareFingerprint: sampleFingerprint,
        ),
      ).thenAnswer(
        (_) async => const TerminalLinking(
          tenantId: 'tenant-uuid-5',
          slug: 'roastery',
          deviceId: 'terminal-original-77',
          reactivationChallengeId: 'auto-approved-challenge-1',
        ),
      );
      when(
        () => authRepository.completeReactivation(
          challengeId: 'auto-approved-challenge-1',
          hardwareFingerprint: sampleFingerprint,
          recoveryCode: null,
        ),
      ).thenAnswer(
        (_) async => CompletedReactivationResult(
          tenantId: 'tenant-uuid-5',
          slug: 'roastery',
          terminalId: 'terminal-original-77',
          activationAttemptId: 'attempt-uuid-5',
          credentialId: 'cred-uuid-3',
          version: 3,
          renewalSecret: 'rotated-secret-renewal-token-0123456789',
          expiresAt: expiresAt,
          previousVersion: 2,
        ),
      );
      when(
        () => authRepository.confirmReactivationCredential(
          challengeId: 'auto-approved-challenge-1',
          credentialId: 'cred-uuid-3',
          version: 3,
          renewalSecret: 'rotated-secret-renewal-token-0123456789',
        ),
      ).thenAnswer((_) async {});

      final viewModel = buildReactivationViewModel();
      final success = await viewModel.link('RST456');

      expect(success, isTrue);
      expect(viewModel.deviceId, 'terminal-original-77');
      expect(
        configDao.saved[TerminalIdentityService.localDeviceIdKey]?.value,
        'terminal-original-77',
      );
      expect(persistedSlugs, contains('roastery'));
      expect(credentialStore.active?.credentialId, 'cred-uuid-3');
      expect(credentialStore.active?.credentialVersion, 3);
      verify(
        () => authRepository.claimLinkingCode(
          'RST456',
          'pos-local-ephemeral-1',
          hardwareFingerprint: sampleFingerprint,
        ),
      ).called(1);
      verify(
        () => authRepository.confirmReactivationCredential(
          challengeId: 'auto-approved-challenge-1',
          credentialId: 'cred-uuid-3',
          version: 3,
          renewalSecret: 'rotated-secret-renewal-token-0123456789',
        ),
      ).called(1);
    });
  });
}
