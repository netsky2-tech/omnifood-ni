import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/sync/sync_failure_classification.dart';

DioException dioError(int? statusCode, {Object? data, DioExceptionType? type}) {
  return DioException(
    requestOptions: RequestOptions(path: '/test'),
    type: type ?? DioExceptionType.badResponse,
    response: statusCode == null
        ? null
        : Response(
            requestOptions: RequestOptions(path: '/test'),
            statusCode: statusCode,
            data: data,
          ),
  );
}

void main() {
  group('classifySyncFailure — one branch per outcome', () {
    test('403 CAPABILITY_REQUIRED → planBlocked (not auth)', () {
      final c = classifySyncFailure(
        dioError(403, data: {
          'statusCode': 403,
          'code': 'CAPABILITY_REQUIRED',
          'message': 'Plan sin la capacidad requerida',
          'missingCapabilities': ['inventory.retail'],
        }),
      );

      expect(c.planBlocked, isTrue);
      expect(c.authBlocked, isFalse);
      expect(c.retryable, isFalse);
      expect(c.permanent, isFalse);
    });

    test('409 QUOTA_EXCEEDED → planBlocked', () {
      final c = classifySyncFailure(
        dioError(409, data: {
          'statusCode': 409,
          'code': 'QUOTA_EXCEEDED',
          'message': 'Cuota de terminales agotada',
          'limitKey': 'limits.terminals',
          'limit': 1,
          'occupied': 1,
        }),
      );

      expect(c.planBlocked, isTrue);
      expect(c.authBlocked, isFalse);
      expect(c.retryable, isFalse);
      expect(c.permanent, isFalse);
    });

    test('409 without the quota code stays permanent (unchanged)', () {
      expect(
        classifySyncFailure(dioError(409, data: {'code': 'DUPLICATE_REPLAY'}))
            .permanent,
        isTrue,
      );
    });

    test('401 → authBlocked', () {
      final c = classifySyncFailure(dioError(401, data: {'code': 'X'}));

      expect(c.authBlocked, isTrue);
      expect(c.planBlocked, isFalse);
    });

    test('403 WITHOUT the capability code → authBlocked (unchanged)', () {
      expect(
        classifySyncFailure(
          dioError(403, data: {'code': 'FORBIDDEN_RESOURCE'}),
        ).authBlocked,
        isTrue,
      );
      expect(
        classifySyncFailure(dioError(403, data: null)).authBlocked,
        isTrue,
      );
    });

    test('403 plan refusal survives a raw-string body', () {
      expect(
        classifySyncFailure(
          dioError(
            403,
            data:
                '{"statusCode":403,"code":"CAPABILITY_REQUIRED","missingCapabilities":["inventory.retail"]}',
          ),
        ).planBlocked,
        isTrue,
      );
    });

    test('other 4xx → permanent (unchanged)', () {
      expect(classifySyncFailure(dioError(400)).permanent, isTrue);
      expect(classifySyncFailure(dioError(404)).permanent, isTrue);
      expect(classifySyncFailure(dioError(422)).permanent, isTrue);
    });

    test('408 and 429 → retryable (unchanged)', () {
      expect(classifySyncFailure(dioError(408)).retryable, isTrue);
      expect(classifySyncFailure(dioError(429)).retryable, isTrue);
    });

    test('5xx → retryable', () {
      expect(classifySyncFailure(dioError(500)).retryable, isTrue);
      expect(classifySyncFailure(dioError(503)).retryable, isTrue);
    });

    test('no response (network) → retryable', () {
      expect(
        classifySyncFailure(
          dioError(null, type: DioExceptionType.connectionError),
        ).retryable,
        isTrue,
      );
    });

    test('exactly one flag is set for every classified branch', () {
      final errors = [
        dioError(403, data: {'code': 'CAPABILITY_REQUIRED'}),
        dioError(409, data: {'code': 'QUOTA_EXCEEDED'}),
        dioError(401),
        dioError(403),
        dioError(400),
        dioError(408),
        dioError(429),
        dioError(500),
        dioError(null, type: DioExceptionType.connectionError),
      ];
      for (final e in errors) {
        final c = classifySyncFailure(e);
        final setFlags = [
          c.authBlocked,
          c.planBlocked,
          c.retryable,
          c.permanent,
        ].where((flag) => flag).length;
        expect(setFlags, 1, reason: 'classification of $e must be exclusive');
      }
    });
  });

  group('purchaseRejectionAction — the order is the rule (catalog §6.3)', () {
    test('a plan refusal is rethrown, never marked rejected', () {
      expect(
        purchaseRejectionAction(dioError(403, data: {
          'code': 'CAPABILITY_REQUIRED',
          'missingCapabilities': ['inventory.retail'],
        })),
        PurchaseRejectionAction.rethrowForPlanBlock,
      );
      expect(
        purchaseRejectionAction(dioError(409, data: {
          'code': 'QUOTA_EXCEEDED',
          'limitKey': 'limits.terminals',
        })),
        PurchaseRejectionAction.rethrowForPlanBlock,
      );
    });

    test('a genuine conflict without the quota code still drops as before', () {
      // Only the quota-coded 409 is a plan refusal. A duplicate conflict must
      // keep the pre-ENT-04 behaviour, or the queue stalls behind one row.
      expect(
        purchaseRejectionAction(dioError(409, data: {'message': 'duplicate'})),
        PurchaseRejectionAction.markRejectedAndContinue,
      );
      expect(
        purchaseRejectionAction(dioError(422, data: {'message': 'invalid'})),
        PurchaseRejectionAction.markRejectedAndContinue,
      );
    });

    test('auth and transient failures leave the row pending', () {
      expect(
        purchaseRejectionAction(dioError(401)),
        PurchaseRejectionAction.retry,
      );
      expect(
        purchaseRejectionAction(dioError(403)),
        PurchaseRejectionAction.retry,
      );
      expect(
        purchaseRejectionAction(dioError(503)),
        PurchaseRejectionAction.retry,
      );
      expect(
        purchaseRejectionAction(
          dioError(null, type: DioExceptionType.connectionError),
        ),
        PurchaseRejectionAction.retry,
      );
    });
  });
}
