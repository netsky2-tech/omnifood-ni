import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

import 'ohac_test_helpers.dart';

const tenant = '11111111-1111-4111-8111-111111111111';
const otherTenant = '22222222-2222-4222-8222-222222222222';
const authorizer = '33333333-3333-4333-8333-333333333333';
const terminal = 'Q802024120001';

const maxInt64 = '9223372036854775807';
const maxInt64MinusOne = '9223372036854775806';
const maxInt64PlusOne = '9223372036854775808';
final boundaryDigest = 'sha256:${'b' * 64}';

Map<String, dynamic> epochEntry() => <String, dynamic>{
  'userId': authorizer,
  'status': 'ACTIVE',
  'role': 'MANAGER',
  'permissions': <String>['sales:void_invoice'],
  'pinVerifier': <String, dynamic>{
    'algorithm': 'bcrypt',
    'formatVersion': '2b',
    'encoded': r'$2b$10$abcdefghijklmnopqrstuv',
  },
  'attemptResetGeneration': '0',
};

Map<String, dynamic> epochBody([Map<String, dynamic> overrides = const {}]) =>
    <String, dynamic>{
      'schema': staffPolicyEpochV1Schema,
      'tenantId': tenant,
      'targetTerminalId': terminal,
      'sequence': '1',
      'previousSequence': '0',
      'previousDigest': genesisDigest,
      'publisherBackendBuild': 'backend-build-1',
      'targetPosBuild': 'pos-build-1',
      'minimumAssertionSchema': 'ohac.assertion.v1',
      'policyEntries': <Map<String, dynamic>>[epochEntry()],
      ...overrides,
    };

OhacEpochAcceptanceInput acceptanceInput([
  Map<String, dynamic> overrides = const {},
]) => OhacEpochAcceptanceInput(
  epoch: overrides['epoch']! as StaffPolicyEpochV1,
  expectedTenantId: (overrides['expectedTenantId'] ?? tenant) as String,
  expectedTerminalId: (overrides['expectedTerminalId'] ?? terminal) as String,
  acceptedSequence: (overrides['acceptedSequence'] ?? '0') as String,
  acceptedDigest: (overrides['acceptedDigest'] ?? genesisDigest) as String,
  supportedPosBuild:
      (overrides['supportedPosBuild'] ?? 'pos-build-1') as String,
);

void main() {
  test('parses a valid signed epoch', () {
    final result = parseStaffPolicyEpochV1(signBody(epochBody()));
    expect(result, isA<OhacSuccess<StaffPolicyEpochV1>>());
    if (result case final OhacSuccess<StaffPolicyEpochV1> success) {
      expect(success.value.sequence, '1');
      expect(success.value.policyEntries, hasLength(1));
      expect(
        RegExp(r'^sha256:[0-9a-f]{64}$').hasMatch(success.value.digest),
        isTrue,
      );
    }
  });

  test(
    'rejects a payload whose transmitted digest does not match its bytes',
    () {
      final body = epochBody(<String, dynamic>{'digest': 'sha256:${'0' * 64}'});
      final result = parseStaffPolicyEpochV1(utf8Bytes(jsonEncode(body)));
      expect(failureOf(result).code, OhacErrorCode.digestMismatch);
    },
  );

  test('rejects an unsupported schema id', () {
    final result = parseStaffPolicyEpochV1(
      signBody(
        epochBody(<String, dynamic>{'schema': 'ohac.staff-policy-epoch.v2'}),
      ),
    );
    expect(failureOf(result).code, OhacErrorCode.unsupportedSchema);
  });

  test(
    'requires the supported assertion schema for minimumAssertionSchema',
    () {
      // The supported assertion schema constant itself parses.
      expect(
        parseStaffPolicyEpochV1(
          signBody(
            epochBody(<String, dynamic>{
              'minimumAssertionSchema': minimumAssertionSchema,
            }),
          ),
        ),
        isA<OhacSuccess<StaffPolicyEpochV1>>(),
      );

      // Unknown non-empty schema ids are rejected with the schema-level
      // error, not a build/field error.
      final error = failureOf(
        parseStaffPolicyEpochV1(
          signBody(
            epochBody(<String, dynamic>{
              'minimumAssertionSchema': 'ohac.assertion.v2',
            }),
          ),
        ),
      );
      expect(error.code, OhacErrorCode.unsupportedSchema);
      expect(error.field, 'minimumAssertionSchema');
    },
  );

  test('rejects unknown and missing fields', () {
    expect(
      failureOf(
        parseStaffPolicyEpochV1(
          signBody(epochBody(<String, dynamic>{'extra': 'nope'})),
        ),
      ).code,
      OhacErrorCode.unknownField,
    );
    final withoutTerminal = epochBody()..remove('targetTerminalId');
    expect(
      failureOf(parseStaffPolicyEpochV1(signBody(withoutTerminal))).code,
      OhacErrorCode.missingField,
    );
  });

  test(
    'reports unknownField, never a digest mismatch, for a signed payload carrying the reserved `__proto__` key',
    () {
      // The publisher stamped its integrity digest over bytes whose canonical
      // form includes the reserved key; digest verification must keep it (like
      // the TS own property) and the exact-keys guard — not the digest — must
      // reject it.
      final withReserved = epochBody()..['__proto__'] = 'x';
      final error = failureOf(parseStaffPolicyEpochV1(signBody(withReserved)));
      expect(error.code, OhacErrorCode.unknownField);
      expect(error.field, '__proto__');
    },
  );

  test(
    'rejects non-canonical decimal strings and non-contiguous sequences',
    () {
      expect(
        failureOf(
          parseStaffPolicyEpochV1(
            signBody(epochBody(<String, dynamic>{'sequence': '01'})),
          ),
        ).code,
        OhacErrorCode.invalidField,
      );
      expect(
        failureOf(
          parseStaffPolicyEpochV1(
            signBody(
              epochBody(<String, dynamic>{
                'sequence': '5',
                'previousSequence': '0',
              }),
            ),
          ),
        ).code,
        OhacErrorCode.invalidField,
      );
    },
  );

  test('accepts the maximum Int64 sequence chained from max-1', () {
    final epoch =
        (parseStaffPolicyEpochV1(
              signBody(
                epochBody(<String, dynamic>{
                  'sequence': maxInt64,
                  'previousSequence': maxInt64MinusOne,
                  'previousDigest': boundaryDigest,
                }),
              ),
            ))
            as OhacSuccess<StaffPolicyEpochV1>;
    expect(epoch.value.sequence, maxInt64);

    expect(
      validateEpochAcceptance(
        acceptanceInput(<String, dynamic>{
          'epoch': epoch.value,
          'acceptedSequence': maxInt64MinusOne,
          'acceptedDigest': boundaryDigest,
        }),
      ),
      isA<OhacSuccess<StaffPolicyEpochV1>>(),
    );

    // The Int64 head itself is semantically valid: no newer epoch can exist,
    // so the outcome is staleness, never a throw or a field error.
    final stale = failureOf(
      validateEpochAcceptance(
        acceptanceInput(<String, dynamic>{
          'epoch': epoch.value,
          'acceptedSequence': maxInt64,
          'acceptedDigest': boundaryDigest,
        }),
      ),
    );
    expect(stale.code, OhacErrorCode.sequenceNotNewer);
    expect(stale.field, 'sequence');
  });

  test('rejects sequence values beyond Int64 before BigInt parsing', () {
    final beyondHead = failureOf(
      parseStaffPolicyEpochV1(
        signBody(
          epochBody(<String, dynamic>{
            'sequence': maxInt64PlusOne,
            'previousSequence': maxInt64,
            'previousDigest': boundaryDigest,
          }),
        ),
      ),
    );
    expect(beyondHead.code, OhacErrorCode.invalidField);
    expect(beyondHead.field, 'sequence');

    final beyondChain = failureOf(
      parseStaffPolicyEpochV1(
        signBody(
          epochBody(<String, dynamic>{
            'sequence': '1',
            'previousSequence': maxInt64PlusOne,
          }),
        ),
      ),
    );
    expect(beyondChain.code, OhacErrorCode.invalidField);
    expect(beyondChain.field, 'previousSequence');
  });

  test('rejects a huge decimal sequence before an expensive parse', () {
    final huge = '9' * 400;
    final error = failureOf(
      parseStaffPolicyEpochV1(
        signBody(
          epochBody(<String, dynamic>{
            'sequence': huge,
            'previousSequence': '${'9' * 399}8',
            'previousDigest': boundaryDigest,
          }),
        ),
      ),
    );
    expect(error.code, OhacErrorCode.invalidField);
    expect(error.field, 'sequence');
  });

  test(
    'returns OHAC_INVALID_FIELD for a malformed acceptedSequence instead of throwing',
    () {
      final epoch =
          (parseStaffPolicyEpochV1(signBody(epochBody()))
                  as OhacSuccess<StaffPolicyEpochV1>)
              .value;

      for (final acceptedSequence in <String>[
        '',
        'abc',
        '01',
        '-1',
        '+1',
        '1.0',
        ' 1',
        '1e3',
        maxInt64PlusOne,
        '9' * 400,
      ]) {
        final error = failureOf(
          validateEpochAcceptance(
            acceptanceInput(<String, dynamic>{
              'epoch': epoch,
              'acceptedSequence': acceptedSequence,
            }),
          ),
        );
        expect(error.code, OhacErrorCode.invalidField);
        expect(error.field, 'acceptedSequence');
      }
    },
  );

  test(
    'returns OHAC_INVALID_FIELD for a malformed acceptedDigest instead of proceeding',
    () {
      final epoch =
          (parseStaffPolicyEpochV1(signBody(epochBody()))
                  as OhacSuccess<StaffPolicyEpochV1>)
              .value;

      for (final acceptedDigest in <String>[
        '',
        'genesis',
        'GENESIS ',
        '0' * 64,
        'sha256:',
        'sha256:${'a' * 63}',
        'sha256:${'a' * 65}',
        'sha256:${'A' * 64}',
        'sha256:${'g' * 64}',
      ]) {
        final error = failureOf(
          validateEpochAcceptance(
            acceptanceInput(<String, dynamic>{
              'epoch': epoch,
              'acceptedDigest': acceptedDigest,
            }),
          ),
        );
        expect(error.code, OhacErrorCode.invalidField);
        expect(error.field, 'acceptedDigest');
      }
    },
  );

  test(
    'requires entries sorted by userId with de-duplicated sorted permissions',
    () {
      const secondUser = '44444444-4444-4444-8444-444444444444';
      final entry = epochEntry();
      final unsorted = <Map<String, dynamic>>[
        <String, dynamic>{...entry, 'userId': secondUser},
        <String, dynamic>{...entry, 'userId': authorizer},
      ];
      expect(
        failureOf(
          parseStaffPolicyEpochV1(
            signBody(epochBody(<String, dynamic>{'policyEntries': unsorted})),
          ),
        ).code,
        OhacErrorCode.invalidField,
      );

      final unsortedPermissions = <Map<String, dynamic>>[
        <String, dynamic>{
          ...entry,
          'permissions': <String>[
            'sales:void_invoice',
            'analytics:read',
            'analytics:read',
          ],
        },
      ];
      expect(
        failureOf(
          parseStaffPolicyEpochV1(
            signBody(
              epochBody(<String, dynamic>{
                'policyEntries': unsortedPermissions,
              }),
            ),
          ),
        ).code,
        OhacErrorCode.invalidField,
      );
    },
  );

  test('rejects unknown roles and statuses', () {
    expect(
      failureOf(
        parseStaffPolicyEpochV1(
          signBody(
            epochBody(<String, dynamic>{
              'policyEntries': <Map<String, dynamic>>[
                <String, dynamic>{...epochEntry(), 'role': 'SUPERUSER'},
              ],
            }),
          ),
        ),
      ).code,
      OhacErrorCode.invalidField,
    );
    expect(
      failureOf(
        parseStaffPolicyEpochV1(
          signBody(
            epochBody(<String, dynamic>{
              'policyEntries': <Map<String, dynamic>>[
                <String, dynamic>{...epochEntry(), 'status': 'PENDING'},
              ],
            }),
          ),
        ),
      ).code,
      OhacErrorCode.invalidField,
    );
  });

  test(
    'rejects a foreign tenant, a foreign terminal and an unsupported build pair',
    () {
      final epoch =
          (parseStaffPolicyEpochV1(signBody(epochBody()))
                  as OhacSuccess<StaffPolicyEpochV1>)
              .value;

      expect(
        failureOf(
          validateEpochAcceptance(
            acceptanceInput(<String, dynamic>{
              'epoch': epoch,
              'expectedTenantId': otherTenant,
            }),
          ),
        ).code,
        OhacErrorCode.tenantScopeMismatch,
      );
      expect(
        failureOf(
          validateEpochAcceptance(
            acceptanceInput(<String, dynamic>{
              'epoch': epoch,
              'expectedTerminalId': 'OTHER-TERMINAL',
            }),
          ),
        ).code,
        OhacErrorCode.tenantTerminalMismatch,
      );
      expect(
        failureOf(
          validateEpochAcceptance(
            acceptanceInput(<String, dynamic>{
              'epoch': epoch,
              'supportedPosBuild': 'pos-build-9',
            }),
          ),
        ).code,
        OhacErrorCode.unsupportedBuildPair,
      );
    },
  );

  test('accepts only the exact next epoch and rejects a broken chain', () {
    final epoch =
        (parseStaffPolicyEpochV1(signBody(epochBody()))
                as OhacSuccess<StaffPolicyEpochV1>)
            .value;

    expect(
      validateEpochAcceptance(
        acceptanceInput(<String, dynamic>{'epoch': epoch}),
      ),
      isA<OhacSuccess<StaffPolicyEpochV1>>(),
    );

    expect(
      failureOf(
        validateEpochAcceptance(
          acceptanceInput(<String, dynamic>{
            'epoch': epoch,
            'acceptedSequence': '1',
          }),
        ),
      ).code,
      OhacErrorCode.sequenceNotNewer,
    );

    expect(
      failureOf(
        validateEpochAcceptance(
          acceptanceInput(<String, dynamic>{
            'epoch': epoch,
            'acceptedDigest': 'sha256:${'a' * 64}',
          }),
        ),
      ).code,
      OhacErrorCode.invalidField,
    );
  });

  test(
    'chains epoch 1 from GENESIS only, and later epochs from real digests only',
    () {
      expect(
        failureOf(
          parseStaffPolicyEpochV1(
            signBody(
              epochBody(<String, dynamic>{
                'sequence': '1',
                'previousSequence': '0',
                'previousDigest': 'sha256:${'a' * 64}',
              }),
            ),
          ),
        ).code,
        OhacErrorCode.invalidField,
      );
      expect(
        failureOf(
          parseStaffPolicyEpochV1(
            signBody(
              epochBody(<String, dynamic>{
                'sequence': '2',
                'previousSequence': '1',
                'previousDigest': genesisDigest,
              }),
            ),
          ),
        ).code,
        OhacErrorCode.invalidField,
      );
    },
  );

  test('rejects an empty policy entry list', () {
    expect(
      failureOf(
        parseStaffPolicyEpochV1(
          signBody(
            epochBody(<String, dynamic>{
              'policyEntries': <Map<String, dynamic>>[],
            }),
          ),
        ),
      ).code,
      OhacErrorCode.invalidField,
    );
  });

  group('value-object immutability (defensive unmodifiable copies)', () {
    test('entry permissions reject mutation and are not aliased to input', () {
      final input = <String>['sales:void_invoice'];
      final entry = StaffPolicyEpochEntryV1(
        userId: authorizer,
        status: 'ACTIVE',
        role: 'MANAGER',
        permissions: input,
        pinVerifier: const OhacPinVerifierV1(
          algorithm: 'bcrypt',
          formatVersion: '2b',
          encoded: r'$2b$10$abcdefghijklmnopqrstuv',
        ),
        attemptResetGeneration: '0',
      );

      expect(
        () => entry.permissions.add('analytics:read'),
        throwsUnsupportedError,
      );
      expect(() => entry.permissions.removeAt(0), throwsUnsupportedError);
      expect(() => entry.permissions[0] = 'tampered', throwsUnsupportedError);

      expect(entry.permissions, isNot(same(input)));
      input.add('analytics:read');
      input[0] = 'tampered';
      expect(entry.permissions, <String>['sales:void_invoice']);
    });

    test(
      'epoch policyEntries reject mutation and are not aliased to input',
      () {
        final entry = StaffPolicyEpochEntryV1(
          userId: authorizer,
          status: 'ACTIVE',
          role: 'MANAGER',
          permissions: <String>['sales:void_invoice'],
          pinVerifier: const OhacPinVerifierV1(
            algorithm: 'bcrypt',
            formatVersion: '2b',
            encoded: r'$2b$10$abcdefghijklmnopqrstuv',
          ),
          attemptResetGeneration: '0',
        );
        final otherEntry = StaffPolicyEpochEntryV1(
          userId: '44444444-4444-4444-8444-444444444444',
          status: 'ACTIVE',
          role: 'CASHIER',
          permissions: <String>['analytics:read'],
          pinVerifier: entry.pinVerifier,
          attemptResetGeneration: '0',
        );
        final input = <StaffPolicyEpochEntryV1>[entry];
        final epoch = StaffPolicyEpochV1(
          schema: staffPolicyEpochV1Schema,
          tenantId: tenant,
          targetTerminalId: terminal,
          sequence: '1',
          previousSequence: '0',
          previousDigest: genesisDigest,
          publisherBackendBuild: 'backend-build-1',
          targetPosBuild: 'pos-build-1',
          minimumAssertionSchema: 'ohac.assertion.v1',
          policyEntries: input,
          digest: 'sha256:${'d' * 64}',
        );

        expect(
          () => epoch.policyEntries.add(otherEntry),
          throwsUnsupportedError,
        );
        expect(() => epoch.policyEntries.removeAt(0), throwsUnsupportedError);

        expect(epoch.policyEntries, isNot(same(input)));
        input.add(otherEntry);
        expect(epoch.policyEntries, hasLength(1));
        expect(epoch.policyEntries.single, same(entry));
      },
    );

    test('a parsed epoch exposes unmodifiable lists at the boundary', () {
      final epoch =
          (parseStaffPolicyEpochV1(signBody(epochBody()))
                  as OhacSuccess<StaffPolicyEpochV1>)
              .value;

      expect(
        () => epoch.policyEntries.add(epoch.policyEntries.single),
        throwsUnsupportedError,
      );
      expect(
        () => epoch.policyEntries.single.permissions.add('x'),
        throwsUnsupportedError,
      );
    });
  });
}
