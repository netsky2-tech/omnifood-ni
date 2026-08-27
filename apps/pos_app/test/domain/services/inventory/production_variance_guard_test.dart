import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/services/inventory/production_variance_guard.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

void main() {
  late MockAuthRepository mockAuthRepository;

  setUp(() {
    mockAuthRepository = MockAuthRepository();
  });

  group('ProductionVarianceGuard - Evaluation (TDD)', () {
    test('evaluates exact match as COMPLETED_NORMAL with 0% deviation and 100% yield', () {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: 10.0,
        allowedTolerancePercentage: 5.0,
      );

      expect(evaluation.yieldPercentage, 100.0);
      expect(evaluation.deviationPercentage, 0.0);
      expect(evaluation.isWithinTolerance, isTrue);
      expect(evaluation.isTotalLoss, isFalse);
      expect(evaluation.requiresSupervisorOverride, isFalse);
      expect(evaluation.outcome, 'COMPLETED');
      expect(evaluation.status, 'COMPLETED_NORMAL');
    });

    test('evaluates variation within allowed tolerance (e.g. 3% deviation <= 5% threshold)', () {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 100.0,
        actualQuantity: 97.0, // 3% deviation below
        allowedTolerancePercentage: 5.0,
      );

      expect(evaluation.yieldPercentage, closeTo(97.0, 0.001));
      expect(evaluation.deviationPercentage, closeTo(3.0, 0.001));
      expect(evaluation.isWithinTolerance, isTrue);
      expect(evaluation.requiresSupervisorOverride, isFalse);
      expect(evaluation.outcome, 'COMPLETED');
      expect(evaluation.status, 'COMPLETED_NORMAL');
    });

    test('evaluates variation exceeding allowed tolerance (e.g. 8% deviation > 5% threshold)', () {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 50.0,
        actualQuantity: 46.0, // 8% deviation
        allowedTolerancePercentage: 5.0,
      );

      expect(evaluation.yieldPercentage, closeTo(92.0, 0.001));
      expect(evaluation.deviationPercentage, closeTo(8.0, 0.001));
      expect(evaluation.isWithinTolerance, isFalse);
      expect(evaluation.isTotalLoss, isFalse);
      expect(evaluation.requiresSupervisorOverride, isTrue);
      expect(evaluation.outcome, 'COMPLETED');
      expect(evaluation.status, 'COMPLETED_WITH_VARIANCE');
    });

    test('evaluates positive deviation (over-yield) exceeding tolerance', () {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: 11.0, // 10% over-yield
        allowedTolerancePercentage: 5.0,
      );

      expect(evaluation.yieldPercentage, closeTo(110.0, 0.001));
      expect(evaluation.deviationPercentage, closeTo(10.0, 0.001));
      expect(evaluation.isWithinTolerance, isFalse);
      expect(evaluation.requiresSupervisorOverride, isTrue);
      expect(evaluation.status, 'COMPLETED_WITH_VARIANCE');
    });

    test('evaluates zero output as FAILED_TOTAL_LOSS requiring supervisor override', () {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 20.0,
        actualQuantity: 0.0,
        allowedTolerancePercentage: 5.0,
      );

      expect(evaluation.yieldPercentage, 0.0);
      expect(evaluation.deviationPercentage, 100.0);
      expect(evaluation.isWithinTolerance, isFalse);
      expect(evaluation.isTotalLoss, isTrue);
      expect(evaluation.requiresSupervisorOverride, isTrue);
      expect(evaluation.outcome, 'FAILED');
      expect(evaluation.status, 'FAILED_TOTAL_LOSS');
    });

    test('handles negative actualQuantity as total loss safely', () {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: -1.0,
        allowedTolerancePercentage: 5.0,
      );

      expect(evaluation.isTotalLoss, isTrue);
      expect(evaluation.requiresSupervisorOverride, isTrue);
      expect(evaluation.outcome, 'FAILED');
      expect(evaluation.status, 'FAILED_TOTAL_LOSS');
    });
  });

  group('ProductionVarianceGuard - Supervisor Authorization (TDD)', () {
    test('does not call authRepository when within tolerance', () async {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: 10.0,
      );

      await ProductionVarianceGuard.validateAndAuthorize(
        evaluation: evaluation,
        authRepository: mockAuthRepository,
      );

      verifyZeroInteractions(mockAuthRepository);
    });

    test('throws ArgumentError if varianceReason is missing when override is required', () async {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: 8.0, // 20% deviation
        allowedTolerancePercentage: 5.0,
      );

      expect(
        () => ProductionVarianceGuard.validateAndAuthorize(
          evaluation: evaluation,
          authRepository: mockAuthRepository,
          supervisorId: 'sup-1',
          pin: '1234',
          varianceReason: '   ',
        ),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message,
          'message',
          contains('motivo de desviación'),
        )),
      );
    });

    test('throws ArgumentError if supervisorId is missing when override is required', () async {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: 8.0,
        allowedTolerancePercentage: 5.0,
      );

      expect(
        () => ProductionVarianceGuard.validateAndAuthorize(
          evaluation: evaluation,
          authRepository: mockAuthRepository,
          supervisorId: '   ',
          pin: '1234',
          varianceReason: 'Masa quemada en horno',
        ),
        throwsA(isA<ArgumentError>().having(
          (e) => e.message,
          'message',
          contains('identificación del supervisor'),
        )),
      );
    });

    test('throws StateError when supervisor PIN is rejected', () async {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: 8.0,
        allowedTolerancePercentage: 5.0,
      );

      when(() => mockAuthRepository.authorizeOverride(
        supervisorId: 'sup-1',
        pin: '9999',
        totpCode: null,
      )).thenAnswer((_) async => false);

      expect(
        () => ProductionVarianceGuard.validateAndAuthorize(
          evaluation: evaluation,
          authRepository: mockAuthRepository,
          supervisorId: 'sup-1',
          pin: '9999',
          varianceReason: 'Masa quemada en horno',
        ),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          contains('denegada o credenciales inválidas'),
        )),
      );
    });

    test('succeeds when supervisor PIN or TOTP is valid for high variance', () async {
      final evaluation = ProductionVarianceGuard.evaluate(
        plannedQuantity: 10.0,
        actualQuantity: 8.0,
        allowedTolerancePercentage: 5.0,
      );

      when(() => mockAuthRepository.authorizeOverride(
        supervisorId: 'sup-1',
        pin: '1234',
        totpCode: null,
      )).thenAnswer((_) async => true);

      await ProductionVarianceGuard.validateAndAuthorize(
        evaluation: evaluation,
        authRepository: mockAuthRepository,
        supervisorId: 'sup-1',
        pin: '1234',
        varianceReason: 'Masa quemada en horno',
      );

      verify(() => mockAuthRepository.authorizeOverride(
        supervisorId: 'sup-1',
        pin: '1234',
        totpCode: null,
      )).called(1);
    });
  });
}
