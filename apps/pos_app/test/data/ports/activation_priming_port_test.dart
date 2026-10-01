import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/adapters/activation/dio_activation_priming_port.dart';
import 'package:pos_app/data/ports/activation_priming_port.dart';
import 'package:pos_app/domain/services/sales/dgi_numbering_service.dart';

class _MockDio extends Mock implements Dio {}

void main() {
  Map<String, dynamic> validPayload() =>
      <String, dynamic>{
        'status': 'success',
        'serverTime': '2026-09-21T10:00:00.000Z',
        'currentVersion': 7,
        'deltas': <String, dynamic>{
          'products': <Map<String, dynamic>>[
            {
              'id': 'prod-uuid-1',
              'name': 'Gallo Pinto Tradicional',
              'uom': 'PLATO',
              'stock': 10,
              'averageCost': 40,
              'sellPrice': 75,
              'isActive': true,
              'productType': 'SIMPLE',
              'createdAt': '2026-09-21T09:00:00.000Z',
              'tenantId': 'tenant-founder-01',
            },
          ],
          'catalogValues': [
            {
              'id': 'cat-1',
              'catalogType': 'UOM',
              'code': 'PLATO',
              'name': 'Plato',
              'isActive': true,
              'sortOrder': 1,
            },
          ],
          'fiscalConfig': {
            'tenantId': 'tenant-founder-01',
            'businessName': 'Fonda La Patrona',
            'fiscalRegime': 'RIM',
            'configVersion': {
              'revision': 3,
              'fingerprint': 'fiscal-fp-sha256-abc',
            },
            'taxRate': 15,
            'pricesIncludeTax': true,
            'ruc': 'J0310000123456',
            'commercialFxSpread': 0.07,
          },
        },
      };

  group('TerminalPrimingPayload.fromJson', () {
    test('parses a full valid priming payload', () {
      final payload = TerminalPrimingPayload.fromJson(validPayload());

      expect(payload.status, equals('success'));
      expect(payload.serverTime, equals('2026-09-21T10:00:00.000Z'));
      expect(payload.currentVersion, equals(7));
      expect(payload.products, hasLength(1));
      expect(payload.products.first['id'], equals('prod-uuid-1'));
      expect(payload.catalogValues, hasLength(1));
      expect(payload.catalogValues.first['id'], equals('cat-1'));
      expect(payload.fiscalEnvelope, isNotNull);
      expect(payload.fiscalEnvelope!['businessName'], equals('Fonda La Patrona'));
    });

    test('falls back to the top-level fiscalConfig when deltas omits it', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['fiscalConfig'] = null;
      raw['fiscalConfig'] = {
        'tenantId': 'tenant-founder-01',
        'businessName': 'Fonda La Patrona',
        'fiscalRegime': 'RIM',
        'configVersion': {'revision': 3, 'fingerprint': 'fiscal-fp-abc123'},
        'taxRate': 15,
        'pricesIncludeTax': true,
      };

      final payload = TerminalPrimingPayload.fromJson(raw);

      expect(payload.fiscalEnvelope, isNotNull);
      expect(payload.fiscalEnvelope!['tenantId'], equals('tenant-founder-01'));
    });

    test('reports a null fiscal envelope when neither location carries one', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['fiscalConfig'] = null;

      final payload = TerminalPrimingPayload.fromJson(raw);

      expect(payload.fiscalEnvelope, isNull);
    });

    test('throws a named failure when the deltas object is missing', () {
      final raw = validPayload()..remove('deltas');

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_DELTAS_MISSING',
          ),
        ),
      );
    });

    test('throws a named failure when products or catalogValues are absent', () {
      final rawMissingProducts = validPayload();
      (rawMissingProducts['deltas'] as Map<String, dynamic>)
          .remove('products');

      expect(
        () => TerminalPrimingPayload.fromJson(rawMissingProducts),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_DELTAS_PARTIAL',
          ),
        ),
      );

      final rawMissingCatalog = validPayload();
      (rawMissingCatalog['deltas'] as Map<String, dynamic>)
          .remove('catalogValues');

      expect(
        () => TerminalPrimingPayload.fromJson(rawMissingCatalog),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_DELTAS_PARTIAL',
          ),
        ),
      );
    });

    test('throws a named failure when a product entry lacks identity fields', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['products'] = [
        {'name': 'No id here'},
      ];

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_PRODUCT_ENTRY_MALFORMED',
          ),
        ),
      );
    });

    test('throws a named failure when a catalog entry lacks identity fields', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['catalogValues'] = [
        {'id': 'cat-1', 'catalogType': 'UOM'},
      ];

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_CATALOG_ENTRY_MALFORMED',
          ),
        ),
      );
    });

    test('throws a named failure when currentVersion is missing', () {
      final raw = validPayload()..remove('currentVersion');

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_CURRENT_VERSION_MISSING',
          ),
        ),
      );
    });

    test('throws a named failure when the fiscal envelope is not an object', () {
      final raw = validPayload();
      (raw['deltas'] as Map<String, dynamic>)['fiscalConfig'] = 'not-a-map';

      expect(
        () => TerminalPrimingPayload.fromJson(raw),
        throwsA(
          isA<TerminalPrimingPayloadException>().having(
            (e) => e.code,
            'code',
            'TERMINAL_PRIMING_FISCAL_ENVELOPE_MALFORMED',
          ),
        ),
      );
    });
  });

  group('DioActivationPrimingPort — fiscal sequence refusal (#526 unit G2b)', () {
    setUpAll(() {
      registerFallbackValue(<String, dynamic>{});
    });

    late Dio dio;
    late DioActivationPrimingPort port;
    final requestOptions = RequestOptions(path: 'onboarding/terminals/priming');

    /// The exact 409 body the backend answers with (verified to survive the
    /// exception filter verbatim), parameterized for the null-MAX variant.
    Map<String, dynamic> refusalBody({
      int? highestSequenceNumber = 5,
      int? proposedSequence = 5,
    }) =>
        <String, dynamic>{
          'statusCode': 409,
          'error': 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
          'code': 'FISCAL_SEQUENCE_RECOVERY_REQUIRED',
          'message':
              'Fiscal sequence recovery required: the cloud already holds '
              'invoice sequence 5 for this tenant, so a terminal proposing '
              'sequence 5 cannot sell. No number was corrected or renumbered; '
              'explicit recovery is required.',
          'highestSequenceNumber': highestSequenceNumber,
          'proposedSequence': proposedSequence,
        };

    void stubRefusal({int? highestSequenceNumber = 5}) {
      when(() => dio.get<dynamic>(any(),
              queryParameters: any(named: 'queryParameters')))
          .thenThrow(
        DioException(
          requestOptions: requestOptions,
          response: Response<dynamic>(
            requestOptions: requestOptions,
            statusCode: 409,
            data: refusalBody(highestSequenceNumber: highestSequenceNumber),
          ),
        ),
      );
    }

    setUp(() {
      dio = _MockDio();
      port = DioActivationPrimingPort(dio);
    });

    test('a 409 fiscal refusal is surfaced as the named fiscal recovery '
        'error, never as a raw transport error', () async {
      stubRefusal();

      await expectLater(
        port.fetchPrimingPayload(),
        throwsA(isA<FiscalSequenceRecoveryRequiredError>()
            .having((e) => e.code, 'code', 'FISCAL_SEQUENCE_RECOVERY_REQUIRED')
            .having((e) => e.highestSequenceNumber, 'highestSequenceNumber', 5)
            .having((e) => e.proposedSequence, 'proposedSequence', 5)
            .having(
              (e) => e.message,
              'message',
              contains('the cloud already holds invoice sequence 5'),
            )),
        reason: 'the refusal body carries the named FISCAL_SEQUENCE_RECOVERY_'
            'REQUIRED contract; the adapter must parse it instead of '
            'degrading to the generic TERMINAL_PRIMING_FAILED path',
      );
    });

    test('the null-MAX variant (highestSequenceNumber: null) is surfaced the '
        'same named way', () async {
      stubRefusal(highestSequenceNumber: null);

      await expectLater(
        port.fetchPrimingPayload(),
        throwsA(isA<FiscalSequenceRecoveryRequiredError>()
            .having((e) => e.code, 'code', 'FISCAL_SEQUENCE_RECOVERY_REQUIRED')
            .having((e) => e.highestSequenceNumber, 'highestSequenceNumber',
                isNull)
            .having((e) => e.proposedSequence, 'proposedSequence', 5)),
        reason: 'the backend could not read the MAX; the refusal must still '
            'surface as the named recovery error with a null MAX',
      );
    });

    test('the local cursor is forwarded as the proposedSequence query '
        'parameter when a cursor exists', () async {
      when(() => dio.get<dynamic>('onboarding/terminals/priming',
              queryParameters: const {'proposedSequence': 5}))
          .thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: requestOptions,
          statusCode: 200,
          data: validPayload(),
        ),
      );

      final payload = await port.fetchPrimingPayload(proposedSequence: 5);

      expect(payload.status, 'success');
      verify(() => dio.get<dynamic>('onboarding/terminals/priming',
          queryParameters: const {'proposedSequence': 5})).called(1);
    });

    test('the refusal reports the proposed sequence echoed by the backend '
        'when present in the body', () async {
      stubRefusal();

      await expectLater(
        port.fetchPrimingPayload(proposedSequence: 5),
        throwsA(isA<FiscalSequenceRecoveryRequiredError>().having(
          (e) => e.proposedSequence,
          'proposedSequence',
          5,
        )),
      );
    });

    test('non-refusal backend errors still propagate as DioException',
        () async {
      when(() => dio.get<dynamic>(any(),
              queryParameters: any(named: 'queryParameters')))
          .thenThrow(
        DioException(
          requestOptions: requestOptions,
          response: Response<dynamic>(
            requestOptions: requestOptions,
            statusCode: 500,
            data: <String, dynamic>{'statusCode': 500},
          ),
        ),
      );

      await expectLater(
        port.fetchPrimingPayload(),
        throwsA(isA<DioException>()),
      );
    });

    test('a fresh device proposal is ABSENT: no query parameter is sent',
        () async {
      when(() => dio.get<dynamic>(any(),
              queryParameters: any(named: 'queryParameters')))
          .thenAnswer(
        (_) async => Response<dynamic>(
          requestOptions: requestOptions,
          statusCode: 200,
          data: validPayload(),
        ),
      );

      await port.fetchPrimingPayload();

      verify(() => dio.get<dynamic>(
            'onboarding/terminals/priming',
            queryParameters: null,
          )).called(1);
    });
  });
}
