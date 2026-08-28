import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../../../data/models/inventory/movement_entity.dart';

class RegularizationCalculationResult {
  final double previousUnitCostNio;
  final double recalculatedUnitCostNio;
  final double deltaUnitCostNio;
  final double totalDeltaCostNio;
  final double affectedQuantity;
  final int targetCostingState;
  final bool isAutoApproved;
  final String? bloqueoMotivo;
  final String lineageHash;

  RegularizationCalculationResult({
    required this.previousUnitCostNio,
    required this.recalculatedUnitCostNio,
    required this.deltaUnitCostNio,
    required this.totalDeltaCostNio,
    required this.affectedQuantity,
    required this.targetCostingState,
    required this.isAutoApproved,
    this.bloqueoMotivo,
    required this.lineageHash,
  });
}

class KardexRecalculationEngine {
  final double autoApproveThresholdNio;

  const KardexRecalculationEngine({
    this.autoApproveThresholdNio = 1500.0,
  });

  RegularizationCalculationResult calculateRegularization({
    required MovementEntity provisionalMovement,
    required MovementEntity triggerMovement,
    bool isClosedPeriod = false,
  }) {
    final previousCost = provisionalMovement.unitCostNio ?? 0.0;
    final newCost = triggerMovement.unitCostNio ?? previousCost;
    final affectedQty = provisionalMovement.quantity.abs();

    final deltaUnitCost = newCost - previousCost;
    final totalDelta = (deltaUnitCost * affectedQty).abs();

    final isThresholdExceeded = totalDelta > autoApproveThresholdNio;
    final isBlocked = isThresholdExceeded || isClosedPeriod;

    String? reason;
    if (isClosedPeriod) {
      reason = 'PERIODO_CERRADO';
    } else if (isThresholdExceeded) {
      reason = 'UMBRAL_EXCEDIDO';
    }

    final targetState = isBlocked ? 40 : 30; // 40 = INTERVENTION_BLOCKED, 30 = REGULARIZED

    // Deterministic lineage hash
    final hashInput = '${provisionalMovement.id}:${triggerMovement.id}:${deltaUnitCost.toStringAsFixed(4)}:${affectedQty.toStringAsFixed(4)}';
    final lineageHash = sha256.convert(utf8.encode(hashInput)).toString();

    return RegularizationCalculationResult(
      previousUnitCostNio: double.parse(previousCost.toStringAsFixed(4)),
      recalculatedUnitCostNio: double.parse(newCost.toStringAsFixed(4)),
      deltaUnitCostNio: double.parse(deltaUnitCost.toStringAsFixed(4)),
      totalDeltaCostNio: double.parse(totalDelta.toStringAsFixed(4)),
      affectedQuantity: double.parse(affectedQty.toStringAsFixed(4)),
      targetCostingState: targetState,
      isAutoApproved: !isBlocked,
      bloqueoMotivo: reason,
      lineageHash: lineageHash,
    );
  }
}
