import 'package:pos_app/domain/repositories/auth_repository.dart';

/// Structured evaluation result for production order yield and deviation.
class ProductionVarianceEvaluation {
  const ProductionVarianceEvaluation({
    required this.plannedQuantity,
    required this.actualQuantity,
    required this.allowedTolerancePercentage,
    required this.yieldPercentage,
    required this.deviationPercentage,
    required this.isWithinTolerance,
    required this.isTotalLoss,
    required this.requiresSupervisorOverride,
    required this.outcome,
    required this.status,
  });

  final double plannedQuantity;
  final double actualQuantity;
  final double allowedTolerancePercentage;
  final double yieldPercentage;
  final double deviationPercentage;
  final bool isWithinTolerance;
  final bool isTotalLoss;
  final bool requiresSupervisorOverride;
  final String outcome;
  final String status;
}

/// Domain guard to calculate yield, evaluate variance against recipe tolerance,
/// and authorize supervisor overrides when deviation is detected.
class ProductionVarianceGuard {
  const ProductionVarianceGuard._();

  /// Evaluates planned vs actual production quantities against recipe tolerance.
  static ProductionVarianceEvaluation evaluate({
    required double plannedQuantity,
    required double actualQuantity,
    double allowedTolerancePercentage = 5.0,
  }) {
    final isTotalLoss = actualQuantity <= 0;
    final yieldPct = plannedQuantity > 0 && actualQuantity > 0
        ? (actualQuantity / plannedQuantity) * 100
        : 0.0;
    final deviationPct = plannedQuantity > 0
        ? ((actualQuantity - plannedQuantity).abs() / plannedQuantity) * 100
        : 100.0;

    final isWithinTol = !isTotalLoss && deviationPct <= allowedTolerancePercentage;
    final requiresOverride = !isWithinTol || isTotalLoss;

    final String outcome;
    final String status;

    if (isTotalLoss) {
      outcome = 'FAILED';
      status = 'FAILED_TOTAL_LOSS';
    } else if (isWithinTol) {
      outcome = 'COMPLETED';
      status = 'COMPLETED_NORMAL';
    } else {
      outcome = 'COMPLETED';
      status = 'COMPLETED_WITH_VARIANCE';
    }

    return ProductionVarianceEvaluation(
      plannedQuantity: plannedQuantity,
      actualQuantity: actualQuantity,
      allowedTolerancePercentage: allowedTolerancePercentage,
      yieldPercentage: yieldPct,
      deviationPercentage: deviationPct,
      isWithinTolerance: isWithinTol,
      isTotalLoss: isTotalLoss,
      requiresSupervisorOverride: requiresOverride,
      outcome: outcome,
      status: status,
    );
  }

  /// Validates requirement for supervisor authorization and performs override check.
  static Future<void> validateAndAuthorize({
    required ProductionVarianceEvaluation evaluation,
    required AuthRepository authRepository,
    String? supervisorId,
    String? pin,
    String? totpCode,
    String? varianceReason,
  }) async {
    if (!evaluation.requiresSupervisorOverride) {
      return;
    }

    if (varianceReason == null || varianceReason.trim().isEmpty) {
      throw ArgumentError(
        'El motivo de desviación o merma es obligatorio cuando se excede la tolerancia.',
      );
    }

    if (supervisorId == null || supervisorId.trim().isEmpty) {
      throw ArgumentError(
        'La identificación del supervisor es obligatoria para autorizar la desviación.',
      );
    }

    final isAuthorized = await authRepository.authorizeOverride(
      supervisorId: supervisorId.trim(),
      pin: pin?.trim(),
      totpCode: totpCode?.trim(),
    );

    if (!isAuthorized) {
      throw StateError(
        'Autorización de supervisor denegada o credenciales inválidas.',
      );
    }
  }
}
