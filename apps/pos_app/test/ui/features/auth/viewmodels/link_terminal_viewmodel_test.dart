import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/auth/terminal_linking.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/auth/viewmodels/link_terminal_viewmodel.dart';

class _MockAuthRepository extends Mock implements AuthRepository {}

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
}
