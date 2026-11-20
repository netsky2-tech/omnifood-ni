import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/security_profile_dao.dart';
import 'package:pos_app/data/daos/user_dao.dart';
import 'package:pos_app/data/repositories/auth_repository_impl.dart';
import 'package:pos_app/data/services/local_auth_service.dart';
import 'package:pos_app/domain/models/auth/terminal_linking.dart';

class _MockUserDao extends Mock implements UserDao {}

class _MockSecurityProfileDao extends Mock implements SecurityProfileDao {}

class _MockLocalAuthService extends Mock implements LocalAuthService {}

class _StubHttpClientAdapter implements HttpClientAdapter {
  _StubHttpClientAdapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _jsonResponse(Map<String, dynamic> body, {int statusCode = 200}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: <String, List<String>>{
      Headers.contentTypeHeader: <String>[Headers.jsonContentType],
    },
  );
}

void main() {
  const sampleFingerprint =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  late _MockUserDao userDao;
  late _MockSecurityProfileDao securityProfileDao;
  late _MockLocalAuthService localAuthService;

  setUp(() {
    userDao = _MockUserDao();
    securityProfileDao = _MockSecurityProfileDao();
    localAuthService = _MockLocalAuthService();
  });

  AuthRepositoryImpl buildRepo(_StubHttpClientAdapter adapter) {
    final dio = Dio(BaseOptions(baseUrl: 'https://api.nhilospos.com'))
      ..options.headers['Authorization'] = 'Bearer stale-token-must-be-stripped'
      ..httpClientAdapter = adapter;
    return AuthRepositoryImpl(
      userDao,
      securityProfileDao,
      localAuthService,
      dio,
      claimDio: dio,
      linkingRetryDelay: Duration.zero,
    );
  }

  group('AuthRepositoryImpl terminal reactivation (issue #566)', () {
    test('claimLinkingCode sends hardwareFingerprint and parses '
        'reactivationChallengeId without Authorization header', () async {
      final adapter = _StubHttpClientAdapter((options) async {
        return _jsonResponse(<String, dynamic>{
          'tenantId': 'tenant-1',
          'slug': 'cafe-central',
          'deviceId': 'terminal-canonical-9',
          'linkedAt': '2026-11-19T12:00:00.000Z',
          'reactivationChallengeId': 'challenge-uuid-1',
        });
      });

      final repo = buildRepo(adapter);
      final result = await repo.claimLinkingCode(
        'AB12CD',
        'pos-local-temp',
        hardwareFingerprint: sampleFingerprint,
      );

      expect(adapter.requests, hasLength(1));
      final req = adapter.requests.single;
      expect(req.path, '/onboarding/activation/link');
      expect(req.headers.containsKey('Authorization'), isFalse);
      expect(req.data, <String, dynamic>{
        'code': 'AB12CD',
        'deviceId': 'pos-local-temp',
        'hardwareFingerprint': sampleFingerprint,
      });
      expect(result.deviceId, 'terminal-canonical-9');
      expect(result.reactivationChallengeId, 'challenge-uuid-1');
    });

    test('lookupReactivationDevice calls device-lookup without Authorization '
        'and parses found result', () async {
      final adapter = _StubHttpClientAdapter((options) async {
        return _jsonResponse(<String, dynamic>{
          'found': true,
          'recoveryChallengeId': 'challenge-123',
          'status': 'PENDING',
          'maskedHint': 'Terminal «••••1234» — Ca*** Ce***',
          'expiresAt': '2026-11-19T12:15:00.000Z',
        });
      });

      final repo = buildRepo(adapter);
      final result = await repo.lookupReactivationDevice(sampleFingerprint);

      final req = adapter.requests.single;
      expect(req.path, '/onboarding/activation/device-lookup');
      expect(req.headers.containsKey('Authorization'), isFalse);
      expect(req.data, <String, dynamic>{
        'hardwareFingerprint': sampleFingerprint,
      });
      expect(result.found, isTrue);
      expect(result.recoveryChallengeId, 'challenge-123');
      expect(result.status, 'PENDING');
      expect(result.maskedHint, 'Terminal «••••1234» — Ca*** Ce***');
      expect(result.expiresAt, DateTime.utc(2026, 11, 19, 12, 15));
    });

    test('completeReactivation maps REACTIVATION_APPROVAL_REQUIRED to Spanish '
        'message', () async {
      final adapter = _StubHttpClientAdapter((options) async {
        return _jsonResponse(
          <String, dynamic>{
            'code': 'REACTIVATION_APPROVAL_REQUIRED',
            'message': 'Approval required',
          },
          statusCode: 403,
        );
      });

      final repo = buildRepo(adapter);
      await expectLater(
        () => repo.completeReactivation(
          challengeId: 'challenge-123',
          hardwareFingerprint: sampleFingerprint,
        ),
        throwsA(
          isA<TerminalReactivationException>()
              .having((e) => e.code, 'code', 'REACTIVATION_APPROVAL_REQUIRED')
              .having(
                (e) => e.userMessage,
                'userMessage',
                'Esperando aprobación desde el panel del negocio o ingresá tu código de recuperación de 6 dígitos.',
              ),
        ),
      );
    });

    test('completeReactivation sends recoveryCode and confirmReactivationCredential '
        'posts credential confirmation', () async {
      final adapter = _StubHttpClientAdapter((options) async {
        if (options.path.endsWith('/complete')) {
          return _jsonResponse(<String, dynamic>{
            'tenantId': 'tenant-1',
            'slug': 'cafe-central',
            'terminalId': 'terminal-canonical-9',
            'activationAttemptId': 'attempt-1',
            'credentialId': 'cred-uuid-2',
            'version': 2,
            'renewalSecret': 'super-secret-renewal-token-0123456789',
            'expiresAt': '2027-01-01T00:00:00.000Z',
            'previousVersion': 1,
          });
        }
        return _jsonResponse(<String, dynamic>{
          'credentialId': 'cred-uuid-2',
          'version': 2,
          'status': 'ACTIVE',
          'expiresAt': '2027-01-01T00:00:00.000Z',
        });
      });

      final repo = buildRepo(adapter);
      final completed = await repo.completeReactivation(
        challengeId: 'challenge-123',
        hardwareFingerprint: sampleFingerprint,
        recoveryCode: '654321',
      );

      expect(completed.terminalId, 'terminal-canonical-9');
      expect(completed.version, 2);
      expect(completed.previousVersion, 1);

      await repo.confirmReactivationCredential(
        challengeId: 'challenge-123',
        credentialId: completed.credentialId,
        version: completed.version,
        renewalSecret: completed.renewalSecret,
      );

      expect(adapter.requests, hasLength(2));
      expect(
        adapter.requests[0].path,
        '/onboarding/activation/reactivation/challenge-123/complete',
      );
      expect(adapter.requests[0].data, <String, dynamic>{
        'hardwareFingerprint': sampleFingerprint,
        'recoveryCode': '654321',
      });
      expect(
        adapter.requests[1].path,
        '/onboarding/activation/reactivation/challenge-123/confirm',
      );
      expect(adapter.requests[1].data, <String, dynamic>{
        'credentialId': 'cred-uuid-2',
        'version': 2,
        'renewalSecret': 'super-secret-renewal-token-0123456789',
      });
    });
  });
}
