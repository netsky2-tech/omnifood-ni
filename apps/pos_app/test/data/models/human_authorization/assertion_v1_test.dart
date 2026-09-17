import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/assertion_v1.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

import 'ohac_test_helpers.dart';

const tenant = '11111111-1111-4111-8111-111111111111';
const terminal = 'Q802024120001';
const authorizer = '33333333-3333-4333-8333-333333333333';
const operator = '44444444-4444-4444-8444-444444444444';
const credential = '55555555-5555-4555-8555-555555555555';
const localAudit = '66666666-6666-4666-8666-666666666666';
final hash = 'sha256:${'a' * 64}';

Map<String, dynamic> assertionBody([Map<String, dynamic> overrides = const {}]) =>
    <String, dynamic>{
      'schema': assertionV1Schema,
      'assertionId': '77777777-7777-4777-8777-777777777777',
      'tenantId': tenant,
      'terminalId': terminal,
      'deviceCredentialId': credential,
      'deviceCredentialVersion': '3',
      'epochSequence': '17',
      'epochDigest': 'sha256:${'b' * 64}',
      'authorizerUserId': authorizer,
      'operatorUserId': operator,
      'authorizerRole': 'MANAGER',
      'permissionsUsed': <String>['sales:void_invoice'],
      'operationType': 'sales.credit-note.v1',
      'operationSchema': 'sales.credit-note.v1',
      'operationDigest': 'sha256:${'c' * 64}',
      'localAuthorizationSequence': '42',
      'localAuditId': localAudit,
      'localAuditEntryHash': hash,
      'posBuild': 'pos-build-1',
      'policySchema': staffPolicyEpochV1Schema,
      'trustLevel': OhacTrustLevel.applicationSandboxSoftware,
      'authorizedAt': '2026-09-17T02:00:00Z',
      ...overrides,
    };

void main() {
  test('parses a valid signed assertion', () {
    final result = parseAssertionV1(signBody(assertionBody()));
    expect(result, isA<OhacSuccess<OhacAssertionV1>>());
    if (result case final OhacSuccess<OhacAssertionV1> success) {
      expect(success.value.assertionId, '77777777-7777-4777-8777-777777777777');
      expect(success.value.trustLevel, 'APPLICATION_SANDBOX_SOFTWARE');
      expect(
        RegExp(r'^sha256:[0-9a-f]{64}$').hasMatch(success.value.digest),
        isTrue,
      );
    }
  });

  test('has no signature field, so a signature claim is rejected as unknown',
      () {
    final result = parseAssertionV1(signBody(assertionBody(
      <String, dynamic>{'signature': 'nope'},
    )));
    expect(failureOf(result).code, OhacErrorCode.unknownField);
  });

  test('rejects a digest that does not cover the transmitted body', () {
    final body = assertionBody(<String, dynamic>{
      'digest': 'sha256:${'0' * 64}',
    });
    final result = parseAssertionV1(utf8Bytes(jsonEncode(body)));
    expect(failureOf(result).code, OhacErrorCode.digestMismatch);
  });

  test('accepts only the declared software trust level', () {
    final result = parseAssertionV1(signBody(assertionBody(
      <String, dynamic>{'trustLevel': 'HARDWARE_ATTESTED'},
    )));
    expect(failureOf(result).code, OhacErrorCode.invalidField);
  });

  test('requires the declared policy schema to be the epoch contract', () {
    final result = parseAssertionV1(signBody(assertionBody(
      <String, dynamic>{'policySchema': 'ohac.staff-policy-epoch.v2'},
    )));
    expect(failureOf(result).code, OhacErrorCode.unsupportedSchema);
  });

  test('rejects non-canonical decimal strings and malformed digests', () {
    expect(
      failureOf(parseAssertionV1(signBody(assertionBody(
        <String, dynamic>{'deviceCredentialVersion': '03'},
      )))).code,
      OhacErrorCode.invalidField,
    );
    expect(
      failureOf(parseAssertionV1(signBody(assertionBody(
        <String, dynamic>{'operationDigest': 'c' * 64},
      )))).code,
      OhacErrorCode.invalidField,
    );
  });

  test('requires permissionsUsed to be non-empty, sorted and de-duplicated',
      () {
    expect(
      failureOf(parseAssertionV1(signBody(assertionBody(
        <String, dynamic>{'permissionsUsed': <String>[]},
      )))).code,
      OhacErrorCode.invalidField,
    );
    expect(
      failureOf(parseAssertionV1(signBody(assertionBody(
        <String, dynamic>{
          'permissionsUsed': <String>['sales:void_invoice', 'analytics:read'],
        },
      )))).code,
      OhacErrorCode.invalidField,
    );
  });

  test('requires a UTC RFC3339 timestamp', () {
    final result = parseAssertionV1(signBody(assertionBody(
      <String, dynamic>{'authorizedAt': '2026-09-17T02:00:00-06:00'},
    )));
    expect(failureOf(result).code, OhacErrorCode.invalidField);
  });

  test('rejects an unknown role and a missing required field', () {
    expect(
      failureOf(parseAssertionV1(signBody(assertionBody(
        <String, dynamic>{'authorizerRole': 'SUPERUSER'},
      )))).code,
      OhacErrorCode.invalidField,
    );
    final withoutTerminal = assertionBody()..remove('terminalId');
    expect(
      failureOf(parseAssertionV1(signBody(withoutTerminal))).code,
      OhacErrorCode.missingField,
    );
  });

  test('rejects a foreign-tenant assertion at the value layer before any store access',
      () {
    // A malformed tenant id fails field validation with a stable code; the
    // tenant/terminal binding equality itself is verified by the backend
    // verifier port (Slice D), but the contract already pins the shape.
    final result = parseAssertionV1(signBody(assertionBody(
      <String, dynamic>{'tenantId': otherTenantUpper},
    )));
    expect(failureOf(result).code, OhacErrorCode.invalidField);
  });

  test('permissionsUsed reject mutation and are not aliased to input', () {
    final input = <String>['sales:void_invoice'];
    final assertion = OhacAssertionV1(
      schema: assertionV1Schema,
      assertionId: '77777777-7777-4777-8777-777777777777',
      tenantId: tenant,
      terminalId: terminal,
      deviceCredentialId: credential,
      deviceCredentialVersion: '3',
      epochSequence: '17',
      epochDigest: 'sha256:${'b' * 64}',
      authorizerUserId: authorizer,
      operatorUserId: operator,
      authorizerRole: 'MANAGER',
      permissionsUsed: input,
      operationType: 'sales.credit-note.v1',
      operationSchema: 'sales.credit-note.v1',
      operationDigest: 'sha256:${'c' * 64}',
      localAuthorizationSequence: '42',
      localAuditId: localAudit,
      localAuditEntryHash: hash,
      posBuild: 'pos-build-1',
      policySchema: staffPolicyEpochV1Schema,
      trustLevel: OhacTrustLevel.applicationSandboxSoftware,
      authorizedAt: '2026-09-17T02:00:00Z',
      digest: 'sha256:${'d' * 64}',
    );

    expect(
      () => assertion.permissionsUsed.add('analytics:read'),
      throwsUnsupportedError,
    );
    expect(
      () => assertion.permissionsUsed.removeAt(0),
      throwsUnsupportedError,
    );
    expect(
      () => assertion.permissionsUsed[0] = 'tampered',
      throwsUnsupportedError,
    );

    expect(assertion.permissionsUsed, isNot(same(input)));
    input.add('analytics:read');
    input[0] = 'tampered';
    expect(assertion.permissionsUsed, <String>['sales:void_invoice']);
  });

  test('a parsed assertion exposes an unmodifiable permissionsUsed list', () {
    final assertion =
        (parseAssertionV1(signBody(assertionBody()))
                as OhacSuccess<OhacAssertionV1>)
            .value;

    expect(() => assertion.permissionsUsed.add('x'), throwsUnsupportedError);
  });
}

/// Uppercase UUIDs are rejected because OHAC requires lowercase canonical ids.
const otherTenantUpper = 'ABCDEF12-ABCD-4BCD-8BCD-ABCDEFABCDEF';
