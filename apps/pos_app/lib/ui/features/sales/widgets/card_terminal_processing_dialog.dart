import 'dart:async';
import 'package:flutter/material.dart';
import '../../../../domain/ports/card_terminal_port.dart';
import '../../../../domain/services/sales/card_payment_orchestrator.dart';

/// Modal dialog providing real-time visual progress for async card payments with manual fallback.
class CardTerminalProcessingDialog extends StatefulWidget {
  final CardPaymentOrchestrator orchestrator;
  final CardTerminalPort terminal;
  final CardPaymentIntent intent;
  final ValueChanged<CardAuthorizationResult>? onCompleted;
  final VoidCallback? onFallbackToManual;

  const CardTerminalProcessingDialog({
    super.key,
    required this.orchestrator,
    required this.terminal,
    required this.intent,
    this.onCompleted,
    this.onFallbackToManual,
  });

  static Future<CardAuthorizationResult?> show(
    BuildContext context, {
    required CardPaymentOrchestrator orchestrator,
    required CardTerminalPort terminal,
    required CardPaymentIntent intent,
    VoidCallback? onFallbackToManual,
  }) {
    return showDialog<CardAuthorizationResult>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => CardTerminalProcessingDialog(
        orchestrator: orchestrator,
        terminal: terminal,
        intent: intent,
        onCompleted: (res) => Navigator.of(ctx).pop(res),
        onFallbackToManual: () {
          Navigator.of(ctx).pop();
          onFallbackToManual?.call();
        },
      ),
    );
  }

  @override
  State<CardTerminalProcessingDialog> createState() =>
      _CardTerminalProcessingDialogState();
}

class _CardTerminalProcessingDialogState
    extends State<CardTerminalProcessingDialog> {
  CardAuthorizationResult? _finalResult;
  Timer? _completeTimer;

  @override
  void initState() {
    super.initState();
    _startTransaction();
  }

  @override
  void dispose() {
    _completeTimer?.cancel();
    super.dispose();
  }

  Future<void> _startTransaction() async {
    final result = await widget.orchestrator.executePayment(
      terminal: widget.terminal,
      intent: widget.intent,
    );

    if (mounted) {
      setState(() {
        _finalResult = result;
      });

      if (result.isSuccess) {
        _completeTimer = Timer(const Duration(milliseconds: 600), () {
          if (mounted) {
            widget.onCompleted?.call(result);
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final primaryColor = Theme.of(context).colorScheme.primary;
    final currencySymbol = widget.intent.currency == 'USD' ? '\$' : 'C\$';
    final amountFormatted = '$currencySymbol ${widget.intent.amount.toStringAsFixed(2)}';

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: StreamBuilder<CardTransactionState>(
            stream: widget.orchestrator.stateStream,
            initialData: widget.orchestrator.currentState,
            builder: (context, snapshot) {
              final state = snapshot.data ?? widget.orchestrator.currentState;

              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header with Terminal & Bank Info
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: primaryColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.point_of_sale,
                          color: primaryColor,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Terminal Bancaria',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                            Text(
                              '${widget.terminal.acquirer.displayName} (${widget.terminal.terminalId})',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Colors.grey.shade700,
                                  ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),

                  // Amount Card
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.shade300),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Monto a Cobrar:',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        Flexible(
                          child: Text(
                            amountFormatted,
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              color: primaryColor,
                            ),
                            textAlign: TextAlign.end,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Dynamic Stage Visualizer
                  _buildStageVisualizer(state, primaryColor),

                  const SizedBox(height: 24),

                  // Action Buttons
                  if (state.stage == CardTransactionStage.authorized) ...[
                    ElevatedButton.icon(
                      key: const Key('card_terminal_success_btn'),
                      onPressed: () => widget.onCompleted?.call(_finalResult!),
                      icon: const Icon(Icons.check),
                      label: const Text('Continuar'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ] else if (state.stage == CardTransactionStage.declined ||
                      state.stage == CardTransactionStage.error ||
                      state.stage == CardTransactionStage.reversed ||
                      state.stage == CardTransactionStage.reversalFailed) ...[
                    ElevatedButton.icon(
                      key: const Key('card_terminal_retry_btn'),
                      onPressed: _startTransaction,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Reintentar en Datáfono'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primaryColor,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      key: const Key('card_terminal_fallback_manual_btn'),
                      onPressed: widget.onFallbackToManual,
                      icon: const Icon(Icons.edit_note, color: Colors.orange),
                      label: const Text(
                        'Entrada Manual (Diferido)',
                        style: TextStyle(color: Colors.orange),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      key: const Key('card_terminal_close_btn'),
                      onPressed: () => Navigator.of(context).pop(_finalResult),
                      child: const Text('Cerrar'),
                    ),
                  ] else ...[
                    // Active Processing State: Option to fallback immediately or cancel
                    OutlinedButton.icon(
                      key: const Key('card_terminal_fallback_manual_btn'),
                      onPressed: widget.onFallbackToManual,
                      icon: const Icon(Icons.flash_on, color: Colors.orange),
                      label: const Text(
                        'Entrada Manual (Diferido)',
                        style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.orange, width: 1.5),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      key: const Key('card_terminal_cancel_btn'),
                      onPressed: () async {
                        await widget.terminal.cancelCurrentOperation();
                        if (context.mounted) {
                          Navigator.of(context).pop();
                        }
                      },
                      child: const Text(
                        'Cancelar Cobro',
                        style: TextStyle(color: Colors.red),
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildStageVisualizer(CardTransactionState state, Color primaryColor) {
    switch (state.stage) {
      case CardTransactionStage.initiating:
      case CardTransactionStage.waitingCard:
        return Column(
          children: [
            SizedBox(
              width: 54,
              height: 54,
              child: CircularProgressIndicator(
                strokeWidth: 4,
                valueColor: AlwaysStoppedAnimation(primaryColor),
              ),
            ),
            const SizedBox(height: 16),
            Icon(Icons.credit_card, size: 40, color: primaryColor),
            const SizedBox(height: 8),
            Text(
              state.message ?? 'Por favor acerque, inserte o deslice la tarjeta...',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
          ],
        );

      case CardTransactionStage.authorized:
        return Column(
          children: [
            const Icon(
              Icons.check_circle,
              size: 64,
              color: Colors.green,
            ),
            const SizedBox(height: 8),
            const Text(
              '¡Pago Aprobado!',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.green,
              ),
            ),
            if (state.authResult?.authCode != null) ...[
              const SizedBox(height: 4),
              Text(
                'Código de Autorización: ${state.authResult!.authCode}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              Text(
                'Lote: ${state.authResult?.batchNumber ?? "001"} | Tarjeta: ****${state.authResult?.last4 ?? "0000"}',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            ],
          ],
        );

      case CardTransactionStage.declined:
      case CardTransactionStage.error:
        return Column(
          children: [
            const Icon(
              Icons.cancel,
              size: 60,
              color: Colors.red,
            ),
            const SizedBox(height: 8),
            Text(
              state.message ?? 'Transacción Declinada',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: Colors.red,
              ),
            ),
          ],
        );

      case CardTransactionStage.timedOut:
      case CardTransactionStage.reversing:
        return Column(
          children: [
            const SizedBox(
              width: 48,
              height: 48,
              child: CircularProgressIndicator(
                strokeWidth: 4,
                valueColor: AlwaysStoppedAnimation(Colors.orange),
              ),
            ),
            const SizedBox(height: 12),
            const Icon(Icons.sync_problem, size: 40, color: Colors.orange),
            const SizedBox(height: 8),
            Text(
              state.message ?? 'Reversando transacción por seguridad...',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.orange,
              ),
            ),
          ],
        );

      case CardTransactionStage.reversed:
        return Column(
          children: [
            const Icon(Icons.shield_outlined, size: 54, color: Colors.orange),
            const SizedBox(height: 8),
            const Text(
              'Transacción Reversada',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.orange,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              state.message ?? 'Cobro anulado exitosamente en el datáfono.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13),
            ),
          ],
        );

      case CardTransactionStage.reversalFailed:
        return Column(
          children: [
            const Icon(Icons.warning, size: 54, color: Colors.red),
            const SizedBox(height: 8),
            const Text(
              'Advertencia de Reverso',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.red,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              state.message ?? 'No se pudo verificar el reverso automático en hardware.',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Colors.red),
            ),
          ],
        );

      case CardTransactionStage.idle:
        return const SizedBox.shrink();
    }
  }
}
