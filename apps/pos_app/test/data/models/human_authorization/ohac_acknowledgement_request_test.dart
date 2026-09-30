import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/human_authorization/ohac_acknowledgement_request.dart';
import 'package:pos_app/data/models/human_authorization/ohac_delivery_entities.dart';

/// Unit coverage for the OHAC acknowledgement request builder and its
/// deterministic idempotency key (design §5 step 3, §10).
///
/// The backend DTO (`human-authorization-ack.dto.ts`) requires ALL EIGHT
/// fields with strict formats, and its idempotency contract replays the
/// stored receipt for the same key + same claim while answering
/// `IDEMPOTENCY_CONFLICT` for the same key + a different claim. The key is
/// therefore derived from the claim itself — stable across process death so
/// a lost-response retry replays, and distinct per claim so two different
/// claims can never collide under one key.
void main() {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const terminalId = 'dev-1';
  const posBuild = '2.3.4+11';
  const assertionSchema = 'ohac.assertion.v1';
  final digest = 'sha256:${'d' * 64}';
  final previousDigest = 'sha256:${'c' * 64}';

  OhacPolicyEpochEntity epoch({
    int sequence = 2,
    String digestValue = '',
    String previousDigestValue = '',
  }) =>
      OhacPolicyEpochEntity(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: sequence,
        digest: digestValue.isEmpty ? digest : digestValue,
        previousSequence: sequence - 1,
        previousDigest:
            previousDigestValue.isEmpty ? previousDigest : previousDigestValue,
        schema: 'ohac.staff-policy-epoch.v1',
        targetPosBuild: posBuild,
        publisherBackendBuild: 'backend-build-1',
        minimumAssertionSchema: assertionSchema,
        payload: '{"sequence":$sequence}',
        receivedAt: '2026-01-01T00:00:00.000Z',
      );

  Map<String, String>? build({
    OhacPolicyEpochEntity? epochValue,
    String tenant = tenantId,
    String terminal = terminalId,
    String? buildValue = posBuild,
    String negotiatedAssertionSchema = assertionSchema,
  }) =>
      buildOhacAcknowledgementRequestBody(
        epoch: epochValue ?? epoch(),
        tenantId: tenant,
        terminalId: terminal,
        posBuild: buildValue,
        negotiatedAssertionSchema: negotiatedAssertionSchema,
      );

  group('deriveOhacAckIdempotencyKey', () {
    test('is stable across repeated derivations of the same claim', () {
      final first = deriveOhacAckIdempotencyKey(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 2,
        digest: digest,
      );
      final second = deriveOhacAckIdempotencyKey(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 2,
        digest: digest,
      );
      expect(first, second);
      expect(first, isNotEmpty);
    });

    test('is a sha256 hex digest', () {
      final key = deriveOhacAckIdempotencyKey(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 2,
        digest: digest,
      );
      expect(key, matches(RegExp(r'^[0-9a-f]{64}$')));
    });

    test('is distinct per claim sequence and digest', () {
      final base = deriveOhacAckIdempotencyKey(
        tenantId: tenantId,
        terminalId: terminalId,
        sequence: 2,
        digest: digest,
      );
      expect(
        deriveOhacAckIdempotencyKey(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 3,
          digest: digest,
        ),
        isNot(base),
      );
      expect(
        deriveOhacAckIdempotencyKey(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 2,
          digest: 'sha256:${'e' * 64}',
        ),
        isNot(base),
      );
    });

    test('does not collide across terminals of the same tenant', () {
      final keyA = deriveOhacAckIdempotencyKey(
        tenantId: tenantId,
        terminalId: 'terminal-a',
        sequence: 2,
        digest: digest,
      );
      final keyB = deriveOhacAckIdempotencyKey(
        tenantId: tenantId,
        terminalId: 'terminal-b',
        sequence: 2,
        digest: digest,
      );
      expect(keyA, isNot(keyB));
    });

    test('the length-prefixed preimage is injective: separator-collision '
        'splits that WOULD collide under a plain join stay distinct', () {
      // Without length prefixes, tenantId 'a|b' + terminalId 'c' and
      // tenantId 'a' + terminalId 'b|c' both render the SAME joined
      // substring 'a|b|c' — a real separator-collision pair (this is the
      // closest collision the preimage structure admits: plain 'x1'/'2'
      // style splits do not collide once a separator exists). The preimage
      // embeds each field's length, so the two renders differ and the
      // derived keys must too. If a regression drops the prefixes, this
      // test and the golden below both fail.
      final keyA = deriveOhacAckIdempotencyKey(
        tenantId: 'a|b',
        terminalId: 'c',
        sequence: 2,
        digest: digest,
      );
      final keyB = deriveOhacAckIdempotencyKey(
        tenantId: 'a',
        terminalId: 'b|c',
        sequence: 2,
        digest: digest,
      );
      expect(keyA, isNot(keyB));
    });

    test('golden pin: the exact preimage format, hashed once, pinned here',
        () {
      // Any change to the canonical preimage — a dropped length prefix, a
      // different separator, a different domain string — changes this key
      // and MUST fail CI: a released build deriving keys under a new format
      // would answer IDEMPOTENCY_CONFLICT against receipts stored under the
      // old format, freezing every submitting terminal.
      expect(
        deriveOhacAckIdempotencyKey(
          tenantId: '11111111-1111-4111-8111-111111111111',
          terminalId: 'dev-1',
          sequence: 2,
          digest: 'sha256:${'d' * 64}',
        ),
        '5be7a1054cd1ff3bf5ea9634cabe91da5f753bde288860033472f1c9e2ed81c7',
      );
    });

    test('refuses an empty identity, a non-positive sequence or an empty '
        'digest instead of deriving a key over a broken claim', () {
      expect(
        () => deriveOhacAckIdempotencyKey(
          tenantId: '',
          terminalId: terminalId,
          sequence: 2,
          digest: digest,
        ),
        throwsArgumentError,
      );
      expect(
        () => deriveOhacAckIdempotencyKey(
          tenantId: tenantId,
          terminalId: '',
          sequence: 2,
          digest: digest,
        ),
        throwsArgumentError,
      );
      expect(
        () => deriveOhacAckIdempotencyKey(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 0,
          digest: digest,
        ),
        throwsArgumentError,
      );
      expect(
        () => deriveOhacAckIdempotencyKey(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 2,
          digest: '',
        ),
        throwsArgumentError,
      );
    });
  });

  group('buildOhacAcknowledgementRequestBody', () {
    test('builds the exact eight DTO fields with the exact values', () {
      final body = build();
      expect(body, isNotNull);
      // Byte-for-byte: the key set is exactly the DTO's eight required
      // fields — no identity fields (the server derives tenant/terminal
      // from the device principal), no extras.
      expect(
        body!.keys.toSet(),
        {
          'schema',
          'sequence',
          'digest',
          'previousSequence',
          'previousDigest',
          'posBuild',
          'assertionSchema',
          'idempotencyKey',
        },
      );
      expect(body['schema'], 'ohac.staff-policy-epoch.v1');
      expect(body['sequence'], '2');
      expect(body['digest'], digest);
      expect(body['previousSequence'], '1');
      expect(body['previousDigest'], previousDigest);
      expect(body['posBuild'], posBuild);
      expect(body['assertionSchema'], assertionSchema);
    });

    test('every wire value satisfies the backend DTO regexes', () {
      final body = build()!;
      expect(body['sequence'], matches(RegExp(r'^\d+$')));
      expect(body['previousSequence'], matches(RegExp(r'^\d+$')));
      expect(body['digest'], matches(RegExp(r'^sha256:[0-9a-f]{64}$')));
      expect(
        body['previousDigest'],
        matches(RegExp(r'^(GENESIS|sha256:[0-9a-f]{64})$')),
      );
      expect(body['posBuild'], isNotEmpty);
      expect(body['assertionSchema'], isNotEmpty);
      expect(body['idempotencyKey'], isNotEmpty);
    });

    test('carries the epoch chain GENESIS value verbatim for epoch 1', () {
      final body = build(
        epochValue: epoch(
          sequence: 1,
          previousDigestValue: 'GENESIS',
        ),
      )!;
      expect(body['previousSequence'], '0');
      expect(body['previousDigest'], 'GENESIS');
    });

    test('derives the idempotency key from the claim identity', () {
      final body = build()!;
      expect(
        body['idempotencyKey'],
        deriveOhacAckIdempotencyKey(
          tenantId: tenantId,
          terminalId: terminalId,
          sequence: 2,
          digest: digest,
        ),
      );
    });

    test('a null or empty posBuild fails closed with no body', () {
      expect(build(buildValue: null), isNull);
      expect(build(buildValue: ''), isNull);
    });

    test('an empty negotiated assertion schema fails closed with no body',
        () {
      expect(build(negotiatedAssertionSchema: ''), isNull);
    });

    test('an empty tenant or terminal fails closed with no body', () {
      expect(build(tenant: ''), isNull);
      expect(build(terminal: ''), isNull);
    });

    test('a digest that is not the contract shape fails closed with no body',
        () {
      expect(
        build(
          epochValue: epoch(digestValue: 'not-a-digest'),
        ),
        isNull,
      );
    });

    test('a previousDigest that is neither GENESIS nor a digest fails closed',
        () {
      expect(
        build(epochValue: epoch(previousDigestValue: 'HEAD')),
        isNull,
      );
    });

    test('a non-positive sequence fails closed with no body', () {
      expect(build(epochValue: epoch(sequence: 0)), isNull);
    });

    test('a blank epoch schema fails closed with no body', () {
      final broken = epoch();
      expect(
        build(
          epochValue: OhacPolicyEpochEntity(
            tenantId: broken.tenantId,
            terminalId: broken.terminalId,
            sequence: broken.sequence,
            digest: broken.digest,
            previousSequence: broken.previousSequence,
            previousDigest: broken.previousDigest,
            schema: '',
            targetPosBuild: broken.targetPosBuild,
            publisherBackendBuild: broken.publisherBackendBuild,
            minimumAssertionSchema: broken.minimumAssertionSchema,
            payload: broken.payload,
            receivedAt: broken.receivedAt,
          ),
        ),
        isNull,
      );
    });
  });
}
